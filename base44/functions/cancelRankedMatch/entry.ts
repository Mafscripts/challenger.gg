import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const canModerate = (role) => ['ceo', 'super_admin', 'admin', 'moderator'].includes(role);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { ranked_match_id, match_id, reason } = await req.json();
    const id = ranked_match_id || match_id;
    if (!id) return Response.json({ error: 'Missing ranked_match_id' }, { status: 400 });

    const match = await base44.asServiceRole.entities.RankedMatch.get(id);
    if (!match) return Response.json({ error: 'Ranked match not found' }, { status: 404 });

    if (user.id !== match.host_id && !canModerate(user.role)) {
      return Response.json({ error: 'Only the host can cancel this ranked match' }, { status: 403 });
    }

    if (match.status === 'completed') {
      return Response.json({ error: 'Completed matches cannot be cancelled' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.RankedMatch.update(id, {
      status: 'cancelled',
      cancelled_date: now,
    });

    if (canModerate(user.role)) {
      await base44.asServiceRole.entities.AdminAction.create({
        admin_id: user.id,
        admin_name: user.full_name || user.email,
        admin_role: user.role,
        action_type: 'moderation',
        target_user_id: match.host_id,
        target_username: match.host_name,
        description: `Cancelled ranked match ${id}`,
        details: { ranked_match_id: id, reason: reason || '' },
        created_date: now,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Cancel ranked match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
