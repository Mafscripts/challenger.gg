import test from "node:test";
import assert from "node:assert/strict";
import { buildProfileArena, getProfileArena } from "./profile-arena.js";
import { tpRank } from "../src/lib/tpRanks.js";

const row = (id, metadata) => ({ id, created_date: new Date("2026-10-18T12:00:00Z"), metadata: {
  status: "completed", host_id: "captain-a", challenger_id: "captain-b", winner_id: "captain-a", game_id: "bo7", ...metadata,
} });

test("Arena includes roster members and separates each game's Ranked, Free 8s and XP record", () => {
  const userId = "member";
  const data = buildProfileArena({ userId,
    ranked: [row("ranked", { match_type: "ranked", game_id: "bo6", team_bravo_player_ids: [userId, "captain-b"] })],
    xp: [row("xp", { match_type: "xp", team_alpha_player_ids: ["captain-a", userId], confirmed_score_alpha: 2, confirmed_score_bravo: 1 })],
    eights: [row("8s", { match_type: "8s", winner_id: "captain-b" })],
    participants: [{ wager_id: "8s", user_id: userId, team: "challenger" }],
    rankedStats: [{ metadata: { game_id: "bo6", elo: 1200 } }],
    eightsStats: [{ metadata: { game_id: "bo7", rating: 9999, wins: 777 }, free_eights_elo: 0 }],
    xpStats: { total_xp: 3210 }, tpStanding: { tp_rank: tpRank({ xp: 3210, matchesPlayed: 1, position: 127 }) },
  });
  assert.equal(data.arenas.length, 3);
  assert.deepEqual(data.arenas.find((r) => r.mode === "ranked"), { id: "ranked:bo6", mode: "ranked", game_id: "bo6", game_name: "Call of Duty: Black Ops 6", rating: 1200, rating_label: "ELO", wins: 0, losses: 1 });
  assert.equal(data.arenas.find((r) => r.mode === "eights").rating, 0);
  assert.equal(data.arenas.find((r) => r.mode === "eights").wins, 1);
  assert.equal(data.arenas.find((r) => r.mode === "xp").rating, 3210);
  assert.equal(data.tp_rank.position, 127);
  assert.equal(data.wins, 2);
  assert.equal(data.losses, 1);
  assert.equal(data.recent_matches.find((r) => r.id === "ranked").profile_side, "bravo");
});

test("cash matches, Money 8s, tournaments and unfinished or ambiguous results never enter Arena records", () => {
  const data = buildProfileArena({ userId: "captain-a",
    ranked: [row("tournament", { match_type: "tournament" }), row("dispute", { match_type: "ranked", status: "disputed" }), row("unknown", { winner_id: "unknown" })],
    eights: [row("cash", { match_type: "wagers" }), row("money", { match_type: "money8s" }), row("cancelled", { match_type: "8s", status: "cancelled" })],
    eightsStats: [{ free_eights_elo: 0, metadata: { rating: 9000, matches_played: 88, wins: 55 } }],
  });
  assert.equal(data.arenas.length, 0);
  assert.equal(data.recent_matches.length, 0);
  assert.equal(data.tp_rank.level, 0);
});

test("duplicate season stats and duplicate matches do not inflate totals or replace latest dedicated ELO", () => {
  const match = row("one", { match_type: "ranked" });
  const data = buildProfileArena({ userId: "captain-a", ranked: [match, match], rankedStats: [
    { metadata: { elo: 300, season: 2, wins: 99 } }, { metadata: { elo: 9999, season: 1, wins: 999 } },
  ] });
  assert.equal(data.arenas[0].rating, 300);
  assert.equal(data.wins, 1);
  assert.equal(data.recent_matches.length, 1);
});

test("profile responses publish display fields only, never raw match chat, notes, IPs or other players' rewards", () => {
  const data = buildProfileArena({ userId: "captain-a", xp: [row("xp", { match_type: "xp", chat_logs: "private", staff_notes: "private", ip_address: "private",
    xp_changes: { "captain-a": { won: true }, other: { email: "private" } } })], xpStats: { total_xp: 100 },
  });
  const json = JSON.stringify(data);
  assert.equal(json.includes("private"), false);
  assert.equal(data.recent_matches[0].profile_result, "win");
});

test("newest activity is bounded to 50 while Arena totals still include older matches", () => {
  const xp = Array.from({ length: 60 }, (_, i) => row(`xp-${i}`, { match_type: "xp", completed_date: new Date(2026, 0, i + 1).toISOString() }));
  const data = buildProfileArena({ userId: "captain-a", xp });
  assert.equal(data.wins, 60);
  assert.equal(data.recent_matches.length, 50);
  assert.equal(data.recent_matches[0].id, "xp-59");
});

test("profile read queries team arrays and joins Free 8s memberships without retrieving unrelated cash games", async () => {
  const calls = {};
  const db = {
    wagerParticipant: { findMany: async () => [{ metadata: { user_id: "member", wager_id: "free-room", team: "host" } }] },
    wager: { findMany: async (query) => { calls.wager = query; return [row("free-room", { match_type: "8s" })]; } },
    rankedMatch: { findMany: async (query) => { calls.ranked = query; return []; } },
    xPMatch: { findMany: async (query) => { calls.xp = query; return []; } },
    rankedStats: { findMany: async () => [] }, eightsStats: { findMany: async () => [] },
    xPStats: { findMany: async () => [], findFirst: async () => null },
  };
  const data = await getProfileArena(db, "member");
  assert.equal(data.wins, 1);
  assert.ok(JSON.stringify(calls.ranked).includes("team_alpha_player_ids"));
  assert.ok(JSON.stringify(calls.wager).includes('"match_type"],"equals":"8s"'));
  assert.ok(JSON.stringify(calls.wager).includes('"in":["free-room"]'));
});
