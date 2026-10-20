import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { knownUserIpAddresses, normalizeIpAddress, requestIpAddress } from "./ban-enforcement.js";
import { effectiveRoleForUser, hasRolePower } from "../src/lib/roles.js";
import { isCloudflareIp } from "../src/lib/cloudflareIps.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const requireAdmin = (actor) => { if (!hasRole(actor, "admin")) fail("Admin access required", 403); };
const sqlTable = (table) => Prisma.raw(`"${table}"`); // Names below are application constants.
const references = (id) => Prisma.sql`jsonb_path_exists(metadata, '$.** ? (@ == $userId)'::jsonpath, jsonb_build_object('userId', ${id}::text))`;
const nameFor = (user) => user.display_name || user.full_name || user.username || "Player";

export async function getAdminUserCount(db, actor) {
  if (!hasRole(actor, "moderator")) fail("Moderator access required", 403);
  return { success: true, total: await db.user.count() };
}

export async function setAdminUserVpnAccess(db, actor, body = {}) {
  if (!hasRole(actor, "ceo")) fail("Only CEOs can manage VPN exceptions", 403);
  const id = typeof body.user_id === "string" ? body.user_id : "";
  if (!id || id.length > 200 || typeof body.allowed !== "boolean" || typeof body.expected_allowed !== "boolean") {
    fail("Choose an account and a valid VPN access setting.");
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length > 500) fail("Use a reason of at most 500 characters.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    const target = await tx.user.findUnique({ where: { id }, select: {
      id: true, username: true, display_name: true, full_name: true, vpn_access_allowed: true,
    } });
    if (!target) fail("User not found", 404);
    if (target.vpn_access_allowed === body.allowed) return { success: true, user: { id, vpn_access_allowed: body.allowed }, unchanged: true };
    if (target.vpn_access_allowed !== body.expected_allowed) fail("VPN access changed. Refresh the player and try again.", 409);
    const user = await tx.user.update({ where: { id }, data: { vpn_access_allowed: body.allowed },
      select: { id: true, vpn_access_allowed: true } });
    await tx.adminAction.create({ data: { metadata: {
      admin_id: actor.id, admin_name: nameFor(actor), admin_role: "ceo",
      action_type: body.allowed ? "user_vpn_access_allowed" : "user_vpn_access_removed",
      target_user_id: id, target_username: nameFor(target),
      description: `VPN exception ${body.allowed ? "enabled" : "removed"} for ${nameFor(target)}.`,
      reason: reason || (body.allowed ? "CEO approved a personal VPN exception." : "CEO restored standard connection protection."),
      details: { previous_allowed: target.vpn_access_allowed, allowed: body.allowed },
    } } });
    await tx.notification.create({ data: { metadata: {
      user_id: id, title: body.allowed ? "VPN access approved" : "VPN exception removed",
      message: body.allowed ? "An admin approved VPN access for your account. You can sign in again. Existing account restrictions still apply."
        : "An admin removed your VPN exception. Use your regular internet connection to sign in.",
      type: "system", is_read: false, action_url: "/login",
    } } });
    return { success: true, user };
  });
}

const directoryFields = ["id", "username", "handle", "display_name", "full_name", "role", "admin_role", "is_admin",
  "created_date", "updated_date", "account_created_date", "is_banned", "is_premium", "premium_expires", "region",
  "badges", "verified_player", "is_verified_player", "streamer_badge", "is_streamer", "force_stream_required",
  "stream_override_required", "monitor_cam_required", "required_monitor_cam", "moni_cam_required", "monitor_cam_override_required"];

