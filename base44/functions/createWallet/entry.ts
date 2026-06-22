import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const cleanHandle = (value) => String(value || '')
  .trim()
  .replace(/^@+/, '')
  .toLowerCase()
  .replace(/[^a-z0-9_.-]/g, '')
  .slice(0, 30);

const cleanUsername = (value) => String(value || '')
  .trim()
  .split('@')[0]
  .replace(/[^a-zA-Z0-9_.-]/g, '')
  .slice(0, 30);

const displayNameFor = (user, fallback) => (
  String(fallback || user.display_name || user.full_name || user.username || user.email || 'Unnamed player').trim().slice(0, 60)
);

const playerName = (user, fallback) => fallback || user.display_name || user.full_name || user.username || user.email || 'Unnamed player';

async function isUnique(base44, field, value, currentUserId) {
  if (!value) return false;
  const matches = await base44.asServiceRole.entities.User.filter({ [field]: value });
  return matches.every((match) => match.id === currentUserId);
}

async function uniqueValue(base44, field, preferred, currentUserId) {
  const base = String(preferred || 'player').slice(0, 30) || 'player';
  if (await isUnique(base44, field, base, currentUserId)) return base;

  const seed = String(currentUserId || Date.now()).replace(/[^a-zA-Z0-9]/g, '').slice(-6) || Date.now().toString(36).slice(-6);
  const seeded = `${base.slice(0, Math.max(1, 30 - seed.length - 1))}-${seed}`;
  if (await isUnique(base44, field, seeded, currentUserId)) return seeded;

  for (let i = 2; i < 100; i += 1) {
    const suffix = String(i);
    const candidate = `${base.slice(0, Math.max(1, 30 - suffix.length - 1))}-${suffix}`;
    if (await isUnique(base44, field, candidate, currentUserId)) return candidate;
  }

  throw new Error(`Unable to generate a unique ${field}`);
}

async function firstUserRole(base44, currentUserId) {
  const users = await base44.asServiceRole.entities.User.filter({}, 'account_created_date', 500);
  const ceo = users.find((row) => (
    row.role === 'ceo' ||
    row.admin_role === 'ceo' ||
    (row.is_admin === true && row.role === 'ceo')
  ));

  if (ceo) {
    return {
      role: ceo.id === currentUserId ? 'ceo' : 'user',
      admin_role: ceo.id === currentUserId ? 'ceo' : null,
      is_admin: ceo.id === currentUserId,
      existingUsers: users,
    };
  }

  if (users.length === 0 || users.every((row) => row.id === currentUserId)) {
    return { role: 'ceo', admin_role: 'ceo', is_admin: true, existingUsers: users };
  }

  const first = users[0];
  await base44.asServiceRole.entities.User.update(first.id, {
    role: 'ceo',
    admin_role: 'ceo',
    is_admin: true,
    badges: [
      ...(first.badges || []).filter((badge) => badge.type !== 'ceo'),
      { name: 'CEO', type: 'ceo' },
    ],
  });

  return {
    role: first.id === currentUserId ? 'ceo' : 'user',
    admin_role: first.id === currentUserId ? 'ceo' : null,
    is_admin: first.id === currentUserId,
    existingUsers: users,
  };
}

async function ensureUser(base44, authUser, payload) {
  const existing = await base44.asServiceRole.entities.User.get(authUser.id).catch(() => null);
  const roleInfo = await firstUserRole(base44, authUser.id);
  const now = new Date().toISOString();
  const existingRole = existing?.role || authUser.role;
  const existingAdminRole = existing?.admin_role || authUser.admin_role;
  const staffRole = roleInfo.role === 'ceo'
    ? 'ceo'
    : (existingAdminRole || (existingRole && existingRole !== 'user' ? existingRole : 'user'));
  const adminRole = staffRole !== 'user' ? (staffRole === 'ceo' ? 'ceo' : existingAdminRole || staffRole) : null;
  const isAdmin = staffRole !== 'user';
  const badges = [
    ...((existing?.badges || authUser.badges || []).filter((badge) => !['ceo', 'super_admin', 'admin', 'moderator'].includes(badge.type))),
  ];

  if (staffRole !== 'user') {
    badges.push({ name: staffRole === 'ceo' ? 'CEO' : staffRole.replace('_', ' '), type: staffRole });
  }

  const userPayload = {
    username: payload.username,
    handle: payload.handle,
    display_name: payload.displayName,
    role: staffRole,
    admin_role: adminRole,
    is_admin: isAdmin,
    email_verified: true,
    account_created_date: existing?.account_created_date || authUser.account_created_date || now,
    credits: existing?.credits || authUser.credits || 0,
    wallet_balance: existing?.wallet_balance || authUser.wallet_balance || 0,
    xp_level: existing?.xp_level || authUser.xp_level || 1,
    wager_wins: existing?.wager_wins || authUser.wager_wins || 0,
    wager_losses: existing?.wager_losses || authUser.wager_losses || 0,
    current_win_streak: existing?.current_win_streak || authUser.current_win_streak || 0,
    total_wager_earnings: existing?.total_wager_earnings || authUser.total_wager_earnings || 0,
    biggest_wager_win: existing?.biggest_wager_win || authUser.biggest_wager_win || 0,
    tournament_wins: existing?.tournament_wins || authUser.tournament_wins || 0,
    region: payload.region,
    badges,
  };

  if (existing) {
    await base44.asServiceRole.entities.User.update(authUser.id, userPayload);
    return { ...existing, ...userPayload };
  }

  return base44.asServiceRole.entities.User.create({
    ...userPayload,
    id: authUser.id,
  }).catch(async () => {
    await base44.asServiceRole.entities.User.update(authUser.id, userPayload);
    return { ...authUser, ...userPayload };
  });
}

