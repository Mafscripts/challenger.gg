import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { activisionIdRequiredResponse } from '../_shared/activision.ts';

const nowIso = () => new Date().toISOString();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || user?.id || 'Unnamed player';
const rosterSize = (teamSize) => Number.parseInt(String(teamSize || '1v1').split('v')[0], 10) || 1;
const paymentModeFor = (value) => value === 'full_team' ? 'full_team' : 'own';

const tournamentStatusesOpenForRegistration = ['open', 'registration'];

const participantUserIds = (participant) => {
  const memberIds = Array.isArray(participant?.members)
    ? participant.members.map((member) => member?.user_id).filter(Boolean)
    : [];
  return [...new Set([participant?.captain_id, participant?.user_id, ...memberIds].filter(Boolean))];
};

async function activeTeamMembers(base44, teamId) {
  const members = await base44.asServiceRole.entities.TeamMember.filter({ team_id: teamId }, '-joined_date', 50);
  return (members || []).filter((member) => member.is_active !== false);
}

async function selectedTournamentTeam(base44, teamId, captainId, requiredSize) {
  if (!teamId) {
    const error = new Error('Select a team to register for tournaments');
    error.status = 400;
    throw error;
  }
  const team = await base44.asServiceRole.entities.Team.get(teamId).catch(() => null);
  if (!team || team.is_active === false) {
    const error = new Error('Select an active team');
    error.status = 400;
    throw error;
  }
  const teamType = team.team_type || '8s';
  if (teamType !== 'tournament' && teamType !== 'general') {
    const error = new Error('Select a tournament team');
    error.status = 400;
    throw error;
  }
  if (team.captain_id !== captainId) {
    const error = new Error('Only the team captain can register the team');
    error.status = 403;
    throw error;
  }
  if (Number(team.roster_size || requiredSize) !== requiredSize) {
    const error = new Error(`Team roster size must match ${requiredSize} players`);
    error.status = 400;
    throw error;
  }
  const members = await activeTeamMembers(base44, team.id);
  if (members.length !== requiredSize) {
    const error = new Error(`Tournament requires exactly ${requiredSize} active roster members`);
    error.status = 400;
    throw error;
  }
  return { team, members };
}

