import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const toMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const playerName = (user) => user.display_name || user.full_name || user.email || 'Unnamed player';

const mapsByMode = {
  snd: [
    { id: 'raid', name: 'Raid' },
    { id: 'shoot_house', name: 'Shoot House' },
    { id: 'shoothouse', name: 'Shoothouse' },
    { id: 'vacant', name: 'Vacant' },
    { id: 'nuketown', name: 'Nuketown' },
    { id: 'hackney_yard', name: 'Hackney Yard' },
    { id: 'gun_runner', name: 'Gun Runner' },
    { id: 'exposure', name: 'Exposure' },
    { id: 'colossus', name: 'Colossus' },
    { id: 'scar', name: 'Scar' },
    { id: 'den', name: 'Den' },
    { id: 'outpost', name: 'Outpost' },
    { id: 'skyline', name: 'Skyline' },
  ],
  overload: [
    { id: 'gaza', name: 'Gaza' },
    { id: 'airstrip', name: 'Airstrip' },
    { id: 'tipperary', name: 'Tipperary' },
    { id: 'rivet', name: 'Rivet' },
    { id: 'khandor', name: 'Khandor' },
    { id: 'grid', name: 'Grid' },
    { id: 'nexus', name: 'Nexus' },
    { id: 'circuit', name: 'Circuit' },
    { id: 'terminal', name: 'Terminal' },
    { id: 'vault', name: 'Vault' },
  ],
  hp: [
    { id: 'terminal', name: 'Terminal' },
    { id: 'rust', name: 'Rust' },
    { id: 'shipment', name: 'Shipment' },
    { id: 'crash', name: 'Crash' },
    { id: 'backlot', name: 'Backlot' },
    { id: 'karst', name: 'Karst' },
    { id: 'incline', name: 'Incline' },
    { id: 'quarry', name: 'Quarry' },
    { id: 'ruins', name: 'Ruins' },
    { id: 'fortress', name: 'Fortress' },
    { id: 'summit', name: 'Summit' },
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

    if (!wager_id) {
      return Response.json({ error: 'Missing required field: wager_id' }, { status: 400 });
    }

    const wager = await base44.asServiceRole.entities.Wager.get(wager_id);
    if (!wager) {
      return Response.json({ error: 'Wager not found' }, { status: 404 });
    }

    if (wager.match_type === 'ranked') {
      return Response.json({ error: 'Ranked matches must use acceptRankedMatch' }, { status: 400 });
    }

    if (wager.status !== 'open') {
      return Response.json({ error: 'Wager is no longer open' }, { status: 400 });
    }

    if (user.id === wager.host_id) {
      return Response.json({ error: 'Cannot accept your own wager' }, { status: 400 });
    }

    if (wager.challenger_id) {
      return Response.json({ error: 'Wager already has a challenger' }, { status: 400 });
    }

    const entryFee = toMoney(wager.entry_fee ?? wager.amount);
    let wallet = null;
    let escrowTransactionId = '';
    let remainingBalance = toMoney(user.wallet_balance);

    if (entryFee > 0) {
      wallet = await getOrCreateWallet(base44, user.id);
      const currentBalance = toMoney(wallet.available_balance);
      remainingBalance = currentBalance;

      if (currentBalance < entryFee) {
        return Response.json({
          error: 'Insufficient wallet balance',
          balance_needed: entryFee,
          balance_available: currentBalance,
        }, { status: 400 });
      }

      remainingBalance = toMoney(currentBalance - entryFee);
      const newPending = toMoney((wallet.pending_balance || 0) + entryFee);

      await base44.asServiceRole.entities.Wallet.update(wallet.id, {
        available_balance: remainingBalance,
        pending_balance: newPending,
        escrow_balance: newPending,
        total_wagered: toMoney((wallet.total_wagered || 0) + entryFee),
      });

      const transaction = await base44.asServiceRole.entities.WalletTransaction.create({
        user_id: user.id,
        wallet_id: wallet.id,
        type: 'wager_escrow',
        amount: -entryFee,
        balance_before: currentBalance,
        balance_after: remainingBalance,
        description: `Escrow for ${wager.team_size} ${wager.game_mode_display || wager.game_mode} wager`,
        reference_id: wager.id,
        reference_type: 'Wager',
        status: 'pending',
        metadata: {
          team: 'challenger',
          opponent_id: wager.host_id,
          opponent_name: wager.host_name,
        },
      });
      escrowTransactionId = transaction.id;

      await base44.asServiceRole.entities.User.update(user.id, {
        wallet_balance: remainingBalance,
      });
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
    const matchStartDeadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await base44.asServiceRole.entities.Wager.update(wager_id, {
      status: 'in_progress',
      challenger_id: user.id,
      challenger_name: playerName(user),
      challenger_banned_map_id: challenger_banned_map || '',
      challenger_banned_map_name: challenger_banned_map_name || '',
      final_map_id: selectedFinalMap,
      final_map_name: selectedFinalMapName,
      match_start_deadline: matchStartDeadline,
      match_started_date: now,
      accepted_date: now,
      match_type: wager.match_type || (entryFee > 0 ? 'wagers' : 'xp'),
    });

    await base44.asServiceRole.entities.WagerParticipant.create({
      wager_id,
      user_id: user.id,
      user_name: playerName(user),
      team: 'challenger',
      is_captain: true,
      entry_fee_paid: entryFee === 0 || Boolean(escrowTransactionId),
      escrow_transaction_id: escrowTransactionId,
      joined_date: now,
    });

    return Response.json({
      success: true,
      wager_id,
      final_map: selectedFinalMap,
      final_map_name: selectedFinalMapName,
      match_start_deadline: matchStartDeadline,
      remaining_balance: remainingBalance,
    });
  } catch (error) {
    console.error('Accept wager error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
