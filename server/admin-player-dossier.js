import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { effectiveRoleForUser } from "../src/lib/roles.js";
import { adminUserRestrictionSql } from "./admin-users.js";
import { adminTimestampSql } from "./lib/adminTimestampSql.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const sections = new Set(["overview", "support", "matches", "history", "items", "wallet"]);
const fields = (source, keys) => Object.fromEntries(keys.filter(key => source?.[key] !== undefined).map(key => [key, source[key]]));
const LIMIT = 20;
const owned = id => ({ metadata: { path: ["user_id"], equals: id } });
const statsFields = ["wins", "losses", "elo", "rank", "rank_name", "division", "xp", "total_xp", "level", "matches_played", "win_streak"];
const membership = id => Prisma.sql`(
  metadata->>'host_id' = ${id} OR metadata->>'challenger_id' = ${id}
  OR metadata->>'player1_id' = ${id} OR metadata->>'player2_id' = ${id}
  OR metadata->'team_alpha_player_ids' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'team_bravo_player_ids' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'team_a_player_ids' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'team_b_player_ids' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'player_ids' @> ${JSON.stringify([id])}::jsonb
  OR jsonb_path_exists(metadata, '$.players[*] ? (@.user_id == $player)'::jsonpath, jsonb_build_object('player', ${id}::text))
)`;
const supportMember = id => Prisma.sql`(
  metadata->>'user_id' = ${id} OR metadata->>'reported_by' = ${id}
  OR metadata->>'reported_against' = ${id} OR metadata->'participant_ids' @> ${JSON.stringify([id])}::jsonb
  OR metadata->'participant_user_ids' @> ${JSON.stringify([id])}::jsonb
)`;

