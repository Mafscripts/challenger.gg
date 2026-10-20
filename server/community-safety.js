import { Router } from "express";
import { requireAuth } from "./middleware/auth.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export async function messagingBlocked(db, first, second) {
  return Boolean(await db.blockedUser.findFirst({ where: { OR: [
    { AND: [{ metadata: { path: ["user_id"], equals: first } }, { metadata: { path: ["blocked_user_id"], equals: second } }] },
    { AND: [{ metadata: { path: ["user_id"], equals: second } }, { metadata: { path: ["blocked_user_id"], equals: first } }] },
  ] } }));
}
export function createCommunitySafetyRouter(db, authenticate = requireAuth) {
  const router = Router();
  const reportAttempts = new Map();
  router.use(authenticate);
  router.post("/block", async (req, res, next) => {
    try {
      const id = req.body?.user_id;
      if (typeof id !== "string" || !id || id.length > 200 || id === req.user.id) fail("Choose another player.");
      if (!await db.user.findUnique({ where: { id }, select: { id: true } })) fail("Player not found.", 404);
      const where = { AND: [{ metadata: { path: ["user_id"], equals: req.user.id } }, { metadata: { path: ["blocked_user_id"], equals: id } }] };
      if (req.body.blocked === false) await db.blockedUser.deleteMany({ where });
      else if (!await db.blockedUser.findFirst({ where })) await db.blockedUser.create({ data: { metadata: { user_id: req.user.id, blocked_user_id: id } } });
      res.json({ success: true, blocked: req.body.blocked !== false });
    } catch (error) { next(error); }
  });
  router.get("/blocked", async (req, res, next) => {
    try { const rows = await db.blockedUser.findMany({ where: { metadata: { path: ["user_id"], equals: req.user.id } }, take: 1000 }); res.json({ user_ids: rows.map(row => row.metadata.blocked_user_id) }); }
    catch (error) { next(error); }
  });
  router.post("/report", async (req, res, next) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (reason.length < 5 || reason.length > 1000) fail("Describe the problem in 5–1000 characters.");
      const messageId = req.body?.message_id;
      if (typeof messageId !== "string" || !messageId || messageId.length > 200) fail("Choose the message to report.");
      const now = Date.now();
      for (const [id, entry] of reportAttempts) if (now - entry.started >= 10 * 60_000) reportAttempts.delete(id);
      const attempt = reportAttempts.get(req.user.id) || { started: now, count: 0 };
      if (attempt.count >= 5) fail("Please wait before sending more reports.", 429);
      attempt.count++; reportAttempts.set(req.user.id, attempt);
      const message = await db.message.findUnique({ where: { id: messageId } });
      if (!message || ![message.metadata.sender_id, message.metadata.recipient_id].includes(req.user.id)) fail("Message not found.", 404);
      const existing = await db.ticket.findFirst({ where: { AND: [
        { metadata: { path: ["user_id"], equals: req.user.id } },
        { metadata: { path: ["reported_message_id"], equals: messageId } },
      ] } });
      if (existing) return res.json({ success: true, ticket_id: existing.id });
      const ticket = await db.ticket.create({ data: { metadata: {
        user_id: req.user.id, username: req.user.username || req.user.display_name, subject: "Community safety report", category: "account", priority: "high", status: "open", request_type: "support", participant_user_ids: [req.user.id], messages: [], internal_notes: [],
        description: `Reported message ${message.id} from player ${message.metadata.sender_id}.\nReason: ${reason}\nContent: ${String(message.metadata.content || "").slice(0, 1000)}`,
        reported_user_id: message.metadata.sender_id, reported_message_id: message.id,
      } } });
      res.status(201).json({ success: true, ticket_id: ticket.id });
    } catch (error) { next(error); }
  });
  return router;
}
