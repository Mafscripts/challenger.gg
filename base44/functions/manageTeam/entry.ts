import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const nowIso = () => new Date().toISOString();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || user?.id || 'Unnamed player';

const normalizeTeamType = (value) => {
  const type = String(value || '8s').toLowerCase();
  if (type === 'eights') return '8s';
  return ['8s', 'wager', 'tournament', 'general'].includes(type) ? type : '8s';
};

const rosterLimitForTeam = (team, fallback = 4) => {
  const size = Number(team?.roster_size || fallback);
  return Number.isFinite(size) && size > 0 ? size : fallback;
};

const teamTypeMatches = (team, expectedType) => {
  const teamType = normalizeTeamType(team?.team_type);
  return teamType === expectedType || teamType === 'general';
};

async function activeTeamMembers(base44, teamId) {
  const members = await base44.asServiceRole.entities.TeamMember.filter({ team_id: teamId }, '-joined_date', 50);
  return (members || []).filter((member) => member.is_active !== false);
}

async function userActiveTeamMemberships(base44, userId, teamType) {
  const memberships = await base44.asServiceRole.entities.TeamMember.filter({ user_id: userId }, '-joined_date', 100);
  const rows = await Promise.all((memberships || [])
    .filter((membership) => membership.is_active !== false)
    .map(async (membership) => {
      const team = await base44.asServiceRole.entities.Team.get(membership.team_id).catch(() => null);
      if (!team || team.is_active === false) return null;
      if (teamType && !teamTypeMatches(team, teamType)) return null;
      return { membership, team };
    }));
  return rows.filter(Boolean);
}

async function notifyUser(base44, userId, payload) {
  if (!userId) return null;
  return base44.asServiceRole.entities.Notification.create({
    user_id: userId,
    type: payload.type || 'system',
    title: payload.title,
    message: payload.message,
    is_read: false,
    action_url: payload.action_url || '/teams',
    related_entity_id: payload.related_entity_id || '',
    related_entity_type: payload.related_entity_type || '',
    created_date: nowIso(),
  }).catch(() => null);
}

async function rosterChangeError(base44, team) {
  if (!team || team.is_active === false) return 'Team is not active';
  if (team.roster_locked) return 'Roster is locked';
  const participants = await base44.asServiceRole.entities.TournamentParticipant.filter({ team_id: team.id }, '-registered_date', 100).catch(() => []);
  for (const participant of participants || []) {
    if (participant.roster_locked) return 'Roster is locked by tournament registration';
    const tournament = await base44.asServiceRole.entities.Tournament.get(participant.tournament_id).catch(() => null);
    const registrationEnded = tournament?.registration_end && new Date(tournament.registration_end) <= new Date();
    if (registrationEnded || !['open', 'registration'].includes(tournament?.status)) {
      return 'Roster is locked by tournament registration';
    }
  }
  return null;
}

async function findUserForInvite(base44, identifier) {
  const needle = String(identifier || '').trim().toLowerCase();
  if (!needle) return null;
  const direct = await base44.asServiceRole.entities.User.get(identifier).catch(() => null);
  if (direct) return direct;
  const users = await base44.asServiceRole.entities.User.filter({}, '-created_date', 500).catch(() => []);
  return (users || []).find((user) => [
    user.id,
    user.email,
    user.username,
    user.handle,
    user.display_name,
    user.full_name,
  ].filter(Boolean).some((value) => String(value).toLowerCase() === needle)) || null;
}

