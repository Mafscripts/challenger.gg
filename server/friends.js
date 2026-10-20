import { withPlayerAvatars } from "./lib/playerAvatars.js";

const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const pair = (a, b, left, right) => ({ OR: [
  { AND: [field(left, a), field(right, b)] }, { AND: [field(left, b), field(right, a)] },
] });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const nameFor = (user) => user.display_name || user.username || "Player";
const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 128;
const activeBan = (user) => user?.is_banned && !(Date.parse(user.metadata?.ban_expires) <= Date.now());

async function relationship(db, actorId, targetId) {
  const [friendship, requests, blocked] = await Promise.all([
    db.friendship.findFirst({ where: { AND: [pair(actorId, targetId, "user_id", "friend_id"), { NOT: field("is_active", false) }] }, select: { id: true } }),
    db.friendRequest.findMany({ where: pair(actorId, targetId, "sender_id", "recipient_id"), orderBy: { created_date: "desc" }, select: { id: true, created_date: true, metadata: true } }),
    db.blockedUser.findFirst({ where: { AND: [pair(actorId, targetId, "user_id", "blocked_user_id"), { NOT: field("is_active", false) }] }, select: { id: true } }),
  ]);
  const pending = requests.find((request) => request.metadata?.status === "pending");
  return { friendship, requests, pending, blocked };
}

export async function friendStatus(db, actorId, targetId) {
  if (!validId(targetId)) fail("Invalid player ID");
  if (actorId === targetId) return { status: "self" };
  const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) fail("Player not found", 404);
  const state = await relationship(db, actorId, targetId);
  if (state.blocked) return { status: "unavailable" };
  if (state.friendship) return { status: "friends" };
  return { status: state.pending ? state.pending.metadata.recipient_id === actorId ? "incoming" : "outgoing" : "none" };
}

export async function changeFriendship(db, actorId, targetId, action) {
  if (!validId(targetId) || actorId === targetId) fail("Choose another player");
  if (!["send", "accept", "decline", "cancel", "remove"].includes(action)) fail("Invalid friend action");
  return db.$transaction(async (tx) => {
    if (action === "send") {
      const senderLock = `topfragg-friend-sender:${actorId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${senderLock}))`;
    }
    const lock = `topfragg-friends:${[actorId, targetId].sort().map((id) => `${id.length}:${id}`).join(":")}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
    const [actor, target, state] = await Promise.all([
      tx.user.findUnique({ where: { id: actorId }, select: { id: true, username: true, display_name: true, is_banned: true, metadata: true } }),
      tx.user.findUnique({ where: { id: targetId }, select: { id: true, username: true, display_name: true, is_banned: true, metadata: true } }),
      relationship(tx, actorId, targetId),
    ]);
    if (!actor || !target) fail("Player not found", 404);
    if (action !== "remove" && state.blocked) fail("Friend requests are unavailable for this player", 403);
    if (["send", "accept"].includes(action) && (activeBan(actor) || activeBan(target))) fail("Friend requests are unavailable for this player", 403);
    const now = new Date().toISOString();
    const finishPending = async (status) => {
      for (const request of state.requests.filter((row) => row.metadata?.status === "pending")) {
        await tx.friendRequest.update({ where: { id: request.id }, data: { metadata: { ...request.metadata, status, responded_at: now } } });
      }
    };
    const notify = (userId, title, message, other) => tx.notification.create({ data: { metadata: {
      user_id: userId, type: "friend_request", title, message, is_read: false,
      action_url: `/profile/${encodeURIComponent(other.username || other.id)}`,
      related_entity_type: "FriendRequest", related_entity_id: state.pending?.id || "", created_date: now,
    } } });
    if (action === "remove") {
      await tx.friendship.deleteMany({ where: pair(actorId, targetId, "user_id", "friend_id") });
      await finishPending("cancelled");
      return { success: true, status: "none" };
    }
    if (state.friendship) return { success: true, status: "friends" };
    if (action === "send") {
      if (state.pending) return { success: true, status: state.pending.metadata.recipient_id === actorId ? "incoming" : "outgoing" };
      const last = state.requests[0];
      if (last && Date.now() - new Date(last.metadata.responded_at || last.created_date).getTime() < 60000) fail("Please wait a minute before sending another request", 429);
      const daily = await tx.friendRequest.count({ where: { AND: [field("sender_id", actorId), { created_date: { gte: new Date(Date.now() - 86400000) } }] } });
      if (daily >= 50) fail("You have reached today's friend request limit", 429);
      const request = await tx.friendRequest.create({ data: { metadata: { sender_id: actorId, recipient_id: targetId, status: "pending", sent_at: now } } });
      state.pending = request;
      await notify(targetId, "New friend request", `${nameFor(actor)} sent you a friend request. Open their profile to accept or decline.`, actor);
      return { success: true, status: "outgoing" };
    }
    if (!state.pending) fail("This friend request is no longer pending", 409);
    const incoming = state.pending.metadata.recipient_id === actorId;
    if ((action === "cancel" && incoming) || (["accept", "decline"].includes(action) && !incoming)) fail("You cannot respond to this friend request", 403);
    if (action === "accept") {
      await tx.friendship.create({ data: { metadata: { user_id: actorId, friend_id: targetId, is_active: true, accepted_at: now } } });
      await finishPending("accepted");
      await notify(targetId, "Friend request accepted", `${nameFor(actor)} accepted your friend request.`, actor);
      return { success: true, status: "friends" };
    }
    await finishPending(action === "cancel" ? "cancelled" : "declined");
    return { success: true, status: "none" };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function listFriendRequests(db, actorId, offset = 0) {
  const rows = await db.friendRequest.findMany({ where: { AND: [field("status", "pending"), { OR: [field("sender_id", actorId), field("recipient_id", actorId)] }] },
    orderBy: { created_date: "desc" }, skip: offset, take: 26, select: { id: true, created_date: true, metadata: true } });
  const page = rows.slice(0, 25);
  const ids = [...new Set(page.map((row) => row.metadata.sender_id === actorId ? row.metadata.recipient_id : row.metadata.sender_id))];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, display_name: true, role: true, admin_role: true, is_admin: true, metadata: true } });
  const byId = new Map((await withPlayerAvatars(db, users)).map((user) => [user.id, user]));
  return { requests: page.flatMap((row) => {
    const incoming = row.metadata.recipient_id === actorId;
    const other = byId.get(incoming ? row.metadata.sender_id : row.metadata.recipient_id);
    return other ? [{ id: row.id, direction: incoming ? "incoming" : "outgoing", sent_at: row.created_date,
      player: { id: other.id, username: other.username, name: nameFor(other), avatar_url: other.avatar_url } }] : [];
  }), next_offset: rows.length > 25 ? offset + 25 : null };
}
