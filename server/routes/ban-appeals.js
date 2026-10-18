import { Router } from "express";
import { prisma } from "../prisma.js";
import { verifyToken, verifyBanAppealToken } from "../auth.js";
import { requireAuth, requireCEO } from "../middleware/auth.js";
import { evaluateAccess, restrictionDetails } from "../ban-enforcement.js";

const router = Router();
const nameFor = (user) => user.display_name || user.username || "Player";
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const cursorFor = (row, field) => row ? Buffer.from(JSON.stringify([row[field], row.id])).toString("base64url") : null;
const beforeCursor = (value, field) => {
  if (!value) return {};
  try {
    if (typeof value !== "string" || value.length > 500) throw new Error();
    const [rawDate, id] = JSON.parse(Buffer.from(value, "base64url").toString());
    const date = new Date(rawDate);
    if (!Number.isFinite(date.getTime()) || typeof id !== "string" || !id || id.length > 100) throw new Error();
    return { OR: [{ [field]: { lt: date } }, { [field]: date, id: { lt: id } }] };
  } catch { fail("Invalid page cursor"); }
};
const messagePage = async (appealId, before) => {
  const rows = appealId ? await prisma.banAppealMessage.findMany({
    where: { appeal_id: appealId, ...beforeCursor(before, "created_date") },
    orderBy: [{ created_date: "desc" }, { id: "desc" }], take: 26,
  }) : [];
  const visible = rows.slice(0, 25);
  return { messages: visible.reverse(), has_more: rows.length > 25,
    next_cursor: rows.length > 25 ? cursorFor(rows[24], "created_date") : null };
};

// Only these two endpoints accept restricted credentials; normal requireAuth rejects them.
const appealIdentity = async (req, res, next) => {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
    let payload;
    try { payload = verifyToken(token); }
    catch {
      try { payload = verifyBanAppealToken(token); }
      catch { return res.status(401).json({ error: "Please sign in again to access your appeal." }); }
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "Please sign in again to access your appeal." });
    req.appealAccess = await evaluateAccess({ req, user });
    req.appealUser = user;
    next();
  } catch (error) { next(error); }
};
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

async function sendMessage({ actor, ownerId, appealId, body = {}, access, ceo = false }) {
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const requestId = String(body.request_id || "");
  if (!content || content.length > 2000) fail("Write a message of 1–2,000 characters.");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) fail("A valid message request ID is required.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR UPDATE`;
    const existing = await tx.banAppealMessage.findUnique({ where: { sender_id_request_id: { sender_id: actor.id, request_id: requestId } } });
    if (existing) {
      const thread = await tx.banAppeal.findUnique({ where: { id: existing.appeal_id } });
      if (thread?.user_id !== ownerId) fail("Message request already used", 409);
      if (existing.content !== content) fail("Message request already used for a different message", 409);
      return { success: true, replayed: true };
    }
    const latest = await tx.banAppealMessage.findFirst({ where: { sender_id: actor.id }, orderBy: { created_date: "desc" } });
    if (latest && Date.now() - latest.created_date.getTime() < (ceo ? 3000 : 30000)) fail(ceo ? "Please wait a few seconds before replying again." : "Please wait 30 seconds between messages.", 429);
    let thread;
    if (ceo) {
      thread = await tx.banAppeal.findUnique({ where: { id: appealId } });
      if (!thread || thread.user_id !== ownerId) fail("Appeal not found", 404);
    } else {
      if (!access.blocked) fail("Your account is no longer restricted. Sign in to continue.", 409);
      thread = await tx.banAppeal.upsert({ where: { user_id: ownerId },
        create: { user_id: ownerId, ban_reason: restrictionDetails(access).reason }, update: {} });
    }
    await tx.banAppealMessage.create({ data: { appeal_id: thread.id, sender_id: actor.id,
      sender_role: ceo ? "ceo" : "user", sender_name: ceo ? "CEO team" : nameFor(actor), content, request_id: requestId } });
    await tx.banAppeal.update({ where: { id: thread.id }, data: {
      status: ceo ? "awaiting_user" : "awaiting_ceo", ...(!ceo ? { ban_reason: restrictionDetails(access).reason } : {}), updated_date: new Date(),
    } });
    if (!ceo) {
      const ceos = await tx.user.findMany({ where: { OR: [{ role: "ceo" }, { admin_role: "ceo" }] }, select: { id: true } });
      for (const user of ceos) await tx.notification.create({ data: { metadata: { user_id: user.id,
        title: "Ban appeal needs review", message: "A private appeal is waiting for a CEO response.",
        type: "system", is_read: false, action_url: "/admin?tab=banAppeals" } } });
    }
    return { success: true };
  });
}

