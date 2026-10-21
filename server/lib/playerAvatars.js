import { staffAvatarFor } from "../../src/lib/staffAvatars.js";
import { Prisma } from "@prisma/client";

const imageUrl = (value) => typeof value === "string" ? value.trim() : "";

// Staff artwork is a read-time override, so uploaded photos remain untouched.
// PlayerProfile owns uploads; legacy accounts can still use a User photo.
export function playerAvatarFor(user, profile) {
  const staffAvatar = staffAvatarFor(user);
  if (staffAvatar) return staffAvatar;
  const details = profile?.metadata || profile;
  return imageUrl(details?.avatar_url) || imageUrl(details?.profile_picture_url)
    || imageUrl(user?.avatar_url) || imageUrl(user?.metadata?.avatar_url) || "";
}

export async function withPlayerAvatars(db, users) {
  const ids = [...new Set(users.map((user) => user?.id).filter((id) => typeof id === "string" && id))];
  if (!ids.length) return users;
  // Pick the latest upload in the database without transferring profile banners,
  // bios or historical copies of the same player's images to the API process.
  const profiles = await db.$queryRaw`SELECT DISTINCT ON (metadata ->> 'user_id')
    metadata ->> 'user_id' AS user_id, metadata ->> 'avatar_url' AS avatar_url,
    metadata ->> 'profile_picture_url' AS profile_picture_url FROM "PlayerProfile"
    WHERE metadata ->> 'user_id' IN (${Prisma.join(ids)})
    ORDER BY metadata ->> 'user_id', created_date DESC, id DESC`;
  const byUser = new Map(profiles.map((profile) => [profile.user_id, profile]));
  return users.map((user) => user ? { ...user, avatar_url: playerAvatarFor(user, byUser.get(user.id)), staff_avatar_url: staffAvatarFor(user) || null } : user);
}
