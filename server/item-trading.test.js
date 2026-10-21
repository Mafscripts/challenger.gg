import test from "node:test";
import assert from "node:assert/strict";
import { createItemTrade, respondItemTrade, tradeItemRestriction, previouslyTradedItemIds } from "./item-trading.js";
import { createTradeListing, placeTradeBid, cancelTradeListing } from "./trade-listings.js";

function fixture() {
  let state = {
    users: ["a", "b", "c"].map((id) => ({ id, username: id, email_verified: true, is_banned: false, metadata: {} })),
    items: ["a", "b", "c"].map((id) => ({ id: `item-${id}`, metadata: { name: `Cosmetic ${id}`, category: "cosmetic", is_tradeable: true } })),
    inventory: ["a", "b", "c"].map((id) => ({ id: `copy-${id}`, metadata: { user_id: id, item_id: `item-${id}`, item_name: `Cosmetic ${id}`, item_category: "cosmetic", is_equipped: true } })),
    offers: [], notices: [],
  };
  const copy = (value) => structuredClone(value);
  const update = (table, { where, data }) => { const row = state[table].find((entry) => entry.id === where.id); Object.assign(row, copy(data)); return copy(row); };
  const matches = (row, where) => !where || (where.AND ? where.AND.every((clause) => matches(row, clause)) : where.metadata ? row.metadata[where.metadata.path[0]] === where.metadata.equals : true);
  const tx = {
    $executeRaw: async (parts, ...values) => {
      const sql = parts.join("?");
      if (sql.includes("An offered item changed owner")) {
        const moved = JSON.parse(values.at(-1));
        for (const row of state.offers) if (row.id !== values[1] && row.metadata.status === "pending" && [...(row.metadata.sender_items || []), ...(row.metadata.recipient_items || [])].some((item) => moved.includes(item.inventory_id))) row.metadata = { ...row.metadata, status: "expired", expiry_reason: "An offered item changed owner" };
      } else if (sql.includes("The owner closed this listing")) {
        for (const row of state.offers) if (row.metadata.listing_id === values[1] && row.metadata.status === "pending") row.metadata = { ...row.metadata, status: "expired" };
      }
      return 1;
    },
    $queryRaw: async (parts, ...values) => {
      const sql = parts.join("?");
      if (sql.includes("An offered item changed owner")) {
        const moved = JSON.parse(values.at(-1)), expired = [];
        for (const row of state.offers) if (row.id !== values[1] && row.metadata.status === "pending" && [...(row.metadata.sender_items || []), ...(row.metadata.recipient_items || [])].some((item) => moved.includes(item.inventory_id))) {
          row.metadata = { ...row.metadata, status: "expired", expiry_reason: "An offered item changed owner" };
          expired.push(copy(row));
        }
        return expired;
      }
      if (sql.includes('UPDATE "TradeOffer"')) {
        const moved = JSON.parse(values.at(-1)), closed = [];
        for (const row of state.offers) if (row.metadata.kind === "listing" && row.metadata.status === "open" && row.metadata.items.some((item) => moved.includes(item.inventory_id))) {
          row.metadata = { ...row.metadata, status: row.id === values[0] ? "accepted" : "expired", accepted_offer_id: row.id === values[0] ? values[2] : "" };
          closed.push({ id: row.id });
        }
        return closed;
      }
      return [{ total: state.offers.filter((row) => row.metadata.sender_id === values[0] && row.metadata.status === "pending").length }];
    },
    blockedUser: { findFirst: async () => null },
    user: { findMany: async ({ where }) => copy(state.users.filter((row) => where.id.in.includes(row.id))), update: async (input) => update("users", input) },
    marketplaceItem: { findMany: async ({ where }) => copy(state.items.filter((row) => where.id.in.includes(row.id))) },
    userInventory: { findMany: async ({ where }) => copy(state.inventory.filter((row) => where.id.in.includes(row.id))), update: async (input) => update("inventory", input) },
    tradeOffer: { create: async ({ data }) => { const row = { id: `trade-${state.offers.length}`, created_date: new Date(), ...copy(data) }; state.offers.push(row); return copy(row); },
      findMany: async ({ where, take }) => copy(state.offers.filter((row) => matches(row, where)).slice(0, take)),
      findFirst: async ({ where }) => copy(state.offers.filter((row) => matches(row, where)).at(-1) || null),
      findUnique: async ({ where }) => copy(state.offers.find((row) => row.id === where.id) || null), update: async (input) => update("offers", input) },
    notification: { create: async ({ data }) => { state.notices.push(copy(data)); return copy(data); }, createMany: async ({ data }) => { state.notices.push(...copy(data)); return { count: data.length }; } },
    playerProfile: { findMany: async () => [] },
  };
  let queue = Promise.resolve();
  const db = { $transaction: (operation) => {
    const task = queue.then(async () => { const before = copy(state); try { return await operation(tx); } catch (err) { state = before; throw err; } });
    queue = task.catch(() => {}); return task;
  } };
  const input = { recipient_id: "b", sender_inventory_ids: ["copy-a"], recipient_inventory_ids: ["copy-b"] };
  return { db, tx, input, state: () => state, create: () => createItemTrade(db, "a", input) };
}

