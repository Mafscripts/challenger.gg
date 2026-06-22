import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { wager_id } = await req.json();
    if (!wager_id) {
      return Response.json({ error: 'Missing required field: wager_id' }, { status: 400 });
    }

    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager) {
      return Response.json({ error: 'Wager not found' }, { status: 404 });
    }

    const team = user.id === wager.host_id ? 'host' : user.id === wager.challenger_id ? 'challenger' : null;
    if (!team) {
      return Response.json({ error: 'Unauthorized - only participants can escrow funds' }, { status: 403 });
    }

    const entryFee = toMoney(wager.entry_fee ?? wager.amount);
    if (entryFee === 0) {
      return Response.json({ success: true, message: 'Free match does not require escrow', wager_amount: 0 });
    }

    const existingTransactions = await base44.asServiceRole.entities.WalletTransaction.filter({
      user_id: user.id,
      reference_id: wager.id,
      reference_type: 'Wager',
      type: 'wager_escrow',
    });
    if (existingTransactions.some((tx) => tx.status === 'pending' || tx.status === 'completed')) {
      return Response.json({ success: true, message: 'Funds already escrowed', wager_amount: entryFee });
    }

    const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: user.id });
    if (wallets.length === 0) {
      return Response.json({ error: 'Wallet not found. Please deposit funds first.' }, { status: 404 });
    }

    const wallet = wallets[0];
    const balanceBefore = toMoney(wallet.available_balance);
    if (balanceBefore < entryFee) {
      return Response.json({
        error: 'Insufficient balance',
        required: entryFee,
        available: balanceBefore,
      }, { status: 400 });
    }

    const newAvailableBalance = toMoney(balanceBefore - entryFee);
    const newPendingBalance = toMoney((wallet.pending_balance || 0) + entryFee);

    await base44.asServiceRole.entities.Wallet.update(wallet.id, {
      available_balance: newAvailableBalance,
      pending_balance: newPendingBalance,
      escrow_balance: newPendingBalance,
      total_wagered: toMoney((wallet.total_wagered || 0) + entryFee),
    });

    const transaction = await base44.asServiceRole.entities.WalletTransaction.create({
      user_id: user.id,
      wallet_id: wallet.id,
      type: 'wager_escrow',
      amount: -entryFee,
      balance_before: balanceBefore,
      balance_after: newAvailableBalance,
      description: `Wager Escrow - ${wager.game_mode_display || wager.game_mode} ${wager.team_size}`,
      status: 'pending',
      reference_id: wager.id,
      reference_type: 'Wager',
      metadata: {
        team,
        opponent_id: team === 'host' ? wager.challenger_id : wager.host_id,
        opponent_name: team === 'host' ? wager.challenger_name : wager.host_name,
      },
    });

    const participants = await base44.asServiceRole.entities.WagerParticipant.filter({
      wager_id: wager.id,
      user_id: user.id,
    });
    if (participants.length > 0) {
      await base44.asServiceRole.entities.WagerParticipant.update(participants[0].id, {
        entry_fee_paid: true,
        escrow_transaction_id: transaction.id,
      });
    }

    await base44.asServiceRole.entities.User.update(user.id, {
      wallet_balance: newAvailableBalance,
    });

    return Response.json({
      success: true,
      message: 'Funds escrowed successfully',
      wager_amount: entryFee,
      remaining_balance: newAvailableBalance,
    });
  } catch (error) {
    console.error('Escrow wager error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
