import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { trophyCountsFor, recentTrophiesFor } from "../lib/trophyCounts.js";
import { getProfileArena } from "../profile-arena.js";
import { friendStatus, changeFriendship, listFriendRequests } from "../friends.js";

const router = Router();

router.get("/friend-requests", requireAuth, async (req, res, next) => {
  try {
    const offset = Number(req.query.offset || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return res.status(400).json({ error: "Invalid offset" });
    res.json(await listFriendRequests(prisma, req.user.id, offset));
  } catch (error) { next(error); }
});

router.get("/:userId/friendship", requireAuth, async (req, res, next) => {
  try { res.json(await friendStatus(prisma, req.user.id, req.params.userId)); }
  catch (error) { next(error); }
});

router.post("/:userId/friendship", requireAuth, async (req, res, next) => {
  try { res.json(await changeFriendship(prisma, req.user.id, req.params.userId, req.body?.action)); }
  catch (error) { next(error); }
});

router.get("/:userId/trophy-showcase", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "");
    if (!userId || userId.length > 128) return res.status(400).json({ error: "Invalid player ID" });
    const where = { metadata: { path: ["user_id"], equals: userId } };
    const [user, profile, inventory] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } }),
      prisma.playerProfile.findFirst({ where, orderBy: { created_date: "desc" }, select: { metadata: true } }),
      prisma.userInventory.findMany({ where, select: { id: true, created_date: true, metadata: true } }),
    ]);
    if (!user) return res.status(404).json({ error: "Player not found" });
    res.json({ trophies: recentTrophiesFor(user.metadata, profile?.metadata, inventory.map((row) => ({ ...row.metadata, id: row.id, created_date: row.created_date }))) });
  } catch (error) { next(error); }
});

router.get("/:userId/arena", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "");
    if (!userId || userId.length > 128) return res.status(400).json({ error: "Invalid player ID" });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.status(404).json({ error: "Player not found" });
    res.json(await getProfileArena(prisma, userId));
  } catch (error) { next(error); }
});

router.get("/:userId/friends", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "");
    if (!userId || userId.length > 128) return res.status(400).json({ error: "Invalid player ID" });
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    if (offset > 100000) return res.status(400).json({ error: "Invalid friend offset" });
    const rows = await prisma.friendship.findMany({ where: { OR: [
      { metadata: { path: ["user_id"], equals: userId } }, { metadata: { path: ["friend_id"], equals: userId } },
    ] }, orderBy: { created_date: "desc" }, select: { metadata: true } });
    const ids = [...new Set(rows.filter((row) => row.metadata?.is_active !== false).map(({ metadata }) => metadata.user_id === userId ? metadata.friend_id : metadata.user_id).filter((id) => typeof id === "string" && id && id !== userId))];
    const pageIds = ids.slice(offset, offset + 25);
    const [users, profiles] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: pageIds } }, select: { id: true, username: true, display_name: true, metadata: true } }),
      pageIds.length ? prisma.playerProfile.findMany({ where: { OR: pageIds.map((id) => ({ metadata: { path: ["user_id"], equals: id } })) }, orderBy: { created_date: "desc" }, select: { metadata: true } }) : [],
    ]);
    const avatar = new Map();
    for (const { metadata } of profiles) if (!avatar.has(metadata?.user_id)) avatar.set(metadata?.user_id, metadata?.avatar_url);
    const byId = new Map(users.map((user) => [user.id, user]));
    res.json({ total: ids.length, next_offset: offset + pageIds.length < ids.length ? offset + pageIds.length : null, friends: pageIds.filter((id) => byId.has(id)).map((id) => {
      const user = byId.get(id);
      return { id, username: user.username, name: user.display_name || user.username || "Player", avatar_url: avatar.get(id) || user.metadata?.avatar_url || "" };
    }) });
  } catch (error) { next(error); }
});

router.get("/trophies", requireAuth, async (req, res, next) => {
  try {
    const ids = JSON.parse(req.query.user_ids || "[]");
    if (!Array.isArray(ids) || ids.length > 32 || ids.some((id) => typeof id !== "string" || !id || id.length > 128)) {
      return res.status(400).json({ error: "Provide up to 32 player IDs" });
    }
    const userIds = [...new Set(ids)];
    if (!userIds.length) return res.json({});
    const ownedByPlayers = { OR: userIds.map((id) => ({ metadata: { path: ["user_id"], equals: id } })) };
    const [users, profiles, inventory] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, metadata: true } }),
      prisma.playerProfile.findMany({ where: ownedByPlayers, orderBy: { created_date: "desc" }, select: { metadata: true } }),
      prisma.userInventory.findMany({ where: ownedByPlayers, select: { metadata: true } }),
    ]);
    const profileByUser = new Map();
    const inventoryByUser = new Map();
    for (const { metadata } of profiles) {
      if (!profileByUser.has(metadata?.user_id)) profileByUser.set(metadata?.user_id, metadata);
    }
    for (const { metadata } of inventory) {
      const items = inventoryByUser.get(metadata?.user_id) || [];
      items.push(metadata);
      inventoryByUser.set(metadata?.user_id, items);
    }
    // Publish only trophy totals; inventories remain private to their owners.
    res.json(Object.fromEntries(users.map((user) => [user.id, trophyCountsFor(
      { ...user.metadata, id: user.id }, profileByUser.get(user.id), inventoryByUser.get(user.id),
    )])));
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid player IDs" });
    next(error);
  }
});

router.get("/:userId/tournament-participants", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "");
    const rows = await prisma.tournamentParticipant.findMany({
      where: {
        OR: [
          { metadata: { path: ["user_id"], equals: userId } },
          { metadata: { path: ["captain_id"], equals: userId } },
          { metadata: { path: ["members"], array_contains: [{ user_id: userId }] } },
        ],
      },
      orderBy: { created_date: "desc" },
      take: 500,
    });
    res.json(rows.map((row) => ({
      id: row.id,
      team_id: row.metadata?.team_id,
      user_id: row.metadata?.user_id,
      captain_id: row.metadata?.captain_id,
      tournament_id: row.metadata?.tournament_id,
      members: Array.isArray(row.metadata?.members)
        ? row.metadata.members.map((member) => ({ user_id: member?.user_id }))
        : [],
    })));
  } catch (error) {
    next(error);
  }
});

export default router;
