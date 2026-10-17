import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { serializeRow } from "./entity.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const cents = (value) => Math.round(Number(value || 0) * 100);
const nameFor = (user) => user.display_name || user.full_name || user.username || "Player";
const walletIndexSql = Prisma.sql`WITH wallets AS (
  SELECT DISTINCT ON (metadata->>'user_id') metadata->>'user_id' AS user_id, id, metadata
  FROM "Wallet" ORDER BY metadata->>'user_id', created_date ASC, id ASC
)`;
const walletJoin = Prisma.sql`LEFT JOIN wallets w ON w.user_id = u.id`;
const balanceSql = Prisma.sql`COALESCE((w.metadata->>'available_balance')::numeric, u.wallet_balance, 0)`;

export async function getAdminWalletSummary(db, actor) {
  if (!hasRole(actor, "admin")) fail("Admin access required", 403);
  const [summary] = await db.$queryRaw`${walletIndexSql} SELECT COUNT(*)::int AS total,
    COALESCE(SUM(${balanceSql}), 0)::float8 AS available,
    COALESCE(SUM((w.metadata->>'pending_balance')::numeric), 0)::float8 AS pending,
    COALESCE(SUM((w.metadata->>'escrow_balance')::numeric), 0)::float8 AS escrow,
    COALESCE(SUM(u.credits), 0)::float8 AS credits FROM "User" u ${walletJoin}`;
  return { success: true, ...summary };
}

export async function getAdminWallets(db, actor, body = {}) {
  if (!hasRole(actor, "admin")) fail("Admin access required", 403);
  const search = String(body.search || "").trim().toLowerCase().slice(0, 200);
  const filter = ["funded", "held"].includes(body.filter) ? body.filter : "all";
  const searchSql = search ? Prisma.sql`POSITION(${search} IN LOWER(CONCAT_WS(' ', u.id, u.username, u.display_name, u.full_name, u.email))) > 0` : Prisma.sql`TRUE`;
  const filterSql = filter === "funded" ? Prisma.sql`(${balanceSql} > 0 OR u.credits > 0)`
    : filter === "held" ? Prisma.sql`(COALESCE((w.metadata->>'pending_balance')::numeric, 0) > 0 OR COALESCE((w.metadata->>'escrow_balance')::numeric, 0) > 0)` : Prisma.sql`TRUE`;
  let cursorSql = Prisma.sql`TRUE`;
  if (body.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(String(body.cursor), "base64url").toString("utf8"));
      const date = new Date(cursor.date);
      if (!Number.isFinite(date.getTime()) || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 200) throw new Error();
      cursorSql = Prisma.sql`(u.created_date, u.id) < (${date}, ${cursor.id})`;
    } catch { fail("Invalid wallet page. Refresh the list."); }
  }
  const [candidates, counts] = await Promise.all([
    db.$queryRaw`${walletIndexSql} SELECT u.id, u.username, u.display_name, u.full_name, u.email, u.credits, u.created_date,
      w.id AS wallet_id, ${balanceSql}::float8 AS available_balance,
      COALESCE((w.metadata->>'pending_balance')::numeric, 0)::float8 AS pending_balance,
      COALESCE((w.metadata->>'escrow_balance')::numeric, 0)::float8 AS escrow_balance,
      COALESCE((w.metadata->>'withdrawable_balance')::numeric, ${balanceSql})::float8 AS withdrawable_balance,
      COALESCE((w.metadata->>'total_earnings')::numeric, 0)::float8 AS total_earnings
      FROM "User" u ${walletJoin} WHERE ${searchSql} AND ${filterSql} AND ${cursorSql}
      ORDER BY u.created_date DESC, u.id DESC LIMIT 26`,
    db.$queryRaw`${walletIndexSql} SELECT COUNT(*)::int AS total FROM "User" u ${walletJoin} WHERE ${searchSql} AND ${filterSql}`,
  ]);
  const rows = candidates.slice(0, 25), last = rows.at(-1);
  return { success: true, rows, total: counts[0].total, next_cursor: candidates.length > 25 && last
    ? Buffer.from(JSON.stringify({ id: last.id, date: last.created_date.toISOString() })).toString("base64url") : null };
}

