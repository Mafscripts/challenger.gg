import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

const mapsByMode = {
  snd: [
    { id: 'raid', name: 'Raid' },
    { id: 'shoot_house', name: 'Shoot House' },
    { id: 'vacant', name: 'Vacant' },
    { id: 'nuketown', name: 'Nuketown' },
    { id: 'hackney_yard', name: 'Hackney Yard' },
    { id: 'gun_runner', name: 'Gun Runner' },
  ],
  overload: [
    { id: 'gaza', name: 'Gaza' },
    { id: 'airstrip', name: 'Airstrip' },
    { id: 'tipperary', name: 'Tipperary' },
    { id: 'rivet', name: 'Rivet' },
    { id: 'khandor', name: 'Khandor' },
  ],
  hp: [
    { id: 'terminal', name: 'Terminal' },
    { id: 'rust', name: 'Rust' },
    { id: 'shipment', name: 'Shipment' },
    { id: 'crash', name: 'Crash' },
    { id: 'backlot', name: 'Backlot' },
  ],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const gameMode = body.game_mode;
    const teamSize = body.team_size;

    if (!gameMode || !teamSize) {
      return Response.json({ error: 'Missing required fields: game_mode, team_size' }, { status: 400 });
    }

    const mapPool = mapsByMode[gameMode] || mapsByMode.snd;
    const selected = body.final_map
      ? { id: body.final_map, name: body.final_map_name || body.final_map }
      : mapPool[Math.floor(Math.random() * mapPool.length)];
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const match = await base44.asServiceRole.entities.RankedMatch.create({
      host_id: user.id,
      host_name: playerName(user),
      challenger_id: '',
      challenger_name: '',
      game_mode: gameMode,
      game_mode_display: body.game_mode_display || gameMode,
      team_size: teamSize,
      best_of: Number(body.best_of || 1),
      maps: mapPool.map((map) => map.name),
      final_map_id: selected?.id || '',
      final_map_name: selected?.name || '',
      status: 'open',
      proof_urls: [],
      match_start_deadline: deadline,
      created_date: now,
    });

    return Response.json({ success: true, ranked_match_id: match.id, match });
  } catch (error) {
    console.error('Create ranked match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
