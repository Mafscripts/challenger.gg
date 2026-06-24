import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const playerName = (user) => user.display_name || user.full_name || user.username || user.email || 'Unnamed player';
const rosterSize = (teamSize) => Number.parseInt(String(teamSize || '1v1').split('v')[0], 10) || 1;
const paymentModeFor = (value) => value === 'full_team' ? 'full_team' : 'own';
const teamTypeFor = (matchType) => matchType === '8s' ? '8s' : 'wager';

const mapsByMode = {
  snd: [
    { id: 'raid', name: 'Raid' },
    { id: 'shoot_house', name: 'Shoot House' },
    { id: 'shoothouse', name: 'Shoothouse' },
    { id: 'vacant', name: 'Vacant' },
    { id: 'nuketown', name: 'Nuketown' },
    { id: 'hackney_yard', name: 'Hackney Yard' },
    { id: 'gun_runner', name: 'Gun Runner' },
  ],
  overload: [
    { id: 'gaza', name: 'Gaza' },
    { id: 'airstrip', name: 'Airstrip' },
    { id: 'tipperary', name: 'Tipperary' },
    { id: 'rivet', name: 'Rivet' },
    { id: 'khandor', name: 'Khandor' },
  ],
  hp: [
    { id: 'terminal', name: 'Terminal' },
    { id: 'rust', name: 'Rust' },
    { id: 'shipment', name: 'Shipment' },
    { id: 'crash', name: 'Crash' },
    { id: 'backlot', name: 'Backlot' },
  ],
};

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
  await base44.asServiceRole.entities.User.update(userId, { wallet_balance: remainingBalance });
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
  return { wager: updated || { ...wager, ...update }, ready };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      wager_id,
      challenger_banned_map,
      challenger_banned_map_name,
      final_map,
      final_map_name,
    } = body;

    if (!wager_id) return Response.json({ error: 'Missing required field: wager_id' }, { status: 400 });
    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager) return Response.json({ error: 'Wager not found' }, { status: 404 });
    if (wager.match_type === 'ranked') return Response.json({ error: 'Ranked matches must use acceptRankedMatch' }, { status: 400 });
    if (wager.status !== 'open') return Response.json({ error: 'Wager is no longer open' }, { status: 400 });
    if (user.id === wager.host_id) return Response.json({ error: 'Cannot accept your own wager' }, { status: 400 });
    if (wager.challenger_id) return Response.json({ error: 'Wager already has a challenger' }, { status: 400 });

    const entryFee = toMoney(wager.entry_fee ?? wager.amount);
    const requiredSize = Number(wager.required_players_per_team || rosterSize(wager.team_size));
    const isTeamMatch = requiredSize > 1 && ['8s', 'wagers'].includes(wager.match_type || 'wagers');
    const paymentMode = paymentModeFor(body.payment_mode);
    const teamResult = isTeamMatch
      ? await selectedTeamRoster(base44, body.team_id, user.id, teamTypeFor(wager.match_type || 'wagers'), requiredSize)
      : { team: null, roster: null };

    if (isTeamMatch) {
      if (teamResult.team.id === wager.host_team_id) return Response.json({ error: 'Select a different team' }, { status: 400 });
      const existingRows = await base44.asServiceRole.entities.WagerParticipant.filter({ wager_id: wager.id }, '-joined_date', 20).catch(() => []);
      const existingUserIds = existingRows.map((participant) => participant.user_id).filter(Boolean);
      const duplicateRosterMember = teamResult.roster.find((member) => existingUserIds.includes(member.user_id));
      if (duplicateRosterMember) return Response.json({ error: 'A roster member is already enrolled in this wager' }, { status: 400 });
    } else if (entryFee > 0) {
      const wallet = await getOrCreateWallet(base44, user.id);
      if (toMoney(wallet.available_balance) < entryFee) {
        return Response.json({
          error: 'Insufficient wallet balance',
          balance_needed: entryFee,
          balance_available: toMoney(wallet.available_balance),
        }, { status: 400 });
      }
    }

    const hostBan = wager.host_banned_map_id || wager.host_banned_map || '';
    const pool = mapsByMode[wager.game_mode] || mapsByMode.snd;
    let selectedFinalMap = final_map || wager.final_map_id || wager.final_map || '';
    let selectedFinalMapName = final_map_name || wager.final_map_name || '';
    if (!selectedFinalMap) {
      const remainingMaps = pool.filter((map) => map.id !== hostBan && map.id !== challenger_banned_map);
      const selected = remainingMaps.length > 0 ? remainingMaps[Math.floor(Math.random() * remainingMaps.length)] : pool[0];
      selectedFinalMap = selected?.id || '';
      selectedFinalMapName = selected?.name || '';
    }

    const now = new Date().toISOString();
    let remainingBalance = toMoney(user.wallet_balance);

    if (isTeamMatch) {
      await createRosterParticipants(base44, {
        wager,
        side: 'challenger',
        team: teamResult.team,
        roster: teamResult.roster,
        entryFee,
        paymentMode,
        payer: user,
      });
    } else {
      const escrow = entryFee > 0
        ? await escrowStake(base44, user.id, wager.id, entryFee, {
          team: 'challenger',
          opponent_id: wager.host_id,
          opponent_name: wager.host_name,
          description: `Escrow for ${wager.team_size} ${wager.game_mode_display || wager.game_mode} wager`,
        })
        : { transaction: null, remaining_balance: remainingBalance };
      remainingBalance = escrow.remaining_balance;
      await base44.asServiceRole.entities.WagerParticipant.create({
        wager_id,
        user_id: user.id,
        user_name: playerName(user),
        team: 'challenger',
        is_captain: true,
        entry_fee_paid: entryFee,
        payment_status: 'paid',
        paid_by: user.id,
        escrowed: entryFee > 0,
        escrow_transaction_id: escrow.transaction?.id || '',
        joined_date: now,
      });
    }

    await base44.asServiceRole.entities.Wager.update(wager_id, {
      status: isTeamMatch ? 'accepted' : 'in_progress',
      challenger_id: user.id,
      challenger_name: playerName(user),
      challenger_team_id: teamResult.team?.id || '',
      challenger_team_name: teamResult.team?.name || '',
      challenger_payment_mode: paymentMode,
      challenger_banned_map_id: challenger_banned_map || '',
      challenger_banned_map_name: challenger_banned_map_name || '',
      final_map_id: selectedFinalMap,
      final_map_name: selectedFinalMapName,
      match_start_deadline: isTeamMatch ? wager.match_start_deadline : new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      match_started_date: isTeamMatch ? wager.match_started_date || '' : now,
      accepted_date: now,
      match_type: wager.match_type || (entryFee > 0 ? 'wagers' : 'xp'),
    });

    const startState = isTeamMatch ? await maybeStartWager(base44, wager_id) : {
      wager: await base44.asServiceRole.entities.Wager.get(wager_id),
      ready: true,
    };

    return Response.json({
      success: true,
      wager_id,
      final_map: selectedFinalMap,
      final_map_name: selectedFinalMapName,
      match_start_deadline: startState.wager.match_start_deadline,
      remaining_balance: remainingBalance,
      ready: startState.ready,
      wager: startState.wager,
    });
  } catch (error) {
    console.error('Accept wager error:', error.message);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
});
