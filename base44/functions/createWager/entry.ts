import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';
const rosterSize = (teamSize) => Number.parseInt(String(teamSize || '1v1').split('v')[0], 10) || 1;
const paymentModeFor = (value) => value === 'full_team' ? 'full_team' : 'own';
const teamTypeFor = (matchType) => matchType === '8s' ? '8s' : 'wager';

const hasActivePremium = (user) => (
  user.is_premium === true && (!user.premium_expires || new Date(user.premium_expires) > new Date())
);

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

async function escrowStake(base44, userId, wagerId, amount, metadata) {
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
    description: metadata.description,
    reference_id: wagerId,
    reference_type: 'Wager',
    status: 'completed',
    metadata,
  });

  await base44.asServiceRole.entities.User.update(userId, {
    wallet_balance: remainingBalance,
  });

  return { transaction, remaining_balance: remainingBalance };
}

async function selectedTeamRoster(base44, teamId, captainId, expectedType, requiredSize) {
  if (!teamId) {
    const error = new Error('Select a team for team wagers');
    error.status = 400;
    throw error;
  }
  const team = await base44.asServiceRole.entities.Team.get(teamId).catch(() => null);
  if (!team || team.is_active === false) {
    const error = new Error('Select an active team');
    error.status = 400;
    throw error;
  }
  const teamType = team.team_type || '8s';
  if (teamType !== expectedType && teamType !== 'general') {
    const error = new Error(`Select a ${expectedType} team`);
    error.status = 400;
    throw error;
  }
  if (team.captain_id !== captainId) {
    const error = new Error('Only the team captain can enroll this team');
    error.status = 403;
    throw error;
  }
  const members = await base44.asServiceRole.entities.TeamMember.filter({ team_id: team.id }, '-joined_date', 50);
  const activeMembers = (members || [])
    .filter((member) => member.is_active !== false)
    .sort((a, b) => {
      if (a.user_id === team.captain_id) return -1;
      if (b.user_id === team.captain_id) return 1;
      return new Date(a.joined_date || 0) - new Date(b.joined_date || 0);
    });
  if (activeMembers.length < requiredSize) {
    const error = new Error(`${team.name} needs ${requiredSize} active roster members`);
    error.status = 400;
    throw error;
  }
  return { team, roster: activeMembers.slice(0, requiredSize) };
}

async function notifyUser(base44, userId, payload) {
  if (!userId) return null;
  return base44.asServiceRole.entities.Notification.create({
    user_id: userId,
    type: payload.type || 'wager',
    title: payload.title,
    message: payload.message,
    is_read: false,
    action_url: payload.action_url,
    related_entity_id: payload.related_entity_id,
    related_entity_type: payload.related_entity_type,
    created_date: new Date().toISOString(),
  }).catch(() => null);
}

