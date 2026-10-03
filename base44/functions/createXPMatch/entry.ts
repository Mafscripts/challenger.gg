import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { activisionIdRequiredResponse } from '../_shared/activision.ts';

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

const mapsByMode = {
  snd: ['Hacienda','Gridlock','Raid','Scar','Den','Sake','Fringe'],
  hp: ['Sake','Colossus','Den','Scar','Gridlock','Hacienda'],
  overload: ['Scar','Gridlock','Den','Exposure'],
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
    if (!mapsByMode[gameMode]) return Response.json({ error: 'Invalid XP game mode' }, { status: 400 });
    const slotsPerTeam = Math.max(1, Number.parseInt(String(teamSize || '1v1').split('v')[0], 10) || 1);
    if (![1,2,3,4].includes(slotsPerTeam) || teamSize !== `${slotsPerTeam}v${slotsPerTeam}`) {
      return Response.json({ error: 'Invalid XP team size' }, { status: 400 });
    }

    const match = await base44.asServiceRole.entities.XPMatch.create({
      host_id: user.id,
      host_name: playerName(user),
      challenger_id: '',
      challenger_name: '',
      game_mode: gameMode,
      game_mode_display: body.game_mode_display || gameMode,
      team_size: teamSize,
      play_rule: body.play_rule || 'controller_only',
      best_of: [1, 3, 5].includes(Number(body.best_of)) ? Number(body.best_of) : 1,
      maps: mapsByMode[gameMode],
      team_alpha_player_ids: [user.id],
      team_alpha_player_names: [playerName(user)],
      team_bravo_player_ids: [],
      team_bravo_player_names: [],
      joined_players: 1,
      total_players: slotsPerTeam * 2,
      status: 'open',
      posted_to_matchfinder: true,
      proof_urls: [],
      match_start_deadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      created_date: new Date().toISOString(),
    });

    return Response.json({ success: true, xp_match_id: match.id, match });
  } catch (error) {
    console.error('Create XP match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});