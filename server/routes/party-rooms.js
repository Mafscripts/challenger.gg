import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { changePartyRoom, createPartyRoom, flattenPartyRoom, getPartyRoom } from "../party-rooms.js";
import { PARTY_ROOM_LIFETIME_MS } from "../party-voice.js";

const router = Router();
router.use(requireAuth);
router.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.partyRoom.findMany({ where: { status: { not: "closed" }, updated_date: { gte: new Date(Date.now() - PARTY_ROOM_LIFETIME_MS) }, OR: [
      { owner_id: req.user.id }, { metadata: { path: ["players"], array_contains: [{ user_id: req.user.id }] } },
    ] }, orderBy: { updated_date: "desc" }, take: 25 });
    res.json({ rooms: rows.map(flattenPartyRoom) });
  } catch (error) { next(error); }
});
router.post("/", async (req, res, next) => {
  try { res.json({ room: await createPartyRoom(prisma, req.user, req.body || {}) }); }
  catch (error) { next(error); }
});
router.get("/:id", async (req, res, next) => {
  try { res.json(await getPartyRoom(prisma, req.params.id)); }
  catch (error) { next(error); }
});
router.post("/:id", async (req, res, next) => {
  try { res.json({ room: await changePartyRoom(prisma, req.params.id, req.user, req.body || {}) }); }
  catch (error) { next(error); }
});
export default router;
