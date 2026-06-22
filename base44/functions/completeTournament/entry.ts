import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const canManageTournaments = (role) => ['ceo', 'super_admin', 'admin'].includes(role);

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

async function awardPrize(base44, user, amount, tournament, isWinner = false) {
  if (!user || amount <= 0) return;

  const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: user.id });
  const wallet = wallets[0] || await base44.asServiceRole.entities.Wallet.create({
    user_id: user.id,
    available_balance: 0,
    pending_balance: 0,
    escrow_balance: 0,
    withdrawable_balance: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    total_earnings: 0,
    total_wagered: 0,
  });

  const balanceBefore = toMoney(wallet.available_balance);
  const balanceAfter = toMoney(balanceBefore + amount);

  await base44.asServiceRole.entities.Wallet.update(wallet.id, {
    available_balance: balanceAfter,
    withdrawable_balance: toMoney((wallet.withdrawable_balance || 0) + amount),
    total_earnings: toMoney((wallet.total_earnings || 0) + amount),
  });

  await base44.asServiceRole.entities.WalletTransaction.create({
    user_id: user.id,
    wallet_id: wallet.id,
    type: 'tournament_prize',
    amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    description: `Tournament prize - ${tournament.name}`,
    status: 'completed',
    reference_id: tournament.id,
    reference_type: 'Tournament',
  });

  await base44.asServiceRole.entities.User.update(user.id, {
    wallet_balance: balanceAfter,
    lifetime_earnings: toMoney((user.lifetime_earnings || 0) + amount),
    tournament_wins: (user.tournament_wins || 0) + (isWinner ? 1 : 0),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!canManageTournaments(user.role)) {
      return Response.json({ error: 'Forbidden - admins only' }, { status: 403 });
    }

    const { tournament_id, winner_id, runner_up_id } = await req.json();
    const tournament = await base44.asServiceRole.entities.Tournament.get(tournament_id);
    if (!tournament) {
      return Response.json({ error: 'Tournament not found' }, { status: 404 });
    }

    if (tournament.status === 'completed') {
      return Response.json({ error: 'Tournament already completed' }, { status: 400 });
    }

    const winner = await base44.asServiceRole.entities.User.get(winner_id);
    const runnerUp = runner_up_id ? await base44.asServiceRole.entities.User.get(runner_up_id) : null;
    const firstPlacePercent = tournament.prize_distribution?.first || 70;
    const secondPlacePercent = tournament.prize_distribution?.second || 20;
    const thirdPlacePercent = tournament.prize_distribution?.third || 10;
    const firstPlacePrize = toMoney((tournament.prize_pool || 0) * firstPlacePercent / 100);
    const secondPlacePrize = toMoney((tournament.prize_pool || 0) * secondPlacePercent / 100);
    const thirdPlacePrize = toMoney((tournament.prize_pool || 0) * thirdPlacePercent / 100);

    await awardPrize(base44, winner, firstPlacePrize, tournament, true);
    await awardPrize(base44, runnerUp, secondPlacePrize, tournament);

    await base44.asServiceRole.entities.Tournament.update(tournament_id, {
      status: 'completed',
      winner_id,
      winner_name: winner?.full_name || winner?.display_name || 'Unknown',
      runner_up_id,
      runner_up_name: runnerUp?.full_name || runnerUp?.display_name || 'Unknown',
      end_date: new Date().toISOString(),
    });

    if (winner) {
      await base44.asServiceRole.entities.Notification.create({
        user_id: winner_id,
        type: 'tournament',
        title: 'Tournament Victory!',
        message: `You won ${tournament.name} and received $${firstPlacePrize.toFixed(2)}!`,
        is_read: false,
        created_date: new Date().toISOString(),
      });
    }

    return Response.json({
      success: true,
      first_place_prize: firstPlacePrize,
      second_place_prize: secondPlacePrize,
      third_place_prize: thirdPlacePrize,
    });
  } catch (error) {
    console.error('Complete tournament error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
