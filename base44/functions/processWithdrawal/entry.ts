import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const canManageWallets = (role) => ['ceo', 'super_admin', 'admin'].includes(role);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Only wallet-capable staff can process withdrawals
    if (!canManageWallets(user.role)) {
      return Response.json({ error: 'Forbidden - admins only' }, { status: 403 });
    }

    const { withdrawal_id, status, notes } = await req.json();
    const nextStatus = status || 'approved';

    // Get withdrawal request
    const withdrawal = await base44.asServiceRole.entities.WithdrawalRequest.get(withdrawal_id);
    if (!withdrawal) {
      return Response.json({ error: 'Withdrawal request not found' }, { status: 404 });
    }

    if (withdrawal.status !== 'pending') {
      return Response.json({ error: 'Withdrawal request already processed' }, { status: 400 });
    }

    // Update withdrawal status
    await base44.asServiceRole.entities.WithdrawalRequest.update(withdrawal_id, {
      status: status || 'approved',
      processed_date: new Date().toISOString(),
      processed_by: user.id,
      notes: notes || '',
    });

    // Create transaction record
    const wallet = await base44.asServiceRole.entities.Wallet.filter({ user_id: withdrawal.user_id }).then(r => r[0]);
    if (wallet) {
      const balanceBefore = wallet.available_balance || 0;
      
      if (nextStatus === 'approved') {
        await base44.asServiceRole.entities.Wallet.update(wallet.id, {
          total_withdrawals: (wallet.total_withdrawals || 0) + withdrawal.amount,
        });

        const transactions = await base44.asServiceRole.entities.WalletTransaction.filter({
          reference_id: withdrawal.id,
          reference_type: 'WithdrawalRequest',
          type: 'withdrawal',
          status: 'pending',
        });
        if (transactions.length > 0) {
          await base44.asServiceRole.entities.WalletTransaction.update(transactions[0].id, {
            status: 'completed',
            metadata: {
              ...(transactions[0].metadata || {}),
              processed_by: user.id,
            },
          });
        } else {
          await base44.asServiceRole.entities.WalletTransaction.create({
            user_id: withdrawal.user_id,
            wallet_id: wallet.id,
            type: 'withdrawal',
            amount: -withdrawal.amount,
            balance_before: balanceBefore + withdrawal.amount,
            balance_after: balanceBefore,
            description: `Withdrawal Approved - $${Number(withdrawal.amount || 0).toFixed(2)}`,
            status: 'completed',
            reference_id: withdrawal.id,
            reference_type: 'WithdrawalRequest',
            metadata: {
              processed_by: user.id,
              backfilled: true,
            },
          });
        }
      } else if (nextStatus === 'rejected') {
        const transactions = await base44.asServiceRole.entities.WalletTransaction.filter({
          reference_id: withdrawal.id,
          reference_type: 'WithdrawalRequest',
          type: 'withdrawal',
          status: 'pending',
        });
        if (transactions.length > 0) {
          await base44.asServiceRole.entities.WalletTransaction.update(transactions[0].id, {
            status: 'cancelled',
            metadata: {
              ...(transactions[0].metadata || {}),
              rejection_reason: notes,
              processed_by: user.id,
            },
          });
        }

        // Refund the withdrawal amount
        const newAvailableBalance = (wallet.available_balance || 0) + withdrawal.amount;
        const newWithdrawableBalance = (wallet.withdrawable_balance || 0) + withdrawal.amount;
        await base44.asServiceRole.entities.Wallet.update(wallet.id, {
          available_balance: newAvailableBalance,
          withdrawable_balance: newWithdrawableBalance,
        });
        await base44.asServiceRole.entities.User.update(withdrawal.user_id, {
          wallet_balance: newAvailableBalance,
        });

        await base44.asServiceRole.entities.WalletTransaction.create({
          user_id: withdrawal.user_id,
          wallet_id: wallet.id,
          type: 'withdrawal',
          amount: withdrawal.amount,
          balance_before: balanceBefore,
          balance_after: newAvailableBalance,
          description: `Withdrawal Rejected - Refunded`,
          status: 'cancelled',
          reference_id: withdrawal.id,
          reference_type: 'WithdrawalRequest',
          metadata: { 
            rejection_reason: notes,
            processed_by: user.id,
          },
        });
      }
    }

    return Response.json({ 
      success: true, 
      message: `Withdrawal ${nextStatus} successfully` 
    });
  } catch (error) {
    console.error('Process withdrawal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
