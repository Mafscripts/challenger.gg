import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { serializeRow } from "./entity.js";
import { messagingBlocked } from "./community-safety.js";
import { withPlayerAvatars } from "./lib/playerAvatars.js";
import { isInventoryTrophy } from "./lib/trophyCounts.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const nameFor = (user) => user?.display_name || user?.username || user?.full_name || "Player";
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const idFor = (value) => { if (typeof value !== "string" || !value || value.length > 200) fail("Select a valid player or offer"); return value; };
const itemIds = (value) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10 || value.some((id) => typeof id !== "string" || !id || id.length > 200) || new Set(value).size !== value.length) fail("Choose 1–10 distinct items on each side");
  return value;
};
const premium = (user) => user?.is_premium && (!user.premium_expires || new Date(user.premium_expires).getTime() > Date.now());
const active = (user) => user && !user.is_banned && user.email_verified === true && !(new Date(user.suspended_until || user.metadata?.suspended_until || 0).getTime() > Date.now());
const pending = (offer) => offer.status === "pending" && (!offer.expires_date || Date.parse(offer.expires_date) > Date.now());
const snapshot = (row, catalog) => ({ inventory_id: row.id, item_id: row.metadata.item_id,
  item_name: catalog.name || row.metadata.item_name || "Item", item_rarity: catalog.rarity || row.metadata.item_rarity || "common",
  item_image: catalog.image_url || row.metadata.item_image || "", item_category: catalog.category || row.metadata.item_category || "cosmetic" });

export function tradeItemRestriction(inventory, catalog) {
  if (!catalog) return "This item is no longer in the collection";
  if (inventory.is_unlocked === false) return "This item has not been unlocked";
  if (inventory.is_tradable === false || inventory.is_tradeable === false || catalog.is_tradeable === false || catalog.is_tradable === false) return "This item is not tradable";
  if (inventory.is_rank_reward || catalog.is_rank_reward || inventory.trophy_tier || ["trophy", "ranked_reward"].includes(inventory.item_category) || ["trophy", "ranked_reward"].includes(catalog.category)
    || inventory.tournament_placement || /^(rank_reward|ranked|tournament_placement_trophy)$/.test(inventory.unlock_type || "")
    || /^(rank_reward|ranked)$/.test(catalog.unlock_type || "")) return "Earned trophies and rank rewards stay with their owner";
  return "";
}

export async function previouslyTradedItemIds(db, userId) {
  const rows = await db.$queryRaw`SELECT DISTINCT entry->>'item_id' AS item_id FROM "TradeOffer"
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN metadata->>'sender_id' = ${userId}
      THEN CASE WHEN jsonb_typeof(metadata->'sender_items') = 'array' THEN metadata->'sender_items' ELSE '[]'::jsonb END
      ELSE CASE WHEN jsonb_typeof(metadata->'recipient_items') = 'array' THEN metadata->'recipient_items' ELSE '[]'::jsonb END END) AS entry
    WHERE metadata->>'status' = 'accepted' AND (metadata->>'sender_id' = ${userId} OR metadata->>'recipient_id' = ${userId})`;
  return rows.map((row) => row.item_id).filter(Boolean);
}

async function notice(tx, userId, offer, title, message, tab) {
  await tx.notification.create({ data: { metadata: { user_id: userId, title, message, type: "trade", event: "item_trade_updated", is_read: false,
    action_url: `/trading?tab=${tab}&offer=${encodeURIComponent(offer.id)}`, related_entity_id: offer.id, related_entity_type: "TradeOffer", created_date: new Date().toISOString() } } });
}

async function loadUsers(tx, ids) {
  const users = await tx.user.findMany({ where: { id: { in: ids } } });
  if (users.length !== ids.length || users.some((user) => !active(user))) fail("Both players need verified, active accounts", 403);
  if (await messagingBlocked(tx, ids[0], ids[1])) fail("Trading is not available between these accounts", 403);
  return new Map(users.map((user) => [user.id, user]));
}

async function checkedItems(tx, ids, ownerId, receiver) {
  const rows = await tx.userInventory.findMany({ where: { id: { in: ids } } });
  if (rows.length !== ids.length || rows.some((row) => row.metadata.user_id !== ownerId)) fail("An item changed owner or is no longer available. Create a new offer.", 409);
  const catalogIds = [...new Set(rows.map((row) => row.metadata.item_id).filter(Boolean))];
  const catalog = await tx.marketplaceItem.findMany({ where: { id: { in: catalogIds } } });
  const byId = new Map(catalog.map((row) => [row.id, row.metadata]));
  for (const row of rows) {
    const item = byId.get(row.metadata.item_id);
    const reason = tradeItemRestriction(row.metadata, item);
    if (reason) fail(`${row.metadata.item_name || "Item"}: ${reason}`, 409);
    if ((item.is_premium_only || item.unlock_type === "premium") && !premium(receiver)) fail(`${nameFor(receiver)} needs Premium to receive ${item.name || "this item"}`, 409);
  }
  return rows.map((row) => ({ row, item: snapshot(row, byId.get(row.metadata.item_id)) }));
}

