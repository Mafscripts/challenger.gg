export async function loadPlayTeams(api) {
  const result = await api.profile.teamPage();
  return (result.teams || []).map(team => ({ ...team, members: result.membersByTeam?.[team.id] || [] }));
}
