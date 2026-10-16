import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as flush } from "node:timers/promises";
import { purgeExpiredNotifications, startNotificationRetentionWorker } from "./notification-retention.js";
import { NOTIFICATION_RETENTION_MS, isCurrentNotification } from "../src/lib/notificationRetention.js";
import { listEntities } from "./entity.js";
import { prisma } from "./prisma.js";

const now = Date.parse("2026-10-16T12:00:00Z");
const cutoff = now - NOTIFICATION_RETENTION_MS;
const record = (id, time, is_read = false) => ({ id, created_date: new Date(time), metadata: { user_id: id.includes("other") ? "other" : "me", is_read, title: "Update", type: "system", created_date: new Date(now).toISOString() } });

function fixture() {
  let records = [record("old-read", cutoff - 1, true), record("old-unread", cutoff - 5000),
    record("other-old", cutoff), record("boundary", cutoff), record("new-read", cutoff + 1, true), record("new-unread", now)];
  const matches = (row, where) => (!where.created_date || row.created_date.getTime() <= where.created_date.lte.getTime())
    && (!where.id || where.id.in.includes(row.id));
  const db = { notification: {
    findMany: async ({ where, take }) => records.filter((row) => matches(row, where)).slice(0, take).map(({ id }) => ({ id })),
    deleteMany: async ({ where }) => { const old = records.length; records = records.filter((row) => !matches(row, where)); return { count: old - records.length }; },
  } };
  return { db, records: () => records };
}

test("24-hour retention permanently deletes read and unread notifications for all users, including the exact boundary", async () => {
  const f = fixture();
  assert.equal(await purgeExpiredNotifications(f.db, { now, batchSize: 2 }), 4);
  assert.deepEqual(f.records().map((row) => row.id), ["new-read", "new-unread"]);
  assert.equal(await purgeExpiredNotifications(f.db, { now }), 0);
  assert.equal(isCurrentNotification({ created_date: new Date(cutoff).toISOString() }, now), false);
  assert.equal(isCurrentNotification({ created_date: new Date(cutoff + 1).toISOString() }, now), true);
});

test("bounded cleanup drains backlogs over later runs and can safely run concurrently", async () => {
  const f = fixture();
  assert.equal(await purgeExpiredNotifications(f.db, { now, batchSize: 2, maxBatches: 1 }), 2);
  assert.equal(f.records().length, 4);
  const results = await Promise.all([purgeExpiredNotifications(f.db, { now }), purgeExpiredNotifications(f.db, { now })]);
  assert.equal(results.reduce((sum, count) => sum + count, 0), 2);
  assert.deepEqual(f.records().map((row) => row.id), ["new-read", "new-unread"]);
});

test("notification reads filter expiration in the database before applying the requested limit", async (t) => {
  t.mock.method(Date, "now", () => now);
  const rows = [record("old", cutoff - 1), record("fresh", now), record("other-fresh", now)];
  const original = prisma.notification.findMany;
  t.after(() => { prisma.notification.findMany = original; });
  prisma.notification.findMany = async ({ where, orderBy, take }) => {
    assert.equal(where.created_date.gt.getTime(), cutoff);
    assert.deepEqual(orderBy, { created_date: "desc" });
    return rows.filter((row) => row.created_date > where.created_date.gt
      && (!where.metadata || row.metadata.user_id === where.metadata.equals)).slice(0, take);
  };
  assert.deepEqual((await listEntities("Notification", { user_id: "me" }, "-created_date", 1)).map((r) => r.id), ["fresh"]);
  assert.deepEqual((await listEntities("Notification", {}, "-created_date", 10)).map((r) => r.id), ["fresh", "other-fresh"]);
});

test("cleanup starts without a page visit, retries failures and stops its timer", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let calls = 0;
  const errors = [];
  const stop = startNotificationRetentionWorker(async () => { if (++calls === 1) throw new Error("temporary failure"); }, { intervalMs: 1000, onError: (...args) => errors.push(args) });
  await flush();
  assert.equal(calls, 1); assert.equal(errors.length, 1);
  t.mock.timers.tick(1000); await flush(); assert.equal(calls, 2);
  await stop();
  t.mock.timers.tick(5000); await flush(); assert.equal(calls, 2);
});

test("slow cleanups never overlap and shutdown waits for the running cleanup", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let finish, calls = 0, stopped = false;
  const stop = startNotificationRetentionWorker(() => { calls++; return new Promise((resolve) => { finish = resolve; }); }, { intervalMs: 1000 });
  await flush();
  t.mock.timers.tick(5000); await flush(); assert.equal(calls, 1);
  const stopping = stop().then(() => { stopped = true; });
  await flush(); assert.equal(stopped, false);
  finish(); await stopping; assert.equal(stopped, true);
  t.mock.timers.tick(5000); await flush(); assert.equal(calls, 1);
});
