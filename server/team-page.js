import { Prisma } from "@prisma/client";
import { serializeRow } from "./entity.js";
import { getLeaderboardAvatars } from "./leaderboard-players.js";
import { trophyCountsFor } from "./lib/trophyCounts.js";
import { staffAvatarFor } from "../src/lib/staffAvatars.js";
import { publicStaffPresentation } from "../src/lib/roles.js";
import { hasRole } from "./roles.js";

const hiddenTypes = new Set(["8s", "eights", "money8s"]);
const active = (row) => row.metadata?.is_active !== false;
const fieldEquals = (field, value) => ({ metadata: { path: [field], equals: value } });
const ownedByTeams = (ids, fields) => ({ OR: ids.flatMap((id) => fields.map((field) => fieldEquals(field, id))) });
const selectRows = { id: true, metadata: true, created_date: true, updated_date: true };
const project = (row, fields) => ({ id: row.id, created_date: row.created_date,
  ...Object.fromEntries(fields.filter((field) => Object.hasOwn(row.metadata || {}, field)).map((field) => [field, row.metadata[field]])) });
const memberFields = ["team_id", "user_id", "user_name", "role", "is_active", "joined_date"];
const teamFields = ["name", "tag", "team_type", "captain_id", "captain_name", "roster_size", "region", "description", "logo_url", "banner_url",
  "is_active", "ranking", "total_wins", "total_losses", "records_reset_at", "win_streak"];

export function teamPageIds(input) {
  const ids = JSON.parse(input || "[]");
  if (!Array.isArray(ids) || ids.length > 101 || ids.some((id) => typeof id !== "string" || !id || id.length > 128)) {
    throw Object.assign(new Error("Provide up to 101 team IDs"), { status: 400 });
  }
  return [...new Set(ids)];
}

// One batched roster query replaces a request per team and per player. Match
// history and uploaded player images are intentionally outside this response.
export async function getTeamPage(db, userId, linkedId = "") {
  if (typeof linkedId !== "string" || linkedId.length > 128) throw Object.assign(new Error("Invalid team ID"), { status: 400 });
  const [memberships, invites] = await Promise.all([
    db.teamMember.findMany({ where: fieldEquals("user_id", userId), select: selectRows }),
    db.teamInvite.findMany({ where: { AND: [fieldEquals("invited_user_id", userId), fieldEquals("status", "pending")] }, orderBy: { created_date: "desc" }, take: 50 }),
  ]);
  const memberIds = new Set(memberships.filter(active).map((row) => row.metadata?.team_id).filter(Boolean));
  const ids = [...new Set([...memberIds, ...invites.map((row) => row.metadata?.team_id), linkedId].filter(Boolean))];
  const rows = await db.team.findMany({ where: { OR: [fieldEquals("captain_id", userId), { id: { in: ids } }] }, select: selectRows });
  const allowed = rows.filter((row) => active(row) && !hiddenTypes.has(String(row.metadata?.team_type || "").toLowerCase()));
  const visible = allowed.filter((row) => row.metadata?.captain_id === userId || memberIds.has(row.id) || row.id === linkedId);
  const rosters = visible.length ? await db.teamMember.findMany({ where: ownedByTeams(visible.map((row) => row.id), ["team_id"]), select: selectRows,
    orderBy: { created_date: "desc" } }) : [];
  const playerIds = [...new Set(rosters.filter(active).map((row) => row.metadata?.user_id).filter((id) => typeof id === "string" && id))];
  const players = playerIds.length ? await db.user.findMany({ where: { id: { in: playerIds } },
    select: { id: true, display_name: true, full_name: true, username: true } }) : [];
  const names = new Map(players.map((player) => [player.id, player.display_name || player.full_name || player.username]));
  const membersByTeam = Object.fromEntries(visible.map((row) => [row.id, []]));
  for (const row of rosters) if (active(row)) membersByTeam[row.metadata.team_id].push({ ...project(row, memberFields),
    user_name: names.get(row.metadata.user_id) || row.metadata.user_name || "Player" });
  const allowedIds = new Set(allowed.map((row) => row.id));
  return {
    teams: visible.map((row) => ({ ...project(row, teamFields), updated_date: row.updated_date })),
    membersByTeam,
    invites: invites.filter((row) => allowedIds.has(row.metadata?.team_id)).map((row) => project(row, ["team_id", "team_name", "team_type", "invited_user_id", "status", "invited_by", "invited_by_name"])),
  };
}

const wagerFields = ["host_team_id", "challenger_team_id", "host_id", "challenger_id", "host_team_name", "challenger_team_name", "host_name", "challenger_name",
  "status", "match_type", "game_mode_display", "game_mode", "team_size", "winner_id", "winner_team", "confirmed_score_alpha", "confirmed_score_bravo",
  "reported_score_alpha", "reported_score_bravo", "team_alpha_score_reported", "team_bravo_score_reported", "winner_score", "loser_score",
  "match_started_date", "accepted_date", "match_completed_date", "completed_date"];
const matchFields = ["team_a_id", "team_b_id", "team_a_name", "team_b_name", "tournament_id", "completed", "status", "round", "winner_id",
  "team_a_score", "team_b_score", "game_mode", "tournament_game_mode", "scheduled_start_date", "assigned_date", "completed_date", "match_completed_date"];
