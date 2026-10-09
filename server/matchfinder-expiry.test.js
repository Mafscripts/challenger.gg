import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { cancelExpiredMatchfinderPost, isExpiredOpenMatch, startMatchfinderExpiryWorker, sweepExpiredMatchfinderPosts } from "./matchfinder-expiry.js";
import { findActiveFreeEightsMatch, joinFreeEightsLobby } from "./free-eights-membership.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import routes from "./routes/functions.js";

const now = Date.parse("2026-10-09T15:13:17.123Z");
const match = (id, extra = {}) => ({ id, created_date: new Date(now - 30 * 60 * 1000), metadata: { match_type: "8s", status: "open", host_id: "host", ...extra } });
const member = (id, wager_id, user_id, extra = {}) => ({ id, metadata: { wager_id, user_id, ...extra } });

function fixture(initial = {}) {
  let rows = structuredClone({ wager: [], rankedMatch: [], xPMatch: [], wagerParticipant: [], wallet: [], user: [], walletTransaction: [], notification: [], ...initial });
  let tail = Promise.resolve();
  const locks = [], events = [];
  let failLedger = false;
  const matchesWhere = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part) => matchesWhere(row, part));
    if (key === "OR") return value.some((part) => matchesWhere(row, part));
    if (key === "NOT") return (Array.isArray(value) ? value : [value]).every((part) => !matchesWhere(row, part));
    if (key === "metadata") return row.metadata?.[value.path[0]] === value.equals;
    if (value?.lte) return row[key] <= value.lte;
    if (value?.in) return value.in.includes(row[key]);
    if (value?.not) return row[key] !== value.not;
    return row[key] === value;
  });
  const db = { $executeRaw: async (strings, ...values) => { locks.push({ sql: strings.join("?"), values }); return 1; } };
  for (const name of Object.keys(rows)) db[name] = {
    findMany: async ({ where, take } = {}) => structuredClone(rows[name].filter((row) => matchesWhere(row, where)).slice(0, take)),
    findFirst: async ({ where }) => structuredClone(rows[name].find((row) => matchesWhere(row, where)) || null),
    findUnique: async ({ where }) => structuredClone(rows[name].find((row) => row.id === where.id) || null),
    update: async ({ where, data }) => {
      const row = rows[name].find((row) => row.id === where.id);
      if (!row) throw new Error(`${name} missing`);
      Object.assign(row, structuredClone(data)); return structuredClone(row);
    },
    create: async ({ data }) => {
      if (name === "walletTransaction" && failLedger) throw new Error("ledger unavailable");
      const row = { id: `${name}-${rows[name].length}`, ...structuredClone(data) };
      rows[name].push(row); return structuredClone(row);
    },
  };
  db.$transaction = async (action) => {
    const previous = tail; let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    const snapshot = structuredClone(rows);
    try { return await action(db); } catch (error) { rows = snapshot; throw error; } finally { release(); }
  };
  return { db, rows: () => rows, locks, events, failLedger: (value) => { failLedger = value; },
    options: { now, publish: (...args) => events.push(args) } };
}

test("expiry starts at the exact 30-minute boundary and ignores matches already underway", () => {
  const row = { ...match("free").metadata, created_date: match("free").created_date };
  assert.equal(isExpiredOpenMatch(row, now - 1), false);
  assert.equal(isExpiredOpenMatch(row, now), true);
  for (const status of ["in_progress", "ready_check", "accepted", "awaiting_completion", "score_conflict", "disputed", "completed", "cancelled"]) {
    assert.equal(isExpiredOpenMatch({ ...row, status }, now), false);
  }
});

