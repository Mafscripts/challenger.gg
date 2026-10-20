import { playerAvatarFor } from "./lib/playerAvatars.js";
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const selection = { id: true, username: true, display_name: true, handle: true, role: true, admin_role: true, is_admin: true, metadata: true };
const summary = (user) => ({ id: user.id, name: user.username || user.display_name || user.handle || "Player", username: user.username || user.handle || "", avatar_url: playerAvatarFor(user) });

export async function searchPartyPlayers(db, query) {
  const value = typeof query === "string" ? query.trim().slice(0, 32) : "";
  if (value.length < 2) return [];
  const users = await db.user.findMany({ where: { is_banned: false, OR: [
    { username: { contains: value, mode: "insensitive" } }, { display_name: { contains: value, mode: "insensitive" } }, { handle: { contains: value, mode: "insensitive" } },
  ] }, select: selection, orderBy: [{ username: "asc" }, { id: "asc" }], take: 8 });
  return users.map(summary);
}

export async function selectedPartyAccounts(db, entries) {
  const ids = entries.map((entry) => entry?.user_id).filter((id) => id !== undefined && id !== null && id !== "");
  if (ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 100)) fail("Choose a valid website account or enter a guest name");
  if (new Set(ids).size !== ids.length) fail("The same website account cannot be added twice");
  if (!ids.length) return new Map();
  const users = await db.user.findMany({ where: { id: { in: ids }, is_banned: false }, select: selection });
  if (users.length !== ids.length) fail("A selected account is no longer available. Search again or add a guest.", 409);
  return new Map(users.map((user) => [user.id, summary(user)]));
}
