import { normalizeMatchXP, xpMatchRoster } from "../src/lib/xpMatchRating.js";
import { matchAfterProgressionReset } from "../src/lib/progressionResets.js";

export const emptyXPMatchRecord = () => ({ total_xp: 0, wins: 0, losses: 0, matches_played: 0, win_streak: 0, weekly_xp: 0 });
const completedAt = row => Date.parse(row.metadata?.match_completed_date || row.metadata?.completed_date || row.created_date || "") || 0;
const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

// XPMatch is the score ledger. General account rewards and old mixed XPStats
// balances never seed this competition's rating, record or matchmaking strength.
export function buildXPMatchRecords(statsRows, matches) {
  const cutoffs = new Map();
  for (const row of statsRows) if (!cutoffs.has(row.metadata?.user_id)) cutoffs.set(row.metadata?.user_id, row.metadata?.progression_reset_at);
  const records = new Map(), seen = new Set();
  const weekStart = Date.now() - 7 * 86400000;
  for (const row of [...matches].sort((a, b) => completedAt(a) - completedAt(b) || String(a.id || "").localeCompare(String(b.id || "")))) {
    const match = row.metadata || {};
    if (match.progression_archived_at || match.status !== "completed" || (match.match_type && !["xp", "xp_match"].includes(match.match_type))) continue;
    if (row.id && seen.has(row.id)) continue;
    if (row.id) seen.add(row.id);
    const alpha = xpMatchRoster(match, "alpha"), bravo = xpMatchRoster(match, "bravo");
    const winnerSide = match.winner_id && match.winner_id === match.host_id ? "alpha" : match.winner_id && match.winner_id === match.challenger_id ? "bravo" : null;
    for (const id of new Set([...alpha, ...bravo])) {
      if (typeof id !== "string" || !id || !matchAfterProgressionReset(match, row, cutoffs.get(id))) continue;
      const record = records.get(id) || emptyXPMatchRecord();
      const change = match.xp_changes?.[id];
      const won = typeof change?.won === "boolean" ? change.won : winnerSide ? (winnerSide === "alpha" ? alpha : bravo).includes(id) : null;
      let delta = 0;
      if (finite(change?.delta)) delta = Math.round(Number(change.delta));
      else if (finite(change?.new_xp) && finite(change?.previous_xp)) delta = Math.round(Number(change.new_xp) - Number(change.previous_xp));
      else if (finite(change?.amount)) delta = Math.round(Number(change.amount));
      else if (finite(match.xp_rating_outcome?.change) && won !== null) delta = Math.abs(Math.round(Number(match.xp_rating_outcome.change))) * (won ? 1 : -1);
      record.total_xp = normalizeMatchXP(record.total_xp + delta);
      record.matches_played++;
      if (won === true) { record.wins++; record.win_streak++; }
      else if (won === false) { record.losses++; record.win_streak = 0; }
      if (completedAt(row) >= weekStart) record.weekly_xp = normalizeMatchXP(record.weekly_xp + delta);
      records.set(id, record);
    }
  }
  return records;
}
