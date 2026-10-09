import { calculateFreeEightsElo } from "../src/lib/freeEightsRanks.js";
import { serializeRow } from "./entity.js";
import { findEightsStatsRow } from "./free-eights-games.js";
import { eightsGameId } from "../src/lib/freeEightsGames.js";

// Match completion and ELO are committed together. A database lock serializes
// this small ladder update across API workers and overlapping match rosters.
export async function completeFreeEightsWithElo(db, matchId, completion) {
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-free-eights-elo'))`;
    const match = await tx.wager.findUnique({ where: { id: matchId } });
    if (!match || match.metadata.match_type !== "8s") throw new Error("Free 8s match required for ELO");
    if (match.metadata.status === "completed" || match.metadata.free_eights_elo_applied_at) {
      return { applied: false, match: serializeRow(match) };
    }
    if (match.metadata.status === "cancelled") throw new Error("Cancelled Free 8s matches cannot award ELO");
    const winningSide = completion.winner_id === match.metadata.host_id ? "host" : "challenger";
    if (![match.metadata.host_id, match.metadata.challenger_id].includes(completion.winner_id)) throw new Error("Invalid Free 8s winner");
    const roster = await tx.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: matchId } } });
    const gameId = eightsGameId(match.metadata.game_id);
    const winners = [];
    const losers = [];
    const statsByUser = new Map();
    for (const row of roster) {
      const { user_id: userId, user_name: username, team } = row.metadata;
      if (!userId || !["host", "challenger"].includes(team)) throw new Error("Invalid Free 8s roster");
      let stats = await findEightsStatsRow(tx, userId, gameId);
      if (!stats) stats = await tx.eightsStats.create({ data: { metadata: { user_id: userId, game_id: gameId, username: username || "Player" } } });
      statsByUser.set(userId, stats);
      (team === winningSide ? winners : losers).push({ user_id: userId, elo: stats.free_eights_elo });
    }
    if (winners.length !== 4 || losers.length !== 4) throw new Error("Free 8s ELO requires a complete 4v4 roster");
    const changes = calculateFreeEightsElo(winners, losers);
    for (const [userId, change] of Object.entries(changes)) {
      // A dedicated column prevents legacy/Money 8s JSON stat updates from
      // overwriting Free 8s ELO. No global user rank or RankedStats is touched.
      await tx.eightsStats.update({ where: { id: statsByUser.get(userId).id }, data: { free_eights_elo: change.new_elo } });
    }
    const updated = await tx.wager.update({ where: { id: matchId }, data: { metadata: {
      ...match.metadata, ...completion,
      free_eights_elo_changes: changes, free_eights_elo_applied_at: new Date().toISOString(),
    } } });
    return { applied: true, match: serializeRow(updated) };
  }, { timeout: 15000, maxWait: 15000 });
  if (result.applied) console.info("[free-8s-elo] match completed", { match_id: matchId, changes: result.match.free_eights_elo_changes });
  return result;
}
