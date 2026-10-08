import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { normalizeFreeEightsCancellationNotifications } from "./wager-cancellation-notifications.js";
import { getEntity, listEntities } from "./entity.js";
import { prisma } from "./prisma.js";
import functionRoutes from "./routes/functions.js";
import { signUser } from "./auth.js";

function override(t, target, name, implementation) {
  const previous = target[name]; target[name] = implementation;
  t.after(() => { target[name] = previous; });
}

test("legacy notification lists and individual reads correct Free 8s only and preserve history", async (t) => {
  const make = (id, match, overrides = {}) => ({ id, created_date: new Date("2026-10-08T00:00:00Z"), metadata: {
    user_id: "me", title: "Wager refunded", message: "Hardpoint BO3 was cancelled and escrow was returned.",
    type: "match", action_url: "/wallet", related_entity_type: "Wager", related_entity_id: match, is_read: false, ...overrides,
  } });
  const rows = [make("free-unread", "free"), make("free-read", "free", { is_read: true }),
    make("paid", "paid"), make("money", "money"), make("missing", "deleted"),
    make("other-type", "free", { related_entity_type: "TournamentMatch" }),
    make("admin", "free", { title: "Admin joined" })];
  const original = structuredClone(rows);
  const lookups = [];
  override(t, prisma.notification, "findMany", async () => rows);
  override(t, prisma.notification, "findUnique", async ({ where }) => rows.find((row) => row.id === where.id));
  override(t, prisma.notification, "update", async () => assert.fail("normalization must not rewrite notification history"));
  override(t, prisma.wager, "findMany", async (query) => {
    lookups.push(query);
    return [{ id: "free", metadata: { match_type: "8s", game_mode_display: "Hardpoint BO3" } },
      { id: "paid", metadata: { match_type: "wagers", game_mode_display: "Hardpoint BO3" } },
      { id: "money", metadata: { match_type: "money8s", game_mode_display: "Hardpoint BO3" } }];
  });
  const notifications = await listEntities("Notification", { user_id: "me" }, "-created_date", 20);
  assert.equal(lookups.length, 1, "one batch lookup even when multiple notifications reference the same match");
  assert.deepEqual(lookups[0].where.id.in, ["free", "paid", "money", "deleted"]);
  for (const id of ["free-unread", "free-read"]) {
    const row = notifications.find((row) => row.id === id);
    assert.equal(row.title, "Free 8s lobby cancelled");
    assert.equal(row.message, "Hardpoint BO3 was cancelled.");
    assert.equal(row.action_url, "/ranked/8s");
    assert.equal(row.created_date, "2026-10-08T00:00:00.000Z");
    assert.equal(row.is_read, id === "free-read");
  }
  for (const id of ["paid", "money", "missing", "other-type"]) assert.equal(notifications.find((row) => row.id === id).title, "Wager refunded");
  assert.equal(notifications.find((row) => row.id === "admin").title, "Admin joined");
  const one = await getEntity("Notification", "free-unread");
  assert.equal(one.title, "Free 8s lobby cancelled");
  assert.equal(one.action_url, "/ranked/8s");
  assert.deepEqual(rows, original);
});

test("correct notifications need no match lookup; a failed legacy lookup preserves available notifications", async (t) => {
  const normal = [{ id: "new", title: "Free 8s lobby cancelled", related_entity_id: "free", related_entity_type: "Wager" }];
  const db = { wager: { findMany: async () => assert.fail("no lookup for correct notifications") } };
  assert.equal(await normalizeFreeEightsCancellationNotifications(db, normal), normal);
  const legacy = [{ id: "old", title: "Wager refunded", related_entity_type: "Wager", related_entity_id: "free" }];
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  db.wager.findMany = async () => { throw Object.assign(new Error("Unavailable"), { code: "P1001" }); };
  assert.equal(await normalizeFreeEightsCancellationNotifications(db, legacy), legacy);
  assert.equal(warnings.length, 1);
});

test("paid wagers and Money 8s still return escrow and send wallet refund notifications", async (t) => {
  for (const matchType of ["wagers", "money8s"]) await t.test(matchType, async (t) => {
    const user = { id: "host", role: "user", email_verified: true, metadata: {} };
    let match = { id: "paid-room", metadata: { match_type: matchType, host_id: "host", challenger_id: "guest", status: "open", game_mode_display: "Hardpoint BO3" } };
    const participants = new Map(["host", "guest"].map((id) => [id, { id, metadata: { user_id: id, wager_id: match.id, entry_fee_paid: 5, escrowed: true } }]));
    const wallets = new Map(["host", "guest"].map((id) => [id, { id, metadata: { user_id: id, available_balance: 10, withdrawable_balance: 10, pending_balance: 5, escrow_balance: 5 } }]));
    const notifications = [], transactions = [];
    override(t, prisma.user, "findUnique", async () => user);
    override(t, prisma.user, "update", async ({ data }) => ({ ...user, ...data }));
    override(t, prisma.ban, "findMany", async () => []);
    override(t, prisma.wager, "findUnique", async () => match);
    override(t, prisma.wager, "update", async ({ data }) => { match = { ...match, ...data }; return match; });
    for (const [delegate, records] of [[prisma.wallet, wallets], [prisma.wagerParticipant, participants]]) {
      override(t, delegate, "findMany", async () => [...records.values()]);
      override(t, delegate, "findUnique", async ({ where }) => records.get(where.id));
      override(t, delegate, "update", async ({ where, data }) => { const row = { ...records.get(where.id), ...data }; records.set(where.id, row); return row; });
    }
    override(t, prisma.walletTransaction, "create", async ({ data }) => { transactions.push(data.metadata); return { id: `tx${transactions.length}`, ...data }; });
    override(t, prisma.notification, "create", async ({ data }) => { notifications.push(data.metadata); return { id: `n${notifications.length}`, ...data }; });
    override(t, prisma.dispute, "findMany", async () => []);
    const app = express(); app.use(express.json()); app.use("/api/functions", functionRoutes);
    app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/functions/refundWager`, { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signUser(user)}` }, body: JSON.stringify({ wager_id: match.id }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(transactions.length, 2);
    assert.ok(transactions.every((row) => row.type === "wager_refund" && row.amount === 5));
    for (const wallet of wallets.values()) {
      assert.equal(wallet.metadata.available_balance, 15);
      assert.equal(wallet.metadata.withdrawable_balance, 15);
      assert.equal(wallet.metadata.pending_balance, 0);
      assert.equal(wallet.metadata.escrow_balance, 0);
    }
    assert.equal(notifications.length, 2);
    assert.ok(notifications.every((row) => row.title === "Wager refunded" && row.action_url === "/wallet"));
  });
});
