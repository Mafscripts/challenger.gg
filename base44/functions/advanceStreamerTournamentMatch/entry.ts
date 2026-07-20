import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const nowIso = () => new Date().toISOString();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || user?.id || 'Unnamed player';
const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);
const streamerTournamentTypes = new Set(['streamer', 'streamer_tournament']);
const startWindowMinutes = 15;
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

function defaultMaps() {
  return [...new Set([...tournamentSndMapPool, ...tournamentHpMapPool, ...tournamentOverloadMapPool])];
}

function normalizeMapPool(value, fallback = defaultMaps()) {
  const rows = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  const maps = rows.map((row) => String(row || '').trim()).filter(Boolean);
  return [...new Set(maps.length > 0 ? maps : fallback)];
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

function requiredWins(match) {
  return Math.floor(Number(match.best_of || 1) / 2) + 1;
}

function scoreError(match, teamAScore, teamBScore) {
  const bestOf = Math.max(1, Math.trunc(Number(match?.best_of || 1)));
  const winsNeeded = requiredWins({ best_of: bestOf });
  const label = `BO${bestOf} results must end ${winsNeeded}-0 through ${winsNeeded}-${winsNeeded - 1}`;
  if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore) || teamAScore < 0 || teamBScore < 0) {
    return `Scores must be whole, non-negative numbers. ${label}.`;
  }
  if (Math.max(teamAScore, teamBScore) !== winsNeeded || Math.min(teamAScore, teamBScore) >= winsNeeded) {
    return `${label}.`;
  }
  return '';
}

function startWindow(start = new Date()) {
  return {
    scheduled_start_date: start.toISOString(),
    start_deadline: new Date(start.getTime() + (startWindowMinutes * 60 * 1000)).toISOString(),
    start_window_minutes: startWindowMinutes,
  };
}

async function advanceWinner(base44, match, tournament) {
  if (!match?.winner_id) return {};
  if (!match.next_match_round || !match.next_match_number) {
    const updatedTournament = await base44.asServiceRole.entities.Tournament.update(match.tournament_id, {
      status: 'completed',
      winner_id: match.winner_id,
      winner_name: match.winner_name,
      completed_date: nowIso(),
    });
    return { tournament_completed: true, tournament: updatedTournament };
  }
  const nextMatches = await base44.asServiceRole.entities.TournamentMatch.filter({
    tournament_id: match.tournament_id,
    round: match.next_match_round,
  }, 'match_number', 256);
  const nextMatch = nextMatches.find((row) => String(row.match_number) === String(match.next_match_number));
  if (!nextMatch) return {};
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
    const assignedDate = new Date();
    patch.status = 'ready';
    patch.assigned_date = assignedDate.toISOString();
    Object.assign(patch, startWindow(assignedDate));
    patch.best_of = (seriesDefinitions[tournament.game_mode] || seriesDefinitions.snd_hp_snd).length;
    patch.map_pool = normalizeMapPool(tournament.streamer_maps || tournament.maps);
    patch.maps = matchMaps(candidate, tournament);
    patch.map_generated_by = 'streamer';
    patch.map_generated_date = nowIso();
  }
  return { advanced_to: await base44.asServiceRole.entities.TournamentMatch.update(nextMatch.id, patch) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const match = await base44.asServiceRole.entities.TournamentMatch.get(body.tournament_match_id || body.match_id || '').catch(() => null);
    if (!match) return Response.json({ success: false, error: 'Tournament match not found' }, { status: 404 });
    const tournament = await base44.asServiceRole.entities.Tournament.get(match.tournament_id).catch(() => null);
    if (!tournament || !isStreamerTournament(tournament)) {
      return Response.json({ success: false, error: 'Streamer tournament not found' }, { status: 404 });
    }
    if (!canModerateStreamerTournament(user, tournament)) {
      return Response.json({ success: false, error: 'Only the streamer host or staff can advance this bracket' }, { status: 403 });
    }
    if (match.completed || match.status === 'completed') {
      return Response.json({ success: true, match, already_completed: true });
    }
    if (!match.team_a_id || !match.team_b_id) {
      return Response.json({ success: false, error: 'Both teams must be assigned before advancing' }, { status: 400 });
    }

    const requestedWinnerId = String(body.winner_id || '');
    const winnerSlot = String(body.winner_slot || '').toLowerCase();
    const winnerIsA = winnerSlot === 'team_a' || winnerSlot === 'a' || requestedWinnerId === String(match.team_a_id);
    const winnerIsB = winnerSlot === 'team_b' || winnerSlot === 'b' || requestedWinnerId === String(match.team_b_id);
    if (!winnerIsA && !winnerIsB) {
      return Response.json({ success: false, error: 'Choose the winning team' }, { status: 400 });
    }

    const winsNeeded = requiredWins(match);
    const teamAScore = Number.isFinite(Number(body.team_a_score)) ? Number(body.team_a_score) : winnerIsA ? winsNeeded : 0;
    const teamBScore = Number.isFinite(Number(body.team_b_score)) ? Number(body.team_b_score) : winnerIsB ? winsNeeded : 0;
    const invalidScore = scoreError(match, teamAScore, teamBScore);
    if (invalidScore) {
      return Response.json({ success: false, error: invalidScore }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.TournamentMatch.update(match.id, {
      team_a_score: teamAScore,
      team_b_score: teamBScore,
      winner_id: winnerIsA ? match.team_a_id : match.team_b_id,
      winner_name: winnerIsA ? match.team_a_name : match.team_b_name,
      completed: true,
      status: 'completed',
      completed_date: nowIso(),
      scores_confirmed: true,
      confirmed_score_alpha: teamAScore,
      confirmed_score_bravo: teamBScore,
      confirmed_score_date: nowIso(),
      confirmed_by: user.id,
      confirmed_by_name: nameFor(user),
      advanced_by: user.id,
      advanced_by_name: nameFor(user),
    });
    const advancement = await advanceWinner(base44, updated, tournament);

    return Response.json({ success: true, match: updated, ...advancement });
  } catch (error) {
    console.error('Advance streamer tournament match error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
