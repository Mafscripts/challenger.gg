const number = (value) => value !== null && value !== undefined && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value)) ? Number(value) : null;
const same = (a, b) => Boolean(a && b && String(a) === String(b));

export function confirmedMatchSummary(match, mode) {
  let winner = ["alpha", "bravo"].includes(match.winner) ? match.winner : null;
  if (!winner) {
    const alpha = mode === "tournaments" ? [match.team_a_id, match.team_a_participant_id] : [match.host_id];
    const bravo = mode === "tournaments" ? [match.team_b_id, match.team_b_participant_id] : [match.challenger_id];
    if (alpha.some((id) => same(id, match.winner_id))) winner = "alpha";
    else if (bravo.some((id) => same(id, match.winner_id))) winner = "bravo";
  }
  const alpha = number(match.confirmed_score_alpha ?? (mode === "tournaments" ? match.team_a_score : match.score?.alpha))
    ?? (winner ? number(winner === "alpha" ? match.winner_score : match.loser_score) : null);
  const bravo = number(match.confirmed_score_bravo ?? (mode === "tournaments" ? match.team_b_score : match.score?.bravo))
    ?? (winner ? number(winner === "bravo" ? match.winner_score : match.loser_score) : null);
  if (!winner && alpha !== null && bravo !== null && alpha !== bravo) winner = alpha > bravo ? "alpha" : "bravo";
  return { alpha, bravo, winner };
}

export function progressChangeFor(match, mode, playerId) {
  const changes = mode === "xp" ? match.xp_changes : mode === "ranked" ? match.elo_changes : mode === "eights" ? match.free_eights_elo_changes : null;
  const entry = changes?.[playerId];
  if (!entry || number(entry.delta) === null) return null;
  return { delta: number(entry.delta), before: number(entry.previous_xp ?? entry.previous_elo), after: number(entry.new_xp ?? entry.new_elo), label: mode === "xp" ? "XP" : mode === "eights" ? "Free 8s ELO" : "Ranked ELO" };
}

export function rematchSettingsFor(match, mode) {
  const challengeFormat = match.format_id || match.game_config?.formats?.find((format) => format.name === match.format_name
    || (Array.isArray(match.series_mode_ids) && JSON.stringify(format.modes) === JSON.stringify(match.series_mode_ids)))?.id;
  return { mode: mode === "wagers" ? "wager" : mode, game_id: match.game_id || "bo7", game_mode: ["eights", "money8s"].includes(mode) ? match.series_format : mode === "challenge" ? challengeFormat : match.game_mode,
    team_size: mode === "money8s" ? "4v4" : mode === "challenge" ? `${match.size}v${match.size}` : match.team_size,
    best_of: Number(match.best_of) || 1, play_rule: match.play_rule || "controller_only" };
}

export const rematchDestination = (mode, gameId) => mode === "xp" ? "/xp" : mode === "ranked" ? "/ranked" : mode === "wagers" ? "/wagers"
  : mode === "challenge" ? "/challenge-a-team" : `/ranked/8s?${mode === "money8s" ? "mode=money" : `game=${encodeURIComponent(gameId || "bo7")}`}`;