test("offers use authoritative inventory snapshots and do not transfer ownership before consent", async () => {
  const f = fixture();
  const result = await createItemTrade(f.db, "a", { ...f.input, sender_id: "c", sender_items: [{ item_name: "Forged" }] });
  assert.equal(result.offer.sender_id, "a");
  assert.equal(result.offer.sender_items[0].item_name, "Cosmetic a");
  assert.deepEqual(f.state().inventory.map((row) => row.metadata.user_id), ["a", "b", "c"]);
  assert.equal(f.state().notices[0].metadata.user_id, "b");
  assert.equal(f.state().offers[0].metadata.status, "pending");
});

test("only the recipient accepts and concurrent repeat accepts move each copy once", async () => {
  const f = fixture(), result = await f.create(), id = result.offer.id;
  await assert.rejects(respondItemTrade(f.db, "a", { offer_id: id, action: "accept" }), /other player/);
  await assert.rejects(respondItemTrade(f.db, "c", { offer_id: id, action: "cancel" }), /other player/);
  const accepted = await Promise.all([1, 2].map(() => respondItemTrade(f.db, "b", { offer_id: id, action: "accept" })));
  assert.equal(accepted.filter((row) => row.already_accepted).length, 1);
  assert.deepEqual(f.state().inventory.map((row) => row.metadata.user_id), ["b", "a", "c"]);
  assert.ok(f.state().inventory.slice(0, 2).every((row) => !row.metadata.is_equipped && row.metadata.purchase_method === "trade"));
  assert.equal(f.state().offers[0].metadata.transfers.length, 2);
  assert.equal(f.state().notices.length, 3);
});

test("stale ownership, newly disabled items, blocks and expired offers never exchange items", async () => {
  for (const reason of ["owner", "catalog", "blocked", "expired"]) {
    const f = fixture(), { offer } = await f.create();
    if (reason === "owner") f.state().inventory[0].metadata.user_id = "c";
    if (reason === "catalog") f.state().items[0].metadata.is_tradeable = false;
    if (reason === "blocked") f.tx.blockedUser.findFirst = async () => ({ id: "block" });
    if (reason === "expired") f.state().offers[0].metadata.expires_date = new Date(0).toISOString();
    const before = structuredClone(f.state().inventory);
    if (reason === "expired") assert.equal((await respondItemTrade(f.db, "b", { offer_id: offer.id, action: "accept" })).success, false);
    else await assert.rejects(respondItemTrade(f.db, "b", { offer_id: offer.id, action: "accept" }));
    assert.deepEqual(f.state().inventory, before);
  }
});

test("a failed second transfer rolls back the first transfer, offer status and notifications", async () => {
  const f = fixture(), { offer } = await f.create(), before = structuredClone(f.state());
  const update = f.tx.userInventory.update;
  f.tx.userInventory.update = async (input) => { if (input.where.id === "copy-b") throw new Error("Storage failure"); return update(input); };
  await assert.rejects(respondItemTrade(f.db, "b", { offer_id: offer.id, action: "accept" }), /Storage failure/);
  assert.deepEqual(f.state(), before);
});

