import test from "node:test";
import assert from "node:assert/strict";
import { createItemTrade, respondItemTrade, tradeItemRestriction, previouslyTradedItemIds } from "./item-trading.js";

function fixture() {
  let state = {
    users: ["a", "b", "c"].map((id) => ({ id, username: id, email_verified: true, is_banned: false, metadata: {} })),
    items: ["a", "b", "c"].map((id) => ({ id: `item-${id}`, metadata: { name: `Cosmetic ${id}`, category: "cosmetic", is_tradeable: true } })),
    inventory: ["a", "b", "c"].map((id) => ({ id: `copy-${id}`, metadata: { user_id: id, item_id: `item-${id}`, item_name: `Cosmetic ${id}`, item_category: "cosmetic", is_equipped: true } })),
    offers: [], notices: [],
  };
  const copy = (value) => structuredClone(value);
  const update = (table, { where, data }) => { const row = state[table].find((entry) => entry.id === where.id); Object.assign(row, copy(data)); return copy(row); };
  const tx = {
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ total: 0 }],
    blockedUser: { findFirst: async () => null },
    user: { findMany: async ({ where }) => copy(state.users.filter((row) => where.id.in.includes(row.id))), update: async (input) => update("users", input) },
    marketplaceItem: { findMany: async ({ where }) => copy(state.items.filter((row) => where.id.in.includes(row.id))) },
    userInventory: { findMany: async ({ where }) => copy(state.inventory.filter((row) => where.id.in.includes(row.id))), update: async (input) => update("inventory", input) },
    tradeOffer: { create: async ({ data }) => { const row = { id: `trade-${state.offers.length}`, created_date: new Date(), ...copy(data) }; state.offers.push(row); return copy(row); },
      findUnique: async ({ where }) => copy(state.offers.find((row) => row.id === where.id) || null), update: async (input) => update("offers", input) },
    notification: { create: async ({ data }) => { state.notices.push(copy(data)); return copy(data); } },
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
