import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const playerName = (user) => user.display_name || user.full_name || user.email || 'Unnamed player';

const hasActivePremium = (user) => (
  user.is_premium === true && (!user.premium_expires || new Date(user.premium_expires) > new Date())
);

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      game_mode,
      game_mode_display,
      team_size,
      max_players,
      best_of,
      host_banned_map,
      host_banned_map_name,
      final_map,
      final_map_name,
      match_type,
    } = body;

    const entryFee = toMoney(body.entry_fee ?? body.amount);
    if (!game_mode || !team_size) {
      return Response.json({ error: 'Missing required fields: game_mode, team_size' }, { status: 400 });
    }

    if (entryFee < 0) {
      return Response.json({ error: 'Invalid wager amount' }, { status: 400 });
    }

    if (match_type === 'ranked') {
      return Response.json({ error: 'Ranked matches must use createRankedMatch' }, { status: 400 });
    }

    const normalizedMatchType = ['8s', 'xp', 'wagers'].includes(match_type) ? match_type : (entryFee > 0 ? 'wagers' : 'xp');
    const platformFeePercent = hasActivePremium(user) ? 5 : 10;
    const totalPrizePool = entryFee * 2;
    const platformFeeAmount = toMoney(totalPrizePool * (platformFeePercent / 100));
    const winnerPayout = toMoney(totalPrizePool - platformFeeAmount);
    const now = new Date().toISOString();
    const matchStartDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const wallet = await getOrCreateWallet(base44, user.id);
    const currentBalance = toMoney(wallet.available_balance);

    if (entryFee > 0 && currentBalance < entryFee) {
      return Response.json({
        error: 'Insufficient wallet balance',
        balance_needed: entryFee,
        balance_available: currentBalance,
      }, { status: 400 });
    }

    const wager = await base44.asServiceRole.entities.Wager.create({
      host_id: user.id,
      host_name: playerName(user),
      challenger_id: '',
      challenger_name: '',
      match_type: normalizedMatchType,
      game_mode,
      game_mode_display: game_mode_display || game_mode,
      team_size,
      best_of: Number(best_of || 1),
      entry_fee: entryFee,
      total_prize_pool: totalPrizePool,
      platform_fee_percent: platformFeePercent,
      platform_fee_amount: platformFeeAmount,
      winner_payout: winnerPayout,
      status: 'open',
      map_pool_id: '',
      host_banned_map_id: host_banned_map || '',
      host_banned_map_name: host_banned_map_name || '',
      challenger_banned_map_id: '',
      challenger_banned_map_name: '',
      final_map_id: final_map || '',
      final_map_name: final_map_name || '',
      winner_id: '',
      winner_name: '',
      winner_score: 0,
      loser_score: 0,
      match_start_deadline: matchStartDeadline,
      created_date: now,
    });

    let escrowTransactionId = '';
    let remainingBalance = currentBalance;

    if (entryFee > 0) {
      remainingBalance = toMoney(currentBalance - entryFee);
      const newPending = toMoney((wallet.pending_balance || 0) + entryFee);

      await base44.asServiceRole.entities.Wallet.update(wallet.id, {
        available_balance: remainingBalance,
        pending_balance: newPending,
        escrow_balance: newPending,
        total_wagered: toMoney((wallet.total_wagered || 0) + entryFee),
      });

      const transaction = await base44.asServiceRole.entities.WalletTransaction.create({
        user_id: user.id,
        wallet_id: wallet.id,
        type: 'wager_escrow',
        amount: -entryFee,
        balance_before: currentBalance,
        balance_after: remainingBalance,
        description: `Escrow for ${team_size} ${game_mode_display || game_mode} wager`,
        reference_id: wager.id,
        reference_type: 'Wager',
        status: 'pending',
        metadata: {
          team: 'host',
          match_type: normalizedMatchType,
          max_players: max_players || null,
        },
      });
      escrowTransactionId = transaction.id;

      await base44.asServiceRole.entities.User.update(user.id, {
        wallet_balance: remainingBalance,
      });
    }

    await base44.asServiceRole.entities.WagerParticipant.create({
      wager_id: wager.id,
      user_id: user.id,
      user_name: playerName(user),
      team: 'host',
      is_captain: true,
      entry_fee_paid: entryFee === 0 || Boolean(escrowTransactionId),
      escrow_transaction_id: escrowTransactionId,
      joined_date: now,
    });

    return Response.json({
      success: true,
      wager_id: wager.id,
      remaining_balance: remainingBalance,
      wager,
    });
  } catch (error) {
    console.error('Create wager error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
