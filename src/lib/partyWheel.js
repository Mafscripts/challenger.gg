export const PARTY_SPIN_MS = 6000;
export const PARTY_MAX_TEAMS = 128;
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
export function partyDrawMembers(room, entry) {
  return entry.duo_id ? room.players.filter((player) => player.duo_id === entry.duo_id) : [room.players.find((player) => player.id === entry.id)];
}
export function partyDrawEntries(room) {
  const seen = new Set();
  return room.players.filter((player) => !player.side).flatMap((player) => {
    if (!player.duo_id) return [player];
    if (seen.has(player.duo_id)) return [];
    seen.add(player.duo_id);
    const members = partyDrawMembers(room, player);
    return [{ ...player, name: members.map((member) => member.name).join(" + "), member_ids: members.map((member) => member.id) }];
  });
}

// Place the remaining duos first. Singles fill the remaining slots; identical
// capacities are interchangeable, which keeps a 16-team draw inexpensive.
function canFinishDraw(room, chosen = null, side = null) {
  const picked = chosen ? partyDrawMembers(room, chosen).map((player) => player.id) : [];
  const remaining = room.players.filter((player) => !player.side && !picked.includes(player.id));
  const bins = room.teams.map((team) => {
    const players = room.players.filter((player) => player.side === team.id || team.id === side && picked.includes(player.id));
    const quota = partyGenderQuota(room, team.id);
    return room.mode === "coed" ? [quota.male - players.filter((p) => p.gender === "male").length, quota.female - players.filter((p) => p.gender === "female").length]
      : [room.team_size - players.length, 0];
  });
  if (bins.some((bin) => bin.some((size) => size < 0))) return false;
  const duos = [], seen = new Set();
  for (const player of remaining) if (player.duo_id && !seen.has(player.duo_id)) {
    seen.add(player.duo_id);
    const pair = remaining.filter((p) => p.duo_id === player.duo_id);
    if (pair.length !== 2) return false;
    duos.push(room.mode === "coed" ? [pair.filter((p) => p.gender === "male").length, pair.filter((p) => p.gender === "female").length] : [2, 0]);
  }
  const singles = remaining.filter((p) => !p.duo_id);
  const counts = room.mode === "coed" ? [singles.filter((p) => p.gender === "male").length, singles.filter((p) => p.gender === "female").length] : [singles.length, 0];
  duos.sort((a, b) => b[0] - a[0]);
  const memo = new Set();
  const fit = (index) => {
    if (index === duos.length) return [0, 1].every((kind) => bins.reduce((sum, bin) => sum + bin[kind], 0) === counts[kind]);
    if (room.mode !== "coed" && bins.reduce((sum, bin) => sum + bin[0] % 2, 0) > counts[0]) return false;
    const key = `${index}:${bins.map((bin) => bin.join(",")).sort().join(";")}`;
    if (memo.has(key)) return false;
    const tried = new Set(), duo = duos[index];
    for (const bin of bins) {
      const shape = bin.join(",");
      if (tried.has(shape) || duo.some((size, kind) => size > bin[kind])) continue;
      tried.add(shape);
      bin[0] -= duo[0]; bin[1] -= duo[1];
      const result = fit(index + 1);
      bin[0] += duo[0]; bin[1] += duo[1];
      if (result) return true;
    }
    memo.add(key); return false;
  };
  return fit(0);
}
export function partyValidation(room) {
  if (room.players.length !== partyCapacity(room)) return `Add exactly ${partyCapacity(room)} players for ${room.teams.length} teams of ${room.team_size}.`;
  if (room.mode === "coed") {
    const male = room.teams.reduce((sum, team) => sum + partyGenderQuota(room, team.id).male, 0);
    const female = partyCapacity(room) - male;
    if (room.players.filter((player) => player.gender === "male").length !== male
      || room.players.filter((player) => player.gender === "female").length !== female) return `Co-ed needs ${male} male and ${female} female players for these teams.`;
  }
  if (room.players.some((player) => player.duo_id) && !canFinishDraw(room)) return "These duos cannot fit the team sizes and gender balance. Unlink a duo or change the roster before spinning.";
  return null;
}
export function partyCandidates(room) {
  const side = partySide(room);
  let pool = partyDrawEntries(room);
  if (room.mode === "coed") {
    const quotas = partyGenderQuota(room, side);
    pool = pool.filter((player) => ["male", "female"].every((gender) => room.players.filter((entry) => entry.side === side && entry.gender === gender).length
      + partyDrawMembers(room, player).filter((member) => member.gender === gender).length <= quotas[gender]));
  }
  const available = room.team_size - room.players.filter((player) => player.side === side).length;
  pool = pool.filter((player) => partyDrawMembers(room, player).length <= available);
  if (room.players.some((player) => player.duo_id)) pool = pool.filter((player) => canFinishDraw(room, player, side));
  if (room.mode === "switcheroo" && room.previous_teams) {
    const teammates = room.players.filter((player) => player.side === side);
    const cost = (player) => partyDrawMembers(room, player).reduce((sum, member) => sum + teammates.filter((mate) => room.previous_teams[member.id] && room.previous_teams[member.id] === room.previous_teams[mate.id]).length, 0);
    const best = Math.min(...pool.map(cost));
    pool = pool.filter((player) => cost(player) === best);
  }
  return pool;
}

