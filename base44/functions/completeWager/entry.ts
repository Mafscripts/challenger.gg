import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const toInt = (value, fallback = 0) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.trunc(amount) : fallback;
};

const playerName = (user) => user?.display_name || user?.full_name || user?.email || 'Unnamed player';

const hasActivePremium = (user) => (
  user?.is_premium === true && (!user.premium_expires || new Date(user.premium_expires) > new Date())
);
const canModerateMatch = (role) => ['ceo', 'super_admin', 'admin', 'moderator'].includes(role);

const xpRewardFor = (wager, won) => {
  if (!won) return 50;
  if (wager.match_type === 'xp') return 200;
  if (wager.match_type === 'ranked') return 175;
  if (wager.match_type === '8s') return 125;
  return 300;
};

async function getOrCreateWallet(base44, userId) {
  const existing = await base44.asServiceRole.entities.Wallet.filter({ user_id: userId });
  if (existing.length > 0) return existing[0];

  return base44.asServiceRole.entities.Wallet.create({
    user_id: userId,
    available_balance: 0,
    pending_balance: 0,
    escrow_balance: 0,
    withdrawable_balance: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    total_earnings: 0,
    total_wagered: 0,
  });
}

async function completeEscrowTransactions(base44, userId, wagerId) {
  const transactions = await base44.asServiceRole.entities.WalletTransaction.filter({
    user_id: userId,
    reference_id: wagerId,
    reference_type: 'Wager',
    type: 'wager_escrow',
  });

  await Promise.all(
    transactions
      .filter((tx) => tx.status === 'pending')
      .map((tx) => base44.asServiceRole.entities.WalletTransaction.update(tx.id, { status: 'completed' }))
  );
}

async function createTransactionOnce(base44, payload) {
  const existing = await base44.asServiceRole.entities.WalletTransaction.filter({
    user_id: payload.user_id,
    wallet_id: payload.wallet_id,
    type: payload.type,
    reference_id: payload.reference_id,
    reference_type: payload.reference_type,
  });

  if (existing.some((tx) => tx.status === payload.status)) return existing[0];
  return base44.asServiceRole.entities.WalletTransaction.create(payload);
}

async function awardXP(base44, user, wager, won) {
  const xpGain = xpRewardFor(wager, won);
  const existing = await base44.asServiceRole.entities.XPStats.filter({ user_id: user.id });
  const now = new Date().toISOString();
  let stats = existing[0];

  if (!stats) {
    stats = await base44.asServiceRole.entities.XPStats.create({
      user_id: user.id,
      username: playerName(user),
      level: user.xp_level || 1,
      current_xp: 0,
      total_xp: 0,
      xp_to_next_level: 1000,
      prestige: 0,
      weekly_xp: 0,
      win_streak: 0,
      region: user.region || 'na',
      season: 1,
      last_played_date: now,
    });
  }

  let level = toInt(stats.level, 1);
  let currentXP = toInt(stats.current_xp, 0) + xpGain;
  let xpToNext = toInt(stats.xp_to_next_level, 1000);

  while (currentXP >= xpToNext) {
    currentXP -= xpToNext;
    level += 1;
    xpToNext = Math.floor(1000 + (level - 1) * 250);
  }

  await base44.asServiceRole.entities.XPStats.update(stats.id, {
    username: playerName(user),
    level,
    current_xp: currentXP,
    total_xp: toInt(stats.total_xp, 0) + xpGain,
    xp_to_next_level: xpToNext,
    weekly_xp: toInt(stats.weekly_xp, 0) + xpGain,
    win_streak: won ? toInt(stats.win_streak, 0) + 1 : 0,
    last_played_date: now,
  });

  return { xpGain, level };
}

