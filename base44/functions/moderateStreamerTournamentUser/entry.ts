import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const nowIso = () => new Date().toISOString();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || user?.id || 'Unnamed player';
const staffRoles = new Set(['ceo', 'super_admin', 'admin', 'moderator']);
const streamerTournamentTypes = new Set(['streamer', 'streamer_tournament']);

function isStreamerTournament(tournament) {
  return Boolean(
    tournament?.is_streamer_tournament
    || streamerTournamentTypes.has(String(tournament?.tournament_type || '').toLowerCase())
    || streamerTournamentTypes.has(String(tournament?.source || '').toLowerCase())
  );
}

function canModerateStreamerTournament(user, tournament) {
  return Boolean(
    staffRoles.has(user?.role)
    || String(tournament?.host_id || tournament?.created_by || '') === String(user?.id || '')
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const tournament = await base44.asServiceRole.entities.Tournament.get(body.tournament_id || '').catch(() => null);
    if (!tournament || !isStreamerTournament(tournament)) {
      return Response.json({ success: false, error: 'Streamer tournament not found' }, { status: 404 });
    }
    if (!canModerateStreamerTournament(user, tournament)) {
      return Response.json({ success: false, error: 'Only the streamer host or staff can moderate this lobby' }, { status: 403 });
    }

    const targetUserId = String(body.user_id || '').trim();
    if (!targetUserId) return Response.json({ success: false, error: 'User id is required' }, { status: 400 });
    if (String(targetUserId) === String(user.id)) {
      return Response.json({ success: false, error: 'You cannot ban yourself from your own lobby' }, { status: 400 });
    }

    const target = await base44.asServiceRole.entities.User.get(targetUserId).catch(() => null);
    if (!target) return Response.json({ success: false, error: 'User not found' }, { status: 404 });

    const action = String(body.action || 'ban').toLowerCase();
    const bannedUsers = Array.isArray(tournament.banned_users) ? tournament.banned_users : [];
    const bannedUserIds = new Set((tournament.banned_user_ids || []).map(String));
    let nextBannedUsers = bannedUsers;

    if (action === 'unban') {
      bannedUserIds.delete(targetUserId);
      nextBannedUsers = bannedUsers.filter((entry) => String(entry?.user_id || '') !== targetUserId);
    } else {
      bannedUserIds.add(targetUserId);
      nextBannedUsers = [
        ...bannedUsers.filter((entry) => String(entry?.user_id || '') !== targetUserId),
        {
          user_id: target.id,
          user_name: nameFor(target),
          banned_by: user.id,
          banned_by_name: nameFor(user),
          reason: String(body.reason || 'Streamer lobby moderation').trim().slice(0, 200),
          banned_date: nowIso(),
        },
      ];
    }

    const updated = await base44.asServiceRole.entities.Tournament.update(tournament.id, {
      banned_user_ids: [...bannedUserIds],
      banned_users: nextBannedUsers,
      updated_date: nowIso(),
    });

    await base44.asServiceRole.entities.ChatMessage.create({
      conversation_id: tournament.id,
      sender_id: user.id,
      sender_name: nameFor(user),
      sender_role: user.role || 'user',
      recipient_id: tournament.id,
      recipient_name: 'Streamer tournament lobby',
      content: `${nameFor(target)} was ${action === 'unban' ? 'unbanned from' : 'banned from'} the lobby.`,
      is_read: false,
      match_type: 'streamer_tournament',
      system: true,
      created_date: nowIso(),
    }).catch(() => null);

    return Response.json({ success: true, tournament: updated });
  } catch (error) {
    console.error('Moderate streamer tournament user error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