test("declining and cancelling close offers without inventory changes", async () => {
  for (const [actor, action, status] of [["a", "cancel", "cancelled"], ["b", "decline", "declined"]]) {
    const f = fixture(), { offer } = await f.create(), inventory = structuredClone(f.state().inventory);
    const result = await respondItemTrade(f.db, actor, { offer_id: offer.id, action });
    assert.equal(result.offer.status, status);
    assert.deepEqual(f.state().inventory, inventory);
  }
});

test("rewards remain bound and forged, duplicated or credit-based offers are rejected", async () => {
  assert.match(tradeItemRestriction({ item_category: "trophy" }, { category: "trophy", is_tradeable: true }), /stay with their owner/);
  assert.match(tradeItemRestriction({ is_rank_reward: true }, {}), /stay with their owner/);
  assert.equal(tradeItemRestriction({ is_tradable: true }, { is_tradeable: true, category: "knife" }), "");
  const f = fixture();
  for (const patch of [{ recipient_id: "a" }, { sender_inventory_ids: ["copy-b"] }, { sender_inventory_ids: ["copy-a", "copy-a"] }, { sender_credits_offered: 1 }]) await assert.rejects(createItemTrade(f.db, "a", { ...f.input, ...patch }));
  assert.equal(f.state().offers.length, 0);
});

