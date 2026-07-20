import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const staffRoles = ['ceo', 'super_admin', 'admin', 'moderator'];
const tournamentSndMapPool = ['Hacienda', 'Gridlock', 'Raid', 'Scar', 'Den', 'Sake', 'Colossus'];
const tournamentMatchMode = 'Search and Destroy';
const tournamentBestOf = 3;
const tournamentStartWindowMinutes = 15;

const startWindowPayload = (start = new Date()) => ({
  assigned_date: start.toISOString(),
  scheduled_start_date: start.toISOString(),
  start_deadline: new Date(start.getTime() + (tournamentStartWindowMinutes * 60 * 1000)).toISOString(),
  start_window_minutes: tournamentStartWindowMinutes,
});

const nextPowerOfTwo = (value) => {
  let size = 1;
  while (size < value) size *= 2;
  return size;
};

const teamPayload = (participant, slot) => ({
  [`team_${slot}_id`]: participant?.team_id || '',
  [`team_${slot}_name`]: participant?.team_name || '',
  [`team_${slot}_participant_id`]: participant?.id || '',
  [`team_${slot}_seed`]: participant?.seed || '',
});

const hasTeam = (participant) => Boolean(participant?.team_id);

const shuffleMaps = () => {
  const maps = [...tournamentSndMapPool];
  for (let index = maps.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [maps[index], maps[swapIndex]] = [maps[swapIndex], maps[index]];
  }
  return maps;
};

const firstHostForMatch = (match, participantA, participantB) => {
  const seedA = Number(match.team_a_seed || participantA?.seed || 999999);
  const seedB = Number(match.team_b_seed || participantB?.seed || 999999);
  if (seedA <= seedB) {
    return {
      id: match.team_a_id,
      name: match.team_a_name || participantA?.team_name || 'Team A',
      seed: Number.isFinite(seedA) ? seedA : null,
    };
  }
  return {
    id: match.team_b_id,
    name: match.team_b_name || participantB?.team_name || 'Team B',
    seed: Number.isFinite(seedB) ? seedB : null,
  };
};

const secondHostForMatch = (match, participantA, participantB, firstHost) => {
  const seedA = Number(match.team_a_seed || participantA?.seed || 999999);
  const seedB = Number(match.team_b_seed || participantB?.seed || 999999);
  if (firstHost?.id === match.team_a_id) {
    return {
      id: match.team_b_id,
      name: match.team_b_name || participantB?.team_name || 'Team B',
      seed: Number.isFinite(seedB) ? seedB : null,
    };
  }
  return {
    id: match.team_a_id,
    name: match.team_a_name || participantA?.team_name || 'Team A',
    seed: Number.isFinite(seedA) ? seedA : null,
  };
};

const setupPayload = (match, participantA, participantB) => {
  const firstHost = firstHostForMatch(match, participantA, participantB);
  const secondHost = secondHostForMatch(match, participantA, participantB, firstHost);
  const hosts = [firstHost, secondHost, null];
  return {
    best_of: tournamentBestOf,
    game_mode: tournamentMatchMode,
    map_pool: tournamentSndMapPool,
    maps: shuffleMaps().slice(0, tournamentBestOf).map((map, index) => ({
      game: index + 1,
      mode: tournamentMatchMode,
      map,
      host_team_id: hosts[index]?.id || '',
      host_team_name: hosts[index]?.name || 'TBD',
      host_seed: hosts[index]?.seed || '',
    })),
    first_host_team_id: firstHost?.id || '',
    first_host_team_name: firstHost?.name || '',
    first_host_seed: firstHost?.seed || '',
    map_generated_by: 'system',
    map_generated_date: new Date().toISOString(),
  };
};

async function createMatch(base44, payload) {
  return base44.asServiceRole.entities.TournamentMatch.create({
    team_a_score: 0,
    team_b_score: 0,
    proof_urls: [],
    completed: false,
    ...payload,
  });
}

