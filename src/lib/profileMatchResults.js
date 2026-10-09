const id = (value) => value === undefined || value === null || value === "" ? null : String(value);
const sameId = (left, right) => id(left) !== null && id(left) === id(right);
const sideFor = (value) => {
  const side = String(value || "").toLowerCase().replace(/[\s_-]/g, "");
  if (["host", "alpha", "a", "teama", "teamalpha"].includes(side)) return "alpha";
  if (["challenger", "bravo", "b", "teamb", "teambravo"].includes(side)) return "bravo";
  return null;
};

export const participantBelongsToUser = (participant, userId) => Boolean(userId && (
  sameId(participant?.captain_id, userId)
  || sameId(participant?.user_id, userId)
  || (Array.isArray(participant?.members) && participant.members.some((member) => sameId(member?.user_id, userId)))
));

const participantKeys = (participant) => [participant?.id, participant?.team_id, participant?.user_id, participant?.captain_id]
  .map(id).filter(Boolean);
const tournamentSideKeys = (match, side) => [match?.[`team_${side}_participant_id`], match?.[`team_${side}_id`]]
  .map(id).filter(Boolean);

export function tournamentMatchSideFor(match, participants) {
  // A team can enter more than one tournament; only this tournament's entry
  // may identify the player's side in this match.
  const keys = new Set((participants || []).filter((participant) => !match?.tournament_id
    || sameId(participant.tournament_id, match.tournament_id)).flatMap(participantKeys));
  const alpha = tournamentSideKeys(match, "a").some((key) => keys.has(key));
  const bravo = tournamentSideKeys(match, "b").some((key) => keys.has(key));
  return alpha === bravo ? null : alpha ? "alpha" : "bravo";
}

export function profileMatchOutcome(match, userId, { wagerParticipants = [], tournamentParticipants = [] } = {}) {
  if (!match || !userId) return "pending";
  const status = String(match.status || "").toLowerCase();
  if (status && status !== "completed") return "pending";
  if (!status && match.completed === false) return "pending";

  // These booleans were saved when rewards were awarded to each actual
  // player. They do not depend on captain IDs or a truncated roster query.
  for (const changes of [match.elo_changes, match.xp_changes]) {
    const won = changes?.[userId]?.won;
    if (typeof won === "boolean") return won ? "win" : "loss";
  }
  if (!match.winner_id) return "pending";

  if (match.tournament_id || String(match.match_type || "").toLowerCase().includes("tournament")) {
    const entries = tournamentParticipants.filter((participant) => participantBelongsToUser(participant, userId));
    const ownSide = tournamentMatchSideFor(match, entries);
    const winner = id(match.winner_id);
    const alphaWon = tournamentSideKeys(match, "a").includes(winner);
    const bravoWon = tournamentSideKeys(match, "b").includes(winner);
    if (!ownSide || alphaWon === bravoWon) return "pending";
    return ownSide === (alphaWon ? "alpha" : "bravo") ? "win" : "loss";
  }

  const participantSides = [...new Set(wagerParticipants.filter((participant) => sameId(participant.wager_id, match.id)
    && participantBelongsToUser(participant, userId)).map((participant) => sideFor(participant.team || participant.side)).filter(Boolean))];
  const ownSide = participantSides.length === 1 ? participantSides[0]
    : participantSides.length > 1 ? null
      : sameId(match.host_id, userId) ? "alpha" : sameId(match.challenger_id, userId) ? "bravo" : null;
  const winnerSide = sameId(match.winner_id, match.host_id) ? "alpha"
    : sameId(match.winner_id, match.challenger_id) ? "bravo" : null;
  if (ownSide && winnerSide) return ownSide === winnerSide ? "win" : "loss";
  if (sameId(match.winner_id, userId)) return "win";
  if (sameId(match.loser_id, userId)) return "loss";
  // Missing/ambiguous team membership is not evidence of a loss.
  return "pending";
}
