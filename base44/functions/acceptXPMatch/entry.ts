import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { activisionIdRequiredForUserIds, activisionIdRequiredResponse } from '../_shared/activision.ts';

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const activisionResponse = activisionIdRequiredResponse([user]);
    if (activisionResponse) return activisionResponse;

    const body = await req.json();
    const id = body.xp_match_id || body.match_id;
    const match = await base44.asServiceRole.entities.XPMatch.get(id);
    if (!match) return Response.json({ error: 'XP match not found' }, { status: 404 });
    if (match.status !== 'open') return Response.json({ error: 'XP match is no longer open' }, { status: 400 });
    if (match.host_id === user.id) return Response.json({ error: 'You cannot accept your own XP match' }, { status: 400 });

    const hostActivisionResponse = await activisionIdRequiredForUserIds(base44, [match.host_id]);
    if (hostActivisionResponse) return hostActivisionResponse;

    const slotsPerTeam = Math.max(1, Number.parseInt(String(match.team_size || '1v1').split('v')[0], 10) || 1);
    const alphaIds = [...new Set((match.team_alpha_player_ids || [match.host_id]).filter(Boolean))];
    const alphaNames = Array.isArray(match.team_alpha_player_names) && match.team_alpha_player_names.length ? [...match.team_alpha_player_names] : [match.host_name];
    const bravoIds = [...new Set((match.team_bravo_player_ids || []).filter(Boolean))];
    const bravoNames = Array.isArray(match.team_bravo_player_names) ? [...match.team_bravo_player_names] : [];

    if (bravoIds.length >= slotsPerTeam) return Response.json({ error: 'XP match is full' }, { status: 400 });
    bravoIds.push(user.id);
    bravoNames.push(playerName(user));

    const rosterFull = alphaIds.length >= slotsPerTeam && bravoIds.length >= slotsPerTeam;
    const updated = await base44.asServiceRole.entities.XPMatch.update(id, {
      challenger_id: match.challenger_id || user.id,
      challenger_name: match.challenger_name || playerName(user),
      team_bravo_player_ids: bravoIds,
      team_bravo_player_names: bravoNames,
      joined_players: alphaIds.length + bravoIds.length,
      posted_to_matchfinder: !rosterFull,
      status: rosterFull ? 'accepted' : 'open',
      match_started_date: rosterFull ? new Date().toISOString() : '',
    });

    return Response.json({ success: true, xp_match_id: id, match: updated, roster_full: rosterFull });
  } catch (error) {
    console.error('Accept XP match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});