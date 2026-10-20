import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCommunitySafetyRouter, messagingBlocked } from "../server/community-safety.js";

const matches = (row, where) => !where || (
  (!where.AND || where.AND.every(item => matches(row, item))) &&
  (!where.OR || where.OR.some(item => matches(row, item))) &&
  (!where.metadata || row.metadata[where.metadata.path[0]] === where.metadata.equals)
);
async function fixture(t) {
  const blocks = [], tickets = [];
  const messages = [{ id: "incoming", metadata: { sender_id: "other", recipient_id: "actor", content: "Reported example" } },
    { id: "private", metadata: { sender_id: "stranger", recipient_id: "other", content: "Private example" } }];
  const db = {
    user: { findUnique: async ({ where }) => ["actor", "other", "stranger"].includes(where.id) ? { id: where.id } : null },
    blockedUser: {
      findFirst: async ({ where }) => blocks.find(row => matches(row, where)),
      findMany: async ({ where }) => blocks.filter(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: `block-${blocks.length}`, ...data }; blocks.push(row); return row; },
      deleteMany: async ({ where }) => { for (let i = blocks.length - 1; i >= 0; i--) if (matches(blocks[i], where)) blocks.splice(i, 1); },
    },
    message: { findUnique: async ({ where }) => messages.find(row => row.id === where.id) },
    ticket: {
      findFirst: async ({ where }) => tickets.find(row => matches(row, where)),
      create: async ({ data }) => { const row = { id: `ticket-${tickets.length}`, ...data }; tickets.push(row); return row; },
    },
  };
  const app = express(); app.use(express.json());
  app.use(createCommunitySafetyRouter(db, (req, res, next) => {
    if (!req.headers["x-test-user"]) return res.status(401).json({ error: "Authentication required" });
    req.user = { id: req.headers["x-test-user"], username: "Example" }; next();
  }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (path, body, actor = "actor") => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(actor ? { "x-test-user": actor } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  return { db, blocks, tickets, request };
}

test("blocking prevents messages in either direction and only its owner can remove a block", async t => {
  const f = await fixture(t);
  assert.equal((await f.request("/block", { user_id: "other", blocked: true })).status, 200);
  assert.equal(await messagingBlocked(f.db, "actor", "other"), true);
  assert.equal(await messagingBlocked(f.db, "other", "actor"), true);
  assert.equal(await messagingBlocked(f.db, "actor", "stranger"), false);
  await f.request("/block", { user_id: "actor", blocked: false }, "other");
  assert.equal(await messagingBlocked(f.db, "actor", "other"), true);
  assert.deepEqual((await f.request("/blocked")).data.user_ids, ["other"]);
  assert.deepEqual((await f.request("/blocked", null, "other")).data.user_ids, []);
  await f.request("/block", { user_id: "other", blocked: false });
  assert.equal(await messagingBlocked(f.db, "actor", "other"), false);
});

test("reports require a conversation participant and produce one private staff ticket per message", async t => {
  const f = await fixture(t);
  assert.equal((await f.request("/report", { message_id: "private", reason: "Offensive message" })).status, 404);
  assert.equal(f.tickets.length, 0);
  assert.equal((await f.request("/report", { message_id: "incoming", reason: "Offensive message", user_id: "stranger" })).status, 201);
  assert.equal(f.tickets[0].metadata.user_id, "actor");
  assert.equal(f.tickets[0].metadata.reported_user_id, "other");
  assert.deepEqual(f.tickets[0].metadata.participant_user_ids, ["actor"]);
  assert.equal((await f.request("/report", { message_id: "incoming", reason: "Same message again" })).status, 200);
  assert.equal(f.tickets.length, 1);
});

test("safety endpoints validate inputs, require sign-in and limit repeated reports", async t => {
  const f = await fixture(t);
  assert.equal((await f.request("/blocked", null, null)).status, 401);
  assert.equal((await f.request("/block", { user_id: "actor" })).status, 400);
  assert.equal((await f.request("/block", { user_id: "missing" })).status, 404);
  assert.equal((await f.request("/report", { message_id: "incoming", reason: "bad" })).status, 400);
  for (let i = 0; i < 5; i++) await f.request("/report", { message_id: "incoming", reason: "Offensive message" });
  assert.equal((await f.request("/report", { message_id: "incoming", reason: "Offensive message" })).status, 429);
});
