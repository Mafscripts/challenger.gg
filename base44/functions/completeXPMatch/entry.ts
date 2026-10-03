import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const n = (value) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
const playerName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || 'Player';
const canModerate = (role) => ['ceo', 'super_admin', 'admin', 'moderator'].includes(role);

async function getOrCreateXP(base44, user) {
  const rows = await base44.asServiceRole.entities.XPStats.filter({ user_id: user.id });
  if (rows.length) return rows[0];
  return base44.asServiceRole.entities.XPStats.create({
    user_id: user.id,
    username: playerName(user),
    level: 1,
    current_xp: 0,
    total_xp: 0,
    xp_to_next_level: 1000,
    weekly_xp: 0,
    wins: 0,
    losses: 0,
    matches_played: 0,
    win_streak: 0,
    region: user.region || 'na',
    season: 1,
  });
}

function nextXPState(stats, gain, won) {
  const total = Math.max(0, n(stats.total_xp) + gain);
  const level = Math.floor(total / 1000) + 1;
  const current = total % 1000;
  return {
    username: stats.username,
    total_xp: total,
    current_xp: current,
    level,
    xp_to_next_level: 1000,
    weekly_xp: n(stats.weekly_xp) + gain,
    wins: n(stats.wins) + (won ? 1 : 0),
    losses: n(stats.losses) + (won ? 0 : 1),
    matches_played: n(stats.matches_played) + 1,
    win_streak: won ? n(stats.win_streak) + 1 : 0,
    last_played_date: new Date().toISOString(),
  };
}

async function finalize(base44, match, actor, winnerId, alphaScore, bravoScore, proofUrls, forced) {
  const loserId = winnerId === match.host_id ? match.challenger_id : match.host_id;
  const [winner, loser] = await Promise.all([
    base44.asServiceRole.entities.User.get(winnerId),
    base44.asServiceRole.entities.User.get(loserId),
  ]);
  if (!winner || !loser) return Response.json({ error: 'Unable to load XP match players' }, { status: 404 });

  const [winnerStats, loserStats] = await Promise.all([getOrCreateXP(base44, winner), getOrCreateXP(base44, loser)]);
  winnerStats.username = playerName(winner);
  loserStats.username = playerName(loser);

  const winnerGain = 100;
  const loserGain = 25;
  const winnerNext = nextXPState(winnerStats, winnerGain, true);
  const loserNext = nextXPState(loserStats, loserGain, false);

  await Promise.all([
    base44.asServiceRole.entities.XPStats.update(winnerStats.id, winnerNext),
    base44.asServiceRole.entities.XPStats.update(loserStats.id, loserNext),
  ]);

  const now = new Date().toISOString();
  const winnerScore = winnerId === match.host_id ? alphaScore : bravoScore;
  const loserScore = winnerId === match.host_id ? bravoScore : alphaScore;
  const xpChanges = {
    [winner.id]: { won: true, delta: winnerGain, previous_xp: n(winnerStats.total_xp), new_xp: winnerNext.total_xp },
    [loser.id]: { won: false, delta: loserGain, previous_xp: n(loserStats.total_xp), new_xp: loserNext.total_xp },
  };

  await base44.asServiceRole.entities.XPMatch.update(match.id, {
    status: 'completed',
    match_type: 'xp',
    winner_id: winnerId,
    winner_name: playerName(winner),
    winner_score: winnerScore,
    loser_score: loserScore,
    confirmed_score_alpha: alphaScore,
    confirmed_score_bravo: bravoScore,
    reported_score_alpha: alphaScore,
    reported_score_bravo: bravoScore,
    proof_urls: proofUrls || [],
    xp_changes: xpChanges,
    match_completed_date: now,
  });

  if (forced) {
    await base44.asServiceRole.entities.AdminAction.create({
      admin_id: actor.id,
      admin_name: actor.full_name || actor.email,
      admin_role: actor.role,
      action_type: 'moderation',
      target_user_id: winnerId,
      target_username: playerName(winner),
      description: `Forced winner for XP match ${match.id}`,
      details: { ranked_match_id: match.id, winner_id: winnerId, match_type: 'xp' },
      created_date: now,
    });
  }

  return Response.json({ success: true, winner_id: winnerId, winner_xp: winnerNext.total_xp, loser_xp: loserNext.total_xp, xp_changes: xpChanges });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const id = body.xp_match_id || body.match_id || body.ranked_match_id;
    const alphaScore = n(body.team_alpha_score);
    const bravoScore = n(body.team_bravo_score);
    if (!id || alphaScore === bravoScore || alphaScore < 0 || bravoScore < 0) {
      return Response.json({ error: 'Invalid XP match score' }, { status: 400 });
    }

    const match = await base44.asServiceRole.entities.XPMatch.get(id);
    if (!match) return Response.json({ error: 'XP match not found' }, { status: 404 });
    if (match.status === 'completed') return Response.json({ success: true, already_completed: true });
    if (match.status === 'cancelled') return Response.json({ error: 'XP match is cancelled' }, { status: 400 });

    const bestOf = Math.max(1, n(match.best_of) || 1);
    const winsNeeded = Math.floor(bestOf / 2) + 1;
    const valid = alphaScore <= winsNeeded && bravoScore <= winsNeeded &&
      ((alphaScore === winsNeeded && bravoScore < winsNeeded) || (bravoScore === winsNeeded && alphaScore < winsNeeded));
    if (!valid) return Response.json({ error: `Invalid BO${bestOf} score` }, { status: 400 });

    const isHost = user.id === match.host_id;
    const isChallenger = user.id === match.challenger_id;
    const moderator = canModerate(user.role);
    if (!isHost && !isChallenger && !moderator) return Response.json({ error: 'Only participants or staff can submit scores' }, { status: 403 });

    const winnerId = alphaScore > bravoScore ? match.host_id : match.challenger_id;
    if (body.winner_id && moderator) return finalize(base44, match, user, body.winner_id, alphaScore, bravoScore, body.proof_urls || [], true);

    if (!match.reported_score_by || match.reported_score_by === user.id) {
      await base44.asServiceRole.entities.XPMatch.update(id, {
        status: isHost ? 'awaiting_challenger_report' : 'awaiting_host_report',
        reported_score_alpha: alphaScore,
        reported_score_bravo: bravoScore,
        reported_score_by: user.id,
        proof_urls: body.proof_urls || [],
      });
      return Response.json({ success: true, status: isHost ? 'awaiting_challenger_report' : 'awaiting_host_report' });
    }

    if (n(match.reported_score_alpha) !== alphaScore || n(match.reported_score_bravo) !== bravoScore) {
      await base44.asServiceRole.entities.XPMatch.update(id, { status: 'score_conflict' });
      return Response.json({ success: true, status: 'score_conflict' });
    }

    return finalize(base44, match, user, winnerId, alphaScore, bravoScore, body.proof_urls || [], false);
  } catch (error) {
    console.error('Complete XP match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
