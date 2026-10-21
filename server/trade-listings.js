import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { serializeRow } from "./entity.js";
import { withPlayerAvatars } from "./lib/playerAvatars.js";
import { checkedItems, loadUsers } from "./item-trading.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const name = (user) => user.display_name || user.username || user.full_name || "Player";
const validId = (value) => { if (typeof value !== "string" || !value || value.length > 200) fail("Choose a valid listing"); return value; };
const ids = (value) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10 || value.some((id) => typeof id !== "string" || !id || id.length > 200) || new Set(value).size !== value.length) fail("Select 1–10 distinct inventory items");
  return value;
};
const pageFor = (value) => Math.max(1, Math.min(10000, Math.floor(Number(value) || 1)));
const open = (listing) => listing.kind === "listing" && listing.status === "open" && Date.parse(listing.expires_date) > Date.now();
const effective = (listing) => ({ ...listing, status: listing.status === "open" && !open(listing) ? "expired" : listing.status });
const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";

async function listingNotice(tx, userId, listingId, title, message) {
  await tx.notification.create({ data: { metadata: { user_id: userId, title, message, type: "trade", event: "item_bid_updated", is_read: false,
    action_url: `/trading?tab=bidding&listing=${encodeURIComponent(listingId)}`, related_entity_id: listingId, related_entity_type: "TradeOffer", created_date: new Date().toISOString() } } });
}
async function competingNotices(tx, userIds, listingId, title, message) {
  if (!userIds.length) return;
  await tx.notification.createMany({ data: [...new Set(userIds)].map((user_id) => ({ metadata: { user_id, title, message, type: "trade", event: "item_bid_updated", is_read: false,
    action_url: `/trading?tab=bidding&listing=${encodeURIComponent(listingId)}`, related_entity_id: listingId, related_entity_type: "TradeOffer", created_date: new Date().toISOString() } })) });
}
async function listingFor(db, actorId, listingId) {
  const row = await db.tradeOffer.findUnique({ where: { id: validId(listingId) } });
  if (!row || row.metadata.kind !== "listing") fail("Listing not found", 404);
  const users = await loadUsers(db, [...new Set([actorId, row.metadata.seller_id])]);
  return { row, users };
}
async function playersFor(db, ids) {
  const rows = ids.length ? await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, username: true, display_name: true, full_name: true, role: true, admin_role: true, is_admin: true, is_premium: true, premium_expires: true, metadata: true } }) : [];
  return new Map((await withPlayerAvatars(db, rows)).map((user) => [user.id, { id: user.id, username: user.username, name: name(user), role: user.role, admin_role: user.admin_role,
    is_admin: user.is_admin, avatar_url: user.avatar_url, is_premium: user.is_premium, premium_expires: user.premium_expires, display_name_color: user.metadata?.display_name_color || "" }]));
}
// Filter before pagination; no per-card account or block requests.
const visiblePlayer = (actorId) => Prisma.sql`u.is_banned = false AND u.email_verified = true
  AND COALESCE(u.metadata->>'suspended_until', '') <= ${new Date().toISOString()}
  AND NOT EXISTS (SELECT 1 FROM "BlockedUser" b WHERE
    (b.metadata->>'user_id' = ${actorId} AND b.metadata->>'blocked_user_id' = u.id)
    OR (b.metadata->>'blocked_user_id' = ${actorId} AND b.metadata->>'user_id' = u.id))`;

