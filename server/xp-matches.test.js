import test from "node:test";
import assert from "node:assert/strict";
import { completeXPMatchRoster, xpMatchOutcome, xpMatchStrength } from "../src/lib/xpMatchRating.js";
import { cancelXPMatchLobby, requestXPMatchCancellation, respondXPMatchCancellation, submitXPMatchResult } from "./xp-matches.js";
import { isExpiredOpenMatch } from "./matchfinder-expiry.js";
import { isMatchfinderPostVisible } from "../src/lib/matchfinderPosts.js";

const roster = () => ({ team_size: "2v2", host_id: "a", challenger_id: "c", team_alpha_player_ids: ["a", "b"], team_bravo_player_ids: ["c", "d"] });
function fixture() {
  let state = { match: { id: "match", metadata: { ...roster(), status: "accepted", match_type: "xp", best_of: 3 } },
    stats: ["a", "b", "c", "d"].map((id) => ({ id: `stats-${id}`, metadata: { user_id: id, total_xp: 1000, weekly_xp: 1000, preserved: true } })),
    users: ["a", "b", "c", "d"].map((id) => ({ id, username: id, xp_level: 2 })) };
  const copy = (value) => structuredClone(value);
  const tx = {
    $executeRaw: async () => 1,
    xPMatch: { findMany: async () => state.stats.map((row) => ({ id: `historic-${row.id}`, metadata: {
      game_id: row.metadata.game_id, status: "completed", match_type: "xp", team_size: "1v1", host_id: row.metadata.user_id,
      challenger_id: "historic-opponent", winner_id: row.metadata.user_id,
      xp_changes: { [row.metadata.user_id]: { won: true, delta: row.metadata.total_xp } },
    } })), findUnique: async () => copy(state.match), update: async ({ data }) => {
      state.match.metadata = copy(data.metadata); return copy(state.match);
    } },
    xPStats: { findMany: async () => copy(state.stats), update: async ({ where, data }) => {
      const row = state.stats.find((entry) => entry.id === where.id); row.metadata = copy(data.metadata); return copy(row);
    }, create: async ({ data }) => { const row = { id: `stats-${state.stats.length}`, ...copy(data) }; state.stats.push(row); return copy(row); } },
    user: { findMany: async () => copy(state.users), update: async ({ where, data }) => {
      Object.assign(state.users.find((user) => user.id === where.id), data);
    } },
  };
  return { state: () => state, tx, db: { $transaction: async (operation) => {
    const before = copy(state);
    try { return await operation(tx); } catch (error) { state = before; throw error; }
  } } };
}

test("XP changes use team averages, reward upsets, and cap the change", () => {
  const match = roster();
  const equal = xpMatchStrength(match, { a: 1000, b: 3000, c: 2000, d: 2000 });
  assert.equal(xpMatchOutcome(equal, "alpha").change, 20);
  assert.equal(xpMatchOutcome(equal, "bravo").change, 20);
  const uneven = xpMatchStrength(match, { a: 10000, b: 10000, c: 0, d: 0 });
  assert.equal(xpMatchOutcome(uneven, "alpha").change, 5);
  assert.equal(xpMatchOutcome(uneven, "bravo").change, 40);
  assert.equal(completeXPMatchRoster(match), true);
  assert.equal(completeXPMatchRoster({ ...match, team_bravo_player_ids: ["a", "d"] }), false);
  assert.equal(completeXPMatchRoster({ ...match, team_bravo_player_ids: ["c"] }), false);
});

test("an expiry timer cannot cancel an XP post after an opponent joins", () => {
  const now = Date.now();
  const match = { ...roster(), status: "open", match_type: "xp", created_date: new Date(now - 3600000).toISOString() };
  assert.equal(isExpiredOpenMatch(match, now), false);
  assert.equal(isMatchfinderPostVisible(match, now), true);
  assert.equal(isExpiredOpenMatch({ ...match, challenger_id: "" }, now), true);
});

test("an opposing captain must explicitly accept; declining preserves the match", async () => {
  const f = fixture();
  assert.equal((await cancelXPMatchLobby(f.db, "match", "a", false)).success, false);
  assert.equal((await requestXPMatchCancellation(f.db, "match", "b")).success, false);
  const sent = await requestXPMatchCancellation(f.db, "match", "a");
  const request = sent.match.xp_cancel_request;
  assert.equal(f.state().match.metadata.status, "accepted");
  assert.equal((await respondXPMatchCancellation(f.db, "match", "a", request.id, "accept")).success, false);
  assert.equal((await respondXPMatchCancellation(f.db, "match", "c", "stale", "accept")).success, false);
  const declined = await respondXPMatchCancellation(f.db, "match", "c", request.id, "decline");
  assert.equal(declined.cancelled, false);
  assert.equal(declined.match.status, "accepted");
  assert.equal((await requestXPMatchCancellation(f.db, "match", "c")).success, false);
  assert.ok(f.state().stats.every((row) => row.metadata.total_xp === 1000));
});