async function createRosterParticipants(base44, { wager, side, team, roster, entryFee, paymentMode, payer }) {
  const totalStake = entryFee <= 0 ? 0 : paymentMode === 'full_team' ? toMoney(entryFee * roster.length) : entryFee;
  const escrow = totalStake > 0
    ? await escrowStake(base44, payer.id, wager.id, totalStake, {
      team: side,
      team_id: team.id,
      match_type: wager.match_type,
      description: `Escrow for ${team.name} ${wager.team_size} wager`,
    })
    : { transaction: null };
  const captainMember = roster.find((member) => member.user_id === payer.id) || roster[0];

  return Promise.all(roster.map(async (member) => {
    const isPayer = member.user_id === payer.id;
    const fullTeamPaid = paymentMode === 'full_team' && totalStake > 0;
    const paid = entryFee <= 0 || isPayer || fullTeamPaid;
    const paidAmount = entryFee <= 0 ? 0 : fullTeamPaid && member.user_id === captainMember.user_id ? totalStake : isPayer ? entryFee : 0;

    const participant = await base44.asServiceRole.entities.WagerParticipant.create({
      wager_id: wager.id,
      user_id: member.user_id,
      user_name: member.user_name,
      team: side,
      team_id: team.id,
      team_name: team.name,
      is_captain: member.user_id === team.captain_id,
      entry_fee_paid: paidAmount,
      payment_status: paid ? 'paid' : 'pending',
      paid_by: paid ? payer.id : '',
      escrowed: paidAmount > 0,
      escrow_transaction_id: paidAmount > 0 ? escrow.transaction?.id || '' : '',
      joined_date: new Date().toISOString(),
    });

    if (!paid && entryFee > 0) {
      await notifyUser(base44, member.user_id, {
        title: 'Wager entry pending',
        message: `${team.name} needs your $${entryFee.toFixed(2)} entry for ${wager.team_size}.`,
        action_url: `/wagers-match/${wager.id}`,
        related_entity_id: wager.id,
        related_entity_type: 'Wager',
      });
    } else if (member.user_id !== payer.id) {
      await notifyUser(base44, member.user_id, {
        title: 'Wager roster enrolled',
        message: `${team.name} was enrolled in a ${wager.team_size} wager.`,
        action_url: `/wagers-match/${wager.id}`,
        related_entity_id: wager.id,
        related_entity_type: 'Wager',
      });
    }
    return participant;
  }));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      game_mode,
      game_mode_display,
      team_size,
      max_players,
      best_of,
      host_banned_map,
      host_banned_map_name,
      final_map,
      final_map_name,
      match_type,
    } = body;

    const entryFee = toMoney(body.entry_fee ?? body.amount);
    if (!game_mode || !team_size) {
      return Response.json({ error: 'Missing required fields: game_mode, team_size' }, { status: 400 });
    }
    if (entryFee < 0) return Response.json({ error: 'Invalid wager amount' }, { status: 400 });
    if (match_type === 'ranked') return Response.json({ error: 'Ranked matches must use createRankedMatch' }, { status: 400 });

    const normalizedMatchType = ['8s', 'xp', 'wagers'].includes(match_type) ? match_type : (entryFee > 0 ? 'wagers' : 'xp');
    const requiredSize = rosterSize(team_size);
    const isTeamMatch = requiredSize > 1 && ['8s', 'wagers'].includes(normalizedMatchType);
    const paymentMode = paymentModeFor(body.payment_mode);
    const teamResult = isTeamMatch
      ? await selectedTeamRoster(base44, body.team_id, user.id, teamTypeFor(normalizedMatchType), requiredSize)
      : { team: null, roster: null };
    const platformFeePercent = hasActivePremium(user) ? 5 : 10;
    const totalPrizePool = toMoney(entryFee * (isTeamMatch ? requiredSize * 2 : 2));
    const platformFeeAmount = toMoney(totalPrizePool * (platformFeePercent / 100));
    const winnerPayout = toMoney(totalPrizePool - platformFeeAmount);
    const now = new Date().toISOString();
    const matchStartDeadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    if (!isTeamMatch && entryFee > 0) {
      const wallet = await getOrCreateWallet(base44, user.id);
      if (toMoney(wallet.available_balance) < entryFee) {
        return Response.json({
          error: 'Insufficient wallet balance',
          balance_needed: entryFee,
          balance_available: toMoney(wallet.available_balance),
        }, { status: 400 });
      }
    }

    const wager = await base44.asServiceRole.entities.Wager.create({
      host_id: user.id,
      host_name: playerName(user),
      host_team_id: teamResult.team?.id || '',
      host_team_name: teamResult.team?.name || '',
      host_payment_mode: paymentMode,
      challenger_id: '',
      challenger_name: '',
      challenger_team_id: '',
      challenger_team_name: '',
      match_type: normalizedMatchType,
      game_mode,
      game_mode_display: game_mode_display || game_mode,
      team_size,
      best_of: Number(best_of || 1),
      entry_fee: entryFee,
      team_entry_fee: toMoney(entryFee * requiredSize),
      required_players_per_team: requiredSize,
      roster_locked: isTeamMatch,
      total_prize_pool: totalPrizePool,
      platform_fee_percent: platformFeePercent,
      platform_fee_amount: platformFeeAmount,
      winner_payout: winnerPayout,
      status: 'open',
      map_pool_id: '',
      host_banned_map_id: host_banned_map || '',
      host_banned_map_name: host_banned_map_name || '',
      challenger_banned_map_id: '',
      challenger_banned_map_name: '',
      final_map_id: final_map || '',
      final_map_name: final_map_name || '',
      winner_id: '',
      winner_name: '',
      winner_score: 0,
      loser_score: 0,
      match_start_deadline: matchStartDeadline,
      created_date: now,
    });

    let remainingBalance = toMoney(user.wallet_balance);
    if (isTeamMatch) {
      await createRosterParticipants(base44, {
        wager,
        side: 'host',
        team: teamResult.team,
        roster: teamResult.roster,
        entryFee,
        paymentMode,
        payer: user,
      });
    } else {
      const escrow = entryFee > 0
        ? await escrowStake(base44, user.id, wager.id, entryFee, {
          team: 'host',
          match_type: normalizedMatchType,
          max_players: max_players || null,
          description: `Escrow for ${team_size} ${game_mode_display || game_mode} wager`,
        })
        : { transaction: null, remaining_balance: remainingBalance };
      remainingBalance = escrow.remaining_balance;
      await base44.asServiceRole.entities.WagerParticipant.create({
        wager_id: wager.id,
        user_id: user.id,
        user_name: playerName(user),
        team: 'host',
        is_captain: true,
        entry_fee_paid: entryFee,
        payment_status: 'paid',
        paid_by: user.id,
        escrowed: entryFee > 0,
        escrow_transaction_id: escrow.transaction?.id || '',
        joined_date: now,
      });
    }

    return Response.json({
      success: true,
      wager_id: wager.id,
      remaining_balance: remainingBalance,
      wager,
    });
  } catch (error) {
    console.error('Create wager error:', error.message);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
});
