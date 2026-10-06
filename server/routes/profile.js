import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { trophyCountsFor } from "../lib/trophyCounts.js";

const router = Router();

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
