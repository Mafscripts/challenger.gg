const score = value => Math.max(0, Number(value) || 0);
const best = (rows, metric, idKey = "id") => rows
  .filter(row => row[idKey] && !row.is_banned && score(row[metric]) > 0)
  .sort((a, b) => score(b[metric]) - score(a[metric]) || String(a[idKey]).localeCompare(String(b[idKey])))[0];

export function selectHomeChampions({ xp = [], wagers = [], tournaments = [] }) {
  const picks = { xp: [best(xp, "total_xp", "user_id"), "total_xp", "user_id"], wagers: [best(wagers, "total_wager_earnings"), "total_wager_earnings", "id"], tournaments: [best(tournaments, "tournament_wins"), "tournament_wins", "id"] };
  return Object.fromEntries(Object.entries(picks).map(([kind, [row, metric, idKey]]) => [kind, row ? { user_id: row[idKey], score: score(row[metric]) } : null]));
}