async function createOrReactivateTeamMember(base44, team, user, role = 'member') {
  const existingRows = await base44.asServiceRole.entities.TeamMember.filter({ team_id: team.id, user_id: user.id }, '-joined_date', 10).catch(() => []);
  const existing = existingRows?.[0];
  const payload = {
    team_id: team.id,
    user_id: user.id,
    user_name: nameFor(user),
    role,
    team_type: normalizeTeamType(team.team_type),
    joined_date: nowIso(),
    is_active: true,
  };
  if (existing) return base44.asServiceRole.entities.TeamMember.update(existing.id, payload);
  return base44.asServiceRole.entities.TeamMember.create(payload);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const action = String(body.action || '').toLowerCase();

    if (action === 'create') {
      const name = String(body.name || '').trim();
      const tag = String(body.tag || '').trim().toUpperCase().slice(0, 6);
      const teamType = normalizeTeamType(body.team_type);
      const rosterSize = Math.max(1, Number(body.roster_size || (teamType === '8s' ? 4 : 2)));
      if (!name || !tag) return Response.json({ success: false, error: 'Team name and tag are required' }, { status: 400 });

      if (teamType === '8s') {
        const active8sTeams = await userActiveTeamMemberships(base44, user.id, '8s');
        if (active8sTeams.length > 0) {
          return Response.json({ success: false, error: 'Leave or disband your current 8s team before creating another' }, { status: 400 });
        }
      }

      const team = await base44.asServiceRole.entities.Team.create({
        name,
        tag,
        captain_id: user.id,
        captain_name: nameFor(user),
        region: body.region || user.region || 'na',
        team_type: teamType,
        roster_size: rosterSize,
        roster_locked: false,
        total_wins: 0,
        total_losses: 0,
        total_earnings: 0,
        ranking: Number(body.ranking || 0),
        is_active: true,
        created_date: nowIso(),
      });
      const member = await createOrReactivateTeamMember(base44, team, user, 'captain');
      return Response.json({ success: true, team, member });
    }

    const team = await base44.asServiceRole.entities.Team.get(body.team_id || '').catch(() => null);
    if (!team) return Response.json({ success: false, error: 'Team not found' }, { status: 404 });

    if (action === 'invite') {
      if (team.captain_id !== user.id) return Response.json({ success: false, error: 'Only the team captain can invite players' }, { status: 403 });
      const lockError = await rosterChangeError(base44, team);
      if (lockError) return Response.json({ success: false, error: lockError }, { status: 400 });
      const members = await activeTeamMembers(base44, team.id);
      if (members.length >= rosterLimitForTeam(team)) return Response.json({ success: false, error: 'Team roster is full' }, { status: 400 });

      const target = await findUserForInvite(base44, body.user_id || body.player || body.identifier);
      if (!target) return Response.json({ success: false, error: 'Player not found' }, { status: 404 });
      if (target.id === user.id || members.some((member) => member.user_id === target.id)) {
        return Response.json({ success: false, error: 'Player is already on this team' }, { status: 400 });
      }
      if (normalizeTeamType(team.team_type) === '8s') {
        const target8sTeams = await userActiveTeamMemberships(base44, target.id, '8s');
        if (target8sTeams.length > 0) return Response.json({ success: false, error: 'Player already has an active 8s team' }, { status: 400 });
      }

      const existingInvites = await base44.asServiceRole.entities.TeamInvite.filter({ team_id: team.id, invited_user_id: target.id, status: 'pending' }).catch(() => []);
      if (existingInvites.length > 0) return Response.json({ success: false, error: 'Invite already pending' }, { status: 400 });

      const invite = await base44.asServiceRole.entities.TeamInvite.create({
        team_id: team.id,
        team_name: team.name,
        team_type: normalizeTeamType(team.team_type),
        invited_user_id: target.id,
        invited_user_name: nameFor(target),
        invited_by: user.id,
        invited_by_name: nameFor(user),
        status: 'pending',
        created_date: nowIso(),
      });
      await notifyUser(base44, target.id, {
        title: 'Team invite',
        message: `${nameFor(user)} invited you to ${team.name}.`,
        related_entity_id: invite.id,
        related_entity_type: 'TeamInvite',
      });
      return Response.json({ success: true, invite });
    }

    if (action === 'respond_invite') {
      const invite = await base44.asServiceRole.entities.TeamInvite.get(body.invite_id || '').catch(() => null);
      if (!invite || invite.invited_user_id !== user.id || invite.status !== 'pending') {
        return Response.json({ success: false, error: 'Invite is not available' }, { status: 400 });
      }
      const inviteTeam = await base44.asServiceRole.entities.Team.get(invite.team_id).catch(() => null);
      if (!inviteTeam || inviteTeam.is_active === false) {
        await base44.asServiceRole.entities.TeamInvite.update(invite.id, { status: 'cancelled', responded_date: nowIso() }).catch(() => null);
        return Response.json({ success: false, error: 'Team is no longer active' }, { status: 400 });
      }
      const decision = body.decision === 'accept' ? 'accepted' : 'declined';
      if (decision === 'declined') {
        const declined = await base44.asServiceRole.entities.TeamInvite.update(invite.id, { status: 'declined', responded_date: nowIso() });
        return Response.json({ success: true, invite: declined });
      }
      const lockError = await rosterChangeError(base44, inviteTeam);
      if (lockError) return Response.json({ success: false, error: lockError }, { status: 400 });
      const members = await activeTeamMembers(base44, inviteTeam.id);
      if (members.length >= rosterLimitForTeam(inviteTeam)) return Response.json({ success: false, error: 'Team roster is full' }, { status: 400 });
      if (normalizeTeamType(inviteTeam.team_type) === '8s') {
        const active8sTeams = await userActiveTeamMemberships(base44, user.id, '8s');
        if (active8sTeams.some((row) => row.team.id !== inviteTeam.id)) {
          return Response.json({ success: false, error: 'Leave your current 8s team before accepting another 8s invite' }, { status: 400 });
        }
      }
      const member = await createOrReactivateTeamMember(base44, inviteTeam, user, 'member');
      const accepted = await base44.asServiceRole.entities.TeamInvite.update(invite.id, { status: 'accepted', responded_date: nowIso() });
      await notifyUser(base44, inviteTeam.captain_id, {
        title: 'Invite accepted',
        message: `${nameFor(user)} joined ${inviteTeam.name}.`,
        related_entity_id: inviteTeam.id,
        related_entity_type: 'Team',
      });
      return Response.json({ success: true, invite: accepted, member });
    }

    if (action === 'kick') {
      if (team.captain_id !== user.id) return Response.json({ success: false, error: 'Only the team captain can kick players' }, { status: 403 });
      const lockError = await rosterChangeError(base44, team);
      if (lockError) return Response.json({ success: false, error: lockError }, { status: 400 });
      const member = await base44.asServiceRole.entities.TeamMember.get(body.member_id || '').catch(() => null);
      if (!member || member.team_id !== team.id || member.is_active === false) return Response.json({ success: false, error: 'Member not found' }, { status: 404 });
      if (member.user_id === team.captain_id || member.role === 'captain') return Response.json({ success: false, error: 'Disband the team to remove the captain' }, { status: 400 });
      const updated = await base44.asServiceRole.entities.TeamMember.update(member.id, { is_active: false, left_date: nowIso(), removed_by: user.id });
      await notifyUser(base44, member.user_id, {
        title: 'Removed from team',
        message: `You were removed from ${team.name}.`,
        related_entity_id: team.id,
        related_entity_type: 'Team',
      });
      return Response.json({ success: true, member: updated });
    }

    if (action === 'leave') {
      const memberRows = await base44.asServiceRole.entities.TeamMember.filter({ team_id: team.id, user_id: user.id }, '-joined_date', 10).catch(() => []);
      const member = (memberRows || []).find((row) => row.is_active !== false);
      if (!member) return Response.json({ success: false, error: 'You are not on this team' }, { status: 400 });
      const lockError = await rosterChangeError(base44, team);
      if (lockError) return Response.json({ success: false, error: lockError }, { status: 400 });
      const members = await activeTeamMembers(base44, team.id);
      if (member.user_id === team.captain_id && members.length > 1) {
        return Response.json({ success: false, error: 'Disband the team before the captain leaves' }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.TeamMember.update(member.id, { is_active: false, left_date: nowIso() });
      let updatedTeam = team;
      if (member.user_id === team.captain_id) {
        updatedTeam = await base44.asServiceRole.entities.Team.update(team.id, { is_active: false, disbanded_date: nowIso(), disbanded_by: user.id });
      }
      return Response.json({ success: true, member: updated, team: updatedTeam });
    }

    if (action === 'disband') {
      if (team.captain_id !== user.id) return Response.json({ success: false, error: 'Only the team captain can disband the team' }, { status: 403 });
      const lockError = await rosterChangeError(base44, team);
      if (lockError) return Response.json({ success: false, error: lockError }, { status: 400 });
      const members = await activeTeamMembers(base44, team.id);
      await Promise.all(members.map((member) => base44.asServiceRole.entities.TeamMember.update(member.id, {
        is_active: false,
        left_date: nowIso(),
        removed_by: user.id,
      }).catch(() => null)));
      const invites = await base44.asServiceRole.entities.TeamInvite.filter({ team_id: team.id, status: 'pending' }, '-created_date', 100).catch(() => []);
      await Promise.all((invites || []).map((invite) => base44.asServiceRole.entities.TeamInvite.update(invite.id, {
        status: 'cancelled',
        responded_date: nowIso(),
      }).catch(() => null)));
      const updatedTeam = await base44.asServiceRole.entities.Team.update(team.id, {
        is_active: false,
        disbanded_date: nowIso(),
        disbanded_by: user.id,
      });
      await Promise.all(members
        .filter((member) => member.user_id !== user.id)
        .map((member) => notifyUser(base44, member.user_id, {
          title: 'Team disbanded',
          message: `${team.name} was disbanded.`,
          related_entity_id: team.id,
          related_entity_type: 'Team',
        })));
      return Response.json({ success: true, team: updatedTeam });
    }

    return Response.json({ success: false, error: 'Unknown team action' }, { status: 400 });
  } catch (error) {
    console.error('Manage team error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
