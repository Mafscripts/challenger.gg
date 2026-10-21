import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { getAdminTicketCounts } from "./admin-tickets.js";
import { getAdminWalletSummary } from "./admin-wallets.js";

// Moderation dates are written as ISO timestamps. Unknown legacy values mean
// no expiry, matching enforcement; never use an expired ban flag as active.
const dateValue = (value) => Prisma.sql`CASE WHEN ${value} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}:[0-9]{2})?' THEN (${value})::timestamptz END`;
const banExpiry = dateValue(Prisma.sql`metadata->>'expires_date'`);
const accountBanExpiry = dateValue(Prisma.sql`u.metadata->>'ban_expires'`);
const suspensionExpiry = dateValue(Prisma.sql`u.metadata->>'suspended_until'`);
const terminalStatuses = ["completed", "cancelled", "canceled", "closed", "expired", "resolved", "finished", "rejected", "draft"];

export async function getAdminDashboard(db, actor) {
  if (!hasRole(actor, "moderator")) throw Object.assign(new Error("Moderator access required"), { status: 403 });
  const [players, matches, operations, tickets, economy, appeals] = await Promise.all([
    db.$queryRaw`WITH active_bans AS (
      SELECT metadata, ${banExpiry} AS expires FROM "Ban"
      WHERE metadata->>'status' = 'active' AND (${banExpiry} IS NULL OR ${banExpiry} > NOW())
    ), players AS (
      SELECT u.id, u.created_date, u.email_verified, u.is_premium, u.premium_expires, u.role, u.admin_role, u.is_admin, (
        (u.is_banned AND (${accountBanExpiry} IS NULL OR ${accountBanExpiry} > NOW()))
        OR EXISTS (SELECT 1 FROM active_bans b WHERE b.metadata->>'user_id' = u.id
          OR (b.metadata->'scope' @> '["email"]'::jsonb AND LOWER(b.metadata->>'email') = LOWER(u.email)))
      ) AS banned,
      ((u.is_banned AND ${accountBanExpiry} IS NULL) OR EXISTS (SELECT 1 FROM active_bans b
        WHERE b.expires IS NULL AND (b.metadata->>'user_id' = u.id
          OR (b.metadata->'scope' @> '["email"]'::jsonb AND LOWER(b.metadata->>'email') = LOWER(u.email))))) AS permanent,
      ${suspensionExpiry} > NOW() AS suspended
      FROM "User" u
    ) SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE banned)::int AS banned,
      COUNT(*) FILTER (WHERE banned AND permanent)::int AS permanent_bans,
      COUNT(*) FILTER (WHERE banned AND NOT permanent)::int AS temporary_bans,
      COUNT(*) FILTER (WHERE suspended AND NOT banned)::int AS suspended,
      COUNT(*) FILTER (WHERE NOT banned AND NOT COALESCE(suspended, FALSE))::int AS unrestricted,
      COUNT(*) FILTER (WHERE email_verified)::int AS verified_email,
      COUNT(*) FILTER (WHERE is_premium AND (premium_expires IS NULL OR premium_expires > NOW()))::int AS premium,
      COUNT(*) FILTER (WHERE role IN ('ceo', 'super_admin', 'admin', 'moderator')
        OR admin_role IN ('ceo', 'super_admin', 'admin', 'moderator') OR is_admin)::int AS staff,
      COUNT(*) FILTER (WHERE created_date >= NOW() - INTERVAL '24 hours')::int AS new_24h,
      COUNT(*) FILTER (WHERE created_date >= NOW() - INTERVAL '7 days')::int AS new_7d,
      COUNT(*) FILTER (WHERE created_date >= NOW() - INTERVAL '30 days')::int AS new_30d,
      (SELECT COUNT(DISTINCT NULLIF(metadata->>'ip', ''))::int FROM active_bans WHERE metadata->'scope' @> '["ip"]'::jsonb) AS blocked_ips,
      (SELECT COUNT(*)::int FROM active_bans) AS active_ban_records
      FROM players`,
    db.$queryRaw`WITH rooms AS (
      SELECT CASE WHEN metadata->>'match_type' = '8s' THEN 'free8s'
        WHEN metadata->>'match_type' = 'money8s' THEN 'money8s' ELSE 'wagers' END AS kind,
        COALESCE(metadata->>'status', 'open') AS status, created_date,
        GREATEST(${dateValue(Prisma.sql`metadata->>'free_eights_reopened_at'`)}, created_date)
          + CASE WHEN metadata->>'match_type' = '8s' THEN INTERVAL '1 hour' ELSE INTERVAL '30 minutes' END AS expires,
        FALSE AS completed FROM "Wager"
      UNION ALL SELECT 'xp', COALESCE(metadata->>'status', 'open'), created_date,
        CASE WHEN NULLIF(metadata->>'challenger_id', '') IS NULL THEN created_date + INTERVAL '30 minutes' END,
        FALSE FROM "XPMatch"
      UNION ALL SELECT 'ranked', COALESCE(metadata->>'status', 'open'), created_date,
        created_date + INTERVAL '30 minutes', FALSE FROM "RankedMatch"
      UNION ALL SELECT 'tournament', COALESCE(metadata->>'status', 'pending'), created_date, NULL,
        COALESCE(metadata->>'completed', 'false') = 'true' FROM "TournamentMatch"
      UNION ALL SELECT 'challenge', status, created_date, NULL, FALSE FROM "ChallengeMatch"
    ) SELECT kind, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status NOT IN (${Prisma.join(terminalStatuses)}) AND NOT completed
        AND (status <> 'open' OR expires IS NULL OR expires > NOW()))::int AS active,
      COUNT(*) FILTER (WHERE status = 'completed' OR completed)::int AS completed,
      COUNT(*) FILTER (WHERE status IN ('disputed', 'score_conflict'))::int AS disputed,
      COUNT(*) FILTER (WHERE created_date >= NOW() - INTERVAL '24 hours')::int AS created_24h
      FROM rooms GROUP BY kind`,
    db.$queryRaw`SELECT
      (SELECT COUNT(*)::int FROM "Team" WHERE COALESCE(metadata->>'is_active', 'true') <> 'false') AS teams,
      (SELECT COUNT(*)::int FROM "TeamInvite" WHERE metadata->>'status' = 'pending') AS team_invites,
      (SELECT COUNT(*)::int FROM "AdminAlert" WHERE COALESCE(metadata->>'status', 'open') NOT IN ('acknowledged', 'resolved', 'closed')) AS alerts,
      (SELECT COUNT(*)::int FROM "Tournament" WHERE metadata->>'status' IN ('open', 'registration')) AS tournament_registration,
      (SELECT COUNT(*)::int FROM "Tournament" WHERE metadata->>'status' IN ('live', 'in_progress')) AS tournament_live,
      (SELECT COUNT(*)::int FROM "Tournament" WHERE metadata->>'status' = 'completed') AS tournament_completed,
      (SELECT COUNT(*)::int FROM "Tournament") AS tournaments,
      (SELECT COUNT(*)::int FROM "RankVerification" WHERE status = 'manual_review') AS rank_reviews,
      (SELECT COUNT(*)::int FROM "MarketplaceItem") AS marketplace_items,
      (SELECT COUNT(*)::int FROM "UserInventory") AS owned_items,
      (SELECT COUNT(*)::int FROM "AdminAction") AS audit_actions,
      (SELECT COUNT(*)::int FROM "SystemLog") AS system_logs,
      (SELECT COUNT(*)::int FROM "AdminAction" WHERE created_date >= NOW() - INTERVAL '24 hours') AS staff_actions_24h`,
    getAdminTicketCounts(db, actor),
    hasRole(actor, "admin") ? Promise.all([
      getAdminWalletSummary(db, actor),
      db.$queryRaw`SELECT COUNT(*) FILTER (WHERE metadata->>'status' = 'pending')::int AS pending_withdrawals,
        COALESCE(SUM(CASE WHEN metadata->>'status' = 'pending' AND metadata->>'amount' ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (metadata->>'amount')::numeric ELSE 0 END), 0)::float8 AS pending_withdrawal_amount FROM "WithdrawalRequest"`,
    ]).then(([wallet, [withdrawals]]) => ({ ...wallet, ...withdrawals })) : null,
    hasRole(actor, "ceo") ? db.banAppeal.count({ where: { status: "awaiting_ceo" } }) : null,
  ]);
  const kinds = ["free8s", "money8s", "xp", "ranked", "tournament", "challenge", "wagers"];
  return {
    success: true, generated_at: new Date().toISOString(), players: players[0],
    matches: Object.fromEntries(kinds.map((kind) => [kind, matches.find((row) => row.kind === kind)
      || { kind, total: 0, active: 0, completed: 0, disputed: 0, created_24h: 0 }])),
    operations: operations[0], support: { ...tickets, appeals }, economy,
  };
}
