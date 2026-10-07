import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import express from "express";
import { recognizeRank } from "./rank-recognition.js";
import { initialRankState, nextRankSubmission, prepareRankImage, publicRankState } from "./rank-verification.js";
import { createRankVerificationRouter } from "./routes/rank-verification.js";
import entityRoutes from "./routes/entities.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import { checkRankImage, stopRankChecker } from "./rank-checker.js";

test("recognizes all supplied emblems with compression, shifted colors, changed numerals and larger screenshots", async () => {
  for (const rank of ["diamond", "crimson", "iridescent", "top250"]) {
    const original = await readFile(new URL(`./rank-references/${rank}.png`, import.meta.url));
    const { width, height } = await sharp(original).metadata();
    const patchWidth = Math.round(width * .18), patchHeight = Math.round(height * .08);
    const changedNumerals = await sharp(original).composite([{ input: await sharp({ create: { width: patchWidth, height: patchHeight, channels: 3, background: "#5c5e71" } }).png().toBuffer(), left: Math.round(width * .41), top: Math.round(height * .54) }]).png().toBuffer();
    const variants = [original, await sharp(original).jpeg({ quality: 70 }).toBuffer(), await sharp(original).modulate({ brightness: 1.12, saturation: .7, hue: 8 }).jpeg({ quality: 85 }).toBuffer(), changedNumerals,
      await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#252a39" } }).composite([{ input: await sharp(original).resize({ height: 380 }).toBuffer(), left: 750, top: 170 }]).jpeg().toBuffer()];
    for (let i = 0; i < variants.length; i++) {
      const prepared = await prepareRankImage(`data:image/${i === 0 || i === 3 ? "png" : "jpeg"};base64,${variants[i].toString("base64")}`);
      const result = await recognizeRank(prepared.bytes);
      assert.equal(result.rank, rank, `${rank} variant ${i}: ${JSON.stringify(result)}`);
    }
  }
});

test("color alone, rank text alone, malformed files and overly large pixel counts do not grant a rank", async () => {
  for (const background of ["#3399ff", "#df1515", "#b730e4", "#d5b237"]) {
    const image = await sharp({ create: { width: 450, height: 450, channels: 3, background } }).png().toBuffer();
    assert.equal((await recognizeRank(image)).rank, null);
  }
  const text = Buffer.from('<svg width="450" height="450"><rect width="450" height="450" fill="black"/><text x="15" y="240" font-size="45" fill="gold">TOP 250</text></svg>');
  assert.equal((await recognizeRank(await sharp(text).png().toBuffer())).rank, null);
  await assert.rejects(prepareRankImage("https://localhost/private"), /Upload a PNG/);
  await assert.rejects(prepareRankImage(`data:image/svg+xml;base64,${text.toString("base64")}`), /Upload a PNG/);
  await assert.rejects(prepareRankImage("data:image/png;base64,YmFk"), /could not be read/);
  const large = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "black" } }).png().toBuffer();
  await assert.rejects(prepareRankImage(`data:image/png;base64,${large.toString("base64")}`), /could not be read/);
});

test("five genuine failed images enter manual review, retries are idempotent and admin changes stay locked", () => {
  let state = initialRankState("u1");
  const result = { rank: null, confidence: 0, candidates: [] };
  for (let i = 0; i < 5; i++) {
    const image = { hash: `hash-${i}`, bytes: Buffer.from(`private-${i}`) };
    const now = new Date(1_800_000_000_000 + i * 6000);
    const update = nextRankSubmission(state, image, result, now);
    state = { ...state, ...update };
    if (i < 4) assert.equal(nextRankSubmission(state, image, result, now), null);
  }
  assert.equal(state.status, "manual_review"); assert.equal(state.failed_attempts, 5); assert.equal(state.attempts.length, 5);
  assert.ok(publicRankState(state, null).attempts.every((attempt) => !Object.hasOwn(attempt, "image")));
  for (const status of ["manual_review", "admin_locked", "rejected"]) assert.throws(() => nextRankSubmission({ ...state, status }, { hash: "fresh", bytes: Buffer.from("image") }, { rank: "top250" }), /admin must review/);
  const reset = { ...state, status: "idle", last_submitted_at: null };
  const success = nextRankSubmission(reset, { hash: "success", bytes: Buffer.from("rank") }, { rank: "diamond", confidence: .9, candidates: [] });
  assert.equal(success.status, "approved"); assert.equal(success.failed_attempts, 0);
});