async function updateModeStats(base44, winner, loser, wager) {
  const now = new Date().toISOString();

  if (wager.match_type === 'ranked') {
    const winnerRows = await base44.asServiceRole.entities.RankedStats.filter({ user_id: winner.id });
    const loserRows = await base44.asServiceRole.entities.RankedStats.filter({ user_id: loser.id });
    const winnerStats = winnerRows[0] || await base44.asServiceRole.entities.RankedStats.create({
      user_id: winner.id,
      username: playerName(winner),
      elo: 1500,
      wins: 0,
      losses: 0,
      win_streak: 0,
      peak_elo: 1500,
      matches_played: 0,
      region: winner.region || 'na',
      season: 1,
    });
    const loserStats = loserRows[0] || await base44.asServiceRole.entities.RankedStats.create({
      user_id: loser.id,
      username: playerName(loser),
      elo: 1500,
      wins: 0,
      losses: 0,
      win_streak: 0,
      peak_elo: 1500,
      matches_played: 0,
      region: loser.region || 'na',
      season: 1,
    });
    const winnerElo = toInt(winnerStats.elo, 1500) + 25;
    const loserElo = Math.max(0, toInt(loserStats.elo, 1500) - 15);

    await base44.asServiceRole.entities.RankedStats.update(winnerStats.id, {
      username: playerName(winner),
      elo: winnerElo,
      wins: toInt(winnerStats.wins, 0) + 1,
      win_streak: toInt(winnerStats.win_streak, 0) + 1,
      peak_elo: Math.max(toInt(winnerStats.peak_elo, 1500), winnerElo),
      matches_played: toInt(winnerStats.matches_played, 0) + 1,
      last_played_date: now,
    });
    await base44.asServiceRole.entities.RankedStats.update(loserStats.id, {
      username: playerName(loser),
      elo: loserElo,
      losses: toInt(loserStats.losses, 0) + 1,
      win_streak: 0,
      matches_played: toInt(loserStats.matches_played, 0) + 1,
      last_played_date: now,
    });
  }

  if (wager.match_type === '8s') {
    const winnerRows = await base44.asServiceRole.entities.EightsStats.filter({ user_id: winner.id });
    const loserRows = await base44.asServiceRole.entities.EightsStats.filter({ user_id: loser.id });
    const winnerStats = winnerRows[0] || await base44.asServiceRole.entities.EightsStats.create({
      user_id: winner.id,
      username: playerName(winner),
      rating: 1000,
      wins: 0,
      losses: 0,
      win_rate: 0,
      matches_played: 0,
      region: winner.region || 'na',
      season: 1,
    });
    const loserStats = loserRows[0] || await base44.asServiceRole.entities.EightsStats.create({
      user_id: loser.id,
      username: playerName(loser),
      rating: 1000,
      wins: 0,
      losses: 0,
      win_rate: 0,
      matches_played: 0,
      region: loser.region || 'na',
      season: 1,
    });
    const winnerMatches = toInt(winnerStats.matches_played, 0) + 1;
    const loserMatches = toInt(loserStats.matches_played, 0) + 1;
    const winnerWins = toInt(winnerStats.wins, 0) + 1;

    await base44.asServiceRole.entities.EightsStats.update(winnerStats.id, {
      username: playerName(winner),
      rating: toInt(winnerStats.rating, 1000) + 20,
      wins: winnerWins,
      matches_played: winnerMatches,
      win_rate: Math.round((winnerWins / winnerMatches) * 100),
      last_played_date: now,
    });
    await base44.asServiceRole.entities.EightsStats.update(loserStats.id, {
      username: playerName(loser),
      rating: Math.max(0, toInt(loserStats.rating, 1000) - 10),
      losses: toInt(loserStats.losses, 0) + 1,
      matches_played: loserMatches,
      win_rate: loserMatches > 0 ? Math.round((toInt(loserStats.wins, 0) / loserMatches) * 100) : 0,
      last_played_date: now,
    });
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { wager_id, winner_id } = body;
    if (!wager_id || !winner_id) {
      return Response.json({ error: 'Missing required fields: wager_id, winner_id' }, { status: 400 });
    }

    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager) {
      return Response.json({ error: 'Wager not found' }, { status: 404 });
    }

    if (wager.match_type === 'ranked') {
      return Response.json({ error: 'Ranked matches must use completeRankedMatch' }, { status: 400 });
    }

    const isParticipant = user.id === wager.host_id || user.id === wager.challenger_id;
    const canModerate = canModerateMatch(user.role);
    if (!isParticipant && !canModerate) {
      return Response.json({ error: 'Unauthorized - only participants or moderators can complete matches' }, { status: 403 });
    }

    if (!canModerate && wager.status !== 'ready') {
      return Response.json({ error: 'Scores must be confirmed by both teams before completion' }, { status: 400 });
    }

    if (![wager.host_id, wager.challenger_id].includes(winner_id)) {
      return Response.json({ error: 'Winner must be a match participant' }, { status: 400 });
    }

    if (!canModerate && wager.winner_id && winner_id !== wager.winner_id) {
      return Response.json({ error: 'Winner does not match the confirmed scoreline' }, { status: 400 });
    }

    if (wager.status === 'completed') {
      return Response.json({
        success: true,
        already_completed: true,
        winner_payout: wager.winner_payout || 0,
        platform_fee: wager.platform_fee_amount || 0,
        platform_fee_percent: wager.platform_fee_percent || 0,
      });
    }

    const loserId = winner_id === wager.host_id ? wager.challenger_id : wager.host_id;
    const winner = await base44.asServiceRole.entities.User.get(winner_id);
    const loser = await base44.asServiceRole.entities.User.get(loserId);
    if (!winner || !loser) {
      return Response.json({ error: 'Unable to load match participants' }, { status: 404 });
    }

    const entryFee = toMoney(wager.entry_fee ?? wager.amount);
    const totalPool = toMoney(entryFee * 2);
    const platformFeePercent = toMoney(wager.platform_fee_percent || (hasActivePremium(winner) ? 5 : 10));
    const platformFee = toMoney(wager.platform_fee_amount ?? entryFee * (platformFeePercent / 100));
    const winnerPayout = toMoney(wager.winner_payout ?? totalPool - platformFee);
    const winnerWallet = await getOrCreateWallet(base44, winner_id);
    const loserWallet = await getOrCreateWallet(base44, loserId);
    const winnerBalanceBefore = toMoney(winnerWallet.available_balance);
    const loserBalanceBefore = toMoney(loserWallet.available_balance);
    const winnerPendingAfter = Math.max(0, toMoney((winnerWallet.pending_balance || 0) - entryFee));
    const loserPendingAfter = Math.max(0, toMoney((loserWallet.pending_balance || 0) - entryFee));
    const winnerNewAvailable = toMoney(winnerBalanceBefore + winnerPayout);

    if (entryFee > 0) {
      await base44.asServiceRole.entities.Wallet.update(winnerWallet.id, {
        available_balance: winnerNewAvailable,
        pending_balance: winnerPendingAfter,
        escrow_balance: winnerPendingAfter,
        withdrawable_balance: toMoney((winnerWallet.withdrawable_balance || 0) + winnerPayout),
        total_earnings: toMoney((winnerWallet.total_earnings || 0) + winnerPayout),
      });

      await base44.asServiceRole.entities.Wallet.update(loserWallet.id, {
        available_balance: loserBalanceBefore,
        pending_balance: loserPendingAfter,
        escrow_balance: loserPendingAfter,
      });

      await completeEscrowTransactions(base44, winner_id, wager.id);
      await completeEscrowTransactions(base44, loserId, wager.id);

      await createTransactionOnce(base44, {
        user_id: winner_id,
        wallet_id: winnerWallet.id,
        type: 'wager_payout',
        amount: winnerPayout,
        balance_before: winnerBalanceBefore,
        balance_after: winnerNewAvailable,
        description: `Wager Win - ${wager.game_mode_display || wager.game_mode} ${wager.team_size}`,
        status: 'completed',
        reference_id: wager_id,
        reference_type: 'Wager',
        metadata: {
          opponent_id: loserId,
          opponent_name: playerName(loser),
          platform_fee: platformFee,
          platform_fee_percent: platformFeePercent,
        },
      });

      await createTransactionOnce(base44, {
        user_id: loserId,
        wallet_id: loserWallet.id,
        type: 'wager_loss',
        amount: -entryFee,
        balance_before: loserBalanceBefore,
        balance_after: loserBalanceBefore,
        description: `Wager Loss - ${wager.game_mode_display || wager.game_mode} ${wager.team_size}`,
        status: 'completed',
        reference_id: wager_id,
        reference_type: 'Wager',
        metadata: {
          winner_id,
          winner_name: playerName(winner),
        },
      });
    }

    const winnerXp = await awardXP(base44, winner, wager, true);
    const loserXp = await awardXP(base44, loser, wager, false);
    await updateModeStats(base44, winner, loser, wager);

    await base44.asServiceRole.entities.User.update(winner_id, {
      wallet_balance: entryFee > 0 ? winnerNewAvailable : (winner.wallet_balance || 0),
      xp_level: winnerXp.level,
      wager_wins: toInt(winner.wager_wins, 0) + (wager.match_type === 'wagers' ? 1 : 0),
      current_win_streak: toInt(winner.current_win_streak, 0) + 1,
      total_wager_earnings: toMoney((winner.total_wager_earnings || 0) + (wager.match_type === 'wagers' ? winnerPayout : 0)),
      lifetime_earnings: toMoney((winner.lifetime_earnings || 0) + (entryFee > 0 ? winnerPayout : 0)),
      biggest_wager_win: Math.max(toMoney(winner.biggest_wager_win), wager.match_type === 'wagers' ? winnerPayout : 0),
    });

    await base44.asServiceRole.entities.User.update(loserId, {
      wallet_balance: entryFee > 0 ? loserBalanceBefore : (loser.wallet_balance || 0),
      xp_level: loserXp.level,
      wager_losses: toInt(loser.wager_losses, 0) + (wager.match_type === 'wagers' ? 1 : 0),
      current_win_streak: 0,
    });

    const alphaScore = toInt(body.team_alpha_score ?? wager.reported_score_alpha ?? wager.team_alpha_score_reported, 0);
    const bravoScore = toInt(body.team_bravo_score ?? wager.reported_score_bravo ?? wager.team_bravo_score_reported, 0);
    const winnerScore = winner_id === wager.host_id ? alphaScore : bravoScore;
    const loserScore = winner_id === wager.host_id ? bravoScore : alphaScore;
    const now = new Date().toISOString();

    await base44.asServiceRole.entities.WagerMatch.create({
      wager_id: wager.id,
      match_number: 1,
      map_id: wager.final_map_id || 'unknown',
      map_name: wager.final_map_name || 'Map pending',
      team_a_score: alphaScore,
      team_b_score: bravoScore,
      winner_team: winner_id === wager.host_id ? 'host' : 'challenger',
      proof_urls: body.proof_urls || [],
      reported_by: user.id,
      verified: true,
      created_date: now,
    });

    await base44.asServiceRole.entities.Wager.update(wager_id, {
      status: 'completed',
      winner_id,
      winner_name: playerName(winner),
      winner_score: winnerScore,
      loser_score: loserScore,
      winner_payout: winnerPayout,
      platform_fee_amount: platformFee,
      platform_fee_percent: platformFeePercent,
      match_completed_date: now,
      completed_date: now,
    });

    return Response.json({
      success: true,
      winner_payout: winnerPayout,
      platform_fee: platformFee,
      platform_fee_percent: platformFeePercent,
      xp_awarded: {
        winner: winnerXp.xpGain,
        loser: loserXp.xpGain,
      },
    });
  } catch (error) {
    console.error('Complete wager error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