test("agreed cancellation changes no XP and cannot be accepted twice", async () => {
  const f = fixture();
  const sent = await requestXPMatchCancellation(f.db, "match", "c");
  const accepted = await respondXPMatchCancellation(f.db, "match", "a", sent.match.xp_cancel_request.id, "accept");
  assert.equal(accepted.match.status, "cancelled");
  assert.equal(accepted.cancelled, true);
  assert.ok(f.state().stats.every((row) => row.metadata.total_xp === 1000));
  assert.equal((await respondXPMatchCancellation(f.db, "match", "a", sent.match.xp_cancel_request.id, "accept")).success, false);
});

test("matching captain reports award every roster member exactly once", async () => {
  const f = fixture();
  const input = { xp_match_id: "match", team_alpha_score: 2, team_bravo_score: 1 };
  await submitXPMatchResult(f.db, { id: "a" }, input);
  assert.ok(f.state().stats.every((row) => row.metadata.total_xp === 1000));
  const completed = await submitXPMatchResult(f.db, { id: "c" }, input);
  assert.equal(completed.match.status, "completed");
  for (const id of ["a", "b", "c", "d"]) {
    const won = ["a", "b"].includes(id);
    assert.equal(completed.xp_changes[id].delta, won ? 20 : -20);
    assert.equal(f.state().stats.find((row) => row.metadata.user_id === id).metadata.preserved, true);
  }
  const before = structuredClone(f.state());
  assert.equal((await submitXPMatchResult(f.db, { id: "a" }, input)).already_completed, true);
  assert.deepEqual(f.state(), before);
});

test("a result uses frozen strength and never reduces XP below zero", async () => {
  const f = fixture();
  f.state().match.metadata.xp_strength_snapshot = { ...xpMatchStrength(roster(), { a: 4000, b: 4000, c: 0, d: 0 }), rating_source: "xp_matches" };
  f.state().stats[0].metadata.total_xp = 5;
  f.state().stats[1].metadata.total_xp = 5000;
  const input = { xp_match_id: "match", team_alpha_score: 1, team_bravo_score: 2 };
  await submitXPMatchResult(f.db, { id: "a" }, input);
  const result = await submitXPMatchResult(f.db, { id: "c" }, input);
  assert.equal(result.xp_changes.a.delta, -5);
  assert.equal(result.xp_changes.a.new_xp, 0);
  assert.equal(result.xp_changes.c.delta, 40);
});

test("failed writes roll back every player's XP and match completion", async () => {
  const f = fixture();
  const input = { xp_match_id: "match", team_alpha_score: 2, team_bravo_score: 0 };
  await submitXPMatchResult(f.db, { id: "a" }, input);
  const before = structuredClone(f.state());
  f.tx.user.update = async () => { throw new Error("write failed"); };
  await assert.rejects(submitXPMatchResult(f.db, { id: "c" }, input), /write failed/);
  assert.deepEqual(f.state(), before);
});

test("a player's first XP match joins the current XP season rather than Season 1", async () => {
  const f = fixture();
  f.state().stats = [];
  f.tx.season = { findMany: async () => [{ id: "s", metadata: { ladder: "xp", season_number: 7, is_active: true, applied_at: "2026-10-19T12:00:00Z" } }] };
  const input = { xp_match_id: "match", team_alpha_score: 2, team_bravo_score: 0 };
  await submitXPMatchResult(f.db, { id: "a" }, input);
  const result = await submitXPMatchResult(f.db, { id: "c" }, input);
  assert.equal(result.success, true);
  assert.equal(f.state().stats.length, 4);
  assert.ok(f.state().stats.every((row) => row.metadata.season === 7 && row.metadata.progression_reset_at === "2026-10-19T12:00:00Z"));
});