export async function getAdminUsers(db, actor, body = {}) {
  if (!hasRole(actor, "moderator")) fail("Moderator access required", 403);
  const admin = hasRole(actor, "admin");
  const search = String(body.search || "").trim().toLowerCase().slice(0, 200);
  const sharedOnly = admin && body.shared_only === true;
  const includeSecurity = admin && (body.include_security !== false || sharedOnly);
  let cursor = null;
  if (body.cursor) {
    try {
      cursor = JSON.parse(Buffer.from(String(body.cursor), "base64url").toString("utf8"));
      if (!cursor.id || typeof cursor.id !== "string" || cursor.id.length > 200 || !Number.isFinite(Date.parse(cursor.date))) throw new Error();
    } catch { fail("Invalid user page. Refresh the list."); }
  }
  // Only the small IP/identity index is read across accounts. Full account rows
  // are fetched in pages of 25, including when searching or filtering shared IPs.
  const ipRows = includeSecurity ? await db.$queryRaw`SELECT id, username, display_name, full_name,
    jsonb_build_object('registration_ip', metadata->'registration_ip', 'last_login_ip', metadata->'last_login_ip',
      'last_seen_ip', metadata->'last_seen_ip', 'ip_history', metadata->'ip_history') AS metadata FROM "User"` : [];
  const byIp = new Map(), shared = new Map();
  for (const user of ipRows) for (const ip of knownUserIpAddresses(user)) {
    if (!byIp.has(ip)) byIp.set(ip, []);
    byIp.get(ip).push(user);
  }
  for (const users of byIp.values()) if (users.length > 1) for (const user of users) {
    if (!shared.has(user.id)) shared.set(user.id, new Map());
    for (const other of users) if (other.id !== user.id) shared.get(user.id).set(other.id, nameFor(other));
  }
  const sharedIds = [...shared.keys()];
  const sharedWhere = sharedOnly ? (sharedIds.length ? Prisma.sql`id IN (${Prisma.join(sharedIds)})` : Prisma.sql`FALSE`) : Prisma.sql`TRUE`;
  const searchWhere = search ? Prisma.sql`(
    POSITION(${search} IN LOWER(CONCAT_WS(' ', username, handle, display_name, full_name, role, admin_role))) > 0
    ${admin ? Prisma.sql`OR POSITION(${search} IN LOWER(COALESCE(email, ''))) > 0
      OR POSITION(${search} IN CONCAT_WS(' ', metadata->>'registration_ip', metadata->>'last_login_ip', metadata->>'last_seen_ip', metadata->'ip_history')) > 0` : Prisma.empty}
  )` : Prisma.sql`TRUE`;
  const cursorWhere = cursor ? Prisma.sql`(created_date, id) < (${new Date(cursor.date)}, ${cursor.id})` : Prisma.sql`TRUE`;
  const [candidates, counts] = await Promise.all([
    db.$queryRaw`SELECT * FROM "User" WHERE ${sharedWhere} AND ${searchWhere} AND ${cursorWhere} ORDER BY created_date DESC, id DESC LIMIT 26`,
    db.$queryRaw`SELECT COUNT(*)::int AS total FROM "User" WHERE ${sharedWhere} AND ${searchWhere}`,
  ]);
  const page = candidates.slice(0, 25);
  const rows = page.map((user) => {
    const flat = { ...user.metadata, ...user };
    const result = Object.fromEntries(directoryFields.filter((key) => flat[key] !== undefined).map((key) => [key, flat[key]]));
    if (admin || user.id === actor.id) result.email = user.email;
    if (hasRole(actor, "ceo")) result.vpn_access_allowed = user.vpn_access_allowed === true;
    if (admin) {
      for (const key of ["credits", "wallet_balance", "ban_reason"]) result[key] = user[key];
      if (includeSecurity) {
        for (const key of ["registration_ip", "last_login_ip", "last_seen_ip", "ip_history"]) result[key] = user.metadata?.[key];
        result.shared_ip_account_count = shared.get(user.id)?.size || 0;
        result.shared_ip_account_names = [...(shared.get(user.id)?.values() || [])];
      }
    }
    return result;
  });
  const last = page.at(-1);
  return { success: true, rows, total: counts[0].total, next_cursor: candidates.length > 25 && last
    ? Buffer.from(JSON.stringify({ id: last.id, date: last.created_date.toISOString() })).toString("base64url") : null };
}