router.get("/me", appealIdentity, wrap(async (req, res) => {
  const appeal = await prisma.banAppeal.findUnique({ where: { user_id: req.appealUser.id } });
  res.json({ restriction: req.appealAccess.blocked ? restrictionDetails(req.appealAccess) : null,
    appeal, ...await messagePage(appeal?.id, req.query.before) });
}));
router.post("/me/messages", appealIdentity, wrap(async (req, res) => {
  res.json(await sendMessage({ actor: req.appealUser, ownerId: req.appealUser.id, body: req.body, access: req.appealAccess }));
}));

router.use("/admin", requireAuth, requireCEO);
router.get("/admin", wrap(async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 100);
  const status = String(req.query.status || "all");
  if (!["all", "awaiting_ceo", "awaiting_user", "closed"].includes(status)) fail("Invalid status");
  const rows = await prisma.banAppeal.findMany({
    where: { AND: [beforeCursor(req.query.before, "updated_date"), ...(status === "all" ? [] : [{ status }]),
      ...(search ? [{ user: { OR: ["username", "display_name", "email"].map((key) => ({ [key]: { contains: search, mode: "insensitive" } })) } }] : [])] },
    orderBy: [{ updated_date: "desc" }, { id: "desc" }], take: 26,
    include: { user: { select: { id: true, username: true, display_name: true, email: true } } },
  });
  res.json({ appeals: rows.slice(0, 25), has_more: rows.length > 25, next_cursor: rows.length > 25 ? cursorFor(rows[24], "updated_date") : null });
}));
router.get("/admin/:id", wrap(async (req, res) => {
  const appeal = await prisma.banAppeal.findUnique({ where: { id: req.params.id },
    include: { user: { select: { id: true, username: true, display_name: true, email: true } } } });
  if (!appeal) fail("Appeal not found", 404);
  res.json({ appeal, ...await messagePage(appeal.id, req.query.before) });
}));
router.post("/admin/:id/messages", wrap(async (req, res) => {
  const appeal = await prisma.banAppeal.findUnique({ where: { id: req.params.id } });
  if (!appeal) fail("Appeal not found", 404);
  res.json(await sendMessage({ actor: req.user, ownerId: appeal.user_id, appealId: appeal.id, body: req.body, ceo: true }));
}));
router.patch("/admin/:id", wrap(async (req, res) => {
  if (!["closed", "awaiting_ceo"].includes(req.body.status)) fail("Invalid appeal status");
  const appeal = await prisma.banAppeal.findUnique({ where: { id: req.params.id } });
  if (!appeal) fail("Appeal not found", 404);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${appeal.user_id} FOR UPDATE`;
    await tx.banAppeal.update({ where: { id: appeal.id }, data: { status: req.body.status } });
    await tx.adminAction.create({ data: { metadata: { admin_id: req.user.id, admin_name: nameFor(req.user),
      action_type: "ban_appeal_status", target_user_id: appeal.user_id, description: `Ban appeal ${req.body.status === "closed" ? "closed" : "reopened"}.` } } });
  });
  res.json({ success: true });
}));
export default router;