export async function createTradeListing(db, actorId, input) {
  const inventoryIds = ids(input.inventory_ids), description = text(input.description, 1000);
  const title = text(input.title, 80);
  if (title.length < 3) fail("Give your listing a title of at least 3 characters");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-item-trading'))`;
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR UPDATE`;
    const users = await loadUsers(tx, [actorId]);
    const entries = await checkedItems(tx, inventoryIds, actorId);
    const existing = await tx.tradeOffer.findMany({ where: { AND: [field("kind", "listing"), field("seller_id", actorId), field("status", "open")] }, orderBy: { created_date: "desc" }, take: 11 });
    const current = existing.filter((row) => open(row.metadata));
    if (current.length >= 10) fail("You can have up to 10 open listings", 409);
    if (current.some((row) => row.metadata.items.some((item) => inventoryIds.includes(item.inventory_id)))) fail("One of these items already has an open listing", 409);
    const listing = serializeRow(await tx.tradeOffer.create({ data: { metadata: { kind: "listing", version: 1, seller_id: actorId, seller_name: name(users.get(actorId)), title, description,
      items: entries.map(({ item }) => item), status: "open", created_date: new Date().toISOString(), expires_date: new Date(Date.now() + 72 * 3600000).toISOString() } } }));
    return { success: true, listing };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function placeTradeBid(db, actorId, input) {
  const listingId = validId(input.listing_id), inventoryIds = ids(input.inventory_ids);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-item-trading'))`;
    const { row } = await listingFor(tx, actorId, listingId), listing = row.metadata;
    if (listing.seller_id === actorId) fail("You cannot bid on your own listing");
    if (!open(listing)) fail("This listing has closed", 409);
    for (const id of [actorId, listing.seller_id].sort()) await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    const users = await loadUsers(tx, [actorId, listing.seller_id]);
    const give = await checkedItems(tx, inventoryIds, actorId, users.get(listing.seller_id));
    const receive = await checkedItems(tx, ids(listing.items.map((item) => item.inventory_id)), listing.seller_id, users.get(actorId));
    if (receive.some(({ item }) => !listing.items.some((previous) => previous.inventory_id === item.inventory_id && previous.item_id === item.item_id))) fail("The listed items changed. Choose another listing.", 409);
    const bids = await tx.tradeOffer.findMany({ where: { AND: [field("kind", "bid"), field("listing_id", listingId), field("status", "pending")] }, take: 101 });
    const own = bids.find((bid) => bid.metadata.sender_id === actorId);
    if (own && own.metadata.sender_items.length === give.length && own.metadata.sender_items.every((item) => give.some((entry) => entry.item.inventory_id === item.inventory_id && entry.item.item_id === item.item_id))) return { success: true, offer: serializeRow(own), unchanged: true };
    const recent = await tx.tradeOffer.findFirst({ where: { AND: [field("kind", "bid"), field("listing_id", listingId), field("sender_id", actorId)] }, orderBy: { created_date: "desc" } });
    if (recent && Date.parse(recent.metadata.created_date) > Date.now() - 30000) fail("Please wait 30 seconds before placing another bid on this listing", 429);
    if (!own && bids.length >= 100) fail("This listing already has 100 active bids", 409);
    const [count] = await tx.$queryRaw`SELECT COUNT(*) AS total FROM "TradeOffer" WHERE metadata->>'sender_id' = ${actorId}
      AND metadata->>'status' = 'pending' AND (metadata->>'expires_date' IS NULL OR metadata->>'expires_date' > ${new Date().toISOString()})`;
    if (Number(count?.total || 0) - (own ? 1 : 0) >= 20) fail("You can have up to 20 open offers and bids. Close one first.", 409);
    if (own) await tx.tradeOffer.update({ where: { id: own.id }, data: { metadata: { ...own.metadata, status: "cancelled", expiry_reason: "Replaced by a newer bid", response_date: new Date().toISOString() } } });
    const offer = serializeRow(await tx.tradeOffer.create({ data: { metadata: { kind: "bid", listing_id: listingId, listing_title: listing.title, version: 1,
      sender_id: actorId, sender_name: name(users.get(actorId)), recipient_id: listing.seller_id, recipient_name: name(users.get(listing.seller_id)),
      sender_items: give.map(({ item }) => item), recipient_items: receive.map(({ item }) => item), sender_credits_offered: 0, recipient_credits_offered: 0,
      status: "pending", created_date: new Date().toISOString(), expires_date: listing.expires_date } } }));
    await listingNotice(tx, listing.seller_id, listingId, own ? "Trade bid updated" : "New trade bid", `${name(users.get(actorId))} ${own ? "updated their bid" : "placed a bid"} on ${listing.title}. Compare the offered items and choose your preferred exchange.`);
    const otherBidders = [...new Set(bids.map((bid) => bid.metadata.sender_id).filter((id) => id !== actorId))];
    await competingNotices(tx, otherBidders, listingId, "New competing bid", `There is a new or updated item offer on ${listing.title}. You can review the bids and update yours.`);
    return { success: true, offer };
  }, { timeout: 20000, maxWait: 15000 });
}

export async function cancelTradeListing(db, actorId, input) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-item-trading'))`;
    const row = await tx.tradeOffer.findUnique({ where: { id: validId(input.listing_id) } });
    if (!row || row.metadata.kind !== "listing") fail("Listing not found", 404);
    if (row.metadata.seller_id !== actorId) fail("Only the owner can close this listing", 403);
    if (row.metadata.status !== "open") return { success: true, listing: serializeRow(row) };
    const bids = await tx.tradeOffer.findMany({ where: { AND: [field("kind", "bid"), field("listing_id", row.id), field("status", "pending")] }, take: 100 });
    const response_date = new Date().toISOString();
    await tx.$executeRaw`UPDATE "TradeOffer" SET metadata = metadata || jsonb_build_object('status', 'expired', 'expiry_reason', 'The owner closed this listing', 'response_date', ${response_date}::text), updated_date = NOW()
      WHERE metadata->>'kind' = 'bid' AND metadata->>'listing_id' = ${row.id} AND metadata->>'status' = 'pending'`;
    await competingNotices(tx, bids.map((bid) => bid.metadata.sender_id), row.id, "Trade listing closed", "The owner closed this listing. Your offered items remain in your inventory.");
    return { success: true, listing: serializeRow(await tx.tradeOffer.update({ where: { id: row.id }, data: { metadata: { ...row.metadata, status: "cancelled", response_date } } })) };
  }, { timeout: 20000, maxWait: 15000 });
}

