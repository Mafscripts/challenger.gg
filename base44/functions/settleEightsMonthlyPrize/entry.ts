import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const playerName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || 'Player';
const EIGHTS_MONTHLY_PRIZE_START_MONTH = '2026-10';

const previousMonthKey = () => {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const month = previousMonthKey();
    if (month < EIGHTS_MONTHLY_PRIZE_START_MONTH) {
      return Response.json({ success: true, settled: false, month, reason: `Prize starts with ${EIGHTS_MONTHLY_PRIZE_START_MONTH}` });
    }
    const referenceId = `8s-monthly-${month}`;
    const existing = await base44.asServiceRole.entities.WalletTransaction.filter({ reference_id: referenceId });
    const paid = existing.find((transaction) => transaction.type === 'eights_monthly_prize' && transaction.status === 'completed');
    if (paid) return Response.json({ success: true, already_settled: true, month, winner_id: paid.user_id, amount: paid.amount });

    const rows = await base44.asServiceRole.entities.EightsStats.list('-created_date', 500);
    const candidates = rows.map((stats) => {
      const snapshot = stats.monthly_key === month
        ? { month, wins: Number(stats.monthly_wins || 0), matches: Number(stats.monthly_matches || 0), xp: Number(stats.monthly_xp || 0), rating: Number(stats.rating || 1000) }
        : (Array.isArray(stats.monthly_history) ? stats.monthly_history.find((entry) => entry?.month === month) : null);
      return snapshot ? { stats, snapshot } : null;
    }).filter((entry) => entry?.snapshot?.matches > 0).sort((a, b) => (
      b.snapshot.wins - a.snapshot.wins || b.snapshot.xp - a.snapshot.xp || b.snapshot.rating - a.snapshot.rating
    ));
    if (candidates.length === 0) return Response.json({ success: true, settled: false, month, reason: 'No eligible players' });

    const winnerStats = candidates[0].stats;
    const winner = await base44.asServiceRole.entities.User.get(winnerStats.user_id);
    if (!winner) return Response.json({ error: 'Monthly winner account not found' }, { status: 404 });
    const walletRows = await base44.asServiceRole.entities.Wallet.filter({ user_id: winner.id });
    const wallet = walletRows[0] || await base44.asServiceRole.entities.Wallet.create({ user_id: winner.id, available_balance: 0, pending_balance: 0, escrow_balance: 0, withdrawable_balance: 0, total_deposits: 0, total_withdrawals: 0, total_earnings: 0, total_wagered: 0 });
    const before = money(wallet.available_balance);
    const amount = 100;
    const after = money(before + amount);
    await base44.asServiceRole.entities.Wallet.update(wallet.id, {
      available_balance: after,
      withdrawable_balance: money((wallet.withdrawable_balance || 0) + amount),
      total_earnings: money((wallet.total_earnings || 0) + amount),
    });
    await base44.asServiceRole.entities.User.update(winner.id, { wallet_balance: after });
    await base44.asServiceRole.entities.WalletTransaction.create({
      user_id: winner.id,
      wallet_id: wallet.id,
      type: 'eights_monthly_prize',
      amount,
      balance_before: before,
      balance_after: after,
      description: `Ranked 8s monthly champion prize · ${month}`,
      reference_id: referenceId,
      reference_type: 'EightsMonthlyPrize',
      status: 'completed',
      metadata: { month, wins: candidates[0].snapshot.wins, matches: candidates[0].snapshot.matches, xp: candidates[0].snapshot.xp },
    });
    await base44.asServiceRole.entities.Notification.create({
      user_id: winner.id,
      type: 'reward',
      title: 'You won the Ranked 8s monthly race',
      message: `$100 has been added to your wallet for finishing #1 in ${month}.`,
      is_read: false,
      action_url: '/wallet',
      related_entity_id: referenceId,
      related_entity_type: 'EightsMonthlyPrize',
      created_date: new Date().toISOString(),
    });
    return Response.json({ success: true, settled: true, month, winner_id: winner.id, winner_name: playerName(winner), amount });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
