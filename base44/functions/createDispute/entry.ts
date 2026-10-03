import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const playerName = (user) => user.display_name || user.full_name || user.email || 'Unnamed player';
const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      wager_id,
      reason,
      description,
      evidence_urls = [],
    } = body;
    const matchType = body.match_type || (body.tournament_match_id ? 'tournament' : 'wager');

    if (matchType === 'tournament') {
      const matchId = body.match_id || body.tournament_match_id;
      if (!matchId || !reason || !description) {
        return Response.json({ error: 'Missing required fields' }, { status: 400 });
      }

      const match = await base44.asServiceRole.entities.TournamentMatch.get(matchId).catch(() => null);
      if (!match) return Response.json({ error: 'Tournament match not found' }, { status: 404 });

      const participants = await base44.asServiceRole.entities.TournamentParticipant.filter({
        tournament_id: match.tournament_id,
      });
      const userParticipant = participants.find((participant) => (
        participant.captain_id === user.id
        || participant.user_id === user.id
        || participant.team_id === user.id
        || (participant.members || []).some((member) => member.user_id === user.id)
      ));
      const userTeamId = userParticipant?.team_id || userParticipant?.user_id || user.id;
      const isParticipant = [match.team_a_id, match.team_b_id].includes(userTeamId);
      const isStaff = staffRoles.has(user.role);
      if (!isParticipant && !isStaff) {
        return Response.json({ error: 'Only tournament match participants can create disputes' }, { status: 403 });
      }

      if (!isStaff) {
        const deadline = new Date(match.start_deadline || '').getTime();
        if (!Number.isFinite(deadline)) {
          return Response.json({ error: 'The match start timer is not available yet. Refresh the match room.' }, { status: 400 });
        }
        if (Date.now() < deadline) {
          return Response.json({ error: 'Disputes unlock when the 15-minute match start timer expires.' }, { status: 400 });
        }
      }

      const existing = await base44.asServiceRole.entities.Dispute.filter({
        match_id: matchId,
        status: 'pending',
      });
      if (existing.length > 0) {
        return Response.json({
          success: true,
          message: 'Dispute already exists',
          dispute_id: existing[0].id,
        });
      }

      const dispute = await base44.asServiceRole.entities.Dispute.create({
        match_id: matchId,
        match_type: 'tournament',
        tournament_match_id: matchId,
        wager_details: match,
        reported_by: user.id,
        reported_by_name: playerName(user),
        reported_against: body.reported_against,
        reported_against_name: body.reported_against_name,
        reason,
        description,
        evidence_urls,
        submitted_evidence: evidence_urls,
        status: 'pending',
        priority: user.is_premium ? 'high' : 'medium',
        created_date: new Date().toISOString(),
      });

      await base44.asServiceRole.entities.TournamentMatch.update(matchId, {
        status: 'disputed',
        dispute_id: dispute.id,
        disputed_date: new Date().toISOString(),
      });

      return Response.json({
        success: true,
        message: 'Dispute created successfully',
        dispute_id: dispute.id,
      });
    }

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

    const now = new Date().toISOString();
    const ticket = await base44.asServiceRole.entities.Ticket.create({
      user_id: user.id,
      username: playerName(user),
      subject: `Wager dispute ${wager.id}`,
      description,
      category: 'support',
      priority: reason === 'no_show' || reason === 'score_dispute' ? 'high' : 'medium',
      status: 'open',
      messages: [{ sender_id: user.id, sender_name: playerName(user), sender_role: user.role || 'user', message: description, timestamp: now }],
    });
    await base44.asServiceRole.entities.AdminAlert.create({
      ticket_id: ticket.id,
      match_type: 'wager',
      match_id: wager.id,
      requested_by: user.id,
      requested_by_name: playerName(user),
      priority: 'high',
      status: 'open',
      created_date: now,
    });
    await base44.asServiceRole.entities.Wager.update(wager_id, {
      status: 'disputed',
      dispute_id: dispute.id,
      disputed_date: now,
      requested_admin: true,
      admin_request_ticket_id: ticket.id,
      admin_request_status: 'waiting_for_admin',
      admin_request_updated_date: now,
    });
    await base44.asServiceRole.entities.ChatMessage.create({
      conversation_id: wager.id,
      sender_id: user.id,
      sender_name: 'Topfragg System',
      sender_role: 'admin',
      staff_badge: true,
      recipient_id: wager.id,
      recipient_name: 'Wager match room',
      content: `⚠️ ${playerName(user)} opened a dispute. This match is now under staff review.`,
      is_read: false,
      match_type: 'wager',
      system: true,
      created_date: now,
    });

    return Response.json({
      success: true,
      message: 'Dispute created successfully',
      dispute_id: dispute.id,
      ticket_id: ticket.id,
    });
  } catch (error) {
    console.error('Create dispute error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
