import { Prisma } from "@prisma/client";
import { serializeRow } from "./entity.js";
import { playerAvatarFor } from "./lib/playerAvatars.js";
import { staffAvatarFor } from "../src/lib/staffAvatars.js";

const presentationFields = [
  "display_name_color", "badges", "verified_player", "is_verified_player", "streamer_badge", "is_streamer",
  "force_stream_required", "stream_override_required", "monitor_cam_required", "required_monitor_cam",
  "moni_cam_required", "monitor_cam_override_required", "gold_count", "silver_count", "bronze_count",
  "premium_count", "premium_trophies", "console_restricted",
];
const metadataProjection = (fields) => Prisma.sql`jsonb_build_object(${Prisma.join(fields.flatMap((field) => [
  Prisma.sql`${field}::text`, Prisma.sql`metadata -> ${field}::text`,
]))})`;
const playerMetadata = metadataProjection(presentationFields);
const orders = {
  "-created_date": Prisma.sql`created_date DESC, id DESC`,
  "-total_wager_earnings": Prisma.sql`total_wager_earnings DESC, id DESC`,
  "-tournament_wins": Prisma.sql`tournament_wins DESC, id DESC`,
};

// The ladder needs public names and counters, not 500 profiles with banners,
// uploaded photos, account settings and payment/connection metadata.
export async function getLeaderboardPlayers(db, order) {
  const orderBy = typeof order === "string" && Object.hasOwn(orders, order) ? orders[order] : orders["-created_date"];
  const rows = await db.$queryRaw`SELECT id, username, handle, display_name, full_name,
    role, admin_role, is_admin, is_premium, premium_expires, region, rank, trophies,
    wager_wins, wager_losses, current_win_streak, total_wager_earnings, tournament_wins,
    ${playerMetadata} AS metadata
    FROM "User" ORDER BY ${orderBy} LIMIT 500`;
  return rows.map((row) => {
    const user = serializeRow(row);
    const avatar = staffAvatarFor(user);
    return { ...user, avatar_url: avatar, staff_avatar_url: avatar || null };
  });
}

export async function getLeaderboardAvatars(db, input) {
  if (!Array.isArray(input) || input.length > 60 || input.some((id) => typeof id !== "string" || !id || id.length > 128)) {
    throw Object.assign(new Error("Provide up to 60 player IDs"), { status: 400 });
  }
  const ids = [...new Set(input)];
  if (!ids.length) return {};
  const [users, profiles] = await Promise.all([
    db.$queryRaw`SELECT id, role, admin_role, is_admin, metadata ->> 'avatar_url' AS avatar_url
      FROM "User" WHERE id IN (${Prisma.join(ids)})`,
    db.$queryRaw`SELECT DISTINCT ON (metadata ->> 'user_id') metadata ->> 'user_id' AS user_id,
      metadata ->> 'avatar_url' AS avatar_url, metadata ->> 'profile_picture_url' AS profile_picture_url
      FROM "PlayerProfile" WHERE metadata ->> 'user_id' IN (${Prisma.join(ids)})
      ORDER BY metadata ->> 'user_id', created_date DESC, id DESC`,
  ]);
  const byUser = new Map(profiles.map((row) => [row.user_id, row]));
  return Object.fromEntries(users.map((user) => [user.id, playerAvatarFor(user, byUser.get(user.id))]));
}

const eightsMetadata = metadataProjection(["user_id", "username", "user_name", "wins", "losses", "win_streak", "game_id"]);
export async function getFreeEightsLeaderboard(db, gameId) {
  const rows = await db.$queryRaw`SELECT id, free_eights_elo, ${eightsMetadata} AS metadata
    FROM "EightsStats"
    WHERE LOWER(COALESCE(NULLIF(metadata ->> 'game_id', ''), 'bo7')) = ${gameId}
    ORDER BY free_eights_elo DESC, id DESC LIMIT 500`;
  return rows.map(serializeRow);
}

export async function getRankedLeaderboard(db, gameId) {
  const rows = await db.$queryRaw`SELECT id, metadata FROM "RankedStats"
    WHERE LOWER(COALESCE(NULLIF(metadata ->> 'game_id', ''), 'bo7')) = ${gameId}
    ORDER BY COALESCE((metadata ->> 'elo')::numeric, 0) DESC, id DESC LIMIT 500`;
  return rows.map(serializeRow);
}
