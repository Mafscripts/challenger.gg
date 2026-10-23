import test from "node:test";
import assert from "node:assert/strict";
import { settleWagerPayout } from "./wager-payout.js";

function fixture({ enabled = true, failTransfer = false } = {}) {
  let state = {
    wager: { id: "match", metadata: { status: "completed", winner_id: "a", host_id: "a", challenger_id: "b", match_type: "wagers", entry_fee: 1, match_completed_date: "2026-10-01T00:00:00Z" } },
    users: ["a", "b", "c"].map((id) => ({ id, wallet_balance: 9, lifetime_earnings: 0, total_wager_earnings: 0, is_premium: id === "c" })),
    participants: ["a", "b", "c"].map((id) => ({ id: `p-${id}`, metadata: { user_id: id, wager_id: "match", team: id === "b" ? "challenger" : "host", entry_fee_paid: 1, escrowed: true } })),
    wallets: ["a", "b", "c"].map((id) => ({ id: `w-${id}`, metadata: { user_id: id, available_balance: 9, withdrawable_balance: 9, pending_balance: 1, escrow_balance: 1, total_earnings: 0 } })),
    transactions: [],
  };
  const copy = (value) => structuredClone(value);
  const update = (table, { where, data }) => {
    const row = state[table].find((row) => row.id === where.id);
    for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? Number(row[key] || 0) + value.increment : copy(value);
    return copy(row);
  };
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [
      { user_id: "a", reward: { effect: "wagers_cash", value: 10 } },
      { user_id: "a", reward: { effect: "cash_fee", value: 2 } },
    ],
    competitionRewardSettings: { findUnique: async () => ({ metadata: { enabled, standard_fee: 10, premium_fee: 5, minimum_fee: 0 } }) },
    competitionRewardGrant: {},
    wager: { findUnique: async () => copy(state.wager), update: async ({ data }) => { Object.assign(state.wager, copy(data)); return copy(state.wager); } },
    wagerParticipant: { findMany: async () => copy(state.participants), update: async (args) => update("participants", args) },
    user: { findMany: async ({ where }) => copy(state.users.filter((row) => where.id.in.includes(row.id))), update: async (args) => update("users", args) },
    wallet: { findMany: async ({ where }) => copy(state.wallets.filter((row) => row.metadata.user_id === where.metadata.equals)), findUnique: async ({ where }) => copy(state.wallets.find((row) => row.id === where.id)), update: async (args) => update("wallets", args) },
    walletTransaction: { create: async ({ data }) => { if (failTransfer && state.transactions.length === 1) throw new Error("Temporary write failure"); state.transactions.push(copy(data)); return copy(data); } },
  };
  const db = { $transaction: async (operation) => { const before = copy(state); try { return await operation(tx); } catch (error) { state = before; throw error; } } };
  return { db, state: () => state, settle: () => settleWagerPayout(db, { id: "match", host_id: "forged", entry_fee: 100 }, "a") };
}

test("cash payouts allocate exact cents and apply a coupon and cash bonus only to their owner", async () => {
  const f = fixture(), result = await f.settle();
  assert.equal(result.totalPot, 3);
  assert.equal(result.walletChanges.a.gross_payout, 1.5);
  assert.equal(result.walletChanges.a.platform_fee, 0);
  assert.equal(result.walletChanges.a.fee_percent, 0);
  assert.equal(result.walletChanges.a.reward_bonus, .1);
  assert.equal(result.walletChanges.a.payout, 1.6);
  assert.equal(result.walletChanges.c.fee_percent, 0);
  assert.equal(result.walletChanges.c.platform_fee, 0);
  assert.equal(result.walletChanges.c.reward_bonus, 0);
  assert.equal(result.walletChanges.b.payout, 0);
  assert.equal(result.walletChanges.b.match_delta, -1);
  assert.equal(result.winnerProfit, 1.1);
  assert.ok(f.state().wallets.every((row) => row.metadata.pending_balance === 0 && row.metadata.escrow_balance === 0));
});

test("repeating payout does not transfer money, bonuses, or earnings a second time", async () => {
  const f = fixture(); await f.settle(); const before = structuredClone(f.state());
  const repeated = await f.settle();
  assert.equal(repeated.walletChanges.a.payout, 1.6);
  assert.deepEqual(f.state(), before);
});

test("a partial wallet write failure rolls back every player and leaves payout retryable", async () => {
  const f = fixture({ failTransfer: true }), before = structuredClone(f.state());
  await assert.rejects(f.settle(), /Temporary write failure/);
  assert.deepEqual(f.state(), before);
  assert.equal(f.state().wager.metadata.payout_applied_at, undefined);
});

test("disabled reward settings preserve full-pot payout without fees or item bonuses", async () => {
  const f = fixture({ enabled: false }), result = await f.settle();
  assert.equal(result.walletChanges.a.payout, 1.5);
  assert.equal(result.walletChanges.c.payout, 1.5);
  assert.equal(result.walletChanges.a.reward_bonus, 0);
  assert.equal(result.walletChanges.a.platform_fee, 0);
});

test("membership fees apply at the listed entry threshold even when reward drops are disabled", async () => {
  for (const [entry, freeFee, premiumFee] of [[19.99, 0, 0], [20, 1, 0], [49.99, 1, 0], [50, 1, 1]]) {
    const f = fixture({ enabled: false }); f.state().wager.metadata.entry_fee = entry;
    const result = await f.settle();
    assert.equal(result.walletChanges.a.fee_percent, freeFee);
    assert.equal(result.walletChanges.c.fee_percent, premiumFee);
    assert.equal(result.walletChanges.a.platform_fee, freeFee ? .01 : 0);
    assert.equal(result.walletChanges.c.platform_fee, premiumFee ? .01 : 0);
    assert.equal(result.walletChanges.b.platform_fee, 0);
  }
});


test("paid completion rolls back with a failed transfer so the same report can be retried", async () => {
  const f = fixture({ failTransfer: true });
  f.state().wager.metadata.status = "in_progress";
  delete f.state().wager.metadata.winner_id;
  const before = structuredClone(f.state());
  await assert.rejects(settleWagerPayout(f.db, { id: "match" }, "a", { status: "completed", winner_id: "a", match_completed_date: "2026-10-01T00:00:00Z" }), /Temporary write failure/);
  assert.deepEqual(f.state(), before);
});


test("another process completing the same paid report is reported as already completed", async () => {
  const f = fixture(); await f.settle(); const before = structuredClone(f.state());
  const result = await settleWagerPayout(f.db, { id: "match" }, "a", { status: "completed", winner_id: "a" });
  assert.equal(result.alreadyCompleted, true);
  assert.deepEqual(f.state(), before);
});
