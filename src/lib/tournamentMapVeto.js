const key = value => String(value || "").trim().toLowerCase();
const closed = match => match?.completed || match?.winner_id || ["completed", "cancelled", "closed", "disputed", "score_conflict"].includes(match?.status);
const hasReports = match => Object.keys(match).some(field => /reported_score|score_reported|reported_by/.test(field) && match[field] != null && match[field] !== "");
export const tournamentVetoPending = match => match?.map_veto?.version === 1
  && (!match.map_veto.bans?.team_a || !match.map_veto.bans?.team_b);
export const tournamentVetoMaps = match => Object.values(match?.map_veto?.bans || {}).map(ban => key(ban.map));

export function tournamentVetoState(match, participants) {
  if (closed(match) || !match.team_a_id || !match.team_b_id) return match.map_veto || null;
  const previous = match.map_veto;
  if (previous?.version === 1 && previous.teams?.team_a === match.team_a_id && previous.teams?.team_b === match.team_b_id) return previous;
  // Do not introduce a veto halfway through a match that is already being played/reported.
  if (match.match_started_date || ["in_progress", "live"].includes(match.status) || hasReports(match)) return null;
  const captains = Object.fromEntries(["team_a", "team_b"].map(side => {
    const participant = participants.find(row => row.id === match[`${side}_participant_id`]
      || row.team_id === match[`${side}_id`] || row.user_id === match[`${side}_id`]);
    return [side, participant?.captain_id || participant?.user_id || null];
  }));
  return { version: 1, teams: { team_a: match.team_a_id, team_b: match.team_b_id }, captains, bans: {} };
}

export function tournamentVetoChoice(match, userId, requestedMap, pools, timestamp) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (closed(match) || match.match_started_date || ["in_progress", "live"].includes(match.status) || hasReports(match)) fail("Map veto is closed for this match.");
  const veto = match.map_veto;
  if (veto?.version !== 1) fail("Map veto is not available for this match.");
  const sides = ["team_a", "team_b"].filter(side => veto.captains?.[side] === userId);
  if (sides.length !== 1) fail("Only the registered team captain may veto a map for their own team.");
  const side = sides[0];
  if (veto.bans?.[side]) fail("Your team has already used its map veto.");
  const map = pools.flat().find(name => key(name) === key(requestedMap));
  if (!map) fail("Choose a map from this match's map pool.");
  if (tournamentVetoMaps(match).includes(key(map))) fail("That map has already been vetoed.");
  const banned = new Set([...tournamentVetoMaps(match), key(map)]);
  if (pools.some(pool => !pool.some(name => !banned.has(key(name))))) fail("This veto would leave a game mode without a playable map.");
  return { ...veto, bans: { ...veto.bans, [side]: { map, user_id: userId, team_id: match[`${side}_id`], vetoed_at: timestamp } } };
}
