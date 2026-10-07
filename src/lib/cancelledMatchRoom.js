export function cancelledMatchDestination(match, matchType, tournament) {
  if (match?.status !== "cancelled" && !(matchType === "tournament" && tournament?.status === "cancelled")) return null;
  if (matchType === "tournament") return match?.tournament_id ? `/tournaments/${encodeURIComponent(match.tournament_id)}` : "/tournaments";
  if (matchType === "ranked") return "/ranked";
  if (matchType === "xp") return "/xp";
  if (match?.match_type === "money8s" || matchType === "money8s") return "/ranked/8s?mode=money";
  if (match?.match_type === "8s" || matchType === "8s") return "/ranked/8s";
  return "/wagers";
}

// A background read may finish after an action has already returned a newer
// record. Never let that read undo a cancellation or replace newer results.
export function latestRoomRecord(previous, incoming) {
  if (!previous || !incoming || previous.id !== incoming.id) return incoming;
  if (previous.status === "cancelled" && incoming.status !== "cancelled") return previous;
  if (incoming.status === "cancelled") return incoming;
  const oldTime = Date.parse(previous.updated_date);
  const newTime = Date.parse(incoming.updated_date);
  return Number.isFinite(oldTime) && Number.isFinite(newTime) && newTime < oldTime ? previous : incoming;
}

export const matchCancelledEvent = "topfragg:match-cancelled";
const cancellationTypes = {
  Wager: "wager", RankedMatch: "ranked", XPMatch: "xp",
  TournamentMatch: "tournament", Tournament: "tournament-parent",
};

export function notifyCancelledMatch(match, entity) {
  const entityType = cancellationTypes[entity];
  if (match?.status !== "cancelled" || !match.id || !entityType || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(matchCancelledEvent, { detail: { entityType, id: String(match.id) } }));
}

export function notifyCancelledMatchResponse(data, functionName) {
  if (data?.success === false) return;
  notifyCancelledMatch(data?.wager, "Wager");
  notifyCancelledMatch(data?.tournament, "Tournament");
  const entity = /ranked/i.test(functionName) ? "RankedMatch"
    : /xp/i.test(functionName) ? "XPMatch"
      : /tournament/i.test(functionName) ? "TournamentMatch" : null;
  notifyCancelledMatch(data?.match, entity);
}

// Keep a confirmed cancellation excluded even when an older request finishes later.
export function excludeCancelledHeaderMatches(matches, cancellations) {
  return matches.filter((match) => !cancellations.has(`${match.entity_type}:${match.id}`)
    && !(match.entity_type === "tournament" && cancellations.has(`tournament-parent:${match.tournament_id}`)));
}