const participantFields = ["team_id", "team_name", "tournament_id", "registered_date", "status", "placement", "seed", "wins", "losses", "eliminated", "eliminated_round", "final_rank", "prize_won"];
const tournamentFields = ["name", "title", "status", "start_date", "game_mode", "team_size", "game", "game_id", "prize_pool"];
const metadataProjection = (fields) => Prisma.sql`jsonb_build_object(${Prisma.join(fields.flatMap((field) => [Prisma.sql`${field}::text`, Prisma.sql`metadata -> ${field}::text`]))})`;

// Table names are fixed SQL fragments at the call sites; IDs/fields stay bound
// parameters. Do not read screenshots, chat or full bracket payloads here.
const activityRows = (db, table, ids, scopeFields, fields) => db.$queryRaw`
  SELECT id, created_date, ${metadataProjection(fields)} AS metadata FROM ${table}
  WHERE ${Prisma.join(scopeFields.map((field) => Prisma.sql`metadata ->> ${field}::text IN (${Prisma.join(ids)})`), " OR ")}
  ORDER BY created_date DESC, id DESC LIMIT 300`;

export async function getTeamPageActivity(db, req, ids) {
  if (!ids.length) return { wagers: [], tournaments: [], participants: [], matches: [] };
  const [wagers, participants, matches] = await Promise.all([
    activityRows(db, Prisma.sql`"Wager"`, ids, ["host_team_id", "challenger_team_id"], wagerFields),
    activityRows(db, Prisma.sql`"TournamentParticipant"`, ids, ["team_id"], participantFields),
    activityRows(db, Prisma.sql`"TournamentMatch"`, ids, ["team_a_id", "team_b_id"], matchFields),
  ]);
  // Retain the generic Wager endpoint's participant/staff visibility rules,
  // using one membership lookup rather than one query for every match.
  const privateIds = wagers.filter((row) => !["open", "registration"].includes(row.metadata?.status || "open")
    && row.metadata?.host_id !== req.user.id && row.metadata?.challenger_id !== req.user.id).map((row) => row.id);
  const tournamentIds = [...new Set([...participants, ...matches].map((row) => row.metadata?.tournament_id).filter(Boolean))];
  const [tournaments, wagerParticipants] = await Promise.all([
    tournamentIds.length ? db.$queryRaw`SELECT id, created_date, ${metadataProjection(tournamentFields)} AS metadata
      FROM "Tournament" WHERE id IN (${Prisma.join(tournamentIds)})` : [],
    privateIds.length && !hasRole(req.user, "moderator") ? db.wagerParticipant.findMany({ where: { AND: [fieldEquals("user_id", req.user.id), ownedByTeams(privateIds, ["wager_id"])] }, select: { metadata: true } }) : [],
  ]);
  const visibleWagerIds = new Set(wagerParticipants.map((row) => row.metadata?.wager_id));
  return {
    wagers: wagers.filter((row) => hasRole(req.user, "moderator") || !privateIds.includes(row.id) || visibleWagerIds.has(row.id)).map((row) => project(row, wagerFields)),
    participants: participants.map((row) => project(row, participantFields)),
    matches: matches.map((row) => project(row, matchFields)),
    tournaments: tournaments.map((row) => project(row, tournamentFields)),
  };
}

const playerFields = ["activision_id", "badges", "player_card_theme", "player_card_motion", "display_name_color", "verified_player", "is_verified_player", "streamer_badge", "is_streamer",
  "force_stream_required", "stream_override_required", "monitor_cam_required", "required_monitor_cam", "moni_cam_required", "monitor_cam_override_required",
  "gold_count", "silver_count", "bronze_count", "premium_count", "premium_trophies", "console_restricted"];
const playerMetadata = metadataProjection(playerFields);
const inventoryMetadata = metadataProjection(["user_id", "item_category", "category", "item_name", "unlock_key", "item_rarity", "purchase_method"]);

export async function getTeamPagePlayers(db, req, teamId) {
  if (typeof teamId !== "string" || !teamId || teamId.length > 128) throw Object.assign(new Error("Invalid team ID"), { status: 400 });
  const members = await db.teamMember.findMany({ where: fieldEquals("team_id", teamId), select: { metadata: true }, orderBy: { created_date: "desc" } });
  const ids = [...new Set(members.filter(active).map((row) => row.metadata?.user_id).filter((id) => typeof id === "string" && id))].slice(0, 20);
  if (!ids.length) return {};
  const [users, avatars, inventory] = await Promise.all([
    db.$queryRaw`SELECT id, username, handle, display_name, full_name, role, admin_role, is_admin, is_premium, premium_expires, region,
      ${playerMetadata} AS metadata FROM "User" WHERE id IN (${Prisma.join(ids)})`,
    getLeaderboardAvatars(db, ids),
    db.$queryRaw`SELECT ${inventoryMetadata} AS metadata FROM "UserInventory"
      WHERE metadata ->> 'user_id' IN (${Prisma.join(ids)})`,
  ]);
  const items = new Map(ids.map((id) => [id, []]));
  for (const row of inventory) items.get(row.metadata?.user_id)?.push(row.metadata);
  return Object.fromEntries(users.map((row) => {
    const user = serializeRow(row);
    const data = { ...user, avatar_url: avatars[user.id] || "", staff_avatar_url: staffAvatarFor(user) || null, team_trophies: trophyCountsFor(user, null, items.get(user.id)) };
    return [user.id, hasRole(req.user, "admin") ? data : publicStaffPresentation(data)];
  }));
}