test("Free 8s expiration cancels the room, clears membership and publishes once", async () => {
  const f = fixture({ wager: [match("free", { free_eights_waiting_for_voice: true, roster_lock_deadline: "future", eights_score_vote_status: "pending" })], wagerParticipant: [member("p1", "free", "host"), member("p2", "free", "friend")] });
  assert.equal((await findActiveFreeEightsMatch(f.db, "friend")).id, "free");
  assert.equal(await cancelExpiredMatchfinderPost(f.db, "Wager", "free", { ...f.options, now: now - 1 }), null);
  const cancelled = await cancelExpiredMatchfinderPost(f.db, "Wager", "free", f.options);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.roster_lock_deadline, "");
  assert.equal(cancelled.free_eights_waiting_for_voice, false);
  assert.equal(cancelled.eights_score_vote_status, "cancelled");
  assert.equal(cancelled.matchfinder_expired_at, new Date(now).toISOString());
  assert.equal(await findActiveFreeEightsMatch(f.db, "friend"), null);
  assert.equal(f.rows().notification.length, 2);
  assert.deepEqual(f.events, [["free", "cancelled"]]);
  assert.equal(await cancelExpiredMatchfinderPost(f.db, "Wager", "free", f.options), null);
  assert.equal(f.rows().notification.length, 2);
  assert.ok(f.locks.some((entry) => entry.sql.includes('"Wager"') && entry.sql.includes("FOR UPDATE")));
  assert.ok(f.locks.some((entry) => entry.values.includes("free8s-enrollment:free")));
});

for (const [entity, delegate] of [["RankedMatch", "rankedMatch"], ["XPMatch", "xPMatch"]]) {
  test(`${entity} expiration notifies each roster member once and preserves running matches`, async () => {
    const f = fixture({ [delegate]: [match("open", { team_alpha_player_ids: ["host", "a"], team_bravo_player_ids: ["b"], challenger_id: "b" }), match("live", { status: "in_progress" })] });
    assert.equal((await cancelExpiredMatchfinderPost(f.db, entity, "open", f.options)).status, "cancelled");
    assert.deepEqual(f.rows().notification.map((row) => row.metadata.user_id).sort(), ["a", "b", "host"]);
    assert.equal(await cancelExpiredMatchfinderPost(f.db, entity, "live", f.options), null);
    assert.equal(f.rows()[delegate][1].metadata.status, "in_progress");
  });
}

function paidFixture(type = "money8s") {
  return fixture({ wager: [match("paid", { match_type: type })], wagerParticipant: [
    member("p1", "paid", "captain", { paid_by: "captain", entry_fee_paid: 20, escrowed: true }),
    member("p2", "paid", "teammate", { paid_by: "captain", entry_fee_paid: 0 }),
    member("p3", "paid", "already-refunded", { entry_fee_paid: 5, escrowed: true, escrow_released: true }),
  ], wallet: [{ id: "wallet", metadata: { user_id: "captain", available_balance: 10, withdrawable_balance: 8, pending_balance: 20, escrow_balance: 20 } }], user: [{ id: "captain", wallet_balance: 10 }] });
}

