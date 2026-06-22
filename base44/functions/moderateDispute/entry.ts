import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const canModerate = (role) => ['ceo', 'super_admin', 'admin', 'moderator'].includes(role);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || !canModerate(user.role)) {
      return Response.json({ error: 'Unauthorized - Moderator access required' }, { status: 403 });
    }

    const { action, dispute_id, wager_id, decision, winner_id, payout_adjustment, message } = await req.json();

    if (action === 'resolve_dispute') {
      const dispute = await base44.entities.Dispute.get(dispute_id);
      if (!dispute) {
        return Response.json({ error: 'Dispute not found' }, { status: 404 });
      }

      // Update dispute
      await base44.entities.Dispute.update(dispute_id, {
        status: 'resolved',
        decision,
        winner_id,
        payout_adjustment,
        resolved_date: new Date().toISOString(),
        assigned_moderator: user.id,
        assigned_moderator_name: user.full_name
      });

      // If there's a winner, process payout
      if (winner_id && payout_adjustment) {
        const winner = await base44.asServiceRole.entities.User.get(winner_id);
        const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: winner_id });
        const wallet = wallets[0] || await base44.asServiceRole.entities.Wallet.create({
          user_id: winner_id,
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
        const balanceAfter = balanceBefore + payout_adjustment;

        await base44.asServiceRole.entities.Wallet.update(wallet.id, {
          available_balance: balanceAfter,
          withdrawable_balance: (wallet.withdrawable_balance || 0) + payout_adjustment,
          total_earnings: (wallet.total_earnings || 0) + payout_adjustment,
        });

        await base44.asServiceRole.entities.WalletTransaction.create({
          user_id: winner_id,
          wallet_id: wallet.id,
          type: 'admin_adjustment',
          amount: payout_adjustment,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Dispute payout adjustment for dispute #${dispute_id}`,
          status: 'completed',
          reference_id: dispute_id,
          reference_type: 'Dispute',
          metadata: { wager_id, moderator_id: user.id },
        });

        await base44.asServiceRole.entities.User.update(winner_id, {
          wallet_balance: balanceAfter,
          lifetime_earnings: (winner.lifetime_earnings || 0) + payout_adjustment
        });

        // Update wager if exists
        if (wager_id) {
          await base44.entities.Wager.update(wager_id, {
            status: 'completed',
            winner_id,
            winner_payout: payout_adjustment,
            completed_date: new Date().toISOString()
          });
        }
      }

      // Add chat message
      if (message) {
        const updatedMessages = [...(dispute.chat_messages || []), {
          sender_id: user.id,
          sender_name: user.full_name,
          sender_role: user.role,
          message,
          timestamp: new Date().toISOString()
        }];
        await base44.entities.Dispute.update(dispute_id, { chat_messages: updatedMessages });
      }

      // Log admin action
      await base44.entities.AdminAction.create({
        admin_id: user.id,
        admin_name: user.full_name,
        admin_role: user.role,
        action_type: 'dispute_resolve',
        target_user_id: dispute.reported_by,
        target_username: dispute.reported_by_name,
        description: `Resolved dispute #${dispute_id}`,
        details: { decision, winner_id, payout_adjustment }
      });

      return Response.json({ 
        success: true, 
        message: 'Dispute resolved successfully',
        winner_id,
        payout: payout_adjustment
      });
    }

    if (action === 'send_message') {
      const dispute = await base44.entities.Dispute.get(dispute_id);
      if (!dispute) {
        return Response.json({ error: 'Dispute not found' }, { status: 404 });
      }

      const updatedMessages = [...(dispute.chat_messages || []), {
        sender_id: user.id,
        sender_name: user.full_name,
        sender_role: user.role,
        message,
        timestamp: new Date().toISOString()
      }];

      await base44.entities.Dispute.update(dispute_id, {
        chat_messages: updatedMessages,
        assigned_moderator: user.id,
        assigned_moderator_name: user.full_name,
        status: 'under_review'
      });

      return Response.json({ success: true, message: 'Message sent' });
    }

    if (action === 'assign_dispute') {
      const dispute = await base44.entities.Dispute.get(dispute_id);
      if (!dispute) {
        return Response.json({ error: 'Dispute not found' }, { status: 404 });
      }

      await base44.entities.Dispute.update(dispute_id, {
        assigned_moderator: user.id,
        assigned_moderator_name: user.full_name,
        status: 'under_review'
      });

      return Response.json({ success: true, message: 'Dispute assigned' });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Dispute action error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
