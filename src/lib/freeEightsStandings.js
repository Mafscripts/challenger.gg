import { normalizeFreeEightsElo } from "./freeEightsRanks.js";
import { playerDisplayName } from "./playerIdentity.js";

const count = (value) => Math.max(0, Number(value) || 0);

export function buildFreeEightsStandings(statsRows, usersById = new Map(), limit = 50) {
  return statsRows.map((row) => {
    const user = usersById.get(String(row.user_id));
    return {
      id: row.id || row.user_id,
      userId: row.user_id,
      user,
      name: playerDisplayName({ ...row, user }),
      slug: user?.username || row.user_id || user?.id || row.username || "",
      wins: count(row.wins),
      losses: count(row.losses),
      streak: count(row.win_streak ?? user?.current_win_streak),
      score: normalizeFreeEightsElo(row.free_eights_elo),
    };
  }).sort((a, b) => b.score - a.score || b.wins - a.wins || a.losses - b.losses || String(a.userId).localeCompare(String(b.userId)))
    .slice(0, limit);
}
