import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const playerName = (user) => user.display_name || user.full_name || user.email || 'Unnamed player';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { wager_id, reason, description, evidence_urls = [] } = await req.json();

    if (!wager_id || !reason || !description) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager) {
      return Response.json({ error: 'Wager not found' }, { status: 404 });
    }

    const isParticipant = user.id === wager.host_id || user.id === wager.challenger_id;
    if (!isParticipant) {
      return Response.json({ error: 'Only match participants can create disputes' }, { status: 403 });
    }

    if (['completed', 'cancelled'].includes(wager.status)) {
      return Response.json({ error: 'Closed matches cannot be disputed from the match room' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.Dispute.filter({
      wager_id,
      status: 'pending',
    });
    if (existing.length > 0) {
      return Response.json({
        success: true,
        message: 'Dispute already exists',
        dispute_id: existing[0].id,
      });
    }

    const opponentId = user.id === wager.host_id ? wager.challenger_id : wager.host_id;
    const opponentName = user.id === wager.host_id ? wager.challenger_name : wager.host_name;

    const dispute = await base44.asServiceRole.entities.Dispute.create({
      wager_id,
      wager_details: {
        game_mode: wager.game_mode,
        team_size: wager.team_size,
        amount: wager.entry_fee ?? wager.amount ?? 0,
      },
      reported_by: user.id,
      reported_by_name: playerName(user),
      reported_against: opponentId,
      reported_against_name: opponentName,
      reason,
      description,
      evidence_urls,
      status: 'pending',
      priority: reason === 'no_show' || reason === 'score_dispute' ? 'high' : 'medium',
      created_date: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.Wager.update(wager_id, {
      status: 'disputed',
    });

    return Response.json({
      success: true,
      message: 'Dispute created successfully',
      dispute_id: dispute.id,
    });
  } catch (error) {
    console.error('Create dispute error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
