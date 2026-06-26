import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const nowIso = () => new Date().toISOString();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || user?.id || 'Unnamed player';
const tournamentTeamSizeOptions = new Set(Array.from({ length: 8 }, (_, index) => `${index + 1}v${index + 1}`));
const tournamentSndMapPool = ['Hacienda', 'Gridlock', 'Raid', 'Scar', 'Den', 'Sake', 'Colossus'];
const tournamentHpMapPool = ['Sake', 'Colossus', 'Den', 'Scar', 'Gridlock', 'Hacienda'];
const tournamentOverloadMapPool = ['Gaza', 'Airstrip', 'Tipperary', 'Rivet', 'Khandor'];
const streamerSwitchFormats = new Set(['2v2', '4v4']);
const gameModeOptions = new Set([
  'bo1_snd',
  'snd',
  'hp',
  'overload',
  'snd_hp_snd',
  'bo3_hp_overload_snd',
  'bo5_hp_overload_snd_hp_snd',
]);

function streamerDefaultMapPool() {
  return [...new Set([...tournamentSndMapPool, ...tournamentHpMapPool, ...tournamentOverloadMapPool])];
}

function normalizeStreamerSwitchFormat(value) {
  const format = String(value || '4v4').toLowerCase();
  return streamerSwitchFormats.has(format) ? format : '4v4';
}

function isStreamerUser(user) {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  return Boolean(
    user?.streamer_badge
    || user?.is_streamer
    || badges.some((badge) => badge?.type === 'streamer')
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!isStreamerUser(user)) {
      return Response.json({ success: false, error: 'Streamer badge is required to post streamer tournaments' }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return Response.json({ success: false, error: 'Tournament name is required' }, { status: 400 });

    const switchFormat = normalizeStreamerSwitchFormat(body.switch_format || body.team_size || '4v4');
    const teamSize = String(body.team_size || switchFormat);
    const requestedMaxTeams = Number(body.max_teams || 8);
    const startDate = body.start_date ? new Date(body.start_date) : null;
    const tournament = await base44.asServiceRole.entities.Tournament.create({
      name,
      title: name,
      description: String(body.description || '').trim().slice(0, 500),
      game_mode: gameModeOptions.has(body.game_mode) ? body.game_mode : 'snd_hp_snd',
      game: 'Call of Duty',
      region: body.region || user.region || 'global',
      team_size: tournamentTeamSizeOptions.has(teamSize) ? teamSize : switchFormat,
      entry_fee: 0,
      entry_type: 'free',
      prize_pool: 0,
      max_teams: Math.max(2, Math.min(64, Number.isFinite(requestedMaxTeams) ? requestedMaxTeams : 8)),
      registered_teams: 0,
      format: 'single_elimination',
      bracket_type: 'single_elimination',
      status: 'open',
      rules: 'Streamer-hosted lobby. The streamer host moderates lobby chat. No tickets or disputes are created from this lobby.',
      maps: streamerDefaultMapPool(),
      map_pools: {
        snd: tournamentSndMapPool,
        hp: tournamentHpMapPool,
        overload: tournamentOverloadMapPool,
      },
      switcheroo_enabled: true,
      switch_format: switchFormat,
      switch_entries: [],
      switch_teams: [],
      switch_bracket_generated: false,
      streamer_maps: streamerDefaultMapPool(),
      start_date: startDate && Number.isFinite(startDate.getTime()) ? startDate.toISOString() : undefined,
      created_by: user.id,
      created_by_name: nameFor(user),
      host_id: user.id,
      host_name: nameFor(user),
      tournament_type: 'streamer',
      source: 'streamer',
      is_streamer_tournament: true,
      streamer_chat_enabled: true,
      streamer_moderator_ids: [user.id],
      banned_user_ids: [],
      banned_users: [],
      created_date: nowIso(),
    });

    await base44.asServiceRole.entities.ChatMessage.create({
      conversation_id: tournament.id,
      sender_id: user.id,
      sender_name: nameFor(user),
      sender_role: user.role || 'user',
      recipient_id: tournament.id,
      recipient_name: 'Streamer tournament lobby',
      content: `${nameFor(user)} opened the streamer tournament lobby.`,
      is_read: false,
      match_type: 'streamer_tournament',
      system: true,
      created_date: nowIso(),
    }).catch(() => null);

    return Response.json({ success: true, tournament });
  } catch (error) {
    console.error('Create streamer tournament error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
