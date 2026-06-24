import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const walletAdjustmentRoles = new Set(['ceo', 'super_admin']);
const walletAdjustmentTypes = new Set(['credits', 'money']);

const getRole = (user) => String(user?.role || user?.admin_role || 'user').toLowerCase();

const nameFor = (user) => (
  user?.display_name
  || user?.username
  || user?.full_name
  || user?.email
  || user?.id
  || 'Unknown user'
);

const money = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundedMoney = (value) => Math.round(money(value) * 100) / 100;

const canAdjustUserWallet = (actorRole, targetRole) => {
  if (actorRole === 'ceo') return true;
  if (actorRole === 'super_admin') return targetRole !== 'ceo';
  return false;
};

const createWalletForUser = (base44, userId) => base44.asServiceRole.entities.Wallet.create({
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me();
    const actorRole = getRole(actor);

    if (!actor || !walletAdjustmentRoles.has(actorRole)) {
      return Response.json({ success: false, error: 'CEO or Super Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const targetUserId = body.user_id;
    const adjustmentType = String(body.type || '').toLowerCase();
    const rawAmount = money(body.amount);
    const reason = String(body.reason || '').trim();

    if (!targetUserId) {
      return Response.json({ success: false, error: 'User is required' }, { status: 400 });
    }

    if (!walletAdjustmentTypes.has(adjustmentType)) {
      return Response.json({ success: false, error: 'Adjustment type must be credits or money' }, { status: 400 });
    }

    if (rawAmount <= 0) {
      return Response.json({ success: false, error: 'Amount must be greater than zero' }, { status: 400 });
    }

    if (!reason) {
      return Response.json({ success: false, error: 'Reason is required' }, { status: 400 });
    }

    const targetUser = await base44.asServiceRole.entities.User.get(targetUserId);
    if (!targetUser) {
      return Response.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const targetRole = getRole(targetUser);
    if (!canAdjustUserWallet(actorRole, targetRole)) {
      return Response.json({ success: false, error: 'Super Admin cannot adjust CEO accounts' }, { status: 403 });
    }

    const timestamp = new Date().toISOString();
    const actorName = nameFor(actor);
    const targetName = nameFor(targetUser);
    const amount = adjustmentType === 'money' ? roundedMoney(rawAmount) : rawAmount;

    if (amount <= 0) {
      return Response.json({ success: false, error: 'Amount must be greater than zero' }, { status: 400 });
    }

    let updatedUser = null;
    let updatedWallet = null;
    let transaction = null;
    let walletId = null;
    let balanceBefore = 0;
    let balanceAfter = 0;

    if (adjustmentType === 'credits') {
      balanceBefore = money(targetUser.credits);
      balanceAfter = balanceBefore + amount;

      const updateResult = await base44.asServiceRole.entities.User.update(targetUserId, {
        credits: balanceAfter,
      });
      updatedUser = updateResult || await base44.asServiceRole.entities.User.get(targetUserId);

      transaction = await base44.asServiceRole.entities.CreditTransaction.create({
        user_id: targetUserId,
        type: 'bonus',
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Admin credit addition: ${reason}`,
        reference_type: 'AdminAction',
        created_date: timestamp,
      });
    } else {
      const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: targetUserId });
      const wallet = wallets[0] || await createWalletForUser(base44, targetUserId);
      walletId = wallet.id;

      balanceBefore = roundedMoney(wallet.available_balance);
      balanceAfter = roundedMoney(balanceBefore + amount);

      const walletUpdates = {
        available_balance: balanceAfter,
        withdrawable_balance: roundedMoney(money(wallet.withdrawable_balance) + amount),
        total_deposits: roundedMoney(money(wallet.total_deposits) + amount),
      };
      const walletUpdateResult = await base44.asServiceRole.entities.Wallet.update(walletId, walletUpdates);
      updatedWallet = walletUpdateResult || { ...wallet, ...walletUpdates };

      const userUpdateResult = await base44.asServiceRole.entities.User.update(targetUserId, {
        wallet_balance: balanceAfter,
      });
      updatedUser = userUpdateResult || await base44.asServiceRole.entities.User.get(targetUserId);

      transaction = await base44.asServiceRole.entities.WalletTransaction.create({
        user_id: targetUserId,
        wallet_id: walletId,
        type: 'admin_adjustment',
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Admin money addition: ${reason}`,
        reference_type: 'AdminAction',
        status: 'completed',
        metadata: {
          reason,
          adjusted_by: actor.id,
          adjusted_by_name: actorName,
        },
      });
    }

    const action = await base44.asServiceRole.entities.AdminAction.create({
      admin_id: actor.id,
      admin_name: actorName,
      admin_role: actorRole,
      action_type: 'wallet_adjust',
      target_user_id: targetUserId,
      target_username: targetName,
      description: `Added ${amount} ${adjustmentType} to ${targetName}: ${reason}`,
      details: {
        target_user: targetUserId,
        target_user_id: targetUserId,
        target_user_name: targetName,
        amount,
        type: adjustmentType,
        reason,
        performed_by: actor.id,
        performed_by_name: actorName,
        performed_by_role: actorRole,
        timestamp,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        transaction_id: transaction?.id,
        wallet_id: updatedWallet?.id || walletId,
      },
      created_date: timestamp,
    });

    await base44.asServiceRole.entities.Notification.create({
      user_id: targetUserId,
      type: 'system',
      title: adjustmentType === 'credits' ? 'Credits added' : 'Money added',
      message: adjustmentType === 'credits'
        ? `${amount.toLocaleString()} credits were added to your account.`
        : `$${amount.toFixed(2)} was added to your wallet.`,
      is_read: false,
      action_url: adjustmentType === 'money' ? '/wallet' : '/marketplace#credits-store',
      related_entity_id: action.id,
      related_entity_type: 'AdminAction',
      created_date: timestamp,
    });

    return Response.json({
      success: true,
      type: adjustmentType,
      amount,
      user: updatedUser,
      wallet: updatedWallet,
      action,
      transaction,
    });
  } catch (error) {
    console.error('Admin wallet adjustment error:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
