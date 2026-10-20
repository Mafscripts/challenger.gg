import { base44 } from "@/api/base44Client";
import { xpMatchRoster, xpMatchTeamSize } from "./xpMatchRating.js";

export async function loadCaptainXPTeams(userId) {
  if (!userId) return [];
  const teams = await base44.entities.Team.filterFresh({ captain_id: userId }, "-created_date", 100);
  return Promise.all((teams || [])
    .filter((team) => team.is_active !== false && ["xp", "ranked"].includes(team.team_type))
    .map(async (team) => {
      const members = await base44.entities.TeamMember.filterFresh({ team_id: team.id }, "-joined_date", 10);
      return { ...team, members: (members || []).filter((member) => member.is_active !== false) };
    }));
}

export function xpTeamsForMatch(teams, match) {
  const size = xpMatchTeamSize(match);
  const alpha = xpMatchRoster(match, "alpha"), bravo = xpMatchRoster(match, "bravo");
  const joined = new Set([...alpha, ...bravo]);
  const available = Math.max(size - alpha.length, size - bravo.length);
  return teams.filter((team) => {
    const members = team.members || [];
    const roster = Number(team.roster_size || members.length || 0);
    return Number.isInteger(roster) && roster >= 1 && roster <= available
      && members.length === roster
      && members.some((member) => member.user_id === team.captain_id)
      && members.every((member) => !joined.has(member.user_id));
  });
}
