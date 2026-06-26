import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const nowIso = () => new Date().toISOString();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || user?.id || 'Unnamed player';
const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);
const streamerTournamentTypes = new Set(['streamer', 'streamer_tournament']);
const streamerSwitchFormats = new Set(['2v2', '4v4']);
const tournamentSndMapPool = ['Hacienda', 'Gridlock', 'Raid', 'Scar', 'Den', 'Sake', 'Colossus'];
const tournamentHpMapPool = ['Sake', 'Colossus', 'Den', 'Scar', 'Gridlock', 'Hacienda'];
const tournamentOverloadMapPool = ['Gaza', 'Airstrip', 'Tipperary', 'Rivet', 'Khandor'];
const seriesDefinitions = {
  bo1_snd: [{ game_mode: 'snd', mode: 'Search and Destroy' }],
  snd: Array.from({ length: 3 }, () => ({ game_mode: 'snd', mode: 'Search and Destroy' })),
  hp: Array.from({ length: 3 }, () => ({ game_mode: 'hp', mode: 'Hardpoint' })),
  overload: Array.from({ length: 3 }, () => ({ game_mode: 'overload', mode: 'Overload' })),
  snd_hp_snd: [
    { game_mode: 'snd', mode: 'Search and Destroy' },
    { game_mode: 'hp', mode: 'Hardpoint' },
    { game_mode: 'snd', mode: 'Search and Destroy' },
  ],
  bo3_hp_overload_snd: [
    { game_mode: 'hp', mode: 'Hardpoint' },
    { game_mode: 'overload', mode: 'Overload' },
    { game_mode: 'snd', mode: 'Search and Destroy' },
  ],
  bo5_hp_overload_snd_hp_snd: [
    { game_mode: 'hp', mode: 'Hardpoint' },
    { game_mode: 'overload', mode: 'Overload' },
    { game_mode: 'snd', mode: 'Search and Destroy' },
    { game_mode: 'hp', mode: 'Hardpoint' },
    { game_mode: 'snd', mode: 'Search and Destroy' },
  ],
};

function isStreamerTournament(tournament) {
  return Boolean(
    tournament?.is_streamer_tournament
    || streamerTournamentTypes.has(String(tournament?.tournament_type || '').toLowerCase())
    || streamerTournamentTypes.has(String(tournament?.source || '').toLowerCase())
  );
}

function canModerateStreamerTournament(user, tournament) {
  return Boolean(
    staffRoles.has(user?.role)
    || String(tournament?.host_id || tournament?.created_by || '') === String(user?.id || '')
  );
}

function normalizeStreamerSwitchFormat(value) {
  const format = String(value || '4v4').toLowerCase();
  return streamerSwitchFormats.has(format) ? format : '4v4';
}

function streamerEntrySlotCount(format) {
  return normalizeStreamerSwitchFormat(format) === '4v4' ? 2 : 1;
}

function cleanManualPlayerName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

function normalizeStreamerSwitchEntries(value, format) {
  const slotCount = streamerEntrySlotCount(format);
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows.map((entry, index) => {
    const rawNames = Array.isArray(entry?.player_names)
      ? entry.player_names
      : [entry?.player_one, entry?.player_two, entry?.player_name, entry?.name];
    const playerNames = rawNames.map(cleanManualPlayerName).filter(Boolean).slice(0, slotCount);
    if (playerNames.length !== slotCount) return null;
    const key = playerNames.map((name) => name.toLowerCase()).join('|');
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: String(entry?.id || crypto.randomUUID?.() || `switch-entry-${Date.now()}-${index}`),
      player_names: playerNames,
      linked_user_ids: Array.isArray(entry?.linked_user_ids) ? entry.linked_user_ids.filter(Boolean) : [],
      created_date: entry?.created_date || nowIso(),
    };
  }).filter(Boolean);
}

function defaultMaps() {
  return [...new Set([...tournamentSndMapPool, ...tournamentHpMapPool, ...tournamentOverloadMapPool])];
}

