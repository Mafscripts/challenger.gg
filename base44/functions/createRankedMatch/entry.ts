import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { activisionIdRequiredResponse } from '../_shared/activision.ts';

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

const mapsByMode = {
  snd: [
    { id: 'hacienda', name: 'Hacienda' },
    { id: 'gridlock', name: 'Gridlock' },
    { id: 'raid', name: 'Raid' },
    { id: 'scar', name: 'Scar' },
    { id: 'den', name: 'Den' },
    { id: 'sake', name: 'Sake' },
    { id: 'fringe', name: 'Fringe' },
  ],
  overload: [
    { id: 'scar', name: 'Scar' },
    { id: 'gridlock', name: 'Gridlock' },
    { id: 'den', name: 'Den' },
    { id: 'exposure', name: 'Exposure' },
  ],
  hp: [
    { id: 'sake', name: 'Sake' },
    { id: 'colossus', name: 'Colossus' },
    { id: 'den', name: 'Den' },
    { id: 'scar', name: 'Scar' },
    { id: 'gridlock', name: 'Gridlock' },
    { id: 'hacienda', name: 'Hacienda' },
  ],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const activisionResponse = activisionIdRequiredResponse([user]);
    if (activisionResponse) return activisionResponse;

    const body = await req.json();
    const gameMode = body.game_mode;
    const teamSize = body.team_size;

    if (!gameMode || !teamSize) {
      return Response.json({ error: 'Missing required fields: game_mode, team_size' }, { status: 400 });
    }
    if (!Object.prototype.hasOwnProperty.call(mapsByMode, gameMode)) {
      return Response.json({ error: 'Invalid ranked game mode' }, { status: 400 });
    }
    const slotsPerTeam = Number.parseInt(String(teamSize).split('v')[0], 10);
    if (![1, 2, 3, 4].includes(slotsPerTeam) || teamSize !== `${slotsPerTeam}v${slotsPerTeam}`) {
      return Response.json({ error: 'Invalid ranked team size' }, { status: 400 });
    }

    const mapPool = mapsByMode[gameMode];
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
      best_of: 1,
      maps: mapPool.map((map) => map.name),
      final_map_id: '',
      final_map_name: '',
      team_alpha_player_ids: [user.id],
      team_alpha_player_names: [playerName(user)],
      team_bravo_player_ids: [],
      team_bravo_player_names: [],
      joined_players: 1,
      total_players: slotsPerTeam * 2,
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