async function placeTeam(base44, matchId, participant, slot) {
  if (!matchId || !participant) return null;

  const target = await base44.asServiceRole.entities.TournamentMatch.get(matchId);
  if (!target) return null;

  const update = {
    ...teamPayload(participant, slot),
  };
  const otherSlot = slot === 'a' ? 'b' : 'a';
  const otherTeam = target[`team_${otherSlot}_id`];
  update.status = otherTeam ? 'ready' : target.status || 'pending';
  if (otherTeam) {
    const participants = await base44.asServiceRole.entities.TournamentParticipant.filter({ tournament_id: target.tournament_id }, 'seed', 256);
    const byId = Object.fromEntries((participants || []).flatMap((row) => [
      [row.id, row],
      [row.team_id, row],
    ].filter(([id]) => Boolean(id))));
    const candidate = { ...target, ...update };
    const assignedDate = new Date();
    Object.assign(update, startWindowPayload(assignedDate));
    Object.assign(update, setupPayload(candidate, byId[candidate.team_a_participant_id] || byId[candidate.team_a_id], byId[candidate.team_b_participant_id] || byId[candidate.team_b_id]));
  }

  await base44.asServiceRole.entities.TournamentMatch.update(matchId, update);
  return { ...target, ...update };
}

async function autoAdvanceBye(base44, match, participant) {
  if (!participant) return;

  await base44.asServiceRole.entities.TournamentMatch.update(match.id, {
    status: 'completed',
    completed: true,
    winner_id: participant.team_id,
    winner_name: participant.team_name,
    completed_date: new Date().toISOString(),
  });

  if (match.next_match_id) {
    const slot = match.match_number % 2 === 1 ? 'a' : 'b';
    await placeTeam(base44, match.next_match_id, participant, slot);
  }
}

async function generateSingleElimination(base44, tournament, participants, size) {
  const rounds = Math.max(1, Math.log2(size));
  const slots = [...participants, ...Array(size - participants.length).fill(null)];
  const createdByRound = [];

  for (let round = 1; round <= rounds; round += 1) {
    const matchCount = size / (2 ** round);
    const roundMatches = [];

    for (let index = 0; index < matchCount; index += 1) {
      const teamA = round === 1 ? slots[index * 2] : null;
      const teamB = round === 1 ? slots[index * 2 + 1] : null;
      const solo = round === 1 && (hasTeam(teamA) !== hasTeam(teamB));
      const both = round === 1 && hasTeam(teamA) && hasTeam(teamB);
      const readyDate = both ? new Date() : null;

      const matchPayload = {
        tournament_id: tournament.id,
        round,
        bracket: 'winner',
        match_number: index + 1,
        ...teamPayload(teamA, 'a'),
        ...teamPayload(teamB, 'b'),
        status: both ? 'ready' : solo ? 'completed' : 'pending',
        ...(readyDate ? startWindowPayload(readyDate) : {}),
        completed: solo,
        winner_id: solo ? (teamA || teamB).team_id : '',
        winner_name: solo ? (teamA || teamB).team_name : '',
        completed_date: solo ? new Date().toISOString() : '',
      };

      roundMatches.push(await createMatch(base44, {
        ...matchPayload,
        ...(both ? setupPayload(matchPayload, teamA, teamB) : {}),
      }));
    }

    createdByRound.push(roundMatches);
  }

  for (let round = 0; round < createdByRound.length - 1; round += 1) {
    await Promise.all(createdByRound[round].map((match, index) => (
      base44.asServiceRole.entities.TournamentMatch.update(match.id, {
        next_match_id: createdByRound[round + 1][Math.floor(index / 2)].id,
      })
    )));
  }

  const refreshedRoundOne = await base44.asServiceRole.entities.TournamentMatch.filter({
    tournament_id: tournament.id,
    round: 1,
    bracket: 'winner',
  });
  await Promise.all(refreshedRoundOne
    .filter((match) => match.completed && match.winner_id)
    .map((match) => autoAdvanceBye(base44, match, {
      team_id: match.winner_id,
      team_name: match.winner_name,
    })));

  return createdByRound.flat();
}

