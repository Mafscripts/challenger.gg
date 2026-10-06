import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

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
