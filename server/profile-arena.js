import { profileMatchOutcome, profileMatchSideFor } from "../src/lib/profileMatchResults.js";
import { DEFAULT_EIGHTS_GAMES, eightsGameName } from "../src/lib/freeEightsGames.js";
import { normalizeMatchXP } from "../src/lib/xpMatchRating.js";
import { tpRank } from "../src/lib/tpRanks.js";
import { getXPStandings } from "./xp-matches.js";
import { matchAfterProgressionReset } from "../src/lib/progressionResets.js";

const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const normalizeGame = (match) => String(match.game_id || "bo7").toLowerCase();
const gameTitle = (match) => {
  const known = DEFAULT_EIGHTS_GAMES.find((game) => game.id === normalizeGame(match));
  const title = String(match.game_name || (known ? eightsGameName(known) : normalizeGame(match)));
  return /^call of duty/i.test(title) ? title : `Call of Duty: ${title}`;
};
const participantWhere = (userId) => ({ OR: [field("host_id", userId), field("challenger_id", userId),
  { metadata: { path: ["team_alpha_player_ids"], array_contains: [userId] } },
  { metadata: { path: ["team_bravo_player_ids"], array_contains: [userId] } },
] });

// Never send match metadata wholesale: it may contain chat and staff notes.
const publicMatchFields = ["game_mode", "game_mode_display", "team_size", "best_of", "map_name", "final_map_name",
  "host_id", "challenger_id", "host_name", "challenger_name", "team_alpha_name", "team_bravo_name", "host_team_name", "challenger_team_name",
  "winner_id", "winner_score", "loser_score", "confirmed_score_alpha", "confirmed_score_bravo", "team_alpha_score", "team_bravo_score",
  "team_a_score", "team_b_score", "reported_score_alpha", "reported_score_bravo", "match_completed_date", "completed_date", "accepted_date"];

export function buildProfileArena({ userId, ranked = [], xp = [], eights = [], participants = [], rankedStats = [], eightsStats = [], xpStats, tpStanding }) {
  const arenas = new Map();
  const latestRatings = new Map();
  const cutoffs = new Map();
  const globalCutoffs = new Map();
  const ensure = (mode, data) => {
    const gameId = normalizeGame(data), key = `${mode}:${gameId}`;
    if (!arenas.has(key)) arenas.set(key, { id: key, mode, game_id: gameId, game_name: gameTitle(data), wins: 0, losses: 0,
      rating: mode === "xp" ? normalizeMatchXP(xpStats?.total_xp) : latestRatings.get(key) ?? null, rating_label: mode === "xp" ? "Global XP" : "ELO" });
    return arenas.get(key);
  };
  const seenStats = new Set();
  for (const [mode, rows] of [["ranked", rankedStats], ["eights", eightsStats]]) {
    for (const row of rows) {
      const key = `${mode}:${normalizeGame(row.metadata || {})}`;
      if (seenStats.has(key)) continue;
      seenStats.add(key);
      cutoffs.set(key, row.metadata?.progression_reset_at);
      if (!row.metadata?.game_id && row.metadata?.progression_reset_at && !globalCutoffs.has(mode)) globalCutoffs.set(mode, row.metadata.progression_reset_at);
      // Dedicated Free 8s ELO, never legacy/Money 8s metadata.rating.
      const rating = normalizeMatchXP(mode === "eights" ? row.free_eights_elo : row.metadata?.elo);
      latestRatings.set(key, rating);
      if (rating || (mode === "ranked" && normalizeMatchXP(row.metadata?.matches_played))) ensure(mode, row.metadata || {}).rating = rating;
    }
  }
  const recent = [], seen = new Set();
  for (const [mode, rows] of [["ranked", ranked], ["xp", xp], ["eights", eights]]) {
    for (const row of rows) {
      const match = { ...row.metadata, id: row.id };
      if (match.status !== "completed" || (mode === "eights" && match.match_type !== "8s")) continue;
      if (mode !== "eights" && match.match_type && ![mode, mode === "xp" ? "xp_match" : "elo"].includes(match.match_type)) continue;
      const key = `${mode}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const options = { wagerParticipants: participants };
      const side = profileMatchSideFor(match, userId, options);
      const result = profileMatchOutcome(match, userId, options);
      // Unresolved/ambiguous results must not become fabricated losses.
      if (!["win", "loss"].includes(result)) continue;
      const arena = ensure(mode, match);
      if (matchAfterProgressionReset(match, row, mode === "xp" ? xpStats?.progression_reset_at : cutoffs.get(`${mode}:${normalizeGame(match)}`) || globalCutoffs.get(mode))) arena[result === "win" ? "wins" : "losses"]++;
      const safe = Object.fromEntries(publicMatchFields.filter((key) => match[key] !== undefined).map((key) => [key, match[key]]));
      recent.push({ ...safe, id: row.id, status: "completed", match_type: mode === "eights" ? "8s" : mode,
        game_id: arena.game_id, game_name: arena.game_name, profile_side: side, profile_result: result,
        created_date: new Date(row.created_date || 0).toISOString() });
    }
  }
  const rows = [...arenas.values()].sort((a, b) => a.game_name.localeCompare(b.game_name) || a.mode.localeCompare(b.mode));
  return { arenas: rows, tp_rank: tpStanding?.tp_rank || tpRank({ xp: xpStats?.total_xp }),
    recent_matches: recent.sort((a, b) => new Date(b.match_completed_date || b.completed_date || b.created_date) - new Date(a.match_completed_date || a.completed_date || a.created_date)).slice(0, 50),
    wins: rows.reduce((sum, row) => sum + row.wins, 0), losses: rows.reduce((sum, row) => sum + row.losses, 0) };
}

export async function getProfileArena(db, userId) {
  const memberships = await db.wagerParticipant.findMany({ where: field("user_id", userId), select: { metadata: true } });
  const ids = [...new Set(memberships.map((row) => row.metadata?.wager_id).filter((id) => typeof id === "string" && id))];
  const [ranked, xp, eights, rankedStats, eightsStats, xpStats, standings] = await Promise.all([
    db.rankedMatch.findMany({ where: { AND: [field("status", "completed"), participantWhere(userId)] }, select: { id: true, created_date: true, metadata: true } }),
    db.xPMatch.findMany({ where: { AND: [field("status", "completed"), participantWhere(userId)] }, select: { id: true, created_date: true, metadata: true } }),
    db.wager.findMany({ where: { AND: [field("status", "completed"), field("match_type", "8s"), { OR: [field("host_id", userId), field("challenger_id", userId), ...(ids.length ? [{ id: { in: ids } }] : [])] }] }, select: { id: true, created_date: true, metadata: true } }),
    db.rankedStats.findMany({ where: field("user_id", userId), orderBy: { created_date: "desc" }, select: { metadata: true } }),
    db.eightsStats.findMany({ where: field("user_id", userId), orderBy: { created_date: "desc" }, select: { metadata: true, free_eights_elo: true } }),
    db.xPStats.findFirst({ where: field("user_id", userId), orderBy: { created_date: "desc" }, select: { metadata: true } }),
    getXPStandings(db),
  ]);
  return buildProfileArena({ userId, ranked, xp, eights, participants: memberships.map((row) => row.metadata), rankedStats, eightsStats,
    xpStats: xpStats?.metadata, tpStanding: standings.find((row) => row.user_id === userId) });
}
