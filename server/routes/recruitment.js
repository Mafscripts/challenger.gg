import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { hasRole } from "../roles.js";
import { containsBlockedLanguage } from "../profanity-filter.js";
import { publicStaffPresentation } from "../../src/lib/roles.js";
import { recruitmentGames, recruitmentModes, recruitmentRegions, recruitmentLanguages, recruitmentAvailability, recruitmentTeamFits, recruitmentGamesFor } from "../../src/lib/recruitment.js";

const router = Router();
router.use(requireAuth);
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const cleanText = (value, min, max, label) => {
  if (typeof value !== "string") fail(`${label} is required`);
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (text.length < min || text.length > max) fail(`${label} must be ${min}–${max} characters`);
  if (containsBlockedLanguage(text)) fail("Please follow the community language rules");
  return text;
};
const choice = (items, value, label) => { if (!items.some((item) => item.id === value)) fail(`Choose a valid ${label}`); return value; };
const rankChoices = ["any", "diamond", "crimson", "iridescent", "top250"];
const metadataOnly = (fields) => Prisma.sql`jsonb_build_object(${Prisma.join(fields.flatMap((key) => [Prisma.sql`${key}::text`, Prisma.sql`metadata -> ${key}::text`]))})`;
const teamFields = ["name", "tag", "team_type", "captain_id", "roster_size", "is_active"];
const badgeFields = ["screenshot_rank", "badges", "verified_player", "is_verified_player", "streamer_badge", "is_streamer", "console_restricted",
  "force_stream_required", "stream_override_required", "monitor_cam_required", "required_monitor_cam", "moni_cam_required", "monitor_cam_override_required"];

async function ensureCanPost(tx, userId) {
  const bans = await tx.ban.findMany({ where: { AND: [field("user_id", userId), field("scope", "find_players_chat"), field("status", "active")] }, select: { metadata: true } });
  if (bans.some(({ metadata }) => !metadata.expires_date || new Date(metadata.expires_date).getTime() > Date.now())) fail("Your Find Players restriction also applies to recruitment posts", 403);
}

async function rosterInfo(db, teamIds) {
  if (!teamIds.length) return new Map();
  const [teams, members] = await Promise.all([
    db.$queryRaw`SELECT id, ${metadataOnly(teamFields)} AS metadata FROM "Team" WHERE id IN (${Prisma.join(teamIds)})`,
    db.$queryRaw`SELECT ${metadataOnly(["user_id", "team_id"])} AS metadata FROM "TeamMember"
      WHERE metadata ->> 'team_id' IN (${Prisma.join(teamIds)}) AND COALESCE(metadata ->> 'is_active', 'true') <> 'false'`,
  ]);
  return new Map(teams.map((team) => [team.id, { ...team.metadata, id: team.id,
    members: [...new Set(members.filter((row) => row.metadata.team_id === team.id).map((row) => row.metadata.user_id))] }]));
}

async function hydrate(db, rows) {
  const ids = [...new Set(rows.map((row) => row.user_id))];
  const [users, teams, counts, ranks] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, display_name: true, full_name: true, role: true, admin_role: true, is_admin: true, is_premium: true, premium_expires: true, created_date: true } }),
    rosterInfo(db, [...new Set(rows.map((row) => row.team_id).filter(Boolean))]),
    ids.length ? db.$queryRaw`SELECT metadata ->> 'user_id' AS user_id, COUNT(DISTINCT metadata ->> 'team_id')::int AS count
      FROM "TeamMember" WHERE metadata ->> 'user_id' IN (${Prisma.join(ids)}) AND COALESCE(metadata ->> 'is_active', 'true') <> 'false' GROUP BY metadata ->> 'user_id'` : [],
    ids.length ? db.$queryRaw`SELECT id, ${metadataOnly(badgeFields)} AS metadata FROM "User" WHERE id IN (${Prisma.join(ids)})` : [],
  ]);
  const players = new Map(users.map((user) => [user.id, publicStaffPresentation({ ...user, name: user.display_name || user.username || user.full_name || "Player",
    ...ranks.find((row) => row.id === user.id)?.metadata, team_count: counts.find((row) => row.user_id === user.id)?.count || 0 })]));
  return rows.map((row) => {
    const team = teams.get(row.team_id);
    const validTeam = team && team.is_active !== false && team.captain_id === row.user_id && recruitmentTeamFits(team, row.competition);
    const openSpots = validTeam ? Math.max(0, Number(team.roster_size || 0) - team.members.length) : 0;
    return { ...row, expires_at: row.expires_at.toISOString(), created_date: row.created_date.toISOString(), updated_date: row.updated_date.toISOString(),
      status: row.status !== "open" ? row.status : row.expires_at <= new Date() ? "expired" : row.kind === "team" && !openSpots ? "filled" : "open",
      player: players.get(row.user_id), team: validTeam ? { id: team.id, name: team.name, tag: team.tag, roster_size: team.roster_size, filled: team.members.length, open_spots: openSpots } : null };
  });
}

