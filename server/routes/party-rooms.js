import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { changePartyRoom, createPartyRoom, flattenPartyRoom, getPartyRoom, partyRoomSummary, partyRoomView } from "../party-rooms.js";
import { PARTY_ROOM_LIFETIME_MS } from "../party-voice.js";
import { partyRoomStorageError, requirePartyRoomStorage } from "../party-room-storage.js";
import { searchPartyPlayers } from "../party-players.js";

const router = Router();
router.use(requireAuth);
router.use((_req, _res, next) => {
  try { requirePartyRoomStorage(prisma); next(); }
  catch (error) { next(error); }
});
router.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.partyRoom.findMany({ where: { status: { not: "closed" }, updated_date: { gte: new Date(Date.now() - PARTY_ROOM_LIFETIME_MS) }, OR: [
      { owner_id: req.user.id }, { metadata: { path: ["players"], array_contains: [{ user_id: req.user.id }] } },
    ] }, orderBy: { updated_date: "desc" }, take: 25 });
    res.json({ rooms: rows.map((row) => partyRoomSummary(flattenPartyRoom(row))) });
  } catch (error) { next(error); }
});
router.post("/", async (req, res, next) => {
  try { res.json({ room: await createPartyRoom(prisma, req.user, req.body || {}) }); }
  catch (error) { next(error); }
});
router.get("/players", async (req, res, next) => {
  try { res.json({ players: await searchPartyPlayers(prisma, req.query.query) }); }
  catch (error) { next(error); }
});
router.get("/:id", async (req, res, next) => {
  try { res.json(await getPartyRoom(prisma, req.params.id, { matchId: typeof req.query.match === "string" ? req.query.match : null })); }
  catch (error) { next(error); }
});
router.post("/:id", async (req, res, next) => {
  try { res.json({ room: partyRoomView(await changePartyRoom(prisma, req.params.id, req.user, req.body || {}), req.body?.view_match_id) }); }
  catch (error) { next(error); }
});
router.use((error, _req, _res, next) => {
  const storageError = partyRoomStorageError(error);
  if (storageError.code === "PARTY_ROOMS_NOT_READY") console.error("[Co-ed / Switcheroo]", storageError.cause?.message);
  next(storageError);
});
export default router;
