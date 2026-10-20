import { effectiveRoleForUser } from "./roles.js";

export const STAFF_AVATARS = Object.freeze({
  ceo: "/assets/staff/ceo.svg",
  super_admin: "/assets/staff/super-admin.svg",
  admin: "/assets/staff/admin.svg",
  moderator: "/assets/staff/moderator.svg",
});

// Use the account's actual role, never profile badges or an uploaded image.
// Raw database users keep admin_role/is_admin in metadata; API users are flat.
export function staffAvatarFor(user) {
  if (!user || typeof user !== "object") return "";
  return STAFF_AVATARS[effectiveRoleForUser({ ...user.metadata, ...user })] || "";
}

export function displayedStaffAvatar(user, source) {
  const avatar = staffAvatarFor(user);
  if (!avatar) return "";
  // Public role labels may be redacted. The server supplies the matching artwork.
  const artwork = Object.values(STAFF_AVATARS);
  return [user.staff_avatar_url, user.avatar_url, source].find((value) => artwork.includes(value)) || avatar;
}
