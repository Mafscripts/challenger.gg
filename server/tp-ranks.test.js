import test from "node:test";
import assert from "node:assert/strict";
import { tpRank, TP_RANK_TIERS } from "../src/lib/tpRanks.js";
import { getXPStandings, getXPMatchPlayerRanks } from "./xp-matches.js";

const stats = (id, xp, extra = {}) => ({ id: `stats-${id}`, metadata: { user_id: id, total_xp: xp, ...extra } });
const game = (alpha, bravo, status = "completed") => ({ metadata: { host_id: alpha, challenger_id: bravo, status } });
function database(rows, matches, room = game("a", "new")) {
  return {
    xPStats: { findMany: async () => rows },
    xPMatch: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { metadata: { path: ["status"], equals: "completed" } });
        return matches.filter((match) => match.metadata.status === "completed");
      },
      findUnique: async () => room,
    },
  };
}

test("TP RANK stays unranked before the first completed XP Match, regardless of XP or position", () => {
  const rank = tpRank({ xp: 999999, matchesPlayed: 0, position: 1 });
  assert.equal(rank.level, 0);
  assert.equal(rank.elite, false);
  assert.equal(rank.position, null);
});

test("one completed match awards a star even with zero XP; every tier promotes at its XP threshold", () => {
  assert.equal(tpRank({ xp: 0, matchesPlayed: 1 }).level, 1);
  for (const [index, tier] of TP_RANK_TIERS.entries()) {
    assert.equal(tpRank({ xp: tier.minXp, matchesPlayed: 1 }).level, tier.level);
    if (index) assert.equal(tpRank({ xp: tier.minXp - 1, matchesPlayed: 1 }).level, tier.level - 1);
  }
  assert.equal(tpRank({ xp: -10, matchesPlayed: 1 }).level, 1);
});

test("only valid eligible positions 1 through 1000 receive the numbered exclusive star", () => {
  for (const position of [1, 127, 1000]) {
    assert.equal(tpRank({ xp: 100, matchesPlayed: 1, position }).elite, true);
  }
  for (const position of [null, 0, -1, 1.5, "1", 1001]) {
    assert.equal(tpRank({ xp: 100, matchesPlayed: 1, position }).elite, false);
  }
  assert.equal(tpRank({ xp: 5000, matchesPlayed: 1, position: 1001 }).name, "Orbit");
});

test("standings require actual XP completion, include zero-XP losses and ignore open/cancelled matches", async () => {
  const db = database([
    stats("new", 999999, { matches_played: 50, wins: 50 }),
    stats("a", 2000), stats("b", 0), stats("cancelled", 5000), stats("open", 6000),
  ], [game("a", "b"), game("cancelled", "a", "cancelled"), game("open", "a", "open")]);
  const rows = await getXPStandings(db);
  assert.deepEqual(rows.map((row) => row.user_id), ["a", "b"]);
  assert.equal(rows[0].tp_rank.position, 1);
  assert.equal(rows[1].tp_rank.matchesPlayed, 1);
  assert.equal(rows[1].tp_rank.level, 1);
  const room = await getXPMatchPlayerRanks(db, "room");
  assert.equal(room.ranks.a, 1);
  assert.equal(room.tp_ranks.a.elite, true);
  assert.equal(room.ranks.new, null);
  assert.equal(room.tp_ranks.new.level, 0);
});

test("team completions count each participant once and use the latest XP record with stable tie positions", async () => {
  const db = database([stats("b", 100), stats("a", 100), stats("b", 999999), stats("c", 0), stats("d", 0)], [
    { metadata: { status: "completed", team_alpha_player_ids: ["a", "b", "b"], team_bravo_player_ids: ["c", "d"] } },
    game("a", "d"),
  ]);
  const rows = await getXPStandings(db);
  assert.deepEqual(rows.map((row) => row.user_id), ["a", "b", "c", "d"]);
  assert.equal(rows[0].tp_rank.matchesPlayed, 2);
  assert.equal(rows[1].tp_rank.matchesPlayed, 1);
  assert.equal(rows[1].total_xp, 100);
});

test("positions continue past 500 and 1000; a player outside the top 1000 keeps their XP tier", async () => {
  const ids = Array.from({ length: 1002 }, (_, index) => `player-${index}`);
  const db = database(ids.map((id, index) => stats(id, 10000 - index)), ids.map((id) => game(id, "opponent")), game(ids[999], ids[1000]));
  const rows = await getXPStandings(db);
  assert.equal(rows.length, 1002);
  assert.equal(rows[999].tp_rank.position, 1000);
  assert.equal(rows[999].tp_rank.elite, true);
  assert.equal(rows[1000].tp_rank.position, 1001);
  assert.equal(rows[1000].tp_rank.elite, false);
  assert.equal(rows[1000].tp_rank.name, "Orbit");
  const room = await getXPMatchPlayerRanks(db, "room");
  assert.equal(room.tp_ranks[ids[999]].position, 1000);
  assert.equal(room.tp_ranks[ids[1000]].position, 1001);
});

test("room ranks validate the match instead of returning unrelated account ranks", async () => {
  const db = database([], [], null);
  assert.equal((await getXPMatchPlayerRanks(db, "")).success, false);
  assert.equal((await getXPMatchPlayerRanks(db, "missing")).success, false);
});
