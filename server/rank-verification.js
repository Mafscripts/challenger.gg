import crypto from "node:crypto";
import sharp from "sharp";
import { screenshotRankFor, top250RequestFor } from "../src/lib/screenshotRanks.js";

export const lockedRankStatuses = new Set(["manual_review", "admin_locked", "rejected"]);
export const rankError = (message, status = 400) => Object.assign(new Error(message), { status });
export const initialRankState = (userId) => ({ user_id: userId, status: "idle", failed_attempts: 0, attempts: [] });
export const publicRankState = (row, rank) => ({
  ...initialRankState(row?.user_id), ...row, rank: screenshotRankFor(rank)?.id || null,
  attempts: (row?.attempts || []).map(({ image: _image, ...attempt }) => ({ ...attempt, has_image: Boolean(_image) })),
  top250_request: (() => { const request = top250RequestFor(row); if (!request) return null; const { image, ...summary } = request; return { ...summary, has_image: Boolean(image) }; })(),
});

export async function prepareRankImage(dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > 2_800_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)) throw rankError("Upload a PNG, JPG or WebP image up to 2 MB.");
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  if (!bytes.length || bytes.length > 2_000_000) throw rankError("Image must be between 1 byte and 2 MB.");
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format) || (metadata.pages || 1) > 1 || metadata.width < 100 || metadata.height < 100) throw new Error("Unsupported image");
    const normalized = await image.rotate().flatten({ background: "#111111" }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    if (normalized.length > 1_000_000) throw rankError("Image is too detailed. Crop the rank card and upload it again.");
    return { bytes: normalized, hash: crypto.createHash("sha256").update(bytes).digest("hex") };
  } catch (error) {
    if (error.status) throw error;
    throw rankError("This image could not be read. Use a clear PNG, JPG or WebP screenshot.");
  }
}

export function nextRankSubmission(current, image, result, now = new Date()) {
  if (lockedRankStatuses.has(current.status)) throw rankError("An admin must review or reopen your rank verification before another upload.", 409);
  if ((current.attempts || []).some((attempt) => attempt.hash === image.hash)) return null;
  if (current.last_submitted_at && now - new Date(current.last_submitted_at) < 5000) throw rankError("Wait a few seconds before uploading another image.", 429);
  const rank = screenshotRankFor(result.rank)?.id || null;
  const failed = rank ? 0 : Math.min(5, current.failed_attempts + 1);
  return {
    status: rank ? "approved" : failed >= 5 ? "manual_review" : "retry",
    failed_attempts: failed,
    last_submitted_at: now,
    reviewed_by: null,
    review_reason: null,
    attempts: [...(current.attempts || []), { id: crypto.randomUUID(), hash: image.hash, image: image.bytes.toString("base64"), submitted_at: now.toISOString(), rank, confidence: result.confidence, candidates: result.candidates }].slice(-5),
  };
}

export async function withRankLock(db, userId, action) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`screenshot-rank:${userId}`}))`;
    return action(tx);
  }, { maxWait: 10_000, timeout: 15_000 });
}

export async function setScreenshotRank(tx, userId, rank) {
  // Update only this metadata key so unrelated concurrent profile writes survive.
  await tx.$executeRaw`UPDATE "User" SET "metadata" = jsonb_set("metadata", '{screenshot_rank}', ${JSON.stringify(rank)}::jsonb), "updated_date" = NOW() WHERE "id" = ${userId}`;
}
