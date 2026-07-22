import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toInt = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.trunc(amount) : null;
};

const playerName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || 'Unnamed player';
const canModerate = (role) => ['ceo', 'super_admin', 'admin', 'moderator'].includes(role);

const rewards = [
  { key: 'bronze_iii_badge', name: 'Bronze Badge', required_elo: 0, category: 'badge', rarity: 'common' },
  { key: 'silver_iii_frame', name: 'Silver Frame', required_elo: 600, category: 'frame', rarity: 'common' },
  { key: 'gold_iii_card', name: 'Gold Calling Card', required_elo: 1200, category: 'calling_card', rarity: 'rare' },
  { key: 'platinum_iii_trophy', name: 'Platinum Trophy', required_elo: 1800, category: 'trophy', rarity: 'epic' },
  { key: 'diamond_iii_badge', name: 'Diamond Badge', required_elo: 2400, category: 'badge', rarity: 'epic' },
  { key: 'master_iii_frame', name: 'Master Frame', required_elo: 3000, category: 'frame', rarity: 'legendary' },
  { key: 'pro_iii_trophy', name: 'Pro Trophy', required_elo: 3600, category: 'trophy', rarity: 'mythic' },
  { key: 'champion_bundle', name: 'Champion Bundle', required_elo: 4200, category: 'ranked_reward', rarity: 'exclusive' },
];

function calculatedRankName(elo) {
  const value = Math.max(0, Number(elo) || 0);
  const bands = [
    ['Bronze', 0, 599],
    ['Silver', 600, 1199],
    ['Gold', 1200, 1799],
    ['Platinum', 1800, 2399],
    ['Diamond', 2400, 2999],
    ['Master', 3000, 3599],
    ['Pro', 3600, 4199],
  ];
  return bands.find(([, min, max]) => value >= min && value <= max)?.[0] || 'Champion';
}

async function getOrCreateStats(base44, user) {
  const rows = await base44.asServiceRole.entities.RankedStats.filter({ user_id: user.id });
  if (rows.length > 0) return rows[0];

  return base44.asServiceRole.entities.RankedStats.create({
    user_id: user.id,
    username: playerName(user),
    elo: 0,
    wins: 0,
    losses: 0,
    win_streak: 0,
    peak_elo: 0,
    matches_played: 0,
    region: user.region || 'na',
    season: 1,
  });
}

async function unlockRankRewards(base44, user, elo) {
  const unlocked = [];
  const now = new Date().toISOString();

  for (const reward of rewards.filter((item) => elo >= item.required_elo)) {
    const existing = await base44.asServiceRole.entities.RankedReward.filter({
      user_id: user.id,
      reward_key: reward.key,
    });
    if (existing.length > 0) continue;

    const inventory = await base44.asServiceRole.entities.UserInventory.create({
      user_id: user.id,
      item_id: `rank_reward:${reward.key}`,
      item_name: reward.name,
      item_image: '',
      item_rarity: reward.rarity,
      item_category: reward.category,
      purchase_method: 'rank_reward',
      price_paid: 0,
      is_equipped: false,
      is_tradable: false,
      is_rank_reward: true,
      showcase_enabled: true,
      unlock_key: reward.key,
      acquired_date: now,
    });

    await base44.asServiceRole.entities.RankedReward.create({
      user_id: user.id,
      reward_key: reward.key,
      reward_name: reward.name,
      required_elo: reward.required_elo,
      inventory_id: inventory.id,
      unlocked_elo: elo,
      unlocked_date: now,
    });

    unlocked.push({ ...reward, inventory_id: inventory.id });
  }

  return unlocked;
}

