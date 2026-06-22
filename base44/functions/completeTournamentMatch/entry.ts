import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const staffRoles = ['ceo', 'super_admin', 'admin', 'moderator'];

const toScore = (value) => {
  const score = Number(value);
  return Number.isFinite(score) ? Math.trunc(score) : null;
};

const participantName = (match, teamId) => (
  teamId === match.team_a_id ? match.team_a_name : match.team_b_name
);

const participantPayload = (match, teamId) => ({
  team_id: teamId,
  team_name: participantName(match, teamId),
});

async function placeTeam(base44, matchId, team, slot) {
  if (!matchId || !team?.team_id) return null;

  const target = await base44.asServiceRole.entities.TournamentMatch.get(matchId);
  if (!target) return null;

  const update = {
    [`team_${slot}_id`]: team.team_id,
    [`team_${slot}_name`]: team.team_name,
  };
  const otherSlot = slot === 'a' ? 'b' : 'a';
  const hasOtherTeam = Boolean(target[`team_${otherSlot}_id`]);
  update.status = hasOtherTeam ? 'ready' : target.status || 'pending';

  await base44.asServiceRole.entities.TournamentMatch.update(matchId, update);
  return { ...target, ...update };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const matchId = body.tournament_match_id || body.match_id;
    const teamAScore = toScore(body.team_a_score);
    const teamBScore = toScore(body.team_b_score);
    const proofUrls = body.proof_urls || [];

    if (!matchId || teamAScore === null || teamBScore === null) {
      return Response.json({ error: 'Missing tournament_match_id, team_a_score, or team_b_score' }, { status: 400 });
    }

    if (teamAScore < 0 || teamBScore < 0 || teamAScore === teamBScore) {
      return Response.json({ error: 'Scores must be non-negative and cannot be tied' }, { status: 400 });
    }

    const match = await base44.asServiceRole.entities.TournamentMatch.get(matchId);
    if (!match) return Response.json({ error: 'Tournament match not found' }, { status: 404 });
    if (match.completed || match.status === 'completed') {
      return Response.json({ success: true, already_completed: true, winner_id: match.winner_id });
    }

    const tournament = await base44.asServiceRole.entities.Tournament.get(match.tournament_id);
    if (!tournament) return Response.json({ error: 'Tournament not found' }, { status: 404 });

    const staff = staffRoles.includes(user.role);
    const participants = await base44.asServiceRole.entities.TournamentParticipant.filter({
      tournament_id: match.tournament_id,
    });
    const userParticipant = participants.find((participant) => (
      participant.captain_id === user.id ||
      participant.team_id === user.id ||
      (participant.members || []).some((member) => member.user_id === user.id)
    ));
    const userTeamId = userParticipant?.team_id || user.id;
    const isParticipant = [match.team_a_id, match.team_b_id].includes(userTeamId);

    if (!staff && !isParticipant) {
      return Response.json({ error: 'Only match participants or staff can report this tournament match' }, { status: 403 });
    }

    if (!match.team_a_id || !match.team_b_id) {
      return Response.json({ error: 'Tournament match is not ready' }, { status: 400 });
    }

    const winnerId = teamAScore > teamBScore ? match.team_a_id : match.team_b_id;
    const loserId = winnerId === match.team_a_id ? match.team_b_id : match.team_a_id;
    const winner = participantPayload(match, winnerId);
    const loser = participantPayload(match, loserId);
    const now = new Date().toISOString();

    await base44.asServiceRole.entities.TournamentMatch.update(matchId, {
      team_a_score: teamAScore,
      team_b_score: teamBScore,
      winner_id: winner.team_id,
      winner_name: winner.team_name,
      proof_urls: proofUrls,
      status: 'completed',
      completed: true,
      completed_date: now,
    });

    if (match.next_match_id) {
      const nextSlot = match.bracket === 'grand_final' ? 'a' : (match.match_number % 2 === 1 ? 'a' : 'b');
      await placeTeam(base44, match.next_match_id, winner, nextSlot);
    }

    if (match.loser_match_id) {
      const loserSlot = match.match_number % 2 === 1 ? 'a' : 'b';
      await placeTeam(base44, match.loser_match_id, loser, loserSlot);
    } else if (match.bracket !== 'grand_final' && tournament.bracket_type === 'double_elimination') {
      const loserParticipant = participants.find((participant) => participant.team_id === loser.team_id);
      if (loserParticipant) {
        await base44.asServiceRole.entities.TournamentParticipant.update(loserParticipant.id, {
          eliminated: true,
          eliminated_round: match.round,
        });
      }
    }

    if (!match.next_match_id && match.bracket !== 'loser') {
      await base44.asServiceRole.entities.Tournament.update(match.tournament_id, {
        status: 'completed',
        winner_id: winner.team_id,
        winner_name: winner.team_name,
        end_date: now,
      });

      const winnerParticipant = participants.find((participant) => participant.team_id === winner.team_id);
      if (winnerParticipant) {
        await base44.asServiceRole.entities.TournamentParticipant.update(winnerParticipant.id, {
          final_rank: 1,
        });
      }
    }

    return Response.json({
      success: true,
      winner_id: winner.team_id,
      winner_name: winner.team_name,
      advanced_to: match.next_match_id || '',
      loser_sent_to: match.loser_match_id || '',
    });
  } catch (error) {
    console.error('Complete tournament match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
