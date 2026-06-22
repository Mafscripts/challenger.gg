import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { amount, payment_method } = await req.json();

    if (!amount || amount <= 0) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (amount < 10) {
      return Response.json({ error: 'Minimum withdrawal is $10' }, { status: 400 });
    }

    // Get wallet
    const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: user.id });
    if (wallets.length === 0) {
      return Response.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const wallet = wallets[0];

    const availableBalance = wallet.available_balance || 0;
    const withdrawableBalance = wallet.withdrawable_balance || 0;

    if (amount > withdrawableBalance || amount > availableBalance) {
      return Response.json({ error: 'Insufficient withdrawable balance' }, { status: 400 });
    }

    // Check for active wagers (pending balance)
    if (wallet.pending_balance > 0) {
      return Response.json({ error: 'Cannot withdraw while you have active wagers' }, { status: 400 });
    }

    // Create withdrawal request
    const withdrawalRequest = await base44.asServiceRole.entities.WithdrawalRequest.create({
      user_id: user.id,
      wallet_id: wallet.id,
      amount: amount,
      payment_method: payment_method || 'paypal',
      payment_details: {},
      status: 'pending',
      requested_date: new Date().toISOString(),
    });

    // Deduct from withdrawable balance immediately
    const balanceBefore = availableBalance;
    const newAvailableBalance = availableBalance - amount;
    const newWithdrawableBalance = withdrawableBalance - amount;

    await base44.asServiceRole.entities.Wallet.update(wallet.id, {
      available_balance: newAvailableBalance,
      withdrawable_balance: newWithdrawableBalance,
    });

    // Create transaction record
    await base44.asServiceRole.entities.WalletTransaction.create({
      user_id: user.id,
      wallet_id: wallet.id,
      type: 'withdrawal',
      amount: -amount,
      balance_before: balanceBefore,
      balance_after: newAvailableBalance,
      description: `Withdrawal Request - $${amount.toFixed(2)}`,
      status: 'pending',
      reference_id: withdrawalRequest.id,
      reference_type: 'WithdrawalRequest',
      metadata: { 
        payment_method: payment_method || 'paypal',
        withdrawal_request_id: withdrawalRequest.id 
      },
    });

    await base44.asServiceRole.entities.User.update(user.id, {
      wallet_balance: newAvailableBalance,
    });

    return Response.json({ 
      success: true, 
      withdrawal_request: withdrawalRequest,
      message: 'Withdrawal request submitted successfully. Processing time: 1-3 business days.' 
    });
  } catch (error) {
    console.error('Withdraw error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
