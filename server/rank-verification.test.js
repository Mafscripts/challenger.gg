import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { recognizeRank } from "./rank-recognition.js";
import { initialRankState, nextRankSubmission, prepareRankImage, publicRankState } from "./rank-verification.js";
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

test("the worker runs recognition without blocking API execution", async (t) => {
  t.after(stopRankChecker);
  const image = await readFile(new URL("./rank-references/top250.png", import.meta.url));
  assert.equal((await checkRankImage(image)).rank, "top250");
});