export async function createItemTrade(db, actorId, input) {
  const recipientId = idFor(input.recipient_id);
  if (actorId === recipientId) fail("Choose another player");
  const senderIds = itemIds(input.sender_inventory_ids), recipientIds = itemIds(input.recipient_inventory_ids);
  if (senderIds.some((id) => recipientIds.includes(id))) fail("The same item cannot appear on both sides");
  if (Number(input.sender_credits_offered || 0) !== 0 || Number(input.recipient_credits_offered || 0) !== 0) fail("Choose inventory items for this trade");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-item-trading'))`;
    for (const id of [actorId, recipientId].sort()) await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    const users = await loadUsers(tx, [actorId, recipientId]);
    const [open] = await tx.$queryRaw`SELECT COUNT(*) AS total FROM "TradeOffer" WHERE metadata->>'sender_id' = ${actorId}
      AND metadata->>'status' = 'pending' AND (metadata->>'expires_date' IS NULL OR metadata->>'expires_date' > ${new Date().toISOString()})`;
    if (Number(open?.total || 0) >= 20) fail("You can have up to 20 open trade offers. Close an offer first.", 409);
    const sent = await checkedItems(tx, senderIds, actorId, users.get(recipientId));
    const received = await checkedItems(tx, recipientIds, recipientId, users.get(actorId));
    const metadata = { version: 1, sender_id: actorId, sender_name: nameFor(users.get(actorId)), recipient_id: recipientId, recipient_name: nameFor(users.get(recipientId)),
      sender_items: sent.map(({ item }) => item), recipient_items: received.map(({ item }) => item), sender_credits_offered: 0, recipient_credits_offered: 0,
      status: "pending", created_date: new Date().toISOString(), expires_date: new Date(Date.now() + 72 * 3600000).toISOString() };
    const offer = serializeRow(await tx.tradeOffer.create({ data: { metadata } }));
    await notice(tx, recipientId, offer, "New item trade", `${metadata.sender_name} offered ${sent.length} item(s) for ${received.length} of yours. Review both sides before accepting.`, "incoming");
    return { success: true, offer };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function respondItemTrade(db, actorId, input) {
  const id = idFor(input.offer_id), action = input.action;
  if (!["accept", "decline", "cancel"].includes(action)) fail("Choose a valid trade action");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-item-trading'))`;
    const initial = await tx.tradeOffer.findUnique({ where: { id } });
    if (!initial) fail("Trade offer not found", 404);
    const first = initial.metadata;
    if (action === "cancel" ? first.sender_id !== actorId : first.recipient_id !== actorId) fail("This trade action belongs to the other player", 403);
    for (const userId of [...new Set([first.sender_id, first.recipient_id])].sort()) await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.$executeRaw`SELECT id FROM "TradeOffer" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.tradeOffer.findUnique({ where: { id } }), offer = serializeRow(row);
    if (offer.status === "accepted" && action === "accept") return { success: true, already_accepted: true, offer };
    if (offer.status !== "pending") fail("This offer has already been answered", 409);
    const save = async (patch) => serializeRow(await tx.tradeOffer.update({ where: { id }, data: { metadata: { ...row.metadata, ...patch, response_date: new Date().toISOString() } } }));
    if (!pending(offer)) return { success: false, error: "This trade offer expired. Create a new offer.", offer: await save({ status: "expired" }) };
    if (action !== "accept") {
      const saved = await save({ status: action === "decline" ? "declined" : "cancelled" });
      await notice(tx, action === "cancel" ? offer.recipient_id : offer.sender_id, saved, action === "cancel" ? "Trade offer cancelled" : "Trade offer declined", "The offer is closed. Your items remain in your inventory.", "history");
      return { success: true, offer: saved };
    }
    if (offer.version !== 1) fail("Create a new item trade to replace this older offer.", 409);
    if (Number(offer.sender_credits_offered || 0) !== 0 || Number(offer.recipient_credits_offered || 0) !== 0) fail("This older offer includes credits. Cancel it and create an item trade instead.", 409);
    const senderIds = itemIds(offer.sender_items?.map((item) => item.inventory_id)), recipientIds = itemIds(offer.recipient_items?.map((item) => item.inventory_id));
    if (senderIds.some((inventoryId) => recipientIds.includes(inventoryId))) fail("This offer contains overlapping items", 409);
    for (const inventoryId of [...senderIds, ...recipientIds].sort()) await tx.$executeRaw`SELECT id FROM "UserInventory" WHERE id = ${inventoryId} FOR UPDATE`;
    const users = await loadUsers(tx, [offer.sender_id, offer.recipient_id]);
    const sent = await checkedItems(tx, senderIds, offer.sender_id, users.get(offer.recipient_id));
    const received = await checkedItems(tx, recipientIds, offer.recipient_id, users.get(offer.sender_id));
    for (const [entries, snapshots] of [[sent, offer.sender_items], [received, offer.recipient_items]]) {
      if (entries.some(({ item }) => !snapshots.some((previous) => previous.inventory_id === item.inventory_id && previous.item_id === item.item_id))) fail("An offered item changed. Review a new offer instead.", 409);
    }
    // Revalidate all items before the first write. Ownership changes commit together.
    const transfers = [];
    for (const [entries, from, to] of [[sent, offer.sender_id, offer.recipient_id], [received, offer.recipient_id, offer.sender_id]]) {
      for (const { row: inventory, item } of entries) {
        await tx.userInventory.update({ where: { id: inventory.id }, data: { metadata: { ...inventory.metadata, user_id: to, is_equipped: false, equipped_slot: "", showcase_enabled: false, is_favorite: false,
          purchase_method: "trade", price_paid: 0, acquired_date: new Date().toISOString(), previous_owner_id: from, trade_offer_id: id } } });
        transfers.push({ inventory_id: inventory.id, item_id: item.item_id, from_user_id: from, to_user_id: to });
      }
      const user = users.get(from);
      const removedIds = new Set(entries.flatMap(({ row: inventory }) => [inventory.id, inventory.metadata.item_id]));
      if (Array.isArray(user.metadata?.showcase_item_ids)) await tx.user.update({ where: { id: from }, data: { metadata: { ...user.metadata,
        showcase_item_ids: user.metadata.showcase_item_ids.filter((itemId) => !removedIds.has(itemId)) } } });
      const profiles = await tx.playerProfile.findMany({ where: field("user_id", from) });
      for (const profile of profiles) if (Array.isArray(profile.metadata?.showcase_item_ids)) await tx.playerProfile.update({ where: { id: profile.id }, data: { metadata: {
        ...profile.metadata, showcase_item_ids: profile.metadata.showcase_item_ids.filter((itemId) => !removedIds.has(itemId)) } } });
    }
    const saved = await save({ status: "accepted", transfers });
    const inventoryIds = JSON.stringify([...senderIds, ...recipientIds]);
    // Other offers referring to a moved copy cannot silently follow its new owner.
    await tx.$executeRaw`UPDATE "TradeOffer" SET metadata = metadata || jsonb_build_object('status', 'expired', 'expiry_reason', 'An offered item changed owner', 'response_date', ${new Date().toISOString()}::text), updated_date = NOW()
      WHERE id <> ${id} AND metadata->>'status' = 'pending'
        AND (metadata->>'sender_id' IN (${offer.sender_id}, ${offer.recipient_id}) OR metadata->>'recipient_id' IN (${offer.sender_id}, ${offer.recipient_id})) AND EXISTS (
        SELECT 1 FROM jsonb_array_elements((CASE WHEN jsonb_typeof(metadata->'sender_items') = 'array' THEN metadata->'sender_items' ELSE '[]'::jsonb END)
          || (CASE WHEN jsonb_typeof(metadata->'recipient_items') = 'array' THEN metadata->'recipient_items' ELSE '[]'::jsonb END)) AS entry
        WHERE ${inventoryIds}::jsonb ? (entry->>'inventory_id'))`;
    for (const userId of [offer.sender_id, offer.recipient_id]) await notice(tx, userId, saved, "Item trade completed", "Both sides have exchanged items. Your new items are now in your inventory.", "history");
    return { success: true, offer: saved };
  }, { timeout: 20000, maxWait: 15000 });
}

export async function getTradeInventory(db, actorId, input) {
  const ownerId = input.user_id ? idFor(input.user_id) : actorId;
  if (ownerId !== actorId) await loadUsers(db, [actorId, ownerId]);
  const rows = await db.$queryRaw`SELECT id, metadata FROM "UserInventory" WHERE metadata->>'user_id' = ${ownerId} ORDER BY created_date DESC, id DESC LIMIT 501`;
  const catalogIds = [...new Set(rows.map((row) => row.metadata.item_id).filter(Boolean))];
  const catalog = catalogIds.length ? await db.marketplaceItem.findMany({ where: { id: { in: catalogIds } } }) : [];
  const byId = new Map(catalog.map((row) => [row.id, row.metadata]));
  return { success: true, has_more: rows.length > 500, items: rows.slice(0, 500).map((row) => {
    const item = byId.get(row.metadata.item_id), restriction = tradeItemRestriction(row.metadata, item);
    const text = `${row.metadata.item_category || ""} ${row.metadata.item_name || ""} ${row.metadata.unlock_key || ""}`.toLowerCase();
    return { ...snapshot(row, item || {}), tradable: !restriction, restriction,
      ...(ownerId === actorId ? { collection: {
        description: item?.description || row.metadata.item_description || row.metadata.description || "",
        equipped: row.metadata.is_equipped === true,
        acquired_date: row.metadata.acquired_date || "",
        premium_only: Boolean(item?.is_premium_only || item?.unlock_type === "premium"),
        catalog_available: Boolean(item),
        visible: !(isInventoryTrophy(row.metadata) && (text.includes("invit") || text.includes("champion"))),
      } } : {}),
    };
  }).filter((item) => ownerId === actorId || item.tradable) };
}

export async function getTradingOverview(db, actorId, input) {
  const tab = ["incoming", "outgoing", "history"].includes(input.tab) ? input.tab : "incoming";
  const page = Math.max(1, Math.min(10000, Math.floor(Number(input.page) || 1)));
  await db.$executeRaw`UPDATE "TradeOffer" SET metadata = metadata || '{"status":"expired"}'::jsonb, updated_date = NOW()
    WHERE (metadata->>'sender_id' = ${actorId} OR metadata->>'recipient_id' = ${actorId}) AND metadata->>'status' = 'pending'
      AND COALESCE(metadata->>'expires_date', '') <> '' AND metadata->>'expires_date' < ${new Date().toISOString()}`;
  const own = Prisma.sql`(metadata->>'sender_id' = ${actorId} OR metadata->>'recipient_id' = ${actorId})`;
  const status = tab === "history" ? Prisma.sql`COALESCE(metadata->>'status', 'pending') <> 'pending'`
    : Prisma.sql`metadata->>'status' = 'pending' AND metadata->>${tab === "incoming" ? "recipient_id" : "sender_id"} = ${actorId}`;
  const order = tab === "history" ? Prisma.sql`updated_date DESC, id DESC` : Prisma.sql`created_date DESC, id DESC`;
  const [counts, rows] = await Promise.all([
    db.$queryRaw`SELECT COUNT(*) FILTER (WHERE metadata->>'status' = 'pending' AND metadata->>'recipient_id' = ${actorId}) AS incoming,
      COUNT(*) FILTER (WHERE metadata->>'status' = 'pending' AND metadata->>'sender_id' = ${actorId}) AS outgoing,
      COUNT(*) FILTER (WHERE COALESCE(metadata->>'status', 'pending') <> 'pending') AS history FROM "TradeOffer" WHERE ${own}`,
    db.$queryRaw`SELECT id, created_date, updated_date, metadata FROM "TradeOffer" WHERE ${own} AND ${status} ORDER BY ${order} LIMIT 50 OFFSET ${(page - 1) * 50}`,
  ]);
  const ids = [...new Set(rows.flatMap((row) => [row.metadata.sender_id, row.metadata.recipient_id]).filter(Boolean))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, display_name: true, full_name: true, role: true, admin_role: true, is_admin: true, is_premium: true, premium_expires: true, metadata: true } }) : [];
  const avatars = await withPlayerAvatars(db, users);
  const byId = new Map(avatars.map((user) => [user.id, { id: user.id, username: user.username, name: nameFor(user), role: user.role, admin_role: user.admin_role, is_admin: user.is_admin,
    avatar_url: user.avatar_url, is_premium: user.is_premium, premium_expires: user.premium_expires, display_name_color: user.metadata?.display_name_color || "" }]));
  return { success: true, page, counts: Object.fromEntries(["incoming", "outgoing", "history"].map((key) => [key, Number(counts[0]?.[key] || 0)])),
    offers: rows.map((row) => ({ ...serializeRow(row), sender: byId.get(row.metadata.sender_id) || null, recipient: byId.get(row.metadata.recipient_id) || null })) };
}

export const tradingHandlers = {
  getTradingOverview: (req) => getTradingOverview(prisma, req.user.id, req.body),
  getTradeInventory: (req) => getTradeInventory(prisma, req.user.id, req.body),
  createItemTrade: (req) => createItemTrade(prisma, req.user.id, req.body),
  respondItemTrade: (req) => respondItemTrade(prisma, req.user.id, req.body),
};
