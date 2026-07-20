import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const allowedMatchTypes = ['wager', 'tournament'];
const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const matchType = body.match_type;
    const matchId = body.match_id;

    if (!allowedMatchTypes.includes(matchType)) {
      return Response.json({ error: 'Admin requests are only available for wager and tournament match rooms' }, { status: 400 });
    }

    if (!matchId) {
      return Response.json({ error: 'Missing match_id' }, { status: 400 });
    }

    if (matchType === 'tournament' && !staffRoles.has(user.role)) {
      const match = await base44.asServiceRole.entities.TournamentMatch.get(matchId).catch(() => null);
      if (!match) return Response.json({ error: 'Tournament match not found' }, { status: 404 });
      const deadline = new Date(match.start_deadline || '').getTime();
      if (!Number.isFinite(deadline)) {
        return Response.json({ error: 'The match start timer is not available yet. Refresh the match room.' }, { status: 400 });
      }
      if (Date.now() < deadline) {
        return Response.json({ error: 'Admin support unlocks when the 15-minute match start timer expires.' }, { status: 400 });
      }
    }

    const subject = body.subject || `${matchType} match admin request`;
    const description = body.description || `Admin requested for ${matchType} match ${matchId}.`;

    const ticketCategory = matchType === 'tournament' ? 'tournament' : 'support';

    const ticket = await base44.asServiceRole.entities.Ticket.create({
      user_id: user.id,
      username: playerName(user),
      subject,
      description,
      category: ticketCategory,
      priority: body.priority || 'high',
      status: 'open',
      messages: [{
        sender_id: user.id,
        sender_name: playerName(user),
        sender_role: user.role || 'user',
        message: description,
        timestamp: new Date().toISOString(),
      }],
    });

    const alert = await base44.asServiceRole.entities.AdminAlert.create({
      ticket_id: ticket.id,
      match_type: matchType,
      match_id: matchId,
      requested_by: user.id,
      requested_by_name: playerName(user),
      priority: body.priority === 'critical' ? 'critical' : 'high',
      status: 'open',
      created_date: new Date().toISOString(),
    });

    if (matchType === 'tournament') {
      await base44.asServiceRole.entities.TournamentMatch.update(matchId, {
        requested_admin: true,
      });
    }

    return Response.json({
      success: true,
      ticket_id: ticket.id,
      alert_id: alert.id,
    });
  } catch (error) {
    console.error('Request admin alert error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
