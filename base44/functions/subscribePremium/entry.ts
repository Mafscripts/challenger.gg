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

    const { plan_type = 'monthly' } = await req.json();
    const plans = {
      weekly: { days: 7, price: 3.99 },
      monthly: { days: 30, price: 9.99 },
      yearly: { days: 365, price: 99.99 },
    };
    const plan = plans[plan_type];
    if (!plan) {
      return Response.json({ error: 'Invalid premium plan' }, { status: 400 });
    }

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
    if (balanceBefore < plan.price) {
      return Response.json({
        error: 'Insufficient wallet balance',
        balance_needed: plan.price,
        balance_available: balanceBefore,
      }, { status: 400 });
    }

    const startsAt = new Date();
    const existingExpiration = user.premium_expires ? new Date(user.premium_expires) : null;
    if (existingExpiration && existingExpiration > startsAt) {
      startsAt.setTime(existingExpiration.getTime());
    }
    const endsAt = new Date(startsAt.getTime() + plan.days * 24 * 60 * 60 * 1000);
    const balanceAfter = toMoney(balanceBefore - plan.price);

    await base44.asServiceRole.entities.Wallet.update(wallet.id, {
      available_balance: balanceAfter,
      withdrawable_balance: Math.max(0, toMoney((wallet.withdrawable_balance || 0) - plan.price)),
    });

    const transaction = await base44.asServiceRole.entities.WalletTransaction.create({
      user_id: user.id,
      wallet_id: wallet.id,
      type: 'premium_subscription',
      amount: -plan.price,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Premium subscription - ${plan_type}`,
      reference_type: 'PremiumMembership',
      status: 'completed',
      metadata: { plan_type },
    });

    const membership = await base44.asServiceRole.entities.PremiumMembership.create({
      user_id: user.id,
      plan_type,
      price_paid: plan.price,
      payment_method: 'base44_payments',
      transaction_id: transaction.id,
      start_date: startsAt.toISOString(),
      end_date: endsAt.toISOString(),
      is_active: true,
      auto_renew: false,
      created_date: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.WalletTransaction.update(transaction.id, {
      reference_id: membership.id,
    });

    await base44.asServiceRole.entities.User.update(user.id, {
      is_premium: true,
      premium_expires: endsAt.toISOString(),
      wallet_balance: balanceAfter,
    });

    return Response.json({
      success: true,
      membership_id: membership.id,
      premium_expires: endsAt.toISOString(),
      remaining_balance: balanceAfter,
    });
  } catch (error) {
    console.error('Subscribe premium error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
