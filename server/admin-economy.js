import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { serializeRow } from "./entity.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const assertAdmin = actor => { if (!hasRole(actor, "admin")) fail("Admin access required", 403); };
const nameFor = user => user?.display_name || user?.full_name || user?.username || "Player";
const clean = value => String(value || "").trim().slice(0, 200);
const withdrawalStates = new Set(["pending", "processing", "approved", "completed", "rejected", "cancelled"]);
const inventoryCategories = new Set(["cosmetic", "badge", "frame", "calling_card", "trophy", "knife", "ranked_reward", "weapon_skin", "gloves", "agent", "sticker", "patch", "music_kit", "reward_item"]);
const identitySql = Prisma.sql`jsonb_build_object('id', u.id, 'display_name', u.display_name, 'full_name', u.full_name, 'username', u.username) AS player`;
const searchSql = search => search ? Prisma.sql`POSITION(${search.toLowerCase()} IN LOWER(CONCAT_WS(' ', r.id, r.metadata->>'user_id', u.display_name, u.full_name, u.username, r.metadata->>'item_name', r.metadata->>'payment_method'))) > 0` : Prisma.sql`TRUE`;
const scopeFor = (kind, search, filter) => createHash("sha256").update(JSON.stringify([kind, search, filter])).digest("hex").slice(0, 20);
function cursorSql(input, scope) {
  if (!input) return Prisma.sql`TRUE`;
  try {
    const cursor = JSON.parse(Buffer.from(String(input), "base64url").toString("utf8"));
    const date = new Date(cursor.date);
    if (cursor.scope !== scope || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 200 || !Number.isFinite(+date)) throw new Error();
    // Prisma's DateTime columns are UTC timestamp without time zone.
    return Prisma.sql`(r.created_date, r.id) < (${date.toISOString().slice(0, -1)}::timestamp, ${cursor.id})`;
  } catch { fail("This page no longer matches your filters. Refresh the list."); }
}
const nextCursor = (rows, scope) => rows.length > 25 ? Buffer.from(JSON.stringify({ scope, id: rows[24].id, date: new Date(rows[24].created_date).toISOString() })).toString("base64url") : null;

export async function getAdminWithdrawals(db, actor, body = {}) {
  assertAdmin(actor);
  const search = clean(body.search), filter = withdrawalStates.has(body.status) ? body.status : "all";
  const scope = scopeFor("withdrawals", search, filter), cursor = cursorSql(body.cursor, scope);
  const status = Prisma.sql`COALESCE(NULLIF(LOWER(r.metadata->>'status'), ''), 'pending')`;
  const filterSql = filter === "all" ? Prisma.sql`TRUE` : Prisma.sql`${status} = ${filter}`;
  const [rows, counts] = await Promise.all([
    db.$queryRaw`SELECT r.id, r.created_date, r.updated_date, ${identitySql},
      jsonb_build_object('user_id', r.metadata->>'user_id', 'amount', r.metadata->'amount', 'payment_method', r.metadata->>'payment_method',
        'status', ${status}, 'requested_date', r.metadata->>'requested_date', 'processed_date', r.metadata->>'processed_date',
        'processed_by_name', r.metadata->>'processed_by_name', 'processing_notes', r.metadata->>'processing_notes') AS metadata
      FROM "WithdrawalRequest" r LEFT JOIN "User" u ON u.id = r.metadata->>'user_id'
      WHERE ${searchSql(search)} AND ${filterSql} AND ${cursor} ORDER BY r.created_date DESC, r.id DESC LIMIT 26`,
    db.$queryRaw`SELECT ${status} AS status, COUNT(*)::int AS total FROM "WithdrawalRequest" r
      LEFT JOIN "User" u ON u.id = r.metadata->>'user_id' WHERE ${searchSql(search)} GROUP BY ${status}`,
  ]);
  const byStatus = Object.fromEntries(counts.map(row => [row.status, row.total]));
  return { success: true, rows: rows.slice(0, 25).map(serializeRow), counts: byStatus,
    total: filter === "all" ? counts.reduce((total, row) => total + row.total, 0) : byStatus[filter] || 0,
    next_cursor: nextCursor(rows, scope) };
}

