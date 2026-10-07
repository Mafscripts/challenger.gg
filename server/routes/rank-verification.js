import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { hasRole } from "../roles.js";
import { checkRankImage } from "../rank-checker.js";
import { initialRankState, lockedRankStatuses, nextRankSubmission, prepareRankImage, publicRankState, rankError, setScreenshotRank, withRankLock } from "../rank-verification.js";
import { screenshotRankFor } from "../../src/lib/screenshotRanks.js";

export function createRankVerificationRouter(db = prisma, recognize = checkRankImage) {
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
  router.post("/submit", async (req, res, next) => {
    try {
      const { state } = await stateFor(req.user.id);
      if (lockedRankStatuses.has(state.status)) throw rankError("Your rank verification is awaiting admin review or has been set by admin.", 409);
      const image = await prepareRankImage(req.body?.image);
      if ((state.attempts || []).some((attempt) => attempt.hash === image.hash)) {
        const current = await stateFor(req.user.id);
        return res.json(publicRankState(current.state, current.user.metadata?.screenshot_rank));
      }
      if (state.last_submitted_at && Date.now() - new Date(state.last_submitted_at) < 5000) throw rankError("Wait a few seconds before uploading another image.", 429);
      // Technical checker failures are not failed recognition attempts.
      let result;
      try { result = await recognize(image.bytes); } catch { throw rankError("Rank checker is temporarily unavailable. Try again shortly; this does not count as a failed attempt.", 503); }
      const response = await withRankLock(db, req.user.id, async (tx) => {
        const current = await tx.rankVerification.findUnique({ where: { user_id: req.user.id } }) || initialRankState(req.user.id);
        const update = nextRankSubmission(current, image, result);
        const updated = update ? await tx.rankVerification.upsert({ where: { user_id: req.user.id }, create: { user_id: req.user.id, ...update }, update }) : current;
        if (update && screenshotRankFor(result.rank)) await setScreenshotRank(tx, req.user.id, result.rank);
        const user = await tx.user.findUnique({ where: { id: req.user.id } });
        return publicRankState(updated, user.metadata?.screenshot_rank);
      });
      console.info("[Screenshot rank]", JSON.stringify({ event: "checked", user_id: req.user.id, status: response.status, rank: response.rank, failed_attempts: response.failed_attempts }));
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
        return publicRankState(row, action === "set_rank" ? rank : user.metadata?.screenshot_rank);
      });
      res.json(response);
    } catch (error) { next(error); }
  });
  return router;
}
export default createRankVerificationRouter();
