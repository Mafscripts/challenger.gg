export const freeEightsMatchCode = (matchId) => String(matchId).slice(-8).toUpperCase();

export const freeEightsVoiceChannelName = (matchId, side) =>
  `8s ${side === "waiting" ? "Waiting" : side === "host" ? "Alpha" : "Bravo"} · #${freeEightsMatchCode(matchId)}`;

export function freeEightsMatchFormat(match) {
  const mode = String(match.game_mode_display || match.game_mode || "Free 8s")
    .replace(/\s*(?:[·|–-]\s*)?(?:BO\s*\d+|Best\s+of\s+\d+)\s*$/i, "").trim();
  return `${mode || "Free 8s"} · BO${match.best_of || 3}`;
}