export async function getAdminInventory(db, actor, body = {}) {
  assertAdmin(actor);
  const search = clean(body.search), category = inventoryCategories.has(body.category) ? body.category : "all";
  const scope = scopeFor("inventory", search, category), cursor = cursorSql(body.cursor, scope);
  const categorySql = category === "all" ? Prisma.sql`TRUE` : Prisma.sql`r.metadata->>'item_category' = ${category}`;
  const [rows, counts] = await Promise.all([
    db.$queryRaw`SELECT r.id, r.created_date, r.updated_date, ${identitySql},
      jsonb_build_object('user_id', r.metadata->>'user_id', 'item_id', r.metadata->>'item_id', 'item_name', r.metadata->>'item_name',
        'item_category', r.metadata->>'item_category', 'item_rarity', r.metadata->>'item_rarity', 'purchase_method', r.metadata->>'purchase_method',
        'acquired_date', r.metadata->>'acquired_date', 'is_tradeable', r.metadata->'is_tradeable', 'is_equipped', r.metadata->'is_equipped',
        'reward', r.metadata->'reward') AS metadata
      FROM "UserInventory" r LEFT JOIN "User" u ON u.id = r.metadata->>'user_id'
      WHERE ${searchSql(search)} AND ${categorySql} AND ${cursor} ORDER BY r.created_date DESC, r.id DESC LIMIT 26`,
    db.$queryRaw`SELECT COUNT(*)::int AS total FROM "UserInventory" r LEFT JOIN "User" u ON u.id = r.metadata->>'user_id'
      WHERE ${searchSql(search)} AND ${categorySql}`,
  ]);
  return { success: true, rows: rows.slice(0, 25).map(serializeRow), total: counts[0]?.total || 0, next_cursor: nextCursor(rows, scope) };
}

export function withdrawalActions(status) {
  return { pending: ["approved", "rejected", "cancelled"], approved: ["completed", "cancelled"], processing: ["completed", "rejected", "cancelled"] }[String(status || "pending").toLowerCase()] || [];
}

export async function processAdminWithdrawal(db, actor, body = {}) {
  assertAdmin(actor);
  const id = clean(body.withdrawal_id), next = clean(body.status).toLowerCase(), notes = String(body.notes || "").trim();
  if (!id || !["approved", "completed", "rejected", "cancelled"].includes(next)) fail("Choose a withdrawal and an available action.");
  if (notes.length > 1000 || (["rejected", "cancelled"].includes(next) && !notes)) fail("Add a reason of up to 1,000 characters.");
  return db.$transaction(async tx => {
    const [row] = await tx.$queryRaw`SELECT * FROM "WithdrawalRequest" WHERE id = ${id} FOR UPDATE`;
    if (!row) fail("Withdrawal request not found", 404);
    const previous = String(row.metadata?.status || "pending").toLowerCase();
    if (body.expected_status && body.expected_status !== previous) fail("Another staff member updated this request. Refresh before continuing.", 409);
    if (!withdrawalActions(previous).includes(next)) fail("This withdrawal has already changed or is resolved. Refresh the list.", 409);
    const timestamp = new Date().toISOString();
    const updated = await tx.withdrawalRequest.update({ where: { id }, data: { metadata: { ...row.metadata, status: next,
      processed_by: actor.id, processed_by_name: nameFor(actor), processed_date: timestamp, processing_notes: notes } } });
    await tx.adminAction.create({ data: { metadata: { admin_id: actor.id, admin_name: nameFor(actor),
      admin_role: actor.role, action_type: "withdrawal_process", target_user_id: row.metadata.user_id,
      description: `Withdrawal ${id}: ${previous} to ${next}${notes ? ` — ${notes}` : ""}`,
      details: { withdrawal_id: id, previous_status: previous, status: next, amount: row.metadata.amount, reason: notes } } } });
    return { success: true, withdrawal: serializeRow(updated) };
  });
}