test("the durable accepted-offer ledger supplies reward claims independently of editable user metadata", async () => {
  let sql;
  const ids = await previouslyTradedItemIds({ $queryRaw: async (parts, ...values) => { sql = parts.join("?"); assert.ok(values.every((value) => value === "a")); return [{ item_id: "reward" }, { item_id: null }]; } }, "a");
  assert.deepEqual(ids, ["reward"]);
  assert.match(sql, /status' = 'accepted'/);
  assert.match(sql, /sender_items/);
  assert.match(sql, /recipient_items/);
});


test("public listings use owned, tradable copies and cannot duplicate or self-bid", async () => {
  const f = fixture();
  const { listing } = await createTradeListing(f.db, "b", { title: "My collectible", inventory_ids: ["copy-b"], items: [{ item_name: "Forged" }] });
  assert.equal(listing.items[0].item_name, "Cosmetic b");
  assert.deepEqual(f.state().inventory.map((row) => row.metadata.user_id), ["a", "b", "c"]);
  await assert.rejects(createTradeListing(f.db, "b", { title: "Duplicate", inventory_ids: ["copy-b"] }), /already has an open listing/);
  await assert.rejects(createTradeListing(f.db, "a", { title: "Not mine", inventory_ids: ["copy-b"] }), /changed owner/);
  await assert.rejects(placeTradeBid(f.db, "b", { listing_id: listing.id, inventory_ids: ["copy-b"] }), /own listing/);
});

test("competing bids remain consented offers and only one can win", async () => {
  const f = fixture(), { listing } = await createTradeListing(f.db, "b", { title: "Open bidding", inventory_ids: ["copy-b"] });
  const first = await placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a"] });
  const second = await placeTradeBid(f.db, "c", { listing_id: listing.id, inventory_ids: ["copy-c"] });
  assert.deepEqual(f.state().inventory.map((row) => row.metadata.user_id), ["a", "b", "c"]);
  assert.ok(f.state().notices.some((row) => row.metadata.user_id === "a" && row.metadata.title === "New competing bid"));
  const results = await Promise.allSettled([respondItemTrade(f.db, "b", { offer_id: first.offer.id, action: "accept" }), respondItemTrade(f.db, "b", { offer_id: second.offer.id, action: "accept" })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.deepEqual(f.state().inventory.map((row) => row.metadata.user_id), ["b", "a", "c"]);
  assert.equal(f.state().offers.find((row) => row.id === listing.id).metadata.accepted_offer_id, first.offer.id);
  assert.equal(f.state().offers.find((row) => row.id === second.offer.id).metadata.status, "expired");
  assert.ok(f.state().notices.some((row) => row.metadata.user_id === "c" && row.metadata.title === "Bidding closed"));
});

test("replacement bids cancel the earlier consent and unchanged retries are idempotent", async () => {
  const f = fixture(), { listing } = await createTradeListing(f.db, "b", { title: "Open bidding", inventory_ids: ["copy-b"] });
  const first = await placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a"] });
  const repeated = await placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a"] });
  assert.equal(repeated.offer.id, first.offer.id);
  assert.equal(repeated.unchanged, true);
  f.state().inventory.push({ id: "copy-a2", metadata: { ...f.state().inventory[0].metadata } });
  await assert.rejects(placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a2"] }), /30 seconds/);
  f.state().offers.find((row) => row.id === first.offer.id).metadata.created_date = new Date(Date.now() - 60000).toISOString();
  const replacement = await placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a2"] });
  assert.notEqual(replacement.offer.id, first.offer.id);
  assert.equal(f.state().offers.find((row) => row.id === first.offer.id).metadata.status, "cancelled");
  await assert.rejects(respondItemTrade(f.db, "b", { offer_id: first.offer.id, action: "accept" }), /already been answered/);
});

test("only the seller closes a listing and all bids close without moving inventory", async () => {
  const f = fixture(), { listing } = await createTradeListing(f.db, "b", { title: "Open bidding", inventory_ids: ["copy-b"] });
  const bid = await placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a"] });
  await assert.rejects(cancelTradeListing(f.db, "a", { listing_id: listing.id }), /Only the owner/);
  await cancelTradeListing(f.db, "b", { listing_id: listing.id });
  assert.equal(f.state().offers.find((row) => row.id === bid.offer.id).metadata.status, "expired");
  assert.deepEqual(f.state().inventory.map((row) => row.metadata.user_id), ["a", "b", "c"]);
  await assert.rejects(placeTradeBid(f.db, "c", { listing_id: listing.id, inventory_ids: ["copy-c"] }), /has closed/);
});

test("expired listings, blocks, stale copies and premium restrictions reject bids", async () => {
  for (const reason of ["expired", "blocked", "owner", "premium"]) {
    const f = fixture(), { listing } = await createTradeListing(f.db, "b", { title: "Open bidding", inventory_ids: ["copy-b"] });
    if (reason === "expired") f.state().offers[0].metadata.expires_date = new Date(0).toISOString();
    if (reason === "blocked") f.tx.blockedUser.findFirst = async () => ({ id: "blocked" });
    if (reason === "owner") f.state().inventory[1].metadata.user_id = "c";
    if (reason === "premium") f.state().items[1].metadata.is_premium_only = true;
    await assert.rejects(placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a"] }));
    assert.equal(f.state().offers.length, 1);
  }
});

test("a failed winning transfer rolls back both inventories, listing and competing bids", async () => {
  const f = fixture(), { listing } = await createTradeListing(f.db, "b", { title: "Open bidding", inventory_ids: ["copy-b"] });
  const { offer } = await placeTradeBid(f.db, "a", { listing_id: listing.id, inventory_ids: ["copy-a"] });
  await placeTradeBid(f.db, "c", { listing_id: listing.id, inventory_ids: ["copy-c"] });
  const before = structuredClone(f.state()), update = f.tx.userInventory.update;
  f.tx.userInventory.update = async (input) => { if (input.where.id === "copy-b") throw new Error("Storage failure"); return update(input); };
  await assert.rejects(respondItemTrade(f.db, "b", { offer_id: offer.id, action: "accept" }), /Storage failure/);
  assert.deepEqual(f.state(), before);
});

test("a direct trade of a listed item expires its listing and pending bids", async () => {
  const f = fixture(), { listing } = await createTradeListing(f.db, "b", { title: "Open bidding", inventory_ids: ["copy-b"] });
  const bid = await placeTradeBid(f.db, "c", { listing_id: listing.id, inventory_ids: ["copy-c"] });
  const direct = await f.create();
  await respondItemTrade(f.db, "b", { offer_id: direct.offer.id, action: "accept" });
  assert.equal(f.state().offers.find((row) => row.id === listing.id).metadata.status, "expired");
  assert.equal(f.state().offers.find((row) => row.id === bid.offer.id).metadata.status, "expired");
});
