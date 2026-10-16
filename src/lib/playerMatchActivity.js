import { participantBelongsToUser, profileMatchOutcome, profileMatchSideFor, tournamentMatchSideFor } from "@/lib/profileMatchResults";
import { matchDateMs } from "@/lib/matchPresentation";

export async function loadPlayerMatchActivity(api, userId) {
  const failures = [];
  const read = async (label, request, fallback = []) => {
    try {
      return await request();
    } catch (error) {
      // Deleted rooms no longer belong in the activity list.
      if (fallback === null && error.status === 404) return null;
      failures.push(label);
      return fallback;
    }
  };
  const [hostedWagers, challengedWagers, participants, hostedRanked, challengedRanked, hostedXp, challengedXp, tournamentParticipants, challenges] = await Promise.all([
    read("Wagers", () => api.entities.Wager.filterFresh({ host_id: userId }, "-created_date", 50)),
    read("Wagers", () => api.entities.Wager.filterFresh({ challenger_id: userId }, "-created_date", 50)),
    read("8s and team matches", () => api.entities.WagerParticipant.filterFresh({ user_id: userId }, "-joined_date", 50)),
    read("Ranked", () => api.entities.RankedMatch.filterFresh({ host_id: userId }, "-created_date", 50)),
    read("Ranked", () => api.entities.RankedMatch.filterFresh({ challenger_id: userId }, "-created_date", 50)),
    read("XP", () => api.entities.XPMatch.filterFresh({ host_id: userId }, "-created_date", 50)),
    read("XP", () => api.entities.XPMatch.filterFresh({ challenger_id: userId }, "-created_date", 50)),
    read("Tournaments", () => api.profile.tournamentParticipants(userId)),
    read("Challenge a Team", async () => { const { data } = await api.functions.invoke("getChallengeActivity", { user_id: userId }); return data?.matches || []; }),
  ]);
  if (failures.length === 9) throw new Error("Your matches could not be loaded. Please try again shortly.");

  const knownWagers = new Set([...hostedWagers, ...challengedWagers].map((row) => String(row.id)));
  const joinedIds = [...new Set(participants.map((row) => row.wager_id).filter(Boolean))].filter((id) => !knownWagers.has(String(id)));
  const entries = tournamentParticipants.filter((entry) => participantBelongsToUser(entry, userId));
  const tournamentIds = [...new Set(entries.map((entry) => entry.tournament_id).filter(Boolean))];
  const [joinedWagers, tournamentRows] = await Promise.all([
    Promise.all(joinedIds.map((id) => read("8s and team matches", () => api.entities.Wager.getFresh(id), null))),
    Promise.all(tournamentIds.map((id) => read("Tournaments", () => api.entities.TournamentMatch.filterFresh({ tournament_id: id }, "-created_date", 100)))),
  ]);
  const participantByMatch = new Map();
  for (const participant of participants) {
    const key = String(participant.wager_id);
    participantByMatch.set(key, [...(participantByMatch.get(key) || []), participant]);
  }
  const enrich = (match, source, options = {}) => {
    const normalized = { ...match, status: match.completed === true ? "completed" : match.status, match_type: match.match_type || source, activity_source: source };
    return { ...normalized, profile_side: profileMatchSideFor(normalized, userId, options), profile_result: profileMatchOutcome(normalized, userId, options) };
  };
  const matches = [
    ...challenges,
    ...[...hostedWagers, ...challengedWagers, ...joinedWagers.filter(Boolean)].map((match) => enrich(match, "wager", { wagerParticipants: participantByMatch.get(String(match.id)) || [] })),
    ...[...hostedRanked, ...challengedRanked].map((match) => enrich(match, "ranked")),
    ...[...hostedXp, ...challengedXp].map((match) => enrich(match, "xp")),
    ...tournamentRows.flat().filter((match) => tournamentMatchSideFor(match, entries)).map((match) => enrich(match, "tournament", { tournamentParticipants: entries })),
  ].filter((match) => match.id && !["cancelled", "canceled", "expired"].includes(String(match.status || "").toLowerCase()));
  const unique = [...new Map(matches.map((match) => [`${match.activity_source}:${match.id}`, match])).values()]
    .sort((a, b) => matchDateMs(b) - matchDateMs(a));
  return { matches: unique, incompleteSources: [...new Set(failures)] };
}