router.get("/", async (req, res, next) => {
  try {
    const mine = req.query.mine === "true";
    const where = mine ? { user_id: req.user.id } : { status: "open", expires_at: { gt: new Date() }, owner: { is_banned: false } };
    if (!mine) {
      if (!hasRole(req.user, "moderator")) {
        const blocks = await prisma.blockedUser.findMany({ where: { OR: [field("user_id", req.user.id), field("blocked_user_id", req.user.id)] }, select: { metadata: true } });
        const hidden = blocks.map(({ metadata }) => metadata.user_id === req.user.id ? metadata.blocked_user_id : metadata.user_id).filter((id) => typeof id === "string");
        if (hidden.length) where.user_id = { notIn: hidden };
      }
      for (const [key, items] of [["competition", recruitmentModes], ["game_id", recruitmentGames], ["kind", [{ id: "player" }, { id: "team" }]]]) {
        if (req.query[key]) where[key] = choice(items, req.query[key], key);
      }
      if (req.query.region && req.query.region !== "any") where.region = { in: ["any", choice(recruitmentRegions, req.query.region, "region")] };
      if (req.query.language && req.query.language !== "any") where.language = { in: ["any", choice(recruitmentLanguages, req.query.language, "language")] };
      if (req.query.availability) where.availability = { in: [...new Set(["flexible", choice(recruitmentAvailability, req.query.availability, "availability")])] };
      if (req.query.rank && req.query.rank !== "any") {
        if (!rankChoices.includes(req.query.rank)) fail("Choose a valid rank");
        where.OR = [{ kind: "player", owner: { metadata: { path: ["screenshot_rank"], equals: req.query.rank } } }, { kind: "team", rank: { in: ["any", req.query.rank] } }];
      }
    }
    const cursor = req.query.cursor;
    if (cursor && (typeof cursor !== "string" || cursor.length > 128)) fail("Invalid page cursor");
    const rows = await prisma.recruitmentPost.findMany({ where, orderBy: [{ created_date: "desc" }, { id: "desc" }], take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const page = rows.slice(0, 20);
    const posts = await hydrate(prisma, page);
    res.json({ posts: mine ? posts : posts.filter((post) => post.status === "open"), next_cursor: rows.length > 20 ? page.at(-1).id : null, can_moderate: hasRole(req.user, "moderator") });
  } catch (error) { next(error); }
});

router.put("/", async (req, res, next) => {
  try {
    const body = req.body || {};
    const data = { kind: choice([{ id: "player" }, { id: "team" }], body.kind, "post type"), competition: choice(recruitmentModes, body.competition, "competition"),
      game_id: choice(recruitmentGamesFor(body.competition), body.game_id, "game"), region: choice(recruitmentRegions, body.region, "region"), language: choice(recruitmentLanguages, body.language, "language"),
      availability: choice(recruitmentAvailability, body.availability, "availability"), title: cleanText(body.title, 3, 80, "Title"), description: cleanText(body.description, 10, 500, "Description") };
    if (!rankChoices.includes(body.rank)) fail("Choose a valid preferred rank");
    data.rank = data.kind === "team" ? body.rank : "any";
    if (![24, 72, 168].includes(body.duration)) fail("Choose an expiry of 1, 3 or 7 days");
    try { new Intl.DateTimeFormat("en", { timeZone: body.timezone }).format(); } catch { fail("Choose a valid timezone"); }
    if (typeof body.timezone !== "string" || body.timezone.length > 64) fail("Choose a valid timezone");
    data.timezone = body.timezone;
    if (body.id !== undefined && (typeof body.id !== "string" || body.id.length > 128)) fail("Invalid post ID");
    const post = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recruitment:${req.user.id}`}))`;
      await ensureCanPost(tx, req.user.id);
      const existing = body.id ? await tx.recruitmentPost.findUnique({ where: { id: body.id } }) : null;
      if (body.id && (!existing || existing.user_id !== req.user.id)) fail("Post not found", 404);
      if (existing?.status === "removed") fail("Staff removed this post. Contact support if you need help.", 403);
      if (data.kind === "team") {
        if (typeof body.team_id !== "string" || body.team_id.length > 128) fail("Choose your team");
        const team = (await rosterInfo(tx, [body.team_id])).get(body.team_id);
        if (!team || team.is_active === false || team.captain_id !== req.user.id || !recruitmentTeamFits(team, data.competition)) fail("Choose an active team you captain for this competition");
        if (!team.members.includes(req.user.id)) fail("Your captain must be on the roster");
        if (!Number.isInteger(Number(team.roster_size)) || team.members.length >= Number(team.roster_size)) fail("This roster has no open places");
        data.team_id = team.id;
      } else data.team_id = null;
      const own = await tx.recruitmentPost.findMany({ where: { user_id: req.user.id, status: "open", expires_at: { gt: new Date() } }, select: { id: true, kind: true, competition: true, game_id: true, team_id: true } });
      if (own.some((row) => row.id !== existing?.id && row.kind === data.kind && row.competition === data.competition && row.game_id === data.game_id && row.team_id === data.team_id)) fail("You already have an active call for this mode. Edit it from My posts.");
      if (own.filter((row) => row.id !== existing?.id).length >= 5) fail("Keep up to five active recruitment posts. Close an old post first.");
      if (!existing) {
        const latest = await tx.recruitmentPost.findFirst({ where: { user_id: req.user.id }, orderBy: { created_date: "desc" }, select: { created_date: true } });
        if (latest && Date.now() - latest.created_date.getTime() < 30_000) fail("Wait a few seconds before posting another call", 429);
      }
      const values = { ...data, user_id: req.user.id, status: "open", moderation_reason: null, expires_at: new Date(Date.now() + (data.availability === "now" ? 3 : body.duration) * 3600_000) };
      return existing ? tx.recruitmentPost.update({ where: { id: existing.id }, data: values }) : tx.recruitmentPost.create({ data: values });
    });
    res.json({ post: (await hydrate(prisma, [post]))[0] });
  } catch (error) { next(error); }
});

router.post("/:id/close", async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      const initial = await tx.recruitmentPost.findUnique({ where: { id: req.params.id } });
      if (!initial) fail("Post not found", 404);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recruitment:${initial.user_id}`}))`;
      const post = await tx.recruitmentPost.findUnique({ where: { id: req.params.id } });
      if (!post) fail("Post not found", 404);
      const own = post.user_id === req.user.id;
      if (!own && !hasRole(req.user, "moderator")) fail("You cannot close this post", 403);
      if (post.status === "removed") return;
      const reason = own ? null : cleanText(req.body?.reason, 5, 160, "Moderation reason");
      await tx.recruitmentPost.update({ where: { id: post.id }, data: { status: own ? "closed" : "removed", moderation_reason: reason } });
      if (!own) {
        await tx.adminAction.create({ data: { metadata: { action_type: "recruitment_removed", admin_id: req.user.id, target_id: post.id, user_id: post.user_id, reason } } });
        await tx.notification.create({ data: { metadata: { user_id: post.user_id, type: "system", title: "Recruitment post removed", message: reason, action_url: "/find-players?view=mine", is_read: false } } });
      }
    });
    res.json({ success: true });
  } catch (error) { next(error); }
});
export default router;
