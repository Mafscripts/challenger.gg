import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { clearOwnNotifications } from "./clear-notifications.js";
import routes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

test("bulk removal includes read and unread rows beyond the visible page, preserving other users and newer arrivals", async () => {
  const cutoff = new Date("2026-10-23T12:00:00Z");
  let rows = Array.from({ length: 1200 }, (_, i) => ({ id: String(i), metadata: { user_id: "a", is_read: i % 2 === 0 }, created_date: new Date(cutoff - 1000) }));
  rows.push({ id: "other", metadata: { user_id: "b" }, created_date: cutoff }, { id: "new", metadata: { user_id: "a" }, created_date: new Date(+cutoff + 1000) });
  let calls = 0;
  const db = { notification: { deleteMany: async ({ where }) => {
    calls++;
    const eligible = row => row.metadata.user_id === where.metadata.equals && row.created_date <= where.created_date.lte;
    const count = rows.filter(eligible).length;
    rows = rows.filter(row => !eligible(row));
    return { count };
  } } };
  assert.deepEqual(await clearOwnNotifications(db, "a", { cutoff }), { success: true, removed: 1200 });
  assert.equal(calls, 1);
  assert.deepEqual(rows.map(row => row.id), ["other", "new"]);
  assert.equal((await clearOwnNotifications(db, "a", { cutoff })).removed, 0);
});

test("dispute acknowledgments are deduplicated and failures do not report deletion success", async () => {
  const acknowledged = [];
  const db = { notification: {
    findMany: async () => [1, 2].map(() => ({ metadata: { type: "dispute", related_entity_id: "d1" } })),
    deleteMany: async () => { throw new Error("Database unavailable"); },
  } };
  await assert.rejects(clearOwnNotifications(db, "a", { acknowledgeDispute: async id => acknowledged.push(id) }), /Database unavailable/);
  assert.deepEqual(acknowledged, ["d1"]);
  await assert.rejects(clearOwnNotifications(db, ""), /Sign in/);
});

test("the real bulk endpoint requires authentication and ignores a forged owner", async t => {
  const user = { id: "owner", email: "owner@example.test", email_verified: true, role: "user", metadata: {} };
  const override = (object, name, fn) => { const previous = object[name]; object[name] = fn; t.after(() => { object[name] = previous; }); };
  override(prisma.user, "findUnique", async () => user);
  override(prisma.ban, "findMany", async () => []);
  let owner;
  override(prisma.notification, "deleteMany", async ({ where }) => { owner = where.metadata.equals; return { count: 2 }; });
  const app = express(); app.use(express.json()); app.use("/functions", routes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/functions/clearNotifications`;
  assert.equal((await fetch(url, { method: "POST" })).status, 401);
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${signUser(user)}`, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: "victim" }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).removed, 2);
  assert.equal(owner, "owner");
});
