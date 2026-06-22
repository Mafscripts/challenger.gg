import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const staffRoles = ['ceo', 'super_admin', 'admin', 'moderator'];
const roleManagers = ['ceo', 'super_admin'];
const walletManagers = ['ceo', 'super_admin', 'admin'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || !staffRoles.includes(user.role)) {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action, user_id, username, reason, duration_days, ban_type, scope, amount, new_role } = body;

    if (action === 'ban') {
      // Create ban record
      const expiresDate = ban_type === 'temporary' && duration_days 
        ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await base44.entities.Ban.create({
        user_id,
        username,
        banned_by: user.id,
        banned_by_name: user.full_name,
        banned_by_role: user.role,
        reason,
        ban_type,
        duration_days: ban_type === 'temporary' ? duration_days : null,
        expires_date: expiresDate,
        scope: scope || ['all'],
        status: 'active'
      });

      // Update user ban status
      await base44.entities.User.update(user_id, {
        is_banned: true,
        ban_reason: reason
      });

      // Log admin action
      await base44.entities.AdminAction.create({
        admin_id: user.id,
        admin_name: user.full_name,
        admin_role: user.role,
        action_type: 'ban',
        target_user_id: user_id,
        target_username: username,
        description: `Banned user ${username}`,
        details: { reason, ban_type, duration_days, scope }
      });

      return Response.json({ success: true, message: `User ${username} has been banned` });
    }

    if (action === 'unban') {
      // Find active ban
      const bans = await base44.entities.Ban.filter({ user_id, status: 'active' });
      if (bans.length > 0) {
        await base44.entities.Ban.update(bans[0].id, { status: 'overturned' });
      }

      // Update user
      await base44.entities.User.update(user_id, {
        is_banned: false,
        ban_reason: null
      });

      await base44.entities.AdminAction.create({
        admin_id: user.id,
        admin_name: user.full_name,
        admin_role: user.role,
        action_type: 'unban',
        target_user_id: user_id,
        target_username: username,
        description: `Unbanned user ${username}`
      });

      return Response.json({ success: true, message: `User ${username} has been unbanned` });
    }

    if (action === 'add_funds') {
      if (!walletManagers.includes(user.role)) {
        return Response.json({ error: 'Unauthorized - wallet management requires admin access' }, { status: 403 });
      }
      const numericAmount = Number(amount || 0);
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
      const previousBalance = wallet.available_balance || 0;
      const newBalance = previousBalance + numericAmount;
      
      await base44.asServiceRole.entities.Wallet.update(wallet.id, {
        available_balance: newBalance,
        withdrawable_balance: (wallet.withdrawable_balance || 0) + numericAmount,
      });

      await base44.asServiceRole.entities.WalletTransaction.create({
        user_id,
        wallet_id: wallet.id,
        type: 'admin_adjustment',
        amount: numericAmount,
        balance_before: previousBalance,
        balance_after: newBalance,
        description: `Admin adjustment by ${user.full_name || user.email}`,
        reference_type: 'AdminAction',
        status: 'completed',
        metadata: { admin_id: user.id },
      });

      await base44.asServiceRole.entities.User.update(user_id, {
        wallet_balance: newBalance
      });

      await base44.asServiceRole.entities.AdminAction.create({
        admin_id: user.id,
        admin_name: user.full_name,
        admin_role: user.role,
        action_type: 'payout_adjust',
        target_user_id: user_id,
        target_username: username,
        description: `Added $${numericAmount} to ${username}'s wallet`,
        details: { amount: numericAmount, previous_balance: previousBalance, new_balance: newBalance }
      });

      return Response.json({ success: true, message: `Added $${numericAmount} to ${username}'s wallet` });
    }

    if (action === 'set_role') {
      if (!roleManagers.includes(user.role)) {
        return Response.json({ error: 'Unauthorized - role management requires Super Admin access' }, { status: 403 });
      }

      if (!['ceo', 'super_admin', 'admin', 'moderator', 'user'].includes(new_role)) {
        return Response.json({ error: 'Invalid role' }, { status: 400 });
      }

      const userData = await base44.entities.User.get(user_id);
      const newBadges = (userData.badges || []).filter(b => !['ceo', 'super_admin', 'admin', 'moderator'].includes(b.type));
      
      if (new_role === 'ceo') {
        newBadges.push({ name: 'CEO', type: 'ceo' });
      } else if (new_role === 'super_admin') {
        newBadges.push({ name: 'Super Admin', type: 'super_admin' });
      } else if (new_role === 'admin') {
        newBadges.push({ name: 'Administrator', type: 'admin' });
      } else if (new_role === 'moderator') {
        newBadges.push({ name: 'Moderator', type: 'moderator' });
      }

      await base44.entities.User.update(user_id, {
        role: new_role,
        badges: newBadges
      });

      await base44.entities.AdminAction.create({
        admin_id: user.id,
        admin_name: user.full_name,
        admin_role: user.role,
        action_type: 'role_change',
        target_user_id: user_id,
        target_username: username,
        description: `Changed ${username}'s role to ${new_role}`,
        details: { new_role }
      });

      return Response.json({ success: true, message: `${username}'s role updated to ${new_role}` });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin action error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
