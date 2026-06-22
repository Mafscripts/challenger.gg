import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const canManageWallets = (role) => ['ceo', 'super_admin', 'admin'].includes(role);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !canManageWallets(user.role)) {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const { user_id, amount } = await req.json();
    const numericAmount = Number(amount || 0);

    if (!user_id || !numericAmount || numericAmount <= 0) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const targetUser = await base44.asServiceRole.entities.User.get(user_id);
    if (!targetUser) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id });
    const wallet = wallets[0] || await base44.asServiceRole.entities.Wallet.create({
      user_id,
      available_balance: 0,
      pending_balance: 0,
      escrow_balance: 0,
      withdrawable_balance: 0,
      total_deposits: 0,
      total_withdrawals: 0,
      total_earnings: 0,
      total_wagered: 0,
    });

    const balanceBefore = wallet.available_balance || 0;
    const newBalance = balanceBefore + numericAmount;

    await base44.asServiceRole.entities.Wallet.update(wallet.id, {
      available_balance: newBalance,
      withdrawable_balance: (wallet.withdrawable_balance || 0) + numericAmount,
    });

    await base44.asServiceRole.entities.WalletTransaction.create({
      user_id,
      wallet_id: wallet.id,
      type: 'admin_adjustment',
      amount: numericAmount,
      balance_before: balanceBefore,
      balance_after: newBalance,
      description: `Admin adjustment by ${user.full_name || user.email}`,
      reference_type: 'AdminAction',
      status: 'completed',
      metadata: { admin_id: user.id },
    });

    await base44.asServiceRole.entities.User.update(user_id, {
      wallet_balance: newBalance,
      lifetime_earnings: (targetUser.lifetime_earnings || 0) + numericAmount,
    });

    await base44.asServiceRole.entities.AdminAction.create({
      admin_id: user.id,
      admin_name: user.full_name,
      admin_role: user.role,
      action_type: 'payout_adjust',
      target_user_id: user_id,
      target_username: targetUser.full_name,
      description: `Added $${numericAmount} to ${targetUser.full_name}'s wallet`,
      details: { amount: numericAmount, previous_balance: balanceBefore, new_balance: newBalance },
    });

    return Response.json({
      success: true,
      message: `Added $${numericAmount} to ${targetUser.full_name}'s wallet`,
      new_balance: newBalance,
    });
  } catch (error) {
    console.error('Add funds error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
