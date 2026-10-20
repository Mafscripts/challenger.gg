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
    xPMatch: { findUnique: async () => copy(state.match), update: async ({ data }) => {
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
  f.state().match.metadata.xp_strength_snapshot = xpMatchStrength(roster(), { a: 4000, b: 4000, c: 0, d: 0 });
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
