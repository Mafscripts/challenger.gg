import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

async function refundParticipant(base44, wager, participant, entryFee) {
  const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: participant.user_id });
  if (wallets.length === 0 || entryFee <= 0) return;

  const wallet = wallets[0];
  const balanceBefore = toMoney(wallet.available_balance);
  const balanceAfter = toMoney(balanceBefore + entryFee);
  const pendingAfter = Math.max(0, toMoney((wallet.pending_balance || 0) - entryFee));

  await base44.asServiceRole.entities.Wallet.update(wallet.id, {
    available_balance: balanceAfter,
    pending_balance: pendingAfter,
    escrow_balance: pendingAfter,
    withdrawable_balance: toMoney((wallet.withdrawable_balance || 0) + entryFee),
  });

  await base44.asServiceRole.entities.WalletTransaction.create({
    user_id: participant.user_id,
    wallet_id: wallet.id,
    type: 'wager_refund',
    amount: entryFee,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    description: `Refund for ${wager.game_mode_display || wager.game_mode} ${wager.team_size} wager`,
    reference_id: wager.id,
    reference_type: 'Wager',
    status: 'completed',
    metadata: { participant_team: participant.team },
  });

  const escrowTransactions = await base44.asServiceRole.entities.WalletTransaction.filter({
    user_id: participant.user_id,
    reference_id: wager.id,
    reference_type: 'Wager',
    type: 'wager_escrow',
    status: 'pending',
  });
  await Promise.all(escrowTransactions.map((tx) => (
    base44.asServiceRole.entities.WalletTransaction.update(tx.id, { status: 'cancelled' })
  )));

  await base44.asServiceRole.entities.User.update(participant.user_id, {
    wallet_balance: balanceAfter,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { wager_id, reason = 'refund' } = await req.json();
    if (!wager_id) {
      return Response.json({ error: 'Missing required field: wager_id' }, { status: 400 });
    }

    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager) {
      return Response.json({ error: 'Wager not found' }, { status: 404 });
    }

    if (['completed', 'cancelled'].includes(wager.status)) {
      return Response.json({ error: 'Wager is already closed' }, { status: 400 });
    }

    const isHostCancellingOpen = wager.status === 'open' && user.id === wager.host_id;
    const canModerate = ['ceo', 'super_admin', 'admin', 'moderator'].includes(user.role);
    if (!isHostCancellingOpen && !canModerate) {
      return Response.json({ error: 'Only the host can cancel an open wager; moderators can refund disputed wagers' }, { status: 403 });
    }

    const participants = await base44.asServiceRole.entities.WagerParticipant.filter({ wager_id: wager.id });
    const entryFee = toMoney(wager.entry_fee ?? wager.amount);
    await Promise.all(participants.map((participant) => refundParticipant(base44, wager, participant, entryFee)));

    await base44.asServiceRole.entities.Wager.update(wager.id, {
      status: 'cancelled',
      match_completed_date: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.SystemLog.create({
      log_type: 'wallet',
      action: 'wager_refund',
      user_id: user.id,
      user_name: user.full_name || user.email,
      entity_type: 'Wager',
      entity_id: wager.id,
      details: { reason, participant_count: participants.length, entry_fee: entryFee },
      created_date: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      refunded_participants: participants.length,
      refund_amount_each: entryFee,
    });
  } catch (error) {
    console.error('Refund wager error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