async function ensureProfile(base44, user, payload, now) {
  const profiles = await base44.asServiceRole.entities.PlayerProfile.filter({ user_id: user.id });
  const profilePayload = {
    username: payload.username,
    handle: payload.handle,
    display_name: payload.displayName,
    region: payload.region,
    elo: 0,
    peak_elo: 0,
    xp: 0,
    level: 1,
    prestige: 0,
    total_matches: 0,
    total_wins: 0,
    total_losses: 0,
    account_created_date: user.account_created_date || now,
    last_active_date: now,
    is_banned: false,
    showcase_item_ids: [],
  };

  if (profiles.length > 0) {
    await base44.asServiceRole.entities.PlayerProfile.update(profiles[0].id, {
      username: payload.username,
      handle: payload.handle,
      display_name: payload.displayName,
      region: profiles[0].region || payload.region,
      last_active_date: now,
    });
    return;
  }

  await base44.asServiceRole.entities.PlayerProfile.create({
    user_id: user.id,
    ...profilePayload,
  });
}

async function ensureWallet(base44, user) {
  const wallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: user.id });
  if (wallets.length > 0) return wallets[0];
  const balance = user.wallet_balance || 0;
  return base44.asServiceRole.entities.Wallet.create({
    user_id: user.id,
    available_balance: balance,
    pending_balance: 0,
    escrow_balance: 0,
    withdrawable_balance: balance,
    total_deposits: 0,
    total_withdrawals: 0,
    total_earnings: 0,
    total_wagered: 0,
  });
}

async function ensureRanked(base44, user, payload) {
  const rankedRows = await base44.asServiceRole.entities.RankedStats.filter({ user_id: user.id });
  if (rankedRows.length > 0) {
    await base44.asServiceRole.entities.RankedStats.update(rankedRows[0].id, {
      username: payload.displayName,
      region: rankedRows[0].region || payload.region,
    });
    return;
  }

  await base44.asServiceRole.entities.RankedStats.create({
    user_id: user.id,
    username: playerName(user, payload.displayName),
    elo: 0,
    wins: 0,
    losses: 0,
    win_streak: 0,
    peak_elo: 0,
    matches_played: 0,
    region: payload.region,
    season: 1,
  });
}

async function ensureXp(base44, user, payload, now) {
  const xpRows = await base44.asServiceRole.entities.XPStats.filter({ user_id: user.id });
  if (xpRows.length > 0) {
    await base44.asServiceRole.entities.XPStats.update(xpRows[0].id, {
      username: payload.displayName,
      region: xpRows[0].region || payload.region,
    });
    return;
  }

  await base44.asServiceRole.entities.XPStats.create({
    user_id: user.id,
    username: playerName(user, payload.displayName),
    level: 1,
    current_xp: 0,
    total_xp: 0,
    xp_to_next_level: 1000,
    prestige: 0,
    weekly_xp: 0,
    daily_missions_completed: 0,
    win_streak: 0,
    region: payload.region,
    season: 1,
    last_played_date: now,
  });
}

async function completeRegistration(base44, authUser, body) {
  const requestedUsername = cleanUsername(body.username || authUser.username || authUser.email || authUser.id);
  const requestedHandle = cleanHandle(body.handle || requestedUsername);
  const username = await uniqueValue(base44, 'username', requestedUsername, authUser.id);
  const handle = await uniqueValue(base44, 'handle', requestedHandle || username, authUser.id);
  const displayName = displayNameFor(authUser, body.display_name || body.displayName || username);
  const region = body.region || authUser.region || 'na';

  if (!username || !handle || !displayName) {
    return Response.json({ error: 'Unable to derive username, display name, or handle' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = { username, handle, displayName, region };
  const user = await ensureUser(base44, authUser, payload);

  await ensureProfile(base44, user, payload, now);
  await ensureWallet(base44, user);
  await ensureRanked(base44, user, payload);
  await ensureXp(base44, user, payload, now);

  return Response.json({
    success: true,
    fallback_function: 'createWallet',
    user_id: user.id,
    username,
    handle,
    display_name: displayName,
    role: user.role,
    admin_role: user.admin_role || null,
    is_admin: Boolean(user.is_admin),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    if (body.action === 'completeRegistration' || body._action === 'completeRegistration') {
      return completeRegistration(base44, user, body);
    }

    const existingWallets = await base44.asServiceRole.entities.Wallet.filter({ user_id: user.id });
    if (existingWallets.length > 0) {
      return Response.json({ wallet: existingWallets[0], message: 'Wallet already exists' });
    }

    const wallet = await base44.asServiceRole.entities.Wallet.create({
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

    return Response.json({ wallet, message: 'Wallet created successfully' });
  } catch (error) {
    console.error('Create wallet error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
