import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const id = body.xp_match_id || body.match_id;
    const match = await base44.asServiceRole.entities.XPMatch.get(id);
    if (!match) return Response.json({ error: 'XP match not found' }, { status: 404 });
    const isStaff = ['ceo', 'super_admin', 'admin', 'moderator'].includes(user.role) || ['ceo', 'super_admin', 'admin', 'moderator'].includes(user.admin_role) || user.is_admin === true;
    if (match.host_id !== user.id && !isStaff) return Response.json({ error: 'Only the host or staff can cancel this XP match' }, { status: 403 });
    if (['completed', 'cancelled'].includes(match.status)) return Response.json({ error: 'This XP match can no longer be cancelled' }, { status: 400 });
    if (!isStaff && match.status !== 'open') return Response.json({ error: 'Only open XP matches can be cancelled by the host' }, { status: 400 });

    const updated = await base44.asServiceRole.entities.XPMatch.update(id, {
      status: 'cancelled',
      posted_to_matchfinder: false,
      cancelled_date: new Date().toISOString(),
    });
    return Response.json({ success: true, match: updated });
  } catch (error) {
    console.error('Cancel XP match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});