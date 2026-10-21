export const XP_MATCH_BASE_CHANGE = 20;
export const XP_MATCH_MIN_CHANGE = 5;
export const XP_MATCH_MAX_CHANGE = 40;
const EXPECTATION_SCALE = 2000;

export const normalizeMatchXP = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;

export function xpMatchRoster(match, side) {
  const stored = match?.[`team_${side}_player_ids`];
  if (Array.isArray(stored) && stored.length) return stored;
  const captain = side === "alpha" ? match?.host_id : match?.challenger_id;
  return captain ? [captain] : [];
}

export const xpMatchTeamSize = (match) => /^[1-5]v[1-5]$/.test(match?.team_size || "")
  && match.team_size[0] === match.team_size[2] ? Number(match.team_size[0]) : 1;

export function completeXPMatchRoster(match) {
  const alpha = xpMatchRoster(match, "alpha"), bravo = xpMatchRoster(match, "bravo");
  const size = xpMatchTeamSize(match);
  return alpha.length === size && bravo.length === size
    && [...alpha, ...bravo].every((id) => typeof id === "string" && id)
    && new Set([...alpha, ...bravo]).size === size * 2
    && alpha.includes(match.host_id) && bravo.includes(match.challenger_id);
}

export function xpMatchStrength(match, xpByUser, capturedAt = new Date().toISOString()) {
  const alpha = xpMatchRoster(match, "alpha"), bravo = xpMatchRoster(match, "bravo");
  const players = Object.fromEntries([...alpha, ...bravo].map((id) => [id, normalizeMatchXP(xpByUser[id])]));
  const average = (ids) => ids.reduce((sum, id) => sum + players[id], 0) / Math.max(1, ids.length);
  return { version: 1, captured_at: capturedAt, players,
    alpha_average_xp: average(alpha), bravo_average_xp: average(bravo) };
}

export function xpMatchOutcome(strength, winningSide) {
  const winnerAverage = normalizeMatchXP(strength[`${winningSide}_average_xp`]);
  const losingSide = winningSide === "alpha" ? "bravo" : "alpha";
  const loserAverage = normalizeMatchXP(strength[`${losingSide}_average_xp`]);
  const exponent = Math.max(-20, Math.min(20, (loserAverage - winnerAverage) / EXPECTATION_SCALE));
  const expectedWin = 1 / (1 + 10 ** exponent);
  const change = Math.max(XP_MATCH_MIN_CHANGE, Math.min(XP_MATCH_MAX_CHANGE,
    Math.round(XP_MATCH_BASE_CHANGE * 2 * (1 - expectedWin))));
  return { change, winning_side: winningSide, winner_average_xp: winnerAverage, loser_average_xp: loserAverage };
}