for (const type of ["money8s", "wagers"]) test(`${type} returns the actual payer's escrow once across concurrent workers`, async () => {
  const f = paidFixture(type);
  const results = await Promise.all([1, 2].map(() => cancelExpiredMatchfinderPost(f.db, "Wager", "paid", f.options)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(f.rows().wallet[0].metadata.available_balance, 30);
  assert.equal(f.rows().wallet[0].metadata.withdrawable_balance, 28);
  assert.equal(f.rows().wallet[0].metadata.escrow_balance, 0);
  assert.equal(f.rows().wallet[0].metadata.pending_balance, 0);
  assert.equal(f.rows().user[0].wallet_balance, 30);
  assert.equal(f.rows().walletTransaction.length, 1);
  assert.equal(f.rows().walletTransaction[0].metadata.amount, 20);
  assert.equal(f.rows().wagerParticipant[0].metadata.escrow_released, true);
});

test("a failed ledger write rolls back refund and cancellation, then safely retries", async () => {
  const f = paidFixture();
  f.failLedger(true);
  await assert.rejects(() => cancelExpiredMatchfinderPost(f.db, "Wager", "paid", f.options), /ledger unavailable/);
  assert.equal(f.rows().wallet[0].metadata.available_balance, 10);
  assert.equal(f.rows().wager[0].metadata.status, "open");
  assert.equal(f.rows().wagerParticipant[0].metadata.escrow_released, undefined);
  assert.equal(f.rows().notification.length, 0);
  assert.equal(f.events.length, 0);
  f.failLedger(false);
  await cancelExpiredMatchfinderPost(f.db, "Wager", "paid", f.options);
  assert.equal(f.rows().wallet[0].metadata.available_balance, 30);
  assert.equal(f.rows().walletTransaction.length, 1);
});

test("a stale candidate rechecks status after taking its row lock", async () => {
  const f = fixture({ wager: [match("started")] });
  const transaction = f.db.$transaction;
  f.db.$transaction = (action) => transaction((tx) => {
    f.rows().wager[0].metadata.status = "in_progress";
    return action(tx);
  });
  assert.equal(await cancelExpiredMatchfinderPost(f.db, "Wager", "started", f.options), null);
  assert.equal(f.rows().wager[0].metadata.status, "in_progress");
});

test("background sweep works without a website visit and shares enrollment/start locks", async () => {
  const recent = match("recent"); recent.created_date = new Date(now - 1000);
  const f = fixture({ wager: [match("old"), recent, match("live", { status: "in_progress" })], rankedMatch: [match("ranked")], xPMatch: [match("xp")] });
  const locks = [];
  assert.equal(await sweepExpiredMatchfinderPosts(f.db, { now, withLock: async (key, action) => { locks.push(key); return action(); } }), 3);
  assert.deepEqual(locks, ["wager-accept:old", "ranked-accept:ranked", "xp-accept:xp"]);
  assert.equal(f.rows().wager[1].metadata.status, "open");
  assert.equal(f.rows().wager[2].metadata.status, "in_progress");
  assert.equal(await sweepExpiredMatchfinderPosts(f.db, { now }), 0);
});

test("the startup worker runs immediately, skips overlapping sweeps, and drains on shutdown", async () => {
  let calls = 0, finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  const stop = startMatchfinderExpiryWorker(async () => { calls++; await completed; }, { intervalMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 1);
  let stopped = false;
  const stopping = stop().then(() => { stopped = true; });
  await Promise.resolve(); assert.equal(stopped, false);
  finish(); await stopping;
  assert.equal(stopped, true);
});

test("Free 8s enrollment rejects an expired room before writing a participant", async () => {
  const expired = match("expired"); expired.created_date = new Date(Date.now() - 31 * 60 * 1000);
  const f = fixture({ wager: [expired] });
  const result = await joinFreeEightsLobby(f.db, "new-player", "expired", "New player");
  assert.equal(result.code, "MATCH_CANCELLED");
  assert.equal(f.rows().wagerParticipant.length, 0);
});

test("accept endpoints reject expired posts before taking payments or adding players", async (t) => {
  const user = { id: "new-player", email_verified: true, role: "user", metadata: { activision_id: "Player#1234567" } };
  const expired = match("expired"); expired.created_date = new Date(Date.now() - 31 * 60 * 1000);
  const override = (target, method, action) => {
    const original = target[method]; target[method] = action;
    t.after(() => { target[method] = original; });
  };
  override(prisma.user, "findUnique", async () => user);
  override(prisma.ban, "findMany", async () => []);
  for (const name of ["wager", "rankedMatch", "xPMatch"]) override(prisma[name], "findUnique", async () => expired);
  const app = express(); app.use(express.json()); app.use("/api/functions", routes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const [action, key] of [["acceptWager", "wager_id"], ["acceptRankedMatch", "ranked_match_id"], ["acceptXPMatch", "xp_match_id"]]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/functions/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signUser(user)}` }, body: JSON.stringify({ [key]: "expired" }) });
    const result = await response.json();
    assert.equal(result.success, false);
    assert.equal(result.code, "MATCH_CANCELLED");
  }
});
