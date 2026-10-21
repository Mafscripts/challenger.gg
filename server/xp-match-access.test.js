import test from "node:test";
import assert from "node:assert/strict";
import { joinXPMatchLobby } from "./xp-matches.js";
import { XP_TEAM_OPPONENT_COOLDOWN_MS as TWELVE_HOURS, xpMatchAwaitingAcceptance, xpMatchDestination, xpMatchTeamIds, xpTeamOpponentRetryAt } from "../src/lib/xpMatchAccess.js";

const now = Date.parse("2026-10-21T12:00:00Z");
const completed = (overrides = {}) => ({
  id: "previous", status: "completed", match_completed_date: new Date(now - 3600000).toISOString(),
  host_party_team_id: "team-a", challenger_party_team_id: "team-b",
  team_alpha_player_ids: ["a"], team_bravo_player_ids: ["b"], ...overrides,
});

test("an XP post unlocks only after an opposing captain accepts, including partial lobbies", () => {
  const post = { id: "post", status: "open", host_id: "a", challenger_id: "", team_size: "4v4", team_alpha_player_ids: ["a"] };
  assert.equal(xpMatchAwaitingAcceptance(post), true);
  assert.equal(xpMatchDestination(post), "/xp#matchfinder");
  assert.equal(xpMatchAwaitingAcceptance({ ...post, challenger_id: "b", team_bravo_player_ids: ["c"] }), true);
  const accepted = { ...post, challenger_id: "b", team_bravo_player_ids: ["b"] };
  assert.equal(xpMatchAwaitingAcceptance(accepted), false);
  assert.equal(xpMatchDestination(accepted), "/xp-match/post");
  assert.equal(xpMatchAwaitingAcceptance({ ...accepted, status: "accepted" }), false);
  assert.equal(xpMatchAwaitingAcceptance({ ...accepted, status: "completed" }), false);
});

test("the 12-hour limit follows team IDs in either orientation; a new team with the same players is allowed", () => {
  const history = [completed()];
  const retryAt = now + 11 * 3600000;
  assert.equal(xpTeamOpponentRetryAt(history, "team-a", ["team-b"], now), retryAt);
  assert.equal(xpTeamOpponentRetryAt(history, "team-b", ["team-a"], now), retryAt);
  assert.equal(xpTeamOpponentRetryAt(history, "new-team-b", ["team-a"], now), 0);
  assert.equal(xpTeamOpponentRetryAt([completed({ host_party_team_id: "new-team-a" })], "team-a", ["team-b"], now), 0);
  assert.equal(xpTeamOpponentRetryAt(history, "a", ["b"], now), 0);
});

test("party teams are included, former teammates are exempt, and the latest opposing-team expiry wins", () => {
  const history = [completed({ team_alpha_party_teams: [{ team_id: "ally" }], team_bravo_party_teams: [{ team_id: "other-opponent" }] }),
    completed({ match_completed_date: new Date(now - 60000).toISOString() })];
  assert.deepEqual(xpMatchTeamIds(history[0], "alpha"), ["ally", "team-a"]);
  assert.equal(xpTeamOpponentRetryAt(history, "ally", ["team-a"], now), 0);
  assert.equal(xpTeamOpponentRetryAt(history, "ally", ["other-opponent"], now), now + 11 * 3600000);
  assert.equal(xpTeamOpponentRetryAt(history, "team-a", ["team-b"], now), now + TWELVE_HOURS - 60000);
});

test("cancelled matches and expired cooldowns never block; completion time takes precedence over later edits", () => {
  assert.equal(xpTeamOpponentRetryAt([completed({ status: "cancelled" })], "team-a", ["team-b"], now), 0);
  assert.equal(xpTeamOpponentRetryAt([completed({ match_completed_date: new Date(now - TWELVE_HOURS).toISOString() })], "team-a", ["team-b"], now), 0);
  assert.equal(xpTeamOpponentRetryAt([completed({ updated_date: new Date(now).toISOString() })], "team-a", ["team-b"], now), now + 11 * 3600000);
  assert.equal(xpTeamOpponentRetryAt([completed({ match_completed_date: "", updated_date: new Date(now - 3600000).toISOString() })], "team-a", ["team-b"], now), now + 11 * 3600000);
});

function enrollmentFixture({ incomingTeam = "team-b", historicalStatus = "completed", size = "1v1" } = {}) {
  let writes = 0;
  const stamp = new Date().toISOString();
  const post = { id: "post", created_date: stamp, metadata: {
    status: "open", match_type: "xp", team_size: size, game_mode: "hp", host_id: "a", host_name: "A", challenger_id: "",
    host_party_team_id: "team-a", team_alpha_party_teams: [{ team_id: "team-a", player_ids: ["a"] }],
    team_alpha_player_ids: ["a"], team_bravo_player_ids: [],
  } };
  const history = [{ id: "previous", updated_date: new Date(), metadata: completed({ status: historicalStatus, match_completed_date: stamp }) }];
  const tx = {
    $executeRaw: async () => 1,
    xPMatch: {
      findUnique: async () => structuredClone(post),
      findMany: async ({ where }) => where.AND?.some((clause) => clause.updated_date) ? structuredClone(history) : [],
      update: async ({ data }) => { writes++; return { ...post, metadata: data.metadata, updated_date: new Date() }; },
    },
    xPStats: { findMany: async () => [] },
  };
  return {
    db: { $transaction: (operation) => operation(tx) }, writes: () => writes,
    party: { team: { id: incomingTeam, name: "B" }, ids: ["b"], names: ["B"], size: 1 },
  };
}

test("server admission rejects the same opposing teams before any enrollment write", async () => {
  const fixture = enrollmentFixture();
  const result = await joinXPMatchLobby(fixture.db, "post", fixture.party, () => null);
  assert.equal(result.success, false);
  assert.equal(result.code, "XP_TEAM_OPPONENT_COOLDOWN");
  assert.ok(result.retry_after_seconds > 0 && result.retry_after_seconds <= TWELVE_HOURS / 1000);
  assert.equal(fixture.writes(), 0);
});

test("server admission accepts a new team containing the same player and unlocks the completed roster", async () => {
  const fixture = enrollmentFixture({ incomingTeam: "new-team-b" });
  const result = await joinXPMatchLobby(fixture.db, "post", fixture.party, () => null);
  assert.equal(result.success, true);
  assert.equal(result.match.challenger_party_team_id, "new-team-b");
  assert.equal(result.roster_full, true);
  assert.equal(result.room_ready, true);
  assert.equal(result.opponent_accepted, true);
  assert.equal(fixture.writes(), 1);
});

test("cancelled history permits acceptance and the first opponent unlocks a larger partially filled room", async () => {
  const fixture = enrollmentFixture({ historicalStatus: "cancelled", size: "4v4" });
  const result = await joinXPMatchLobby(fixture.db, "post", fixture.party, () => null);
  assert.equal(result.success, true);
  assert.equal(result.match.status, "open");
  assert.equal(result.roster_full, false);
  assert.equal(result.room_ready, true);
  assert.equal(result.opponent_accepted, true);
});