function normalizeMapPool(value, fallback = defaultMaps()) {
  const rows = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  const maps = rows.map((row) => String(row || '').trim()).filter(Boolean);
  return [...new Set(maps.length > 0 ? maps : fallback)];
}

function shuffledCopy(rows) {
  const copy = [...rows];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function seedPositions(size) {
  if (size <= 2) return [1, 2];
  const previous = seedPositions(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}

function participantKey(participant) {
  return participant?.team_id || participant?.user_id || participant?.id || null;
}

function participantName(participant) {
  return participant?.team_name || participant?.user_name || participant?.name || 'Open slot';
}

function participantSlotFields(participant, slot) {
  return {
    [`${slot}_id`]: participantKey(participant),
    [`${slot}_name`]: participantName(participant),
    [`${slot}_participant_id`]: participant?.id || null,
    [`${slot}_seed`]: participant?.seed || null,
  };
}

function streamerManualMember(name, index) {
  return {
    user_id: null,
    user_name: name,
    username: name,
    handle: name,
    display_name: name,
    manual_name: true,
    slot: index + 1,
  };
}

function streamerTeamName(playerNames, index) {
  const first = cleanManualPlayerName(playerNames[0]);
  return first ? `Team ${index + 1} - ${first}` : `Team ${index + 1}`;
}

function matchHasScoreActivity(match) {
  if (!match) return false;
  if (match.completed || match.status === 'completed' || match.winner_id) return true;
  return [
    'team_a_reported_score_alpha',
    'team_a_reported_score_bravo',
    'team_b_reported_score_alpha',
    'team_b_reported_score_bravo',
    'reported_score_alpha',
    'reported_score_bravo',
  ].some((field) => match[field] !== undefined && match[field] !== null);
}

function matchMaps(match, tournament) {
  const maps = normalizeMapPool(tournament.streamer_maps || tournament.maps);
  const games = seriesDefinitions[tournament.game_mode] || seriesDefinitions.snd_hp_snd;
  const offset = Math.max(0, Number(match.match_number || 1) - 1);
  return games.map((game, index) => ({
    game: index + 1,
    game_mode: game.game_mode,
    mode: game.mode,
    map: maps[(offset + index) % maps.length],
    selected_by: 'streamer',
  }));
}

async function clearGeneratedBracket(base44, tournament) {
  const [matches, participants] = await Promise.all([
    base44.asServiceRole.entities.TournamentMatch.filter({ tournament_id: tournament.id }, 'round', 500).catch(() => []),
    base44.asServiceRole.entities.TournamentParticipant.filter({ tournament_id: tournament.id }, 'seed', 500).catch(() => []),
  ]);
  if (matches.some(matchHasScoreActivity)) {
    return { success: false, error: 'This switch bracket already has completed or reported matches' };
  }
  await Promise.all(matches.map((match) => base44.asServiceRole.entities.TournamentMatch.delete(match.id).catch(() => null)));
  await Promise.all(participants.map((participant) => base44.asServiceRole.entities.TournamentParticipant.delete(participant.id).catch(() => null)));
  return { success: true };
}

async function advanceWinner(base44, match, tournament, participants) {
  if (!match?.winner_id) return null;
  if (!match.next_match_round || !match.next_match_number) {
    await base44.asServiceRole.entities.Tournament.update(match.tournament_id, {
      status: 'completed',
      winner_id: match.winner_id,
      winner_name: match.winner_name,
      completed_date: nowIso(),
    });
    return null;
  }
  const nextMatches = await base44.asServiceRole.entities.TournamentMatch.filter({
    tournament_id: match.tournament_id,
    round: match.next_match_round,
  }, 'match_number', 256);
  const nextMatch = nextMatches.find((row) => String(row.match_number) === String(match.next_match_number));
  if (!nextMatch) return null;
  const slot = match.slot_in_next === 'team_b' ? 'team_b' : 'team_a';
  const patch = {
    [`${slot}_id`]: match.winner_id,
    [`${slot}_name`]: match.winner_name,
    [`${slot}_source_match_id`]: match.id,
    [`${slot}_seed`]: match.winner_id === match.team_a_id ? match.team_a_seed : match.team_b_seed,
    [`${slot}_participant_id`]: match.winner_id === match.team_a_id ? match.team_a_participant_id : match.team_b_participant_id,
  };
  const candidate = { ...nextMatch, ...patch };
  if (candidate.team_a_id && candidate.team_b_id && !['completed', 'disputed'].includes(nextMatch.status)) {
    patch.status = 'ready';
    patch.assigned_date = nowIso();
    patch.best_of = (seriesDefinitions[tournament.game_mode] || seriesDefinitions.snd_hp_snd).length;
    patch.map_pool = normalizeMapPool(tournament.streamer_maps || tournament.maps);
    patch.maps = matchMaps(candidate, tournament);
    patch.map_generated_by = 'streamer';
    patch.map_generated_date = nowIso();
  }
  return base44.asServiceRole.entities.TournamentMatch.update(nextMatch.id, patch);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const tournament = await base44.asServiceRole.entities.Tournament.get(body.tournament_id || '').catch(() => null);
    if (!tournament || !isStreamerTournament(tournament)) {
      return Response.json({ success: false, error: 'Streamer tournament not found' }, { status: 404 });
    }
    if (!canModerateStreamerTournament(user, tournament)) {
      return Response.json({ success: false, error: 'Only the streamer host or staff can generate this bracket' }, { status: 403 });
    }

    const switchFormat = normalizeStreamerSwitchFormat(body.switch_format || tournament.switch_format || tournament.team_size);
    const entries = normalizeStreamerSwitchEntries(body.entries || tournament.switch_entries, switchFormat);
    if (entries.length < 4) {
      return Response.json({
        success: false,
        error: switchFormat === '4v4' ? 'Add at least four duos to make two 4v4 teams' : 'Add at least four players to make two 2v2 teams',
      }, { status: 400 });
    }
    if (entries.length % 2 !== 0) {
      return Response.json({
        success: false,
        error: switchFormat === '4v4' ? '4v4 switcheroo needs an even number of duos' : '2v2 switcheroo needs an even number of players',
      }, { status: 400 });
    }

    const generatedTeamCount = entries.length / 2;
    if (generatedTeamCount > Number(tournament.max_teams || 64)) {
      return Response.json({ success: false, error: `This lobby is capped at ${tournament.max_teams} generated teams` }, { status: 400 });
    }
    const reset = await clearGeneratedBracket(base44, tournament);
    if (!reset.success) return Response.json(reset, { status: 400 });

    const generatedTeams = [];
    const shuffledEntries = shuffledCopy(entries);
    for (let index = 0; index < shuffledEntries.length; index += 2) {
      const pair = [shuffledEntries[index], shuffledEntries[index + 1]];
      const playerNames = pair.flatMap((entry) => entry.player_names);
      generatedTeams.push({
        id: `streamer-team-${tournament.id}-${crypto.randomUUID?.() || `${Date.now()}-${index}`}`,
        name: streamerTeamName(playerNames, generatedTeams.length),
        seed: generatedTeams.length + 1,
        player_names: playerNames,
        source_entry_ids: pair.map((entry) => entry.id),
      });
    }

    const participants = [];
    for (const team of generatedTeams) {
      const participant = await base44.asServiceRole.entities.TournamentParticipant.create({
        tournament_id: tournament.id,
        team_id: team.id,
        team_name: team.name,
        captain_id: '',
        captain_name: team.player_names[0] || team.name,
        user_id: '',
        user_name: team.name,
        members: team.player_names.map(streamerManualMember),
        switch_player_names: team.player_names,
        seed: team.seed,
        eliminated: false,
        entry_type: 'streamer_switch',
        payment_mode: 'free',
        entry_fee_paid: 0,
        paid_member_ids: [],
        roster_locked: true,
        registered_date: nowIso(),
        created_date: nowIso(),
      });
      participants.push(participant);
    }

    const bracketSize = nextPowerOfTwo(participants.length);
    const seededParticipants = seedPositions(bracketSize).map((seed) => participants[seed - 1] || null);
    const totalRounds = Math.log2(bracketSize);
    const matches = [];
    const bestOf = (seriesDefinitions[tournament.game_mode] || seriesDefinitions.snd_hp_snd).length;
    const mapPool = normalizeMapPool(tournament.streamer_maps || tournament.maps);

    for (let round = 1; round <= totalRounds; round += 1) {
      const matchCount = bracketSize / (2 ** round);
      for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
        const isRoundOne = round === 1;
        const a = isRoundOne ? seededParticipants[(matchNumber - 1) * 2] : null;
        const b = isRoundOne ? seededParticipants[((matchNumber - 1) * 2) + 1] : null;
        const hasBye = isRoundOne && Boolean(a) !== Boolean(b);
        const winner = hasBye ? (a || b) : null;
        const matchPayload = {
          tournament_id: tournament.id,
          tournament_game_mode: tournament.game_mode || 'snd_hp_snd',
          bracket: 'winner',
          match_type: 'streamer_tournament',
          is_streamer_tournament: true,
          round,
          match_number: matchNumber,
          ...(a ? participantSlotFields(a, 'team_a') : {}),
          ...(b ? participantSlotFields(b, 'team_b') : {}),
          status: isRoundOne ? (a && b ? 'ready' : 'completed') : 'pending',
          winner_id: winner ? participantKey(winner) : null,
          winner_name: winner ? participantName(winner) : null,
          completed: Boolean(winner),
          completed_date: winner ? nowIso() : null,
          next_match_round: round < totalRounds ? round + 1 : null,
          next_match_number: round < totalRounds ? Math.ceil(matchNumber / 2) : null,
          slot_in_next: round < totalRounds ? (matchNumber % 2 === 1 ? 'team_a' : 'team_b') : null,
          is_final: round === totalRounds,
          created_date: nowIso(),
        };
        matches.push(await base44.asServiceRole.entities.TournamentMatch.create({
          ...matchPayload,
          ...(a && b ? {
            best_of: bestOf,
            map_pool: mapPool,
            maps: matchMaps(matchPayload, tournament),
            map_generated_by: 'streamer',
            map_generated_date: nowIso(),
          } : {}),
        }));
      }
    }

    const teams = generatedTeams.map((team, index) => ({ ...team, participant_id: participants[index]?.id || null }));
    const updated = await base44.asServiceRole.entities.Tournament.update(tournament.id, {
      team_size: switchFormat,
      switch_format: switchFormat,
      switch_entries: entries,
      switch_teams: teams,
      switch_bracket_generated: true,
      bracket_generated: true,
      bracket_generated_date: nowIso(),
      registration_locked: true,
      registered_teams: participants.length,
      status: 'in_progress',
      updated_by: user.id,
      updated_date: nowIso(),
    });

    await base44.asServiceRole.entities.ChatMessage.create({
      conversation_id: tournament.id,
      sender_id: user.id,
      sender_name: nameFor(user),
      sender_role: user.role || 'user',
      recipient_id: tournament.id,
      recipient_name: 'Streamer tournament lobby',
      content: `${nameFor(user)} generated the ${switchFormat} switcheroo bracket.`,
      is_read: false,
      match_type: 'streamer_tournament',
      system: true,
      created_date: nowIso(),
    }).catch(() => null);

    for (const match of matches.filter((row) => row.status === 'completed' && row.winner_id)) {
      await advanceWinner(base44, match, updated, participants);
    }

    const refreshedMatches = await base44.asServiceRole.entities.TournamentMatch.filter({ tournament_id: tournament.id }, 'round', 500);
    return Response.json({
      success: true,
      tournament: updated,
      participants,
      teams,
      matches: refreshedMatches,
      match_count: refreshedMatches.length,
    });
  } catch (error) {
    console.error('Generate streamer switch bracket error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
