import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { ranked_match_id, match_id } = await req.json();
    const id = ranked_match_id || match_id;
    if (!id) return Response.json({ error: 'Missing ranked_match_id' }, { status: 400 });

    const match = await base44.asServiceRole.entities.RankedMatch.get(id);
    if (!match) return Response.json({ error: 'Ranked match not found' }, { status: 404 });
    if (match.status !== 'open') return Response.json({ error: 'Ranked match is no longer open' }, { status: 400 });
    if (match.host_id === user.id) return Response.json({ error: 'Cannot accept your own ranked match' }, { status: 400 });

    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await base44.asServiceRole.entities.RankedMatch.update(id, {
      challenger_id: user.id,
      challenger_name: playerName(user),
      status: 'in_progress',
      match_started_date: now,
      match_start_deadline: deadline,
    });

    return Response.json({ success: true, ranked_match_id: id, match_start_deadline: deadline });
  } catch (error) {
    console.error('Accept ranked match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
