export const xpTeamMatchWhere = (teamIds) => ({
  OR: teamIds.flatMap((teamId) => [
    { metadata: { path: ["host_party_team_id"], equals: teamId } },
    { metadata: { path: ["challenger_party_team_id"], equals: teamId } },
    { metadata: { path: ["team_alpha_party_teams"], array_contains: [{ team_id: teamId }] } },
    { metadata: { path: ["team_bravo_party_teams"], array_contains: [{ team_id: teamId }] } },
  ]),
});
