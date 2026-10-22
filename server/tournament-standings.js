import { storedGameId } from "../src/lib/mw4.js";

export function buildTournamentStandings(tournaments, awards, gameId) {
  const eligible = new Set(tournaments.filter((row) => {
    const event = row.metadata || row;
    return event.status === "completed" && storedGameId(row) === gameId;
  }).map((row) => row.id));
  const counts = new Map(), seen = new Set();
  for (const row of awards) {
    const award = row.metadata || row;
    if (!eligible.has(award.tournament_id) || seen.has(award.tournament_id)) continue;
    seen.add(award.tournament_id);
    for (const id of new Set(award.user_ids || [])) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts].map(([user_id, tournament_wins]) => ({ user_id, tournament_wins }))
    .sort((a, b) => b.tournament_wins - a.tournament_wins || a.user_id.localeCompare(b.user_id));
}
