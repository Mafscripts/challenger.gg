import { xpMatchRoster } from "./xpMatchRating.js";

export const XP_TEAM_OPPONENT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

// Parties can still fill larger matches. The first opposing party's acceptance
// unlocks the room; posting a match alone never does.
export const xpMatchAwaitingAcceptance = (match) => match?.status === "open"
  && (!match.challenger_id || !xpMatchRoster(match, "bravo").includes(match.challenger_id));

export const xpMatchDestination = (match) => xpMatchAwaitingAcceptance(match)
  ? "/xp#matchfinder" : `/xp-match/${encodeURIComponent(match.id)}`;

export function xpMatchTeamIds(match, side) {
  const parties = match?.[`team_${side}_party_teams`];
  return [...new Set([
    ...(Array.isArray(parties) ? parties.map(party => party.team_id) : []),
    match?.[side === "alpha" ? "host_party_team_id" : "challenger_party_team_id"],
    match?.[side === "alpha" ? "host_team_id" : "challenger_team_id"],
  ].filter(id => typeof id === "string" && id))];
}

export function xpTeamOpponentRetryAt(matches, teamId, opposingTeamIds, now = Date.now()) {
  const opponents = new Set(opposingTeamIds);
  let retryAt = 0;
  for (const match of matches) {
    if (match.status !== "completed") continue;
    const completedAt = Date.parse(match.match_completed_date || match.completed_date || match.updated_date || match.created_date);
    if (!Number.isFinite(completedAt) || completedAt + XP_TEAM_OPPONENT_COOLDOWN_MS <= now) continue;
    const alpha = xpMatchTeamIds(match, "alpha"), bravo = xpMatchTeamIds(match, "bravo");
    if ((alpha.includes(teamId) && bravo.some(id => opponents.has(id)))
      || (bravo.includes(teamId) && alpha.some(id => opponents.has(id)))) {
      retryAt = Math.max(retryAt, completedAt + XP_TEAM_OPPONENT_COOLDOWN_MS);
    }
  }
  return retryAt;
}