export async function getAdminUserSecurity(db, req) {
  requireAdmin(req.user);
  const user = await db.user.findUnique({ where: { id: String(req.body.user_id || "") } });
  if (!user) fail("User not found", 404);
  const ips = knownUserIpAddresses(user);
  // Read only identity and IP fields, including accounts beyond the console's
  // first page. Normalize in one place so IPv6 spellings do not split matches.
  const candidates = ips.length ? await db.$queryRaw`SELECT id, username, display_name, full_name, created_date, is_banned,
    jsonb_build_object('registration_ip', metadata->'registration_ip', 'last_login_ip', metadata->'last_login_ip',
      'last_seen_ip', metadata->'last_seen_ip', 'ip_history', metadata->'ip_history') AS metadata FROM "User"` : [];
  const shared = candidates.filter((candidate) => candidate.id !== user.id).flatMap((candidate) => {
    const matching = knownUserIpAddresses(candidate).filter((ip) => ips.includes(ip));
    return matching.length ? [{ id: candidate.id, username: candidate.username, name: nameFor(candidate),
      shared_ips: matching, is_banned: candidate.is_banned, created_date: candidate.created_date }] : [];
  });
  const history = Array.isArray(user.metadata?.ip_history) ? user.metadata.ip_history : [];
  const proxyIps = new Set([user.metadata?.registration_ip, user.metadata?.last_login_ip, user.metadata?.last_seen_ip,
    ...history.map((entry) => entry?.ip)].filter(isCloudflareIp));
  return { success: true, ips, history: history.filter((entry) => ips.includes(normalizeIpAddress(entry?.ip))), shared_accounts: shared,
    excluded_proxy_ip_count: proxyIps.size,
    incoming_ip_captured: Boolean(requestIpAddress(req)),
    proxy_header_present: Boolean(req.headers["x-forwarded-for"] || req.headers["x-real-ip"]),
  };
}

const ownedTables = [
  "Session", "UserSettings", "PlayerProfile", "Wallet", "RankedStats", "XPStats", "EightsStats",
  "RankedReward", "RankedLeaderboard", "XPLeaderboard", "WagerLeaderboard", "TournamentLeaderboard", "Leaderboard",
  "Inventory", "UserInventory", "PremiumMembership", "KnifeUnlock", "Notification", "Achievement", "Achievements",
  "Statistic", "Statistics", "TeamMember", "WagerParticipant", "EightsLobbyParticipant", "MatchHistory", "ActivityFeed",
];
const sharedTables = [
  "Wager", "XPMatch", "RankedMatch", "TournamentMatch", "TournamentParticipant", "TournamentWin", "Tournament",
  "ChallengeMatch", "Team", "TeamMatch", "EightsLobby", "Ticket", "SupportTicket", "Dispute", "WagerDispute",
  "AdminAlert", "Message", "ChatMessage", "Conversation", "TradeOffer", "Purchase", "CreditPurchase",
  "WalletTransaction", "CreditTransaction", "WithdrawalRequest", "DepositRequest", "AdminAction", "AuditLog", "SystemLog",
  "MapVeto", "WagerMatch", "TryoutRoom", "DiscordEventDispatch",
];
const activeStatuses = ["completed", "cancelled", "canceled", "closed", "expired", "resolved", "finished", "rejected", "draft"];
const playerRef = (id) => Prisma.sql`(
  metadata->>'host_id' = ${id} OR metadata->>'challenger_id' = ${id}
  OR metadata->'team_alpha_player_ids' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'team_bravo_player_ids' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'team_alpha' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'team_bravo' @> ${JSON.stringify([id])}::jsonb
  OR jsonb_path_exists(metadata, '$.players[*] ? (@.user_id == $userId)'::jsonpath, jsonb_build_object('userId', ${id}::text))
)`;

function anonymize(value, id) {
  if (Array.isArray(value)) return value.map((item) => anonymize(item, id));
  if (!value || typeof value !== "object") return value;
  const clean = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, anonymize(item, id)]));
  const pairedNames = { host_id: "host", challenger_id: "challenger", sender_id: "sender", recipient_id: "recipient",
    reported_by: "reported_by", reported_against: "reported_against", assigned_admin_id: "assigned_admin",
    resolved_by: "resolved_by", captain_id: "captain", owner_id: "owner", author_id: "author" };
  for (const [field, prefix] of Object.entries(pairedNames)) {
    if (value[field] !== id) continue;
    for (const key of [`${prefix}_name`, `${prefix}_username`, `${prefix}_display_name`]) if (key in clean) clean[key] = "Deleted player";
    for (const key of [`${prefix}_avatar_url`, `${prefix}_email`, `${prefix}_discord_id`]) delete clean[key];
  }
  if (value.user_id === id || value.id === id || value.subject_id === id) {
    for (const key of ["username", "user_name", "display_name", "full_name", "name"]) if (key in clean) clean[key] = "Deleted player";
    for (const key of ["email", "avatar_url", "profile_picture_url", "activision_id", "discord_user_id", "twitch_user_id", "ip_history", "registration_ip", "last_login_ip", "last_seen_ip"]) delete clean[key];
    if ("description" in clean) clean.description = "Content removed with the deleted account.";
  }
  if (value.sender_id === id || value.reported_by === id) {
    for (const key of ["content", "message", "description"]) if (key in clean) clean[key] = "Content removed with the deleted account.";
  }
  for (const side of ["alpha", "bravo"]) {
    const ids = value[`team_${side}_player_ids`];
    const names = clean[`team_${side}_player_names`];
    if (Array.isArray(ids) && Array.isArray(names)) clean[`team_${side}_player_names`] = names.map((name, index) => ids[index] === id ? "Deleted player" : name);
  }
  return clean;
}

