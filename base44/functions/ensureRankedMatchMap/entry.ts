import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
  hp: [
    { id: 'sake', name: 'Sake' },
    { id: 'colossus', name: 'Colossus' },
    { id: 'den', name: 'Den' },
    { id: 'scar', name: 'Scar' },
    { id: 'gridlock', name: 'Gridlock' },
    { id: 'hacienda', name: 'Hacienda' },
  ],
  overload: [
    { id: 'scar', name: 'Scar' },
    { id: 'gridlock', name: 'Gridlock' },
    { id: 'den', name: 'Den' },
    { id: 'exposure', name: 'Exposure' },
  ],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const id = body.ranked_match_id || body.match_id;
    if (!id) return Response.json({ error: 'Missing ranked_match_id' }, { status: 400 });

    const match = await base44.asServiceRole.entities.RankedMatch.get(id);
    if (!match) return Response.json({ error: 'Ranked match not found' }, { status: 404 });

    const isParticipant = user.id === match.host_id || user.id === match.challenger_id;
    const isStaff = ['ceo', 'super_admin', 'admin', 'moderator'].includes(user.role);
    if (!isParticipant && !isStaff) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (match.final_map_name) return Response.json({ success: true, match });

    const pool = mapsByMode[match.game_mode] || mapsByMode.snd;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    const updated = await base44.asServiceRole.entities.RankedMatch.update(id, {
      best_of: 1,
      maps: pool.map((map) => map.name),
      final_map_id: selected.id,
      final_map_name: selected.name,
    });

    return Response.json({ success: true, match: updated });
  } catch (error) {
    console.error('Ensure ranked map error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
