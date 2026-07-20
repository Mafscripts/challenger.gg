import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { activisionIdRequiredResponse } from '../_shared/activision.ts';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const rosterSize = (teamSize) => Number.parseInt(String(teamSize || '1v1').split('v')[0], 10) || 1;

async function getOrCreateWallet(base44, userId) {
  const existing = await base44.asServiceRole.entities.Wallet.filter({ user_id: userId });
  if (existing.length > 0) return existing[0];
  return base44.asServiceRole.entities.Wallet.create({
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
}

async function escrowStake(base44, userId, wagerId, amount, team) {
  if (amount <= 0) return { transaction: null, remaining_balance: 0 };
  const wallet = await getOrCreateWallet(base44, userId);
  const currentBalance = toMoney(wallet.available_balance);
  if (currentBalance < amount) {
    const error = new Error('Insufficient wallet balance');
    error.status = 400;
    throw error;
  }
  const remainingBalance = toMoney(currentBalance - amount);
  const pendingBalance = toMoney((wallet.pending_balance || 0) + amount);
  const escrowBalance = toMoney((wallet.escrow_balance || 0) + amount);
  await base44.asServiceRole.entities.Wallet.update(wallet.id, {
    available_balance: remainingBalance,
    withdrawable_balance: toMoney(Math.max(0, (wallet.withdrawable_balance || 0) - amount)),
    pending_balance: pendingBalance,
    escrow_balance: escrowBalance,
    total_wagered: toMoney((wallet.total_wagered || 0) + amount),
  });
  const transaction = await base44.asServiceRole.entities.WalletTransaction.create({
    user_id: userId,
    wallet_id: wallet.id,
    type: 'wager_escrow',
    amount: -amount,
    balance_before: currentBalance,
    balance_after: remainingBalance,
    description: `Escrow for ${team || 'wager'} entry`,
    reference_id: wagerId,
    reference_type: 'Wager',
    status: 'completed',
    metadata: { team },
  });
  await base44.asServiceRole.entities.User.update(userId, { wallet_balance: remainingBalance });
  return { transaction, remaining_balance: remainingBalance };
}

const participantHasPaid = (participant, entryFee) => (
  entryFee <= 0 || participant.payment_status === 'paid' || toMoney(participant.entry_fee_paid) > 0
);

async function maybeStartWager(base44, wagerId) {
  const wager = await base44.asServiceRole.entities.Wager.get(wagerId);
  const requiredSize = Number(wager.required_players_per_team || rosterSize(wager.team_size));
  const entryFee = toMoney(wager.entry_fee ?? wager.amount);
  const participants = await base44.asServiceRole.entities.WagerParticipant.filter({ wager_id: wager.id }, '-joined_date', 20).catch(() => []);
  const host = participants.filter((participant) => participant.team === 'host');
  const challenger = participants.filter((participant) => participant.team === 'challenger');
  const ready = host.length >= requiredSize
    && challenger.length >= requiredSize
    && [...host.slice(0, requiredSize), ...challenger.slice(0, requiredSize)].every((participant) => participantHasPaid(participant, entryFee));
  const update = ready
    ? {
      status: 'in_progress',
      match_started_date: wager.match_started_date || new Date().toISOString(),
      match_start_deadline: wager.match_start_deadline || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }
    : { status: wager.challenger_id ? 'accepted' : 'open' };
  const updated = await base44.asServiceRole.entities.Wager.update(wager.id, update);
  return { wager: updated || { ...wager, ...update }, participants, ready };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const activisionResponse = activisionIdRequiredResponse([user]);
    if (activisionResponse) return activisionResponse;

    const { wager_id } = await req.json();
    if (!wager_id) return Response.json({ success: false, error: 'Missing wager_id' }, { status: 400 });
    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager || ['completed', 'cancelled', 'disputed'].includes(wager.status)) {
      return Response.json({ success: false, error: 'Wager is not payable' }, { status: 400 });
    }

    const entryFee = toMoney(wager.entry_fee ?? wager.amount);
    const rows = await base44.asServiceRole.entities.WagerParticipant.filter({ wager_id, user_id: user.id }, '-joined_date', 10).catch(() => []);
    const participant = (rows || []).find((row) => row.payment_status !== 'paid' && toMoney(row.entry_fee_paid) <= 0) || rows?.[0];
    if (!participant) return Response.json({ success: false, error: 'You are not enrolled in this wager' }, { status: 403 });
    if (participantHasPaid(participant, entryFee)) {
      return Response.json({ success: true, already_paid: true, wager });
    }

    const escrow = await escrowStake(base44, user.id, wager.id, entryFee, participant.team);
    const updatedParticipant = await base44.asServiceRole.entities.WagerParticipant.update(participant.id, {
      entry_fee_paid: entryFee,
      payment_status: 'paid',
      paid_by: user.id,
      escrowed: entryFee > 0,
      escrow_transaction_id: escrow.transaction?.id || '',
      paid_date: new Date().toISOString(),
    });
    const startState = await maybeStartWager(base44, wager.id);
    return Response.json({ success: true, participant: updatedParticipant, ...startState });
  } catch (error) {
    console.error('Pay wager entry error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: error.status || 500 });
  }
});
