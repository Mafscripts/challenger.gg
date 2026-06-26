import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const nowIso = () => new Date().toISOString();
const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);
const streamerTournamentTypes = new Set(['streamer', 'streamer_tournament']);
const tournamentSndMapPool = ['Hacienda', 'Gridlock', 'Raid', 'Scar', 'Den', 'Sake', 'Colossus'];
const tournamentHpMapPool = ['Sake', 'Colossus', 'Den', 'Scar', 'Gridlock', 'Hacienda'];
const tournamentOverloadMapPool = ['Gaza', 'Airstrip', 'Tipperary', 'Rivet', 'Khandor'];

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

function refreshMatchMaps(match, maps) {
  const existing = Array.isArray(match.maps) && match.maps.length > 0
    ? match.maps
    : [{ game: 1, mode: match.game_mode || 'Search and Destroy' }];
  const offset = Math.max(0, Number(match.match_number || 1) - 1);
  return existing.map((row, index) => ({
    ...row,
    map: maps[(offset + index) % maps.length] || row.map,
    selected_by: 'streamer',
  }));
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
      return Response.json({ success: false, error: 'Only the streamer host or staff can edit maps' }, { status: 403 });
    }

    const maps = normalizeMapPool(body.maps || body.streamer_maps).slice(0, 40);
    const updated = await base44.asServiceRole.entities.Tournament.update(tournament.id, {
      maps,
      streamer_maps: maps,
      updated_by: user.id,
      updated_date: nowIso(),
    });
    const matches = await base44.asServiceRole.entities.TournamentMatch.filter({ tournament_id: tournament.id }, 'round', 500).catch(() => []);
    const refreshed = [];
    for (const match of matches) {
      if (!match.team_a_id || !match.team_b_id || matchHasScoreActivity(match)) continue;
      const next = await base44.asServiceRole.entities.TournamentMatch.update(match.id, {
        maps: refreshMatchMaps(match, maps),
        map_pool: maps,
        map_generated_by: 'streamer',
        map_generated_date: nowIso(),
      }).catch(() => null);
      if (next) refreshed.push(next);
    }

    return Response.json({ success: true, tournament: updated, refreshed_matches: refreshed });
  } catch (error) {
    console.error('Update streamer maps error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
