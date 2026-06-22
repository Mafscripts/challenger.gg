import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toInt = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.trunc(amount) : null;
};

const playerName = (user) => user.display_name || user.full_name || user.email || 'Unnamed player';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      wager_id,
      team,
      proof_urls = [],
    } = body;

    const alphaScore = toInt(body.team_alpha_score);
    const bravoScore = toInt(body.team_bravo_score);

    if (!wager_id || !team || alphaScore === null || bravoScore === null) {
      return Response.json({
        error: 'Missing required fields: wager_id, team, team_alpha_score, team_bravo_score',
      }, { status: 400 });
    }

    if (alphaScore < 0 || bravoScore < 0) {
      return Response.json({ error: 'Scores cannot be negative' }, { status: 400 });
    }

    if (alphaScore === bravoScore) {
      return Response.json({ error: 'Scores cannot be tied' }, { status: 400 });
    }

    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager) {
      return Response.json({ error: 'Wager not found' }, { status: 404 });
    }

    if (wager.match_type === 'ranked') {
      return Response.json({ error: 'Ranked scores must use completeRankedMatch' }, { status: 400 });
    }

    if (['completed', 'cancelled'].includes(wager.status)) {
      return Response.json({ error: 'Match is already closed' }, { status: 400 });
    }

    const isHost = user.id === wager.host_id;
    const isChallenger = user.id === wager.challenger_id;
    if (!isHost && !isChallenger) {
      return Response.json({ error: 'Unauthorized - only participants can submit scores' }, { status: 403 });
    }

    if ((team === 'host' && !isHost) || (team === 'challenger' && !isChallenger)) {
      return Response.json({ error: 'Submitted team does not match current user' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const existingReporter = wager.reported_score_by;
    const existingAlpha = toInt(wager.reported_score_alpha);
    const existingBravo = toInt(wager.reported_score_bravo);
    const winnerId = alphaScore > bravoScore ? wager.host_id : wager.challenger_id;
    const winnerName = alphaScore > bravoScore ? wager.host_name : wager.challenger_name;
    const winnerScore = Math.max(alphaScore, bravoScore);
    const loserScore = Math.min(alphaScore, bravoScore);

    if (!existingReporter || existingReporter === user.id) {
      const waitingStatus = team === 'host' ? 'awaiting_team_bravo_report' : 'awaiting_team_alpha_report';
      await base44.asServiceRole.entities.Wager.update(wager_id, {
        status: waitingStatus,
        reported_score_alpha: alphaScore,
        reported_score_bravo: bravoScore,
        reported_score_by: user.id,
        reported_score_team: team,
        reported_score_date: now,
        team_alpha_score_reported: alphaScore,
        team_bravo_score_reported: bravoScore,
        [`${team === 'host' ? 'team_alpha' : 'team_bravo'}_reported_by`]: user.id,
        [`${team === 'host' ? 'team_alpha' : 'team_bravo'}_reported_date`]: now,
      });

      return Response.json({
        success: true,
        status: waitingStatus,
        team_alpha_score: alphaScore,
        team_bravo_score: bravoScore,
        message: 'Score submitted - waiting for opponent confirmation',
      });
    }

    const scoresMatch = existingAlpha === alphaScore && existingBravo === bravoScore;
    if (scoresMatch) {
      await base44.asServiceRole.entities.Wager.update(wager_id, {
        status: 'ready',
        winner_id: winnerId,
        winner_name: winnerName,
        winner_score: winnerScore,
        loser_score: loserScore,
        team_alpha_score_reported: alphaScore,
        team_bravo_score_reported: bravoScore,
        [`${team === 'host' ? 'team_alpha' : 'team_bravo'}_reported_by`]: user.id,
        [`${team === 'host' ? 'team_alpha' : 'team_bravo'}_reported_date`]: now,
      });

      return Response.json({
        success: true,
        status: 'ready',
        ready_to_complete: true,
        winner_id: winnerId,
        winner_name: winnerName,
        winner_score: winnerScore,
        loser_score: loserScore,
        team_alpha_score: alphaScore,
        team_bravo_score: bravoScore,
        message: 'Scores confirmed by both teams',
      });
    }

    await base44.asServiceRole.entities.Wager.update(wager_id, {
      status: 'score_conflict',
      team_alpha_score_reported: alphaScore,
      team_bravo_score_reported: bravoScore,
      [`${team === 'host' ? 'team_alpha' : 'team_bravo'}_reported_by`]: user.id,
      [`${team === 'host' ? 'team_alpha' : 'team_bravo'}_reported_date`]: now,
    });

    const existingDisputes = await base44.asServiceRole.entities.Dispute.filter({
      wager_id,
      status: 'pending',
    });

    const dispute = existingDisputes[0] || await base44.asServiceRole.entities.Dispute.create({
      wager_id,
      reported_by: user.id,
      reported_by_name: playerName(user),
      reported_against: team === 'host' ? wager.challenger_id : wager.host_id,
      reported_against_name: team === 'host' ? wager.challenger_name : wager.host_name,
      reason: 'score_dispute',
      description: `Score mismatch. First report: ${existingAlpha}-${existingBravo}. Latest report: ${alphaScore}-${bravoScore}.`,
      evidence_urls: proof_urls,
      status: 'pending',
      priority: 'high',
      created_date: now,
    });

    return Response.json({
      success: true,
      status: 'score_conflict',
      team_alpha_score: alphaScore,
      team_bravo_score: bravoScore,
      dispute_id: dispute.id,
      message: 'Score conflict detected - dispute opened automatically',
    });
  } catch (error) {
    console.error('Submit score error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