async function generateDoubleElimination(base44, tournament, participants, size) {
  const winnerMatches = await generateSingleElimination(base44, tournament, participants, size);
  const winnerRounds = Math.max(1, Math.log2(size));
  const loserRounds = Math.max(1, (winnerRounds - 1) * 2);
  const loserByRound = [];

  for (let round = 1; round <= loserRounds; round += 1) {
    const stage = Math.ceil(round / 2);
    const matchCount = Math.max(1, size / (2 ** (stage + 1)));
    const matches = [];

    for (let index = 0; index < matchCount; index += 1) {
      matches.push(await createMatch(base44, {
        tournament_id: tournament.id,
        round,
        bracket: 'loser',
        match_number: index + 1,
        status: 'pending',
      }));
    }

    loserByRound.push(matches);
  }

  const grandFinal = await createMatch(base44, {
    tournament_id: tournament.id,
    round: winnerRounds + 1,
    bracket: 'grand_final',
    match_number: 1,
    status: 'pending',
  });

  for (let round = 0; round < loserByRound.length - 1; round += 1) {
    await Promise.all(loserByRound[round].map((match, index) => (
      base44.asServiceRole.entities.TournamentMatch.update(match.id, {
        next_match_id: loserByRound[round + 1][Math.floor(index / 2)]?.id || loserByRound[round + 1][0].id,
      })
    )));
  }

  await Promise.all(loserByRound[loserByRound.length - 1].map((match) => (
    base44.asServiceRole.entities.TournamentMatch.update(match.id, {
      next_match_id: grandFinal.id,
    })
  )));

  const refreshedWinnerMatches = await base44.asServiceRole.entities.TournamentMatch.filter({
    tournament_id: tournament.id,
    bracket: 'winner',
  });

  await Promise.all(refreshedWinnerMatches.map((match) => {
    const targetRound = match.round === 1 ? 1 : Math.min(loserRounds, (match.round - 1) * 2);
    const candidates = loserByRound[targetRound - 1] || loserByRound[loserByRound.length - 1];
    const loserTarget = candidates[Math.floor((match.match_number - 1) / 2)] || candidates[0];
    const winnerTarget = match.round === winnerRounds ? grandFinal.id : match.next_match_id;

    return base44.asServiceRole.entities.TournamentMatch.update(match.id, {
      next_match_id: winnerTarget,
      loser_match_id: loserTarget?.id || '',
    });
  }));

  return [...winnerMatches, ...loserByRound.flat(), grandFinal];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!staffRoles.includes(user.role)) {
      return Response.json({ error: 'Forbidden - staff only' }, { status: 403 });
    }

    const { tournament_id } = await req.json();
    if (!tournament_id) {
      return Response.json({ error: 'Missing tournament_id' }, { status: 400 });
    }

    const tournament = await base44.asServiceRole.entities.Tournament.get(tournament_id);
    if (!tournament) {
      return Response.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const existing = await base44.asServiceRole.entities.TournamentMatch.filter({ tournament_id });
    if (existing.length > 0) {
      return Response.json({ error: 'Bracket already exists for this tournament' }, { status: 400 });
    }

    const participants = await base44.asServiceRole.entities.TournamentParticipant.filter({ tournament_id }, 'seed', 256);
    if (participants.length === 0) {
      return Response.json({ error: 'No registered tournament participants' }, { status: 400 });
    }

    const randomizedParticipants = [...participants];
    for (let index = randomizedParticipants.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [randomizedParticipants[index], randomizedParticipants[swapIndex]] = [randomizedParticipants[swapIndex], randomizedParticipants[index]];
    }
    const seededParticipants = await Promise.all(randomizedParticipants.map(async (participant, index) => {
      const seed = index + 1;
      await base44.asServiceRole.entities.TournamentParticipant.update(participant.id, { seed });
      return { ...participant, seed };
    }));

    const size = nextPowerOfTwo(seededParticipants.length);
    const format = tournament.format || tournament.bracket_type || 'single_elimination';
    const created = format === 'double_elimination'
      ? await generateDoubleElimination(base44, tournament, seededParticipants, size)
      : await generateSingleElimination(base44, tournament, seededParticipants, size);

    await base44.asServiceRole.entities.Tournament.update(tournament_id, {
      status: 'in_progress',
      bracket_type: format,
      format,
      bracket_data: {
        generated_at: new Date().toISOString(),
        size,
        rounds: Math.log2(size),
        format,
      },
    });

    return Response.json({
      success: true,
      tournament_id,
      format,
      bracket_size: size,
      match_count: created.length,
    });
  } catch (error) {
    console.error('Generate tournament bracket error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