test("staff can cancel joined or disputed XP matches without captain approval and without changing player XP", async () => {
  for (const status of ["accepted", "in_progress", "score_conflict", "disputed"]) {
    const f = fixture(); f.state().match.metadata.status = status;
    f.state().match.metadata.xp_cancel_request = { id: "pending", status: "pending" };
    const beforeStats = structuredClone(f.state().stats), beforeUsers = structuredClone(f.state().users);
    assert.equal((await cancelXPMatchLobby(f.db, "match", "admin", false)).success, false);
    const result = await cancelXPMatchLobby(f.db, "match", "admin", true);
    assert.equal(result.success, true); assert.equal(result.match.status, "cancelled");
    assert.equal(result.match.cancelled_by, "admin"); assert.equal(result.match.cancelled_by_staff, true);
    assert.equal(result.match.xp_cancel_request.status, "superseded");
    assert.equal(result.match.posted_to_matchfinder, false);
    assert.deepEqual(f.state().stats, beforeStats); assert.deepEqual(f.state().users, beforeUsers);
    assert.equal(result.match.winner_id, undefined);
  }
});
test("staff cancellation cannot replace completed XP results or reopen a terminal match", async () => {
  for (const status of ["completed", "cancelled", "closed", "expired"]) {
    const f = fixture(); f.state().match.metadata.status = status;
    const before = structuredClone(f.state());
    assert.equal((await cancelXPMatchLobby(f.db, "match", "admin", true)).success, false);
    assert.deepEqual(f.state(), before);
  }
});

test("cancelXPMatch endpoint permits admin roles and rejects a forged staff override from a normal player", async t => {
  const [{ default: routes }, { prisma }] = await Promise.all([import("./routes/functions.js"), import("./prisma.js")]);
  const handler = routes.stack.find(layer => layer.route?.path === "/:name" && layer.route.methods.post).route.stack.at(-1).handle;
  const original = prisma.$transaction;
  t.after(() => { prisma.$transaction = original; });
  const invoke = user => new Promise((resolve, reject) => {
    const response = { status() { return this; }, json: resolve };
    handler({ params: { name: "cancelXPMatch" }, body: { xp_match_id: "match", staff_override: true }, user }, response, reject);
  });
  for (const user of [{ id: "staff", role: "admin" }, { id: "staff", role: "user", admin_role: "admin" }, { id: "staff", role: "ceo" }, { id: "staff", role: "developer" }]) {
    const f = fixture(); prisma.$transaction = f.db.$transaction;
    assert.equal((await invoke(user)).success, true);
    assert.equal(f.state().match.metadata.cancelled_by_staff, true);
  }
  const f = fixture(); prisma.$transaction = f.db.$transaction;
  assert.equal((await invoke({ id: "a", role: "user" })).success, false);
  assert.equal(f.state().match.metadata.status, "accepted");
});

test("the support Decision action cancels an XP dispute and resolves its case without awarding XP", async t => {
  const [{ default: routes }, { prisma }] = await Promise.all([import("./routes/functions.js"), import("./prisma.js")]);
  const handler = routes.stack.find(layer => layer.route?.path === "/:name" && layer.route.methods.post).route.stack.at(-1).handle;
  const f = fixture(); f.state().match.metadata.status = "disputed";
  const ticket = { id: "case", metadata: { status: "admin_joined", assigned_admin_id: "staff", joined_staff_ids: ["staff"], match_type: "xp", match_id: "match", dispute_id: "report" } };
  const dispute = { id: "report", metadata: { status: "pending", match_type: "xp", match_id: "match", ticket_id: "case" } };
  const delegates = {};
  for (const [model, record] of [["ticket", ticket], ["dispute", dispute]]) {
    delegates[model] = { findUnique: async () => structuredClone(record), update: async ({ data }) => { record.metadata = structuredClone(data.metadata); return structuredClone(record); } };
    Object.assign(f.tx, { [model]: delegates[model] });
  }
  const replacements = [["ticket", "findUnique", delegates.ticket.findUnique], ["ticket", "update", delegates.ticket.update], ["dispute", "findUnique", delegates.dispute.findUnique], ["dispute", "update", delegates.dispute.update], ["xPMatch", "findUnique", f.tx.xPMatch.findUnique], ["adminAlert", "findMany", async () => []], ["notification", "findMany", async () => []], ["notification", "create", async ({ data }) => ({ id: crypto.randomUUID(), ...data })]];
  for (const [model, method, action] of replacements) { const original = prisma[model][method]; prisma[model][method] = action; t.after(() => { prisma[model][method] = original; }); }
  const originalTransaction = prisma.$transaction; prisma.$transaction = f.db.$transaction; t.after(() => { prisma.$transaction = originalTransaction; });
  const beforeStats = structuredClone(f.state().stats);
  const result = await new Promise((resolve, reject) => handler({ params: { name: "moderateDispute" }, body: { dispute_id: "report", action: "cancel_match", notes: "Match cancelled after review" }, user: { id: "staff", role: "admin", username: "Staff" } }, { status() { return this; }, json: resolve }, reject));
  assert.equal(result.success, true);
  assert.equal(f.state().match.metadata.status, "cancelled");
  assert.equal(ticket.metadata.status, "resolved"); assert.equal(dispute.metadata.status, "resolved");
  assert.equal(dispute.metadata.decision, "cancel_match");
  assert.deepEqual(f.state().stats, beforeStats);
});