export async function deleteAdminUser(db, actor, body = {}) {
  return deleteAccountRecords(db, actor, body);
}

export async function deleteOwnAccount(db, actor, body, verifyPassword, { testCurrencyOnly = process.env.TEST_CURRENCY_ONLY === "true" } = {}) {
  return deleteAccountRecords(db, actor, { ...body, user_id: actor.id, reason: "Account deletion requested and confirmed by the account owner." }, verifyPassword, testCurrencyOnly);
}

async function deleteAccountRecords(db, actor, body = {}, verifyOwnPassword = null, testCurrencyOnly = false) {
  if (!verifyOwnPassword) requireAdmin(actor);
  const id = String(body.user_id || "");
  if (!verifyOwnPassword && id === actor.id) fail("You cannot delete your own account from the admin console.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`voice-membership:${id}`}))`;
    const target = await tx.user.findUnique({ where: { id } });
    if (!target) fail("User not found", 404);
    const targetRole = effectiveRoleForUser(target), actorRole = effectiveRoleForUser(actor);
    if (verifyOwnPassword) {
      if (target.id !== actor.id) fail("You can only delete your own account.", 403);
      if (targetRole === "ceo") fail("Transfer platform ownership before deleting an owner account.", 409);
      if (typeof body.password !== "string" || !body.password || body.password.length > 256 || !target.password_hash || !await verifyOwnPassword(body.password, target.password_hash)) fail("Enter your current password to delete this account.", 401);
      const wallets = await tx.wallet.findMany({ where: { metadata: { path: ["user_id"], equals: id } } });
      if (!testCurrencyOnly && (Number(target.wallet_balance || 0) !== 0 || wallets.some(wallet => ["available_balance", "withdrawable_balance", "locked_balance", "pending_balance"].some(key => Number(wallet.metadata?.[key] || 0) !== 0)))) fail("Your account has funds or pending funds. Contact support to settle them before permanent deletion.", 409);
    } else if (hasRolePower(targetRole, actorRole)) fail("You can only delete accounts with a lower role than your own.", 403);
    if (body.confirmation !== (target.username || target.email) || String(body.reason || "").trim().length < 5) fail("Enter the exact account name and a reason for deleting this account.");
    for (const table of ["Wager", "XPMatch", "RankedMatch", "TournamentMatch", "ChallengeMatch"]) {
      const status = table === "ChallengeMatch" ? Prisma.sql`status` : Prisma.sql`COALESCE(metadata->>'status', 'open')`;
      const membership = table === "Wager" ? Prisma.sql`OR id IN (SELECT metadata->>'wager_id' FROM "WagerParticipant" WHERE metadata->>'user_id' = ${id})` : Prisma.empty;
      const [active] = await tx.$queryRaw(Prisma.sql`SELECT id FROM ${sqlTable(table)} WHERE ${status} NOT IN (${Prisma.join(activeStatuses)}) AND (${playerRef(id)} ${membership}) LIMIT 1`);
      if (active) fail(`Finish or cancel this player's active matches before deleting the account (${table} #${active.id.slice(-8)}).`, 409);
    }
    const [registration] = await tx.$queryRaw`SELECT id FROM "TournamentParticipant" WHERE ${references(id)}
      AND COALESCE(metadata->>'status', 'registered') NOT IN ('withdrawn', 'cancelled', 'eliminated', 'rejected')
      AND metadata->>'tournament_id' IN (SELECT id FROM "Tournament" WHERE COALESCE(metadata->>'status', 'open')
        NOT IN ('completed', 'cancelled', 'finished')) LIMIT 1`;
    if (registration) fail("Remove this player from their active tournament registration before deleting the account.", 409);
    const [pending] = await tx.$queryRaw`SELECT id FROM "WithdrawalRequest" WHERE metadata->>'user_id' = ${id}
      AND COALESCE(metadata->>'status', 'pending') IN ('pending', 'processing', 'approved') LIMIT 1`;
    if (pending) fail("Complete or reject the pending withdrawal before deleting this account.", 409);
    const [trade] = await tx.$queryRaw`SELECT id FROM "TradeOffer" WHERE (metadata->>'sender_id' = ${id} OR metadata->>'recipient_id' = ${id})
      AND COALESCE(metadata->>'status', 'pending') IN ('pending', 'accepted', 'processing') LIMIT 1`;
    if (trade) fail("Close pending trades before deleting this account.", 409);

    // A shared team needs a real captain, rather than an orphaned user reference.
    const teams = await tx.team.findMany({ where: { OR: ["captain_id", "owner_id", "leader_id"].map((key) => ({ metadata: { path: [key], equals: id } })) } });
    for (const team of teams) {
      const members = await tx.teamMember.findMany({ where: { metadata: { path: ["team_id"], equals: team.id } }, orderBy: { created_date: "asc" } });
      const successorId = members.find((row) => row.metadata?.user_id !== id && row.metadata?.is_active !== false)?.metadata?.user_id;
      const successor = successorId ? await tx.user.findUnique({ where: { id: successorId } }) : null;
      if (successor) {
        const metadata = { ...team.metadata };
        for (const key of ["captain_id", "owner_id", "leader_id"]) if (metadata[key] === id) metadata[key] = successor.id;
        if (team.metadata.captain_id === id) metadata.captain_name = nameFor(successor);
        if (team.metadata.owner_id === id && "owner_name" in metadata) metadata.owner_name = nameFor(successor);
        await tx.team.update({ where: { id: team.id }, data: { metadata } });
      } else {
        await tx.team.delete({ where: { id: team.id } });
        await tx.teamInvite.deleteMany({ where: { metadata: { path: ["team_id"], equals: team.id } } });
        await tx.teamMember.deleteMany({ where: { metadata: { path: ["team_id"], equals: team.id } } });
        await tx.challengeStanding.deleteMany({ where: { kind: "team", subject_id: team.id } });
      }
    }
    for (const table of ownedTables) {
      await tx.$executeRaw(Prisma.sql`DELETE FROM ${sqlTable(table)} WHERE metadata->>'user_id' = ${id} OR id = ${id}`);
    }
    for (const table of ["FriendRequest", "Friendship", "BlockedUser", "TeamInvite"]) {
      await tx.$executeRaw(Prisma.sql`DELETE FROM ${sqlTable(table)} WHERE ${references(id)}`);
    }
    // Delete messages written by this account. Shared room results stay available.
    for (const table of ["Message", "ChatMessage"]) await tx.$executeRaw(Prisma.sql`DELETE FROM ${sqlTable(table)} WHERE metadata->>'sender_id' = ${id}`);
    for (const table of sharedTables) {
      const rows = await tx.$queryRaw(Prisma.sql`SELECT id, metadata FROM ${sqlTable(table)} WHERE ${references(id)}`);
      for (const row of rows) await tx.$executeRaw(Prisma.sql`UPDATE ${sqlTable(table)} SET metadata = ${JSON.stringify(anonymize(row.metadata, id))}::jsonb WHERE id = ${row.id}`);
    }
    await tx.rankVerification.deleteMany({ where: { user_id: id } });
    await tx.referralReward.deleteMany({ where: { OR: [{ referred_user_id: id }, { referrer_user_id: id }] } });
    await tx.referralCode.deleteMany({ where: { user_id: id } });
    await tx.challengeStanding.deleteMany({ where: { kind: "solo", subject_id: id } });
    await tx.user.delete({ where: { id } });
    await tx.adminAction.create({ data: { metadata: { admin_id: actor.id, admin_name: nameFor(actor), action_type: "account_deleted",
      description: "Permanently deleted an account and its private records", target_id: id, reason: String(body.reason).trim() } } });
    return { success: true, deleted_user_id: id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
