const imageUrl = (value) => typeof value === "string" ? value.trim() : "";

// PlayerProfile is the source for uploaded avatars; old accounts may still
// carry an avatar on User or use the legacy profile_picture_url field.
export function playerAvatarFor(user, profile) {
  const details = profile?.metadata || profile;
  return imageUrl(details?.avatar_url) || imageUrl(details?.profile_picture_url)
    || imageUrl(user?.avatar_url) || imageUrl(user?.metadata?.avatar_url) || "";
}

export async function withPlayerAvatars(db, users) {
  const ids = [...new Set(users.map((user) => user?.id).filter((id) => typeof id === "string" && id))];
  if (!ids.length) return users;
  const profiles = await db.playerProfile.findMany({
    where: { OR: ids.map((id) => ({ metadata: { path: ["user_id"], equals: id } })) },
    orderBy: { created_date: "desc" },
    select: { metadata: true },
  });
  const byUser = new Map();
  for (const profile of profiles) {
    const id = profile.metadata?.user_id;
    if (!byUser.has(id)) byUser.set(id, profile);
  }
  return users.map((user) => user ? { ...user, avatar_url: playerAvatarFor(user, byUser.get(user.id)) } : user);
}
