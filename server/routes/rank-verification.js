import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { hasRole } from "../roles.js";
import { initialRankState, prepareRankImage, publicRankState, rankError, setScreenshotRank, withRankLock } from "../rank-verification.js";
import { screenshotRankFor, selfSelectableRanks } from "../../src/lib/screenshotRanks.js";

export function createRankVerificationRouter(db = prisma) {
  const router = Router();
  router.use(requireAuth);
  const stateFor = async (userId) => {
    const [state, user] = await Promise.all([db.rankVerification.findUnique({ where: { user_id: userId } }), db.user.findUnique({ where: { id: userId } })]);
    if (!user) throw rankError("Player not found", 404);
    return { user, state: state || initialRankState(userId) };
  };
  router.get("/me", async (req, res, next) => {
    try { const { state, user } = await stateFor(req.user.id); res.json(publicRankState(state, user.metadata?.screenshot_rank)); } catch (error) { next(error); }
  });
  // Old clients must not auto-award Top 250 through image recognition.
  router.post("/submit", (_req, res) => res.status(410).json({ error: "Choose your game rank in Settings. Top 250 requires an admin request." }));
  router.post("/select", async (req, res, next) => {
    try {
      const rank = req.body?.rank;
      if (rank !== null && !selfSelectableRanks.some((item) => item.id === rank)) throw rankError("Choose Diamond, Crimson or Iridescent. Top 250 requires an admin request.");
      const response = await withRankLock(db, req.user.id, async (tx) => {
        const current = await tx.rankVerification.findUnique({ where: { user_id: req.user.id } }) || initialRankState(req.user.id);
        // Selecting an ordinary rank keeps any pending admin request in its queue.
        const update = { updated_date: new Date(), ...(current.status === "manual_review" ? {} : { status: rank ? "self_selected" : "idle" }) };
        const updated = await tx.rankVerification.upsert({ where: { user_id: req.user.id }, create: { user_id: req.user.id, ...update }, update });
        await setScreenshotRank(tx, req.user.id, rank);
        const user = await tx.user.findUnique({ where: { id: req.user.id } });
        return publicRankState(updated, user.metadata?.screenshot_rank);
      });
      res.json(response);
    } catch (error) { next(error); }
  });
  router.post("/top250-request", async (req, res, next) => {
    try {
      const note = req.body?.note ?? "";
      if (typeof note !== "string" || note.length > 500) throw rankError("Your request message must be at most 500 characters.");
      const image = req.body?.image ? await prepareRankImage(req.body.image) : null;
      const response = await withRankLock(db, req.user.id, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: req.user.id } });
        if (!user) throw rankError("Player not found", 404);
        const current = await tx.rankVerification.findUnique({ where: { user_id: user.id } }) || initialRankState(user.id);
        if (current.status === "manual_review") return publicRankState(current, user.metadata?.screenshot_rank);
        if (user.metadata?.screenshot_rank === "top250") throw rankError("Top 250 is already assigned to your account.", 409);
        if (current.last_submitted_at && Date.now() - new Date(current.last_submitted_at) < 30_000) throw rankError("Wait 30 seconds before sending another request.", 429);
        const request = { id: crypto.randomUUID(), kind: "top250_request", rank: "top250", note: note.trim(), submitted_at: new Date().toISOString(), ...(image ? { hash: image.hash, image: image.bytes.toString("base64") } : {}) };
        const update = { status: "manual_review", failed_attempts: 0, last_submitted_at: new Date(), reviewed_by: null, review_reason: null, attempts: [...(current.attempts || []), request].slice(-5) };
        const row = await tx.rankVerification.upsert({ where: { user_id: user.id }, create: { user_id: user.id, ...update }, update });
        const admins = await tx.user.findMany({ where: { OR: [{ role: { in: ["admin", "super_admin", "ceo"] } }, { admin_role: { in: ["admin", "super_admin", "ceo"] } }, { is_admin: true }] }, select: { id: true, role: true, admin_role: true, is_admin: true } });
        for (const admin of admins.filter((admin) => hasRole(admin, "admin"))) await tx.notification.create({ data: { metadata: {
          user_id: admin.id, type: "system", title: "Top 250 rank request", message: `${user.display_name || user.username || user.id} requested the Top 250 rank. Review and assign it in Verify Rank.`, is_read: false,
          action_url: `/admin?tab=verifyRank&player=${encodeURIComponent(user.id)}`, related_entity_id: user.id, related_entity_type: "RankVerification", rank_request_id: request.id,
        } } });
        return publicRankState(row, user.metadata?.screenshot_rank);
      });
      res.json(response);
    } catch (error) { next(error); }
  });
  router.get("/image/:userId/:attemptId", async (req, res, next) => {
    try {
      if (req.params.userId !== req.user.id && !hasRole(req.user, "admin")) throw rankError("Admin access required", 403);
      const row = await db.rankVerification.findUnique({ where: { user_id: req.params.userId } });
      const attempt = (row?.attempts || []).find((entry) => entry.id === req.params.attemptId);
      if (!attempt?.image) throw rankError("Screenshot not found", 404);
      res.set("Cache-Control", "no-store").json({ image: `data:image/jpeg;base64,${attempt.image}` });
    } catch (error) { next(error); }
  });
  router.get("/admin", requireAdmin, async (req, res, next) => {
    try {
      const status = req.query.status === "manual_review" ? "manual_review" : undefined;
      const rows = await db.rankVerification.findMany({ where: status ? { status } : {}, orderBy: [{ updated_date: "desc" }, { user_id: "asc" }], take: 51, ...(req.query.cursor ? { cursor: { user_id: String(req.query.cursor) }, skip: 1 } : {}) });
      const users = await db.user.findMany({ where: { id: { in: rows.slice(0, 50).map((row) => row.user_id) } }, select: { id: true, username: true, display_name: true, metadata: true } });
      const byId = new Map(users.map((user) => [user.id, user]));
      res.json({ rows: rows.slice(0, 50).map((row) => ({ ...publicRankState(row, byId.get(row.user_id)?.metadata?.screenshot_rank), user_name: byId.get(row.user_id)?.display_name || byId.get(row.user_id)?.username || row.user_id })), next_cursor: rows.length > 50 ? rows[49].user_id : null });
    } catch (error) { next(error); }
  });
  router.get("/admin/:userId", requireAdmin, async (req, res, next) => {
    try { const { state, user } = await stateFor(req.params.userId); res.json({ ...publicRankState(state, user.metadata?.screenshot_rank), user_name: user.display_name || user.username || user.id }); } catch (error) { next(error); }
  });
  router.post("/admin/:userId", requireAdmin, async (req, res, next) => {
    try {
      const { action, rank, reason, expected_updated_date: expected } = req.body || {};
      if (!["set_rank", "reject", "reset"].includes(action) || typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500) throw rankError("Choose an action and enter a reason (3–500 characters).");
      if (action === "set_rank" && rank !== null && !screenshotRankFor(rank)) throw rankError("Choose Diamond, Crimson, Iridescent, Top 250 or no rank.");
      const response = await withRankLock(db, req.params.userId, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: req.params.userId } });
        if (!user) throw rankError("Player not found", 404);
        const current = await tx.rankVerification.findUnique({ where: { user_id: user.id } });
        if ((current?.updated_date?.toISOString() || null) !== (expected || null)) throw rankError("This request changed. Refresh it before reviewing.", 409);
        const update = { status: action === "set_rank" ? "admin_locked" : action === "reject" ? "rejected" : "idle", reviewed_by: req.user.id, review_reason: reason.trim(), ...(action === "reset" ? { failed_attempts: 0, attempts: [], last_submitted_at: null } : {}) };
        const row = await tx.rankVerification.upsert({ where: { user_id: user.id }, create: { user_id: user.id, ...update }, update });
        if (action === "set_rank") await setScreenshotRank(tx, user.id, rank);
        await tx.adminAction.create({ data: { metadata: { action: "screenshot_rank_review", admin_id: req.user.id, target_user_id: user.id, decision: action, previous_rank: user.metadata?.screenshot_rank || null, rank: action === "set_rank" ? rank : user.metadata?.screenshot_rank || null, reason: reason.trim() } } });
        await tx.notification.create({ data: { metadata: { user_id: user.id, type: "system", title: action === "set_rank" ? "Game rank updated" : action === "reject" ? "Rank request declined" : "Rank review reopened", message: action === "set_rank" ? `Your game rank is now ${screenshotRankFor(rank)?.label || "not set"}. ${reason.trim()}` : reason.trim(), is_read: false, action_url: "/settings#settings-rank", related_entity_id: user.id, related_entity_type: "RankVerification" } } });
        return publicRankState(row, action === "set_rank" ? rank : user.metadata?.screenshot_rank);
      });
      res.json(response);
    } catch (error) { next(error); }
  });
  return router;
}
export default createRankVerificationRouter();