export async function adjustAdminWallet(db, actor, body = {}) {
  if (!hasRole(actor, "ceo")) fail("Only the CEO can adjust balances", 403);
  const type = body.type, operation = body.operation || "add";
  if (!["money", "credits"].includes(type) || !["add", "remove", "set"].includes(operation)) fail("Choose a balance and an adjustment action.");
  if (typeof body.user_id !== "string" || !body.user_id) fail("Choose an account.");
  const raw = body.amount;
  if (!["string", "number"].includes(typeof raw) || String(raw).trim() === "") fail("Enter an amount.");
  const amount = Number(raw), units = type === "money" ? cents(amount) : amount;
  if (!Number.isFinite(amount) || !Number.isSafeInteger(units) || units < 0 || (operation !== "set" && units === 0)
    || (type === "money" && Math.abs(amount * 100 - units) > 0.000001)) {
    fail(type === "money" ? "Use a valid amount with at most two decimal places." : "Use a valid whole number of credits.");
  }
  const reason = String(body.reason || "").trim();
  if (!reason || reason.length > 1000) fail("Enter a reason of up to 1,000 characters.");
  const requestId = body.request_id || randomUUID();
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) fail("Invalid adjustment reference. Reopen the editor.");
  const fingerprint = { user_id: body.user_id, type, operation, amount, reason };
  try {
    return await db.$transaction(async (tx) => {
      // Serialize retries and CEO adjustments for this account before reading its balances.
      const locked = await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${body.user_id} FOR UPDATE`;
      if (!locked.length) fail("Account no longer exists", 404);
      const previous = await tx.adminAction.findFirst({ where: { AND: [
        { metadata: { path: ["admin_id"], equals: actor.id } },
        { metadata: { path: ["request_id"], equals: requestId } },
      ] } });
      if (previous) {
        if (Object.entries(fingerprint).some(([key, value]) => previous.metadata.request?.[key] !== value)) fail("This adjustment reference has already been used.", 409);
        return { success: true, replayed: true, type, amount, operation,
          balance_before: previous.metadata.details.balance_before, balance_after: previous.metadata.details.balance_after,
          action: serializeRow(previous) };
      }
      const target = await tx.user.findUnique({ where: { id: body.user_id } });
      const wallets = await tx.$queryRaw`SELECT * FROM "Wallet" WHERE metadata->>'user_id' = ${target.id}
        ORDER BY created_date ASC, id ASC FOR UPDATE`;
      if (wallets.length > 1) fail("This account has duplicate wallets. Resolve them before adjusting its balance.", 409);
      const existing = wallets[0], metadata = existing?.metadata || {};
      const beforeUnits = type === "credits" ? Number(target.credits) : cents(metadata.available_balance ?? target.wallet_balance);
      if (!Number.isSafeInteger(beforeUnits) || beforeUnits < 0) fail("This account has an invalid balance. Review its records first.", 409);
      if (body.expected_balance !== undefined && (type === "money" ? cents(body.expected_balance) : Number(body.expected_balance)) !== beforeUnits) {
        fail("The balance changed while this editor was open. Refresh the wallet and try again.", 409);
      }
      const afterUnits = operation === "set" ? units : beforeUnits + (operation === "remove" ? -units : units);
      if (!Number.isSafeInteger(afterUnits) || afterUnits < 0) fail("The adjustment would leave a negative or invalid balance.");
      const deltaUnits = afterUnits - beforeUnits;
      if (!deltaUnits) fail("The balance already matches this amount.");
      const divisor = type === "money" ? 100 : 1;
      const before = beforeUnits / divisor, after = afterUnits / divisor, delta = deltaUnits / divisor;
      const targetName = nameFor(target), actorName = nameFor(actor);
      const action = await tx.adminAction.create({ data: { metadata: {
        admin_id: actor.id, admin_name: actorName, admin_role: "ceo", action_type: "wallet_adjust",
        target_user_id: target.id, target_username: targetName, request_id: requestId, request: fingerprint,
        description: `${type === "money" ? "Money" : "Credits"} ${operation === "set" ? "set" : operation === "remove" ? "removed" : "added"} for ${targetName}: ${reason}`,
        details: { type, operation, amount, delta, balance_before: before, balance_after: after, reason },
      } } });
      let wallet = existing;
      if (type === "money") {
        const withdrawableBefore = cents(metadata.withdrawable_balance ?? before);
        if (!Number.isSafeInteger(withdrawableBefore)) fail("This account has an invalid withdrawable balance.", 409);
        const next = { ...metadata, user_id: target.id, available_balance: after,
          withdrawable_balance: Math.max(0, Math.min(afterUnits, withdrawableBefore + deltaUnits)) / 100 };
        wallet = existing ? await tx.wallet.update({ where: { id: existing.id }, data: { metadata: next } })
          : await tx.wallet.create({ data: { metadata: { pending_balance: 0, escrow_balance: 0,
            total_deposits: 0, total_withdrawals: 0, total_earnings: 0, total_wagered: 0, ...next } } });
      }
      const user = await tx.user.update({ where: { id: target.id }, data: type === "money" ? { wallet_balance: after } : { credits: after } });
      const transaction = await tx[type === "money" ? "walletTransaction" : "creditTransaction"].create({ data: { metadata: {
        user_id: target.id, ...(type === "money" ? { wallet_id: wallet.id } : {}), type: "admin_adjustment", status: "completed",
        amount: delta, balance_before: before, balance_after: after, operation,
        description: `CEO balance adjustment: ${reason}`, reason, adjusted_by: actor.id, adjusted_by_name: actorName,
        reference_type: "AdminAction", reference_id: action.id, request_id: requestId,
      } } });
      const recordedAction = await tx.adminAction.update({ where: { id: action.id }, data: { metadata: { ...action.metadata,
        details: { ...action.metadata.details, wallet_id: wallet?.id || null, transaction_id: transaction.id } } } });
      await tx.notification.create({ data: { metadata: {
        user_id: target.id, type: "system", title: type === "money" ? "Wallet balance updated" : "Credits updated",
        message: `${type === "money" ? "Your wallet balance" : "Your credits balance"} changed from ${before} to ${after}.`,
        is_read: false, action_url: type === "money" ? "/wallet" : "/marketplace#credits-store",
        related_entity_id: action.id, related_entity_type: "AdminAction",
      } } });
      return { success: true, type, operation, amount, balance_before: before, balance_after: after,
        user: { id: user.id, credits: user.credits, wallet_balance: user.wallet_balance },
        wallet: wallet ? serializeRow(wallet) : null, transaction: serializeRow(transaction), action: serializeRow(recordedAction) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error.code === "P2034") fail("The balance is being updated. Refresh the wallet and try again.", 409);
    throw error;
  }
}