async function notifyUser(base44, userId, payload) {
  if (!userId) return null;
  return base44.asServiceRole.entities.Notification.create({
    user_id: userId,
    type: 'tournament',
    title: payload.title,
    message: payload.message,
    is_read: false,
    action_url: payload.action_url || '/tournaments',
    related_entity_id: payload.related_entity_id,
    related_entity_type: payload.related_entity_type,
    created_date: nowIso(),
  }).catch(() => null);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const activisionResponse = activisionIdRequiredResponse([user]);
    if (activisionResponse) return activisionResponse;

    const body = await req.json();
    const tournament = await base44.asServiceRole.entities.Tournament.get(body.tournament_id || '').catch(() => null);
    if (!tournament) return Response.json({ success: false, error: 'Tournament not found' }, { status: 404 });
    if (!tournamentStatusesOpenForRegistration.includes(tournament.status)) {
      return Response.json({ success: false, error: 'Registration is closed' }, { status: 400 });
    }
    if (Number(tournament.max_teams || 0) && Number(tournament.registered_teams || 0) >= Number(tournament.max_teams || 0)) {
      return Response.json({ success: false, error: 'Tournament is full' }, { status: 400 });
    }

    const requiredSize = rosterSize(tournament.team_size);
    const { team, members } = await selectedTournamentTeam(base44, body.team_id, user.id, requiredSize);
    const duplicateTeam = await base44.asServiceRole.entities.TournamentParticipant.filter({ tournament_id: tournament.id, team_id: team.id }, '-registered_date', 1).catch(() => []);
    if (duplicateTeam.length > 0) return Response.json({ success: false, error: 'Already registered' }, { status: 400 });

    const existingParticipants = await base44.asServiceRole.entities.TournamentParticipant.filter({ tournament_id: tournament.id }, 'seed', 500).catch(() => []);
    const memberIds = members.map((member) => member.user_id).filter(Boolean);
    const duplicatePlayer = (existingParticipants || []).find((participant) => {
      const participantIds = participantUserIds(participant);
      return memberIds.some((memberId) => participantIds.includes(memberId));
    });
    if (duplicatePlayer) {
      return Response.json({ success: false, error: 'A roster member is already registered for this tournament' }, { status: 400 });
    }

    const feeType = tournament.entry_type || (tournament.is_premium_only ? 'premium' : (Number(tournament.entry_fee || 0) > 0 ? 'credits' : 'free'));
    const inviteOnly = tournament.invite_only === true || feeType === 'invitational';
    const invitedUserIds = Array.isArray(tournament.invited_user_ids)
      ? tournament.invited_user_ids.map(String)
      : [];
    if (inviteOnly && !invitedUserIds.includes(String(user.id))) {
      return Response.json({ success: false, error: 'This tournament is invite only' }, { status: 403 });
    }
    if ((feeType === 'premium' || feeType === 'credits_premium') && !user.is_premium) {
      return Response.json({ success: false, error: 'Premium membership is required' }, { status: 400 });
    }

    const entryFee = Number(tournament.entry_fee || 0);
    const paymentMode = paymentModeFor(body.payment_mode);
    const memberUsers = await Promise.all(members.map((member) => base44.asServiceRole.entities.User.get(member.user_id).catch(() => null)));
    const rosterActivisionResponse = activisionIdRequiredResponse(memberUsers);
    if (rosterActivisionResponse) return rosterActivisionResponse;

    if ((feeType === 'credits' || feeType === 'credits_premium') && entryFee > 0) {
      if (paymentMode === 'full_team') {
        const totalEntryFee = entryFee * requiredSize;
        if (Number(user.credits || 0) < totalEntryFee) {
          return Response.json({ success: false, error: 'Not enough credits' }, { status: 400 });
        }
        await base44.asServiceRole.entities.User.update(user.id, { credits: Number(user.credits || 0) - totalEntryFee });
      } else {
        const unpaidMember = memberUsers.find((memberUser) => Number(memberUser?.credits || 0) < entryFee);
        if (unpaidMember) {
          return Response.json({ success: false, error: `${nameFor(unpaidMember)} does not have enough credits` }, { status: 400 });
        }
        await Promise.all(memberUsers.map((memberUser) => base44.asServiceRole.entities.User.update(memberUser.id, {
          credits: Number(memberUser.credits || 0) - entryFee,
        })));
      }
    }

    const existingCount = Number(tournament.registered_teams || 0);
    const participantMembers = members.map((member) => ({ user_id: member.user_id, user_name: member.user_name }));
    const participant = await base44.asServiceRole.entities.TournamentParticipant.create({
      tournament_id: tournament.id,
      team_id: team.id,
      team_name: team.name,
      captain_id: team.captain_id,
      captain_name: team.captain_name || nameFor(user),
      members: participantMembers,
      seed: existingCount + 1,
      eliminated: false,
      entry_type: feeType,
      payment_mode: paymentMode,
      entry_fee_paid: entryFee * requiredSize,
      paid_member_ids: participantMembers.map((member) => member.user_id),
      roster_locked: true,
      registered_date: nowIso(),
    });

    await base44.asServiceRole.entities.Tournament.update(tournament.id, {
      registered_teams: existingCount + 1,
    });

    await Promise.all(participantMembers.map((member) => notifyUser(base44, member.user_id, {
      title: 'Tournament registered',
      message: `${team.name} registered for ${tournament.name}.`,
      related_entity_id: tournament.id,
      related_entity_type: 'Tournament',
    })));

    return Response.json({ success: true, participant });
  } catch (error) {
    console.error('Register tournament error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