test("API enforces owner identity, admin review, private screenshots and generic entity protections", async (t) => {
  const users = new Map([
    ["u1", { id: "u1", role: "user", email_verified: true, metadata: {} }],
    ["u2", { id: "u2", role: "user", email_verified: true, metadata: {} }],
    ["admin", { id: "admin", role: "admin", email_verified: true, metadata: {} }],
  ]);
  const states = new Map(), audits = [];
  let result = { rank: "diamond", confidence: .9, candidates: [] }, failChecker = false;
  const override = (target, method, implementation) => {
    const original = target[method]; target[method] = implementation;
    t.after(() => { target[method] = original; });
  };
  override(prisma.user, "findUnique", async ({ where }) => users.get(where.id));
  override(prisma.ban, "findMany", async () => []);
  const db = {
    user: { findUnique: async ({ where }) => users.get(where.id), findMany: async ({ where }) => [...users.values()].filter((user) => where.id.in.includes(user.id)) },
    rankVerification: {
      findUnique: async ({ where }) => states.get(where.user_id) || null,
      upsert: async ({ where, create, update }) => {
        const row = { ...initialRankState(where.user_id), ...(states.get(where.user_id) || create), ...update, updated_date: new Date() }; states.set(where.user_id, row); return row;
      },
      findMany: async () => [...states.values()],
    },
    adminAction: { create: async ({ data }) => { audits.push(data.metadata); } },
    $executeRaw: async (_parts, ...args) => { if (args.length === 2) users.get(args[1]).metadata.screenshot_rank = JSON.parse(args[0]); },
    $transaction: async (action) => action(db),
  };
  const app = express(); app.use(express.json({ limit: "4mb" }));
  app.use("/rank", createRankVerificationRouter(db, async () => { if (failChecker) throw new Error("worker failure"); return result; }));
  app.use("/entities", entityRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (path, user = "u1", body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${signUser(users.get(user))}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request("/rank/me", null)).status, 401);
  assert.equal((await request("/rank/admin")).status, 403);
  const bytes = await readFile(new URL("./rank-references/diamond.png", import.meta.url));
  const image = `data:image/png;base64,${bytes.toString("base64")}`;
  const submitted = await request("/rank/submit", "u1", { image, user_id: "u2", rank: "top250", confidence: 1 });
  assert.equal(submitted.status, 200); assert.equal(submitted.data.rank, "diamond"); assert.equal(users.get("u2").metadata.screenshot_rank, undefined);
  assert.ok(submitted.data.attempts.every((attempt) => !attempt.image));
  const attemptId = submitted.data.attempts[0].id;
  assert.equal((await request(`/rank/image/u1/${attemptId}`, "u2")).status, 403);
  assert.ok((await request(`/rank/image/u1/${attemptId}`, "admin")).data.image.startsWith("data:image/jpeg;base64,"));
  assert.equal((await request("/rank/admin/u1", "u2", { action: "set_rank", rank: "top250", reason: "Fake approval" })).status, 403);
  const review = { action: "set_rank", rank: "crimson", reason: "Discord report checked", expected_updated_date: submitted.data.updated_date };
  assert.equal((await request("/rank/admin/u1", "admin", { ...review, expected_updated_date: null })).status, 409);
  const changed = await request("/rank/admin/u1", "admin", review);
  assert.equal(changed.status, 200); assert.equal(changed.data.rank, "crimson"); assert.equal(changed.data.status, "admin_locked"); assert.equal(audits.length, 1);
  assert.equal((await request("/rank/submit", "u1", { image })).status, 409);
  assert.equal((await request("/entities/RankVerification", "u1")).status, 403);
  assert.equal((await request("/entities/rankVerification", "u1")).status, 403);
  const patched = await fetch(`http://127.0.0.1:${server.address().port}/entities/user/u1`, { method: "PATCH", headers: { Authorization: `Bearer ${signUser(users.get("u1"))}`, "Content-Type": "application/json" }, body: JSON.stringify({ screenshot_rank: "top250" }) });
  assert.equal(patched.status, 403);
  failChecker = true;
  assert.equal((await request("/rank/submit", "u2", { image })).status, 503); assert.equal(states.has("u2"), false);
  failChecker = false; result = { rank: null, confidence: 0, candidates: [] };
  for (let i = 0; i < 5; i++) {
    if (states.has("u2")) states.get("u2").last_submitted_at = new Date(0);
    const variant = await sharp(bytes).modulate({ brightness: 1 + i * .02 }).png().toBuffer();
    const response = await request("/rank/submit", "u2", { image: `data:image/png;base64,${variant.toString("base64")}` });
    assert.equal(response.status, 200); assert.equal(response.data.failed_attempts, i + 1);
  }
  assert.equal(states.get("u2").status, "manual_review");
  assert.equal((await request("/rank/submit", "u2", { image })).status, 409);
});

test("the worker runs recognition without blocking API execution", async (t) => {
  t.after(stopRankChecker);
  const image = await readFile(new URL("./rank-references/top250.png", import.meta.url));
  assert.equal((await checkRankImage(image)).rank, "top250");
});
