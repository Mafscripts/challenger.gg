export const PARTY_SPIN_MS = 6000;
export const partyCapacity = (room) => room.team_size * room.teams.length;
export const partyGenderQuota = (room, teamId) => {
  const index = room.teams.findIndex((team) => team.id === teamId);
  const male = index % 2 === 0 ? Math.ceil(room.team_size / 2) : Math.floor(room.team_size / 2);
  return { male, female: room.team_size - male };
};
export const partySpinEnds = (room) => Date.parse(room.spin?.started_at || "") + (room.spin?.duration_ms || 0);
export const partySpinning = (room, now = Date.now()) => Boolean(room.spin && now < partySpinEnds(room));
export const partySide = (room) => {
  return [...room.teams].sort((a, b) => room.players.filter((player) => player.side === a.id).length - room.players.filter((player) => player.side === b.id).length)[0]?.id;
};
export function partyValidation(room) {
  if (room.players.length !== partyCapacity(room)) return `Add exactly ${partyCapacity(room)} players for ${room.teams.length} teams of ${room.team_size}.`;
  if (room.mode === "coed") {
    const male = room.teams.reduce((sum, team) => sum + partyGenderQuota(room, team.id).male, 0);
    const female = partyCapacity(room) - male;
    if (room.players.filter((player) => player.gender === "male").length !== male
      || room.players.filter((player) => player.gender === "female").length !== female) return `Co-ed needs ${male} male and ${female} female players for these teams.`;
  }
  return null;
}
export function partyCandidates(room) {
  const side = partySide(room);
  let pool = room.players.filter((player) => !player.side);
  if (room.mode === "coed") {
    const quotas = partyGenderQuota(room, side);
    pool = pool.filter((player) => room.players.filter((entry) => entry.side === side && entry.gender === player.gender).length < quotas[player.gender]);
  }
  if (room.mode === "switcheroo" && room.previous_teams) {
    const teammates = room.players.filter((player) => player.side === side);
    const cost = (player) => teammates.filter((mate) => room.previous_teams[player.id] && room.previous_teams[player.id] === room.previous_teams[mate.id]).length;
    const best = Math.min(...pool.map(cost));
    pool = pool.filter((player) => cost(player) === best);
  }
  return pool;
}