// Solve the duo placement once, then fill the remaining individual slots.
// Re-solving for every candidate on every pick becomes costly with 128 teams.
export function assignPartyTeams(room, choose) {
  const order = (items) => {
    const remaining = [...items], result = [];
    while (remaining.length) result.push(remaining.splice(choose(remaining.length), 1)[0]);
    return result;
  };
  const bins = room.teams.map((team) => {
    const members = room.players.filter((player) => player.side === team.id);
    const quota = partyGenderQuota(room, team.id);
    return { id: team.id, members, left: room.mode === "coed"
      ? [quota.male - members.filter((p) => p.gender === "male").length, quota.female - members.filter((p) => p.gender === "female").length]
      : [room.team_size - members.length, 0] };
  });
  const bundles = partyDrawEntries(room).map((entry) => {
    const members = partyDrawMembers(room, entry);
    return { members, needs: room.mode === "coed" ? [members.filter((p) => p.gender === "male").length, members.filter((p) => p.gender === "female").length] : [members.length, 0] };
  });
  const duos = order(bundles.filter((bundle) => bundle.members.length === 2)).sort((a, b) => Math.max(...b.needs) - Math.max(...a.needs));
  const cost = (bundle, bin) => room.mode !== "switcheroo" || !room.previous_teams ? 0 : bundle.members.reduce((sum, member) => sum + bin.members.filter((mate) => room.previous_teams[member.id] && room.previous_teams[member.id] === room.previous_teams[mate.id]).length, 0);
  const targets = (bundle) => order(bins.filter((bin) => bundle.needs.every((need, i) => need <= bin.left[i])))
    .sort((a, b) => cost(bundle, a) - cost(bundle, b) || a.members.length - b.members.length);
  const place = (bundle, bin, undo = false) => {
    bundle.needs.forEach((need, i) => { bin.left[i] += undo ? need : -need; });
    if (undo) bin.members.splice(-bundle.members.length);
    else bin.members.push(...bundle.members);
    bundle.members.forEach((member) => { member.side = undo ? null : bin.id; });
  };
  const memo = new Set();
  const fit = (index) => {
    if (index === duos.length) return true;
    const key = `${index}:${bins.map((bin) => bin.left.join(",")).sort().join(";")}`;
    if (memo.has(key)) return false;
    const tried = new Set(), bundle = duos[index];
    for (const bin of targets(bundle)) {
      const shape = bin.left.join(",");
      if (tried.has(shape)) continue;
      tried.add(shape); place(bundle, bin);
      if (fit(index + 1)) return true;
      place(bundle, bin, true);
    }
    memo.add(key); return false;
  };
  if (!fit(0)) return false;
  for (const bundle of order(bundles.filter((entry) => entry.members.length === 1))) {
    const bin = targets(bundle)[0];
    if (!bin) return false;
    place(bundle, bin);
  }
  return bins.every((bin) => bin.left.every((left) => left === 0));
}
