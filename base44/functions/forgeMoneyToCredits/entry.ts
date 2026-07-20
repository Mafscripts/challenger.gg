import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { commercePausedResponse } from '../_shared/commerce.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const pausedResponse = commercePausedResponse();
    if (pausedResponse) return pausedResponse;

    const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: user.id });
    const legacyBalance = user.wallet_balance || 0;
    const wallet = wallets[0] || await base44.asServiceRole.entities.Wallet.create({
      user_id: user.id,
      available_balance: legacyBalance,
      pending_balance: 0,
      escrow_balance: 0,
      withdrawable_balance: legacyBalance,
      total_deposits: 0,
      total_withdrawals: 0,
      total_earnings: 0,
      total_wagered: 0,
    });
    const walletBalance = wallet.available_balance || legacyBalance || 0;

    if (walletBalance <= 0) {
      return Response.json({ error: 'No tournament winnings to forge' }, { status: 400 });
    }

    const creditsToAdd = Math.floor(walletBalance);
    const currentCredits = user.credits || 0;
    const newCredits = currentCredits + creditsToAdd;

    await base44.asServiceRole.entities.Wallet.update(wallet.id, {
      available_balance: 0,
      withdrawable_balance: Math.max(0, (wallet.withdrawable_balance || 0) - walletBalance),
    });

    await base44.asServiceRole.entities.WalletTransaction.create({
      user_id: user.id,
      wallet_id: wallet.id,
      type: 'withdrawal',
      amount: -walletBalance,
      balance_before: walletBalance,
      balance_after: 0,
      description: 'Forged wallet balance into credits',
      status: 'completed',
      reference_type: 'CreditTransaction',
      metadata: { credits_added: creditsToAdd },
    });

    await base44.asServiceRole.entities.CreditTransaction.create({
      user_id: user.id,
      type: 'bonus',
      amount: creditsToAdd,
      balance_before: currentCredits,
      balance_after: newCredits,
      description: 'Forged wallet balance into credits',
      reference_type: 'Wallet',
      created_date: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.User.update(user.id, {
      wallet_balance: 0,
      credits: newCredits,
    });

    return Response.json({
      success: true,
      forged_amount: creditsToAdd,
      new_credits: newCredits,
      new_wallet: 0,
    });
  } catch (error) {
    console.error('Forge money to credits error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
