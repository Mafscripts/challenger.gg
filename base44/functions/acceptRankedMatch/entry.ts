import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { activisionIdRequiredForUserIds, activisionIdRequiredResponse } from '../_shared/activision.ts';

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

const mapsByMode = {
  snd: ['Hacienda', 'Gridlock', 'Raid', 'Scar', 'Den', 'Sake', 'Fringe'],
  hp: ['Sake', 'Colossus', 'Den', 'Scar', 'Gridlock', 'Hacienda'],
  overload: ['Scar', 'Gridlock', 'Den', 'Exposure'],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const activisionResponse = activisionIdRequiredResponse([user]);
    if (activisionResponse) return activisionResponse;

    const { ranked_match_id, match_id } = await req.json();
    const id = ranked_match_id || match_id;
    if (!id) return Response.json({ error: 'Missing ranked_match_id' }, { status: 400 });

    const match = await base44.asServiceRole.entities.RankedMatch.get(id);
    if (!match) return Response.json({ error: 'Ranked match not found' }, { status: 404 });
    if (match.status !== 'open') return Response.json({ error: 'Ranked match is no longer open' }, { status: 400 });
    const slotsPerTeam = Math.max(1, Number.parseInt(String(match.team_size || '1v1').split('v')[0], 10) || 1);
    const alphaIds = [...new Set((Array.isArray(match.team_alpha_player_ids) && match.team_alpha_player_ids.length > 0 ? match.team_alpha_player_ids : [match.host_id]).filter(Boolean))];
    const bravoIds = [...new Set((Array.isArray(match.team_bravo_player_ids) ? match.team_bravo_player_ids : [match.challenger_id]).filter(Boolean))];
    const alphaNames = Array.isArray(match.team_alpha_player_names) && match.team_alpha_player_names.length > 0 ? [...match.team_alpha_player_names] : [match.host_name];
    const bravoNames = Array.isArray(match.team_bravo_player_names) ? [...match.team_bravo_player_names] : [];
    if ([...alphaIds, ...bravoIds].includes(user.id)) return Response.json({ success: true, ranked_match_id: id, match, already_joined: true });
    if (alphaIds.length >= slotsPerTeam && bravoIds.length >= slotsPerTeam) return Response.json({ error: 'Ranked match is full' }, { status: 400 });
    const hostActivisionResponse = await activisionIdRequiredForUserIds(base44, [match.host_id]);
    if (hostActivisionResponse) return hostActivisionResponse;

    const joinAlpha = alphaIds.length <= bravoIds.length && alphaIds.length < slotsPerTeam;
    if (joinAlpha) {
      alphaIds.push(user.id);
      alphaNames.push(playerName(user));
    } else {
      bravoIds.push(user.id);
      bravoNames.push(playerName(user));
    }
    const rosterFull = alphaIds.length >= slotsPerTeam && bravoIds.length >= slotsPerTeam;
    const now = new Date().toISOString();
    const deadline = match.match_start_deadline || new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pool = mapsByMode[match.game_mode] || mapsByMode.snd;
    const selectedMap = rosterFull ? (match.final_map_name || pool[Math.floor(Math.random() * pool.length)]) : '';
    const updated = await base44.asServiceRole.entities.RankedMatch.update(id, {
      challenger_id: match.challenger_id || (!joinAlpha ? user.id : ''),
      challenger_name: match.challenger_name || (!joinAlpha ? playerName(user) : ''),
      team_alpha_player_ids: alphaIds,
      team_alpha_player_names: alphaNames,
      team_bravo_player_ids: bravoIds,
      team_bravo_player_names: bravoNames,
      joined_players: alphaIds.length + bravoIds.length,
      total_players: slotsPerTeam * 2,
      status: rosterFull ? 'in_progress' : 'open',
      match_started_date: rosterFull ? now : '',
      match_start_deadline: deadline,
      best_of: 1,
      final_map_id: selectedMap ? (match.final_map_id || selectedMap.toLowerCase().replace(/\s+/g, '_')) : '',
      final_map_name: selectedMap,
    });

    return Response.json({ success: true, ranked_match_id: id, match_start_deadline: deadline, match: updated, roster_full: rosterFull });
  } catch (error) {
    console.error('Accept ranked match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
