import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { trophyCountsFor, recentTrophiesFor } from "../lib/trophyCounts.js";
import { getProfileArena } from "../profile-arena.js";
import { friendStatus, changeFriendship, listFriendRequests } from "../friends.js";
import { playerAvatarFor } from "../lib/playerAvatars.js";
import { xpTeamMatchWhere } from "../lib/xpTeamMatches.js";
import { isExpiredOpenMatch } from "../matchfinder-expiry.js";
import { getTeamPage, getTeamPageActivity, getTeamPagePlayers, teamPageIds } from "../team-page.js";

const router = Router();

router.get("/team-page", requireAuth, async (req, res, next) => {
  try { res.json(await getTeamPage(prisma, req.user.id, req.query.team || "")); }
  catch (error) { next(error); }
});

router.get("/team-page/activity", requireAuth, async (req, res, next) => {
  try { res.json(await getTeamPageActivity(prisma, req, teamPageIds(req.query.team_ids))); }
  catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid team IDs" });
    next(error);
  }
});

router.get("/team-page/players", requireAuth, async (req, res, next) => {
  try { res.json(await getTeamPagePlayers(prisma, req, req.query.team)); }
  catch (error) { next(error); }
});

router.get("/team-xp-matches", requireAuth, async (req, res, next) => {
  try {
    const ids = JSON.parse(req.query.team_ids || "[]");
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== "string" || !id || id.length > 128)) {
      return res.status(400).json({ error: "Provide up to 100 team IDs" });
    }
    const teamIds = [...new Set(ids)];
    if (!teamIds.length) return res.json([]);
    const rows = await prisma.xPMatch.findMany({ where: xpTeamMatchWhere(teamIds), orderBy: { created_date: "desc" }, take: 300 });
    res.json(rows.map((row) => {
      const match = { ...row.metadata, id: row.id, created_date: row.created_date };
      return isExpiredOpenMatch(match) ? { ...match, status: "expired" } : match;
    }));
  } catch (error) {
    if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid team IDs" });
    next(error);
  }
});

router.get("/:userId/teams", requireAuth, async (req, res, next) => {
  try {
    const userId = String(req.params.userId || "");
    if (!userId || userId.length > 128) return res.status(400).json({ error: "Invalid player ID" });
    const rows = await prisma.teamMember.findMany({
      where: { metadata: { path: ["user_id"], equals: userId } },
      select: { id: true, metadata: true, created_date: true },
    });
    const memberships = new Map();
    const joinedAt = (row) => Date.parse(row.metadata?.joined_date || row.created_date) || 0;
    for (const row of rows.sort((a, b) => joinedAt(b) - joinedAt(a))) {
      const member = row.metadata || {};
      if (member.is_active === false || typeof member.team_id !== "string" || !member.team_id || memberships.has(member.team_id)) continue;
      memberships.set(member.team_id, {
        id: row.id, user_id: userId, team_id: member.team_id,
        role: member.role || "member", joined_date: member.joined_date || row.created_date,
      });
      if (memberships.size === 100) break;
    }
    if (!memberships.size) return res.json([]);
    const teams = await prisma.team.findMany({ where: { id: { in: [...memberships.keys()] } }, select: { id: true, metadata: true } });
    const hiddenTypes = new Set(["8s", "eights", "money8s"]);
    const summaryFields = ["name", "tag", "team_type", "roster_size", "captain_id", "region", "logo_url", "banner_url", "total_wins", "total_losses"];
    const byId = new Map(teams
      .filter(({ metadata: team }) => team?.is_active !== false && team?.is_demo !== true && !hiddenTypes.has(String(team?.team_type || "").toLowerCase()))
      .map(({ id, metadata }) => [id, { ...Object.fromEntries(summaryFields.filter((field) => Object.hasOwn(metadata || {}, field)).map((field) => [field, metadata[field]])), id }]));
    res.json([...memberships.values()].filter((member) => byId.has(member.team_id)).map((member) => ({ ...member, team: byId.get(member.team_id) })));
  } catch (error) { next(error); }
});

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
      prisma.user.findMany({ where: { id: { in: pageIds } }, select: { id: true, username: true, display_name: true, role: true, admin_role: true, is_admin: true, metadata: true } }),
      pageIds.length ? prisma.playerProfile.findMany({ where: { OR: pageIds.map((id) => ({ metadata: { path: ["user_id"], equals: id } })) }, orderBy: { created_date: "desc" }, select: { metadata: true } }) : [],
    ]);
    const avatar = new Map();
    for (const { metadata } of profiles) if (!avatar.has(metadata?.user_id)) avatar.set(metadata?.user_id, metadata);
    const byId = new Map(users.map((user) => [user.id, user]));
    res.json({ total: ids.length, next_offset: offset + pageIds.length < ids.length ? offset + pageIds.length : null, friends: pageIds.filter((id) => byId.has(id)).map((id) => {
      const user = byId.get(id);
      return { id, username: user.username, name: user.display_name || user.username || "Player", avatar_url: playerAvatarFor(user, avatar.get(id)) };
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