// This endpoint is deliberately read-only. Each tab requests a bounded view of
// one player; opening a name must not fetch platform-wide lists or chat logs.
export async function getAdminPlayerDossier(db, actor, payload = {}) {
  if (!hasRole(actor, "moderator")) fail("Moderator access required", 403);
  const id = typeof payload.user_id === "string" ? payload.user_id.trim() : "";
  if (!id || id.length > 200) fail("Choose a valid player.");
  const section = payload.section || "overview";
  if (!sections.has(section)) fail("Choose a valid player section.");
  const canViewMoney = hasRole(actor, "admin");
  if (section === "wallet" && !canViewMoney) fail("Admin access required to view balances", 403);
  const record = await db.user.findUnique({ where: { id }, select: {
    id: true, username: true, display_name: true, full_name: true, role: true, admin_role: true, is_admin: true,
    region: true, created_date: true, account_created_date: true, is_banned: true, is_premium: true, premium_expires: true,
    rank: true, division: true, xp_level: true, wager_wins: true, wager_losses: true, tournament_wins: true, trophies: true,
    ...(canViewMoney ? { email: true, ban_reason: true, credits: true } : {}), metadata: true,
  } });
  if (!record) fail("Player no longer exists", 404);
  const restrictions = adminUserRestrictionSql();
  const [status] = await db.$queryRaw`SELECT ${restrictions.banned} AS active_ban,
    (${restrictions.suspended}) AS active_suspension,
    (u.is_premium AND (u.premium_expires IS NULL OR u.premium_expires > NOW())) AS active_premium,
    ${adminTimestampSql(Prisma.sql`u.metadata->>'suspended_until'`)} AS suspended_until
    FROM "User" u WHERE u.id = ${id} LIMIT 1`;
  const player = { ...fields(record, ["id", "username", "display_name", "full_name", "region", "created_date", "account_created_date",
    "is_banned", "is_premium", "premium_expires", "rank", "division", "xp_level", "wager_wins", "wager_losses", "tournament_wins", "trophies"]),
    ...fields(record.metadata, ["avatar_url", "profile_picture_url", "activision_id", "verified_player", "is_verified_player"]),
    role: effectiveRoleForUser(record),
    active_ban: status?.active_ban === true, active_suspension: status?.active_suspension === true,
    active_premium: status?.active_premium === true, suspended_until: status?.suspended_until || null,
    ...(canViewMoney ? fields(record, ["email", "ban_reason", "credits"]) : {}),
  };
  const result = { success: true, player, section, permissions: { wallet: canViewMoney }, limit: LIMIT };
  if (section === "overview") {
    const [profile, ranked, xp, eightsRows] = await Promise.all([
      db.playerProfile.findFirst({ where: owned(id), orderBy: [{ created_date: "asc" }, { id: "asc" }], select: { metadata: true } }),
      ...["rankedStats", "xPStats"].map(model => db[model].findFirst({ where: owned(id), orderBy: [{ updated_date: "desc" }, { id: "desc" }], select: { metadata: true } })),
      // Older installations may not have the separate ELO column yet. Reading
      // it from the row representation remains compatible with those schemas.
      db.$queryRaw`SELECT metadata, to_jsonb(s)->'free_eights_elo' AS free_eights_elo FROM "EightsStats" s
        WHERE metadata->>'user_id' = ${id} ORDER BY updated_date DESC, id DESC LIMIT 1`,
    ]);
    const eights = eightsRows[0];
    // Profile presentation can be updated separately from the account.
    Object.assign(player, fields(profile?.metadata, ["avatar_url", "profile_picture_url", "activision_id"]));
    result.stats = { ranked: fields(ranked?.metadata, statsFields), xp: fields(xp?.metadata, statsFields), eights: { ...fields(eights?.metadata, statsFields), ...(eights?.free_eights_elo != null ? { elo: eights.free_eights_elo } : {}) } };
  }
  if (section === "support") {
    result.rows = await db.$queryRaw`SELECT * FROM (
      (SELECT id, 'ticket' AS kind, created_date, updated_date,
        COALESCE(metadata->>'subject', 'Support request') AS title, COALESCE(metadata->>'status', 'open') AS status,
        metadata->>'assigned_admin_name' AS staff_name, metadata->>'requested_admin' = 'true' AS admin_requested,
        metadata->>'match_id' AS match_id, metadata->>'match_type' AS match_type
        FROM "Ticket" WHERE ${supportMember(id)} ORDER BY updated_date DESC, id DESC LIMIT 20)
      UNION ALL
      (SELECT id, 'dispute' AS kind, created_date, updated_date,
        COALESCE(metadata->>'reason', 'Match dispute') AS title, COALESCE(metadata->>'status', 'pending') AS status,
        metadata->>'assigned_admin_name' AS staff_name, FALSE AS admin_requested,
        COALESCE(metadata->>'match_id', metadata->>'wager_id') AS match_id, metadata->>'match_type' AS match_type
        FROM "Dispute" WHERE ${supportMember(id)}
          AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t.id = "Dispute".metadata->>'ticket_id' OR t.metadata->>'dispute_id' = "Dispute".id)
        ORDER BY updated_date DESC, id DESC LIMIT 20)
    ) cases ORDER BY updated_date DESC, kind, id DESC LIMIT 20`;
  }
  if (section === "matches") {
    const installed = await db.$queryRaw`SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()
      AND tablename IN ('XPMatch', 'RankedMatch', 'Wager', 'TournamentMatch', 'ChallengeMatch', 'WagerParticipant', 'TournamentParticipant')`;
    const tables = new Set(installed.map(row => row.name));
    result.unavailable_sources = [["XPMatch", "XP matches"], ["RankedMatch", "Ranked matches"], ["Wager", "Wagers & 8s"], ["TournamentMatch", "Tournaments"], ["ChallengeMatch", "Team challenges"]]
      .filter(([table]) => !tables.has(table)).map(([, name]) => name);
    const parts = [["XPMatch", "xp"], ["RankedMatch", "ranked"], ["Wager", "wager"], ["TournamentMatch", "tournament"], ["ChallengeMatch", "challenge"]]
      .filter(([table]) => tables.has(table))
      .map(([table, type]) => Prisma.sql`(SELECT id, ${type}::text AS kind, created_date, updated_date,
        ${table === "ChallengeMatch" ? Prisma.sql`status` : Prisma.sql`COALESCE(metadata->>'status', 'open')`} AS status,
        COALESCE(metadata->>'title', metadata->>'name', metadata->>'game', ${type}) AS title,
        metadata->>'game' AS game, metadata->>'game_mode' AS game_mode,
        metadata->>'host_name' AS host_name, metadata->>'challenger_name' AS challenger_name,
        metadata->>'match_type' AS match_type
        FROM ${Prisma.raw(`"${table}"`)} WHERE ${membership(id)}
        ${table === "Wager" && tables.has("WagerParticipant") ? Prisma.sql`OR id IN (SELECT metadata->>'wager_id' FROM "WagerParticipant" WHERE metadata->>'user_id' = ${id})` : Prisma.empty}
        ${table === "TournamentMatch" && tables.has("TournamentParticipant") ? Prisma.sql`OR EXISTS (SELECT 1 FROM "TournamentParticipant" p
          WHERE (p.metadata->>'user_id' = ${id} OR p.metadata->>'captain_id' = ${id}
            OR jsonb_path_exists(p.metadata, '$.members[*] ? (@.user_id == $player)'::jsonpath, jsonb_build_object('player', ${id}::text)))
          AND (p.id IN ("TournamentMatch".metadata->>'team_a_participant_id', "TournamentMatch".metadata->>'team_b_participant_id', "TournamentMatch".metadata->>'team_a_id', "TournamentMatch".metadata->>'team_b_id')
            OR (p.metadata->>'tournament_id' = "TournamentMatch".metadata->>'tournament_id'
              AND (p.metadata->>'team_id' IN ("TournamentMatch".metadata->>'team_a_id', "TournamentMatch".metadata->>'team_b_id')
                OR p.metadata->>'user_id' IN ("TournamentMatch".metadata->>'team_a_id', "TournamentMatch".metadata->>'team_b_id')))))` : Prisma.empty}
        ORDER BY updated_date DESC, id DESC LIMIT 20)`);
    result.rows = parts.length ? await db.$queryRaw(Prisma.sql`SELECT * FROM (${Prisma.join(parts, " UNION ALL ")}) matches ORDER BY updated_date DESC, kind, id DESC LIMIT 20`) : [];
  }
  if (section === "history") {
    // No metadata, network identifiers, credentials, or raw audit payloads are
    // returned. Existing audit detail permissions continue to apply there.
    result.rows = await db.$queryRaw`SELECT id, created_date,
      COALESCE(metadata->>'action_type', metadata->>'action', 'staff_action') AS action,
      COALESCE(metadata->>'admin_name', metadata->>'actor_name', 'Staff') AS staff_name,
      ${canViewMoney ? Prisma.sql`LEFT(COALESCE(metadata->>'description', metadata->>'reason', ''), 350)` : Prisma.sql`''::text`} AS description
      FROM "AdminAction" WHERE metadata->>'target_user_id' = ${id} OR metadata->>'target_id' = ${id}
      ORDER BY created_date DESC, id DESC LIMIT 20`;
  }
  if (section === "items") {
    const rows = await db.userInventory.findMany({ where: owned(id), orderBy: [{ created_date: "desc" }, { id: "desc" }], take: LIMIT,
      select: { id: true, created_date: true, metadata: true } });
    result.rows = rows.map(row => ({ id: row.id, created_date: row.created_date, ...fields(row.metadata, ["item_id", "item_name", "name", "item_type", "type", "quantity", "is_equipped", "equipped"]) }));
  }
  if (section === "wallet") {
    const [wallet, transactions] = await Promise.all([
      db.wallet.findFirst({ where: owned(id), orderBy: [{ created_date: "asc" }, { id: "asc" }], select: { metadata: true } }),
      db.walletTransaction.findMany({ where: owned(id), orderBy: [{ created_date: "desc" }, { id: "desc" }], take: LIMIT,
        select: { id: true, created_date: true, metadata: true } }),
    ]);
    result.wallet = { available_balance: 0, locked_balance: 0, pending_balance: 0, ...fields(wallet?.metadata, ["available_balance", "locked_balance", "pending_balance", "withdrawable_balance"]) };
    result.rows = transactions.map(row => ({ id: row.id, created_date: row.created_date,
      ...fields(row.metadata, ["type", "amount", "status", "description", "reason", "balance_after"]) }));
  }
  return result;
}
