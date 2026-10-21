import { base44 } from "@/api/base44Client";
import { xpMatchRoster, xpMatchTeamSize } from "./xpMatchRating.js";

export async function loadCaptainXPTeams(userId) {
  if (!userId) return [];
  const result = await base44.profile.teamPage();
  return (result.teams || []).filter((team) => team.is_active !== false && team.team_type === "xp" && team.captain_id === userId)
    .map((team) => ({ ...team, members: (result.membersByTeam?.[team.id] || []).filter((member) => member.is_active !== false) }));
}

export function xpTeamsForMatch(teams, match) {
  const size = xpMatchTeamSize(match);
  const alpha = xpMatchRoster(match, "alpha"), bravo = xpMatchRoster(match, "bravo");
  const joined = new Set([...alpha, ...bravo]);
  const available = Math.max(size - alpha.length, size - bravo.length);
  return teams.filter((team) => {
    const members = team.members || [];
    const roster = Number(team.roster_size || members.length || 0);
    return Number.isInteger(roster) && roster === size && roster <= available
      && members.length === roster && new Set(members.map((member) => member.user_id)).size === roster
      && members.some((member) => member.user_id === team.captain_id)
      && members.every((member) => !joined.has(member.user_id));
  });
}
