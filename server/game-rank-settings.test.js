import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { readFile } from "node:fs/promises";
import { createRankVerificationRouter } from "./routes/rank-verification.js";
import entityRoutes from "./routes/entities.js";
import authRoutes from "./routes/auth.js";
import { initialRankState } from "./rank-verification.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

test("self-selected ranks and admin-only Top 250 requests use authenticated identity and notify the right users", async (t) => {
  const users = new Map([
    ["player", { id: "player", role: "user", username: "Sage", email_verified: true, metadata: { activision_id: "Sage#123", free_eights_elo: 1200 } }],
    ["other", { id: "other", role: "user", email_verified: true, metadata: {} }],
    ...["admin", "super_admin", "ceo", "moderator"].map((role) => [role, { id: role, role, email_verified: true, metadata: {} }]),
    ["extra-admin", { id: "extra-admin", role: "user", admin_role: "admin", email_verified: true, metadata: {} }],
    ["flag-admin", { id: "flag-admin", role: "user", is_admin: true, email_verified: true, metadata: {} }],
  ]);
  const states = new Map(), audits = [], notifications = [];
  let version = Date.now(), notificationFailure = false;
  const clone = (value) => value ? structuredClone(value) : null;
  const override = (target, name, implementation) => { const original = target[name]; target[name] = implementation; t.after(() => { target[name] = original; }); };
  override(prisma.user, "findUnique", async ({ where }) => clone(users.get(where.id)));
  override(prisma.ban, "findMany", async () => []);
  const db = {
    user: {
      findUnique: async ({ where }) => clone(users.get(where.id)),
      findMany: async ({ where }) => [...users.values()].filter((user) => where.OR || where.id.in.includes(user.id)).map(clone),
    },
    rankVerification: {
      findUnique: async ({ where }) => clone(states.get(where.user_id)),
      upsert: async ({ where, create, update }) => {
        const current = states.get(where.user_id);
        const row = { ...initialRankState(where.user_id), ...(current || create), ...(current ? update : {}), updated_date: new Date(++version) };
        states.set(where.user_id, row); return clone(row);
      },
      findMany: async ({ where }) => [...states.values()].filter((row) => !where.status || row.status === where.status).map(clone),
    },
    adminAction: { create: async ({ data }) => { audits.push(data.metadata); } },
    notification: { create: async ({ data }) => { if (notificationFailure) throw new Error("notification unavailable"); notifications.push(data.metadata); } },
    $executeRaw: async (_parts, ...args) => { if (args.length === 2) users.get(args[1]).metadata.screenshot_rank = JSON.parse(args[0]); },
  };
  // Model the production advisory lock and rollback for simultaneous requests.
  let transactionTail = Promise.resolve();
  db.$transaction = (action) => {
    const work = transactionTail.then(async () => {
      const beforeUsers = structuredClone(users), beforeStates = structuredClone(states), noticeCount = notifications.length, auditCount = audits.length;
      try { return await action(db); } catch (error) {
        users.clear(); beforeUsers.forEach((value, key) => users.set(key, value));
        states.clear(); beforeStates.forEach((value, key) => states.set(key, value));
        notifications.length = noticeCount; audits.length = auditCount; throw error;
      }
    });
    transactionTail = work.catch(() => {}); return work;
  };
  const app = express(); app.use(express.json({ limit: "4mb" }));
  app.use("/rank", createRankVerificationRouter(db)); app.use("/entities", entityRoutes); app.use("/auth", authRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (path, body, userId = "player", method = body ? "POST" : "GET") => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${signUser(users.get(userId))}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };

  await t.test("players select ordinary ranks immediately without impersonating another account", async () => {
    assert.equal((await request("/rank/select", { rank: "diamond" }, null)).status, 401);
    for (const rank of ["diamond", "crimson", "iridescent"]) {
      const response = await request("/rank/select", { rank, user_id: "other", screenshot_rank: "top250" });
      assert.equal(response.status, 200); assert.equal(response.data.rank, rank);
      assert.equal(users.get("player").metadata.screenshot_rank, rank);
      assert.equal(users.get("other").metadata.screenshot_rank, undefined);
      assert.equal(users.get("player").metadata.activision_id, "Sage#123");
      assert.equal(users.get("player").metadata.free_eights_elo, 1200);
    }
    for (const rank of ["top250", "Diamond", "bronze", "challenger", {}, 250, undefined]) assert.equal((await request("/rank/select", { rank })).status, 400);
    assert.equal((await request("/rank/submit", { image: "ignored", rank: "top250" })).status, 410);
    assert.equal((await request("/auth/me", { screenshot_rank: "top250" }, "player", "PATCH")).status, 403);
    assert.equal((await request("/entities/user/player", { screenshot_rank: "top250" }, "player", "PATCH")).status, 403);
    for (const name of ["RankVerification", "rankVerification"]) assert.equal((await request(`/entities/${name}`)).status, 403);
  });

  let pending, screenshotId;
  await t.test("requests preserve the current rank, deduplicate concurrent retries and notify every admin but no moderator", async () => {
    const bytes = await readFile(new URL("./rank-references/top250.png", import.meta.url));
    const image = `data:image/png;base64,${bytes.toString("base64")}`;
    const requests = await Promise.all([request("/rank/top250-request", { note: "Please review my rank", image, user_id: "other", rank: "top250" }), request("/rank/top250-request", { note: "Please review my rank", image })]);
    requests.forEach((response) => assert.equal(response.status, 200));
    pending = requests[0].data; screenshotId = pending.top250_request.id;
    assert.equal(pending.status, "manual_review"); assert.equal(pending.rank, "iridescent");
    assert.equal(pending.top250_request.note, "Please review my rank");
    assert.equal(pending.top250_request.has_image, true);
    assert.equal(pending.attempts.length, 1);
    assert.ok(pending.attempts.every((attempt) => !Object.hasOwn(attempt, "image")));
    assert.equal(pending.top250_request.image, undefined);
    assert.equal(users.get("player").metadata.screenshot_rank, "iridescent");
    assert.equal(states.has("other"), false);
    assert.deepEqual(notifications.map((notice) => notice.user_id).sort(), ["admin", "ceo", "extra-admin", "flag-admin", "super_admin"]);
    notifications.forEach((notice) => { assert.equal(notice.action_url, "/admin?tab=verifyRank&player=player"); assert.equal(notice.is_read, false); assert.equal(notice.rank_request_id, screenshotId); });
    assert.equal((await request("/rank/admin")).status, 403);
    assert.equal((await request("/rank/admin", undefined, "moderator")).status, 403);
    const queue = await request("/rank/admin?status=manual_review", undefined, "admin");
    assert.equal(queue.data.rows[0].top250_request.rank, "top250");
    assert.equal(queue.data.rows[0].user_name, "Sage");
    assert.equal((await request(`/rank/image/player/${screenshotId}`, undefined, "other")).status, 403);
    assert.equal((await request(`/rank/image/player/${screenshotId}`, undefined, "moderator")).status, 403);
    for (const user of ["player", "admin"]) assert.match((await request(`/rank/image/player/${screenshotId}`, undefined, user)).data.image, /^data:image\/jpeg;base64,/);
  });

  await t.test("editing an ordinary rank keeps the request pending and prevents approval of a stale review", async () => {
    const changed = await request("/rank/select", { rank: "diamond" });
    assert.equal(changed.data.status, "manual_review"); assert.equal(changed.data.top250_request.id, screenshotId);
    assert.equal((await request("/rank/admin/player", { action: "set_rank", rank: "top250", reason: "Verified", expected_updated_date: pending.updated_date }, "admin")).status, 409);
    pending = changed.data;
    assert.equal((await request("/rank/admin/player", { action: "set_rank", rank: "top250", reason: "Forged", expected_updated_date: pending.updated_date })).status, 403);
    const approved = await request("/rank/admin/player", { action: "set_rank", rank: "top250", reason: "Screenshot verified", expected_updated_date: pending.updated_date }, "admin");
    assert.equal(approved.status, 200); assert.equal(approved.data.rank, "top250");
    assert.equal(users.get("player").metadata.screenshot_rank, "top250");
    assert.equal(audits[0].previous_rank, "diamond"); assert.equal(audits[0].admin_id, "admin");
    assert.equal(notifications.at(-1).user_id, "player"); assert.equal(notifications.at(-1).title, "Game rank updated");
    assert.equal((await request("/rank/top250-request", {})).status, 409);
    assert.equal((await request("/rank/select", { rank: "crimson" })).data.rank, "crimson");
  });

  await t.test("optional evidence, rejection, input validation and notification failures are handled without granting Top 250", async () => {
    for (const body of [{ note: "x".repeat(501) }, { note: {} }, { image: "https://private.example" }, { image: "data:image/png;base64,YmFk" }]) assert.equal((await request("/rank/top250-request", body, "other")).status, 400);
    notificationFailure = true;
    assert.equal((await request("/rank/top250-request", {}, "other")).status, 500);
    assert.equal(states.has("other"), false);
    notificationFailure = false;
    const before = notifications.length;
    const requested = await request("/rank/top250-request", {}, "other");
    assert.equal(requested.status, 200); assert.equal(requested.data.rank, null); assert.equal(requested.data.top250_request.has_image, false);
    assert.equal((await request(`/rank/image/other/${requested.data.top250_request.id}`, undefined, "admin")).status, 404);
    const rejected = await request("/rank/admin/other", { action: "reject", reason: "Please provide evidence", expected_updated_date: requested.data.updated_date }, "admin");
    assert.equal(rejected.data.status, "rejected"); assert.equal(rejected.data.rank, null);
    assert.equal(notifications.at(-1).title, "Rank request declined");
    assert.equal((await request("/rank/top250-request", {}, "other")).status, 429);
    states.get("other").last_submitted_at = new Date(0);
    assert.equal((await request("/rank/top250-request", { note: "Evidence available on Discord" }, "other")).status, 200);
    assert.equal(notifications.length, before + 11);
    assert.equal((await request("/rank/select", { rank: null })).data.rank, null);
  });
});