async function finalizeMatch(base44, match, user, winnerId, alphaScore, bravoScore, proofUrls, forced) {
  const loserId = winnerId === match.host_id ? match.challenger_id : match.host_id;
  const [winner, loser] = await Promise.all([
    base44.asServiceRole.entities.User.get(winnerId),
    base44.asServiceRole.entities.User.get(loserId),
  ]);

  if (!winner || !loser) {
    return Response.json({ error: 'Unable to load ranked match participants' }, { status: 404 });
  }

  const [winnerStats, loserStats] = await Promise.all([
    getOrCreateStats(base44, winner),
    getOrCreateStats(base44, loser),
  ]);

  const winnerElo = Math.max(0, toInt(winnerStats.elo) + 25);
  const loserElo = Math.max(0, toInt(loserStats.elo) - 25);
  const now = new Date().toISOString();

  await base44.asServiceRole.entities.RankedStats.update(winnerStats.id, {
    username: playerName(winner),
    elo: winnerElo,
    wins: toInt(winnerStats.wins) + 1,
    win_streak: toInt(winnerStats.win_streak) + 1,
    peak_elo: Math.max(toInt(winnerStats.peak_elo), winnerElo),
    matches_played: toInt(winnerStats.matches_played) + 1,
    last_played_date: now,
  });

  await base44.asServiceRole.entities.RankedStats.update(loserStats.id, {
    username: playerName(loser),
    elo: loserElo,
    losses: toInt(loserStats.losses) + 1,
    win_streak: 0,
    peak_elo: Math.max(toInt(loserStats.peak_elo), loserElo),
    matches_played: toInt(loserStats.matches_played) + 1,
    last_played_date: now,
  });

  const winnerScore = winnerId === match.host_id ? alphaScore : bravoScore;
  const loserScore = winnerId === match.host_id ? bravoScore : alphaScore;
  const unlocked_rewards = await unlockRankRewards(base44, winner, winnerElo);

  const profileRows = await base44.asServiceRole.entities.PlayerProfile.filter({ user_id: winner.id });
  if (profileRows.length > 0) {
    await base44.asServiceRole.entities.PlayerProfile.update(profileRows[0].id, {
      elo: winnerElo,
      peak_elo: Math.max(toInt(profileRows[0].peak_elo), winnerElo),
      total_matches: toInt(profileRows[0].total_matches) + 1,
      total_wins: toInt(profileRows[0].total_wins) + 1,
      highest_rank: calculatedRankName(Math.max(toInt(profileRows[0].peak_elo), winnerElo)),
      last_active_date: now,
    });
  }

  const loserProfileRows = await base44.asServiceRole.entities.PlayerProfile.filter({ user_id: loser.id });
  if (loserProfileRows.length > 0) {
    await base44.asServiceRole.entities.PlayerProfile.update(loserProfileRows[0].id, {
      elo: loserElo,
      total_matches: toInt(loserProfileRows[0].total_matches) + 1,
      total_losses: toInt(loserProfileRows[0].total_losses) + 1,
      last_active_date: now,
    });
  }

  await base44.asServiceRole.entities.RankedMatch.update(match.id, {
    status: 'completed',
    winner_id: winnerId,
    winner_name: playerName(winner),
    winner_score: winnerScore,
    loser_score: loserScore,
    reported_score_alpha: alphaScore,
    reported_score_bravo: bravoScore,
    proof_urls: proofUrls || [],
    match_completed_date: now,
  });

  if (forced) {
    await base44.asServiceRole.entities.AdminAction.create({
      admin_id: user.id,
      admin_name: user.full_name || user.email,
      admin_role: user.role,
      action_type: 'moderation',
      target_user_id: winnerId,
      target_username: playerName(winner),
      description: `Forced winner for ranked match ${match.id}`,
      details: { ranked_match_id: match.id, winner_id: winnerId },
      created_date: now,
    });
  }

  return Response.json({
    success: true,
    winner_id: winnerId,
    winner_name: playerName(winner),
    winner_elo: winnerElo,
    loser_elo: loserElo,
    unlocked_rewards,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const id = body.ranked_match_id || body.match_id;
    const alphaScore = toInt(body.team_alpha_score);
    const bravoScore = toInt(body.team_bravo_score);
    const proofUrls = body.proof_urls || [];

    if (!id || alphaScore === null || bravoScore === null) {
      return Response.json({ error: 'Missing ranked_match_id, team_alpha_score, or team_bravo_score' }, { status: 400 });
    }

    if (alphaScore < 0 || bravoScore < 0 || alphaScore === bravoScore) {
      return Response.json({ error: 'Scores must be non-negative and cannot be tied' }, { status: 400 });
    }

    const match = await base44.asServiceRole.entities.RankedMatch.get(id);
    if (!match) return Response.json({ error: 'Ranked match not found' }, { status: 404 });
    if (match.status === 'completed') return Response.json({ success: true, already_completed: true });
    if (match.status === 'cancelled') return Response.json({ error: 'Ranked match is cancelled' }, { status: 400 });

    const bestOf = Math.max(1, Math.trunc(Number(match.best_of) || 1));
    const winsNeeded = Math.floor(bestOf / 2) + 1;
    const validFinalScore = alphaScore <= winsNeeded
      && bravoScore <= winsNeeded
      && ((alphaScore === winsNeeded && bravoScore < winsNeeded) || (bravoScore === winsNeeded && alphaScore < winsNeeded));
    if (!validFinalScore) {
      return Response.json({ error: `Invalid BO${bestOf} score. One team must reach ${winsNeeded} map ${winsNeeded === 1 ? 'win' : 'wins'}.` }, { status: 400 });
    }

    const slotsPerTeam = Math.max(1, Number.parseInt(String(match.team_size || '1v1').split('v')[0], 10) || 1);
    const alphaRoster = Array.isArray(match.team_alpha_player_ids) ? match.team_alpha_player_ids : [match.host_id].filter(Boolean);
    const bravoRoster = Array.isArray(match.team_bravo_player_ids) ? match.team_bravo_player_ids : [match.challenger_id].filter(Boolean);
    if (alphaRoster.length < slotsPerTeam || bravoRoster.length < slotsPerTeam) {
      return Response.json({ error: 'All ranked roster slots must be filled before scores can be submitted' }, { status: 400 });
    }

    const isHost = user.id === match.host_id;
    const isChallenger = user.id === match.challenger_id;
    const moderator = canModerate(user.role);

    if (!isHost && !isChallenger && !moderator) {
      return Response.json({ error: 'Only participants or moderators can report this match' }, { status: 403 });
    }

    const computedWinnerId = alphaScore > bravoScore ? match.host_id : match.challenger_id;
    const forcedWinnerId = body.winner_id;
    if (forcedWinnerId && !moderator) {
      return Response.json({ error: 'Only staff can force a ranked winner' }, { status: 403 });
    }

    if (forcedWinnerId) {
      if (![match.host_id, match.challenger_id].includes(forcedWinnerId)) {
        return Response.json({ error: 'Winner must be a ranked match participant' }, { status: 400 });
      }
      return finalizeMatch(base44, match, user, forcedWinnerId, alphaScore, bravoScore, proofUrls, true);
    }

    const now = new Date().toISOString();
    if (!match.reported_score_by || match.reported_score_by === user.id) {
      await base44.asServiceRole.entities.RankedMatch.update(id, {
        status: isHost ? 'awaiting_challenger_report' : 'awaiting_host_report',
        reported_score_alpha: alphaScore,
        reported_score_bravo: bravoScore,
        reported_score_by: user.id,
        proof_urls: proofUrls,
      });

      return Response.json({
        success: true,
        status: isHost ? 'awaiting_challenger_report' : 'awaiting_host_report',
        message: 'Score submitted - waiting for opponent confirmation',
      });
    }

    const scoresMatch = toInt(match.reported_score_alpha) === alphaScore && toInt(match.reported_score_bravo) === bravoScore;
    if (!scoresMatch) {
      await base44.asServiceRole.entities.RankedMatch.update(id, {
        status: 'score_conflict',
        proof_urls: proofUrls,
      });

      const ticket = await base44.asServiceRole.entities.Ticket.create({
        user_id: user.id,
        username: playerName(user),
        subject: `Ranked score conflict ${id}`,
        description: `Score mismatch. First report: ${match.reported_score_alpha}-${match.reported_score_bravo}. Latest report: ${alphaScore}-${bravoScore}.`,
        category: 'ranked',
        priority: 'high',
        status: 'open',
        messages: [],
      });

      await base44.asServiceRole.entities.AdminAlert.create({
        ticket_id: ticket.id,
        match_type: 'ranked',
        match_id: id,
        requested_by: user.id,
        requested_by_name: playerName(user),
        priority: 'high',
        status: 'open',
        created_date: now,
      });

      return Response.json({ success: true, status: 'score_conflict', ticket_id: ticket.id });
    }

    return finalizeMatch(base44, match, user, computedWinnerId, alphaScore, bravoScore, proofUrls, false);
  } catch (error) {
    console.error('Complete ranked match error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