export async function getTradeListings(db, actorId, input) {
  const mine = input.scope === "mine", page = pageFor(input.page);
  const scope = mine ? Prisma.sql`t.metadata->>'seller_id' = ${actorId}` : Prisma.sql`t.metadata->>'status' = 'open' AND t.metadata->>'expires_date' > ${new Date().toISOString()}`;
  const where = Prisma.sql`t.metadata->>'kind' = 'listing' AND ${scope} AND ${visiblePlayer(actorId)}`;
  const [counts, rows] = await Promise.all([
    db.$queryRaw`SELECT COUNT(*) AS total FROM "TradeOffer" t JOIN "User" u ON u.id = t.metadata->>'seller_id' WHERE ${where}`,
    db.$queryRaw`SELECT t.id, t.created_date, t.updated_date, t.metadata,
      (SELECT COUNT(*) FROM "TradeOffer" b WHERE b.metadata->>'listing_id' = t.id AND b.metadata->>'kind' = 'bid' AND b.metadata->>'status' = 'pending' AND b.metadata->>'expires_date' > ${new Date().toISOString()}) AS bid_count
      FROM "TradeOffer" t JOIN "User" u ON u.id = t.metadata->>'seller_id' WHERE ${where} ORDER BY t.created_date DESC, t.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
  ]);
  const players = await playersFor(db, rows.map((row) => row.metadata.seller_id));
  return { success: true, page, total: Number(counts[0]?.total || 0), listings: rows.map((row) => ({ ...effective(serializeRow(row)), bid_count: Number(row.bid_count || 0), seller: players.get(row.metadata.seller_id) || null })) };
}

export async function getTradeListing(db, actorId, input) {
  const { row } = await listingFor(db, actorId, input.listing_id), page = pageFor(input.page), listing = effective(serializeRow(row));
  const where = Prisma.sql`t.metadata->>'listing_id' = ${row.id} AND t.metadata->>'kind' = 'bid' AND t.metadata->>'status' = 'pending'
    AND t.metadata->>'expires_date' > ${new Date().toISOString()} AND ${visiblePlayer(actorId)}`;
  const [counts, bids, own] = await Promise.all([
    db.$queryRaw`SELECT COUNT(*) AS total FROM "TradeOffer" t JOIN "User" u ON u.id = t.metadata->>'sender_id' WHERE ${where}`,
    db.$queryRaw`SELECT t.id, t.created_date, t.updated_date, t.metadata FROM "TradeOffer" t JOIN "User" u ON u.id = t.metadata->>'sender_id' WHERE ${where} ORDER BY t.created_date DESC, t.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
    db.tradeOffer.findFirst({ where: { AND: [field("kind", "bid"), field("listing_id", row.id), field("sender_id", actorId), field("status", "pending")] } }),
  ]);
  const players = await playersFor(db, [listing.seller_id, ...bids.map((bid) => bid.metadata.sender_id)]);
  // Public bids intentionally expose only their offered items and public player identity.
  const publicBid = (bid) => ({ id: bid.id, sender_id: bid.metadata.sender_id, sender_name: bid.metadata.sender_name, sender: players.get(bid.metadata.sender_id) || null,
    sender_items: bid.metadata.sender_items, status: bid.metadata.status, created_date: bid.metadata.created_date, expires_date: bid.metadata.expires_date });
  return { success: true, page, total: Number(counts[0]?.total || 0), listing: { ...listing, seller: players.get(listing.seller_id) || null }, bids: bids.map(publicBid),
    own_bid: own && Date.parse(own.metadata.expires_date) > Date.now() ? publicBid(own) : null };
}

export const tradeListingHandlers = {
  createTradeListing: (req) => createTradeListing(prisma, req.user.id, req.body),
  placeTradeBid: (req) => placeTradeBid(prisma, req.user.id, req.body),
  cancelTradeListing: (req) => cancelTradeListing(prisma, req.user.id, req.body),
  getTradeListings: (req) => getTradeListings(prisma, req.user.id, req.body),
  getTradeListing: (req) => getTradeListing(prisma, req.user.id, req.body),
};
