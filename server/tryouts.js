import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { publicUser } from "./auth.js";
import { containsBlockedLanguage } from "./profanity-filter.js";
import { getMapImage } from "../src/lib/cdlMaps.js";
import { TRYOUT_CAPACITY, TRYOUT_HP_MAPS, TRYOUT_TEAM_SIZE, canAccessTryouts, canManageTryouts, tryoutSeriesScore } from "../src/lib/tryouts.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const nameFor = (user) => user.display_name || user.username || user.full_name || "Player";
const activisionFor = (user) => String(user.activision_id || user.metadata?.activision_id || "").trim();
const requireAccess = (user) => { if (!canAccessTryouts(user)) fail("A Challengers badge is required to access Try outs", 403); };
const requireAdmin = (user) => { if (!canManageTryouts(user)) fail("Admin access is required", 403); };
const roomFor = (row) => ({ ...row.metadata, id: row.id, created_date: row.created_date.toISOString(), updated_date: row.updated_date.toISOString() });
const playerFor = (user) => ({ user_id: user.id, user_name: nameFor(user), avatar_url: user.avatar_url || null, activision_id: activisionFor(user), team: "bench", joined_at: new Date().toISOString() });
const canReadRoom = (user, room) => canManageTryouts(user) || room.players.some((player) => player.user_id === user.id);
const roomSummary = (room, user) => ({
  id: room.id, name: room.name, status: room.status, created_date: room.created_date,
  player_count: room.players.length, capacity: TRYOUT_CAPACITY,
  alpha_count: room.players.filter((player) => player.team === "alpha").length,
  bravo_count: room.players.filter((player) => player.team === "bravo").length,
  joined: room.players.some((player) => player.user_id === user.id),
  score: tryoutSeriesScore(room.maps), winner: room.winner || null,
});

async function getTryouts(req) {
  requireAccess(req.user);
  const rows = await prisma.tryoutRoom.findMany({ orderBy: { created_date: "desc" }, take: 100 });
  return { success: true, rooms: rows.map((row) => roomSummary(roomFor(row), req.user)) };
}

async function getTryoutRoom(req) {
  requireAccess(req.user);
  const id = String(req.body.room_id || "");
  if (!id || id.length > 200) fail("Try out room ID required");
  const row = await prisma.tryoutRoom.findUnique({ where: { id } });
  if (!row) fail("Try out room not found", 404);
  const room = roomFor(row);
  if (!canReadRoom(req.user, room)) fail("Join this try out before opening its matchroom", 403);
  return { success: true, room };
}

async function createTryoutRoom(req) {
  requireAdmin(req.user);
  const name = String(req.body.name || "Challengers Try out").trim().slice(0, 80);
  if (!name) fail("Give the try out a name");
  return prisma.$transaction(async (tx) => {
    const row = await tx.tryoutRoom.create({ data: { metadata: {
      name, status: "lobby", game_id: "bo7", game_name: "Black Ops 7", game_mode: "Hardpoint",
      best_of: 3, team_size: "4v4", players: [], maps: [], messages: [], version: 1,
      created_by: req.user.id, created_by_name: nameFor(req.user),
    } } });
    await tx.adminAction.create({ data: { metadata: {
      action_type: "tryout_create", admin_id: req.user.id, room_id: row.id,
      description: `Created ${name}`, created_date: new Date().toISOString(),
    } } });
    return { success: true, room: roomFor(row) };
  });
}

async function eligibleRoster(tx, room) {
  const users = await tx.user.findMany({ where: { id: { in: room.players.map((player) => player.user_id) } } });
  const current = new Map(users.map((user) => [user.id, publicUser(user)]));
  for (const player of room.players) {
    if (!["alpha", "bravo"].includes(player.team)) continue;
    const user = current.get(player.user_id);
    if (!user || !canAccessTryouts(user) || !activisionFor(user) || user.is_banned || user.email_verified !== true) {
      fail(`${player.user_name} needs an eligible account, a Challengers badge and an Activision ID before starting`);
    }
    player.activision_id = activisionFor(user);
  }
}

async function updateTryoutRoom(req) {
  requireAccess(req.user);
  const id = String(req.body.room_id || "");
  if (!id || id.length > 200) fail("Try out room ID required");
  const action = String(req.body.action || "");
  const selfActions = ["join", "leave", "chat"];
  if (!selfActions.includes(action)) requireAdmin(req.user);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "TryoutRoom" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.tryoutRoom.findUnique({ where: { id } });
    if (!row) fail("Try out room not found", 404);
    const room = structuredClone(row.metadata);
    const isAdmin = canManageTryouts(req.user);
    if (action !== "join" && !canReadRoom(req.user, room)) fail("Only participants and admins can use this matchroom", 403);
    if (!["join", "leave", "chat"].includes(action) && req.body.expected_version !== room.version) fail("The room has changed. Refresh and try again.", 409);
    const stamp = new Date().toISOString();
    const lobbyOnly = () => { if (room.status !== "lobby") fail("Teams and maps can only be changed before the match starts", 409); };
    switch (action) {
      case "join": {
        lobbyOnly();
        if (!activisionFor(req.user)) fail("Add your Activision ID in Settings > Gaming IDs before joining");
        if (room.players.some((player) => player.user_id === req.user.id)) break;
        if (room.players.length >= TRYOUT_CAPACITY) fail("This try out is full", 409);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tryout-join:' + req.user.id}))`;
        const active = await tx.tryoutRoom.findFirst({ where: { AND: [
          { id: { not: id } }, { metadata: { path: ["active_user_ids"], array_contains: [req.user.id] } },
        ] } });
        if (active) fail("Leave your current try out before joining another", 409);
        room.players.push(playerFor(req.user));
        break;
      }
      case "leave": {
        lobbyOnly();
        room.players = room.players.filter((player) => player.user_id !== req.user.id);
        break;
      }
      case "move": {
        lobbyOnly();
        const player = room.players.find((entry) => entry.user_id === req.body.user_id);
        if (!player || !["alpha", "bravo", "bench"].includes(req.body.team)) fail("Choose a player and a valid team");
        const target = room.players.find((entry) => entry.user_id === req.body.swap_user_id);
        if (target) {
          if (target.user_id === player.user_id || target.team !== req.body.team || target.team === player.team) fail("Choose players from different teams");
          target.team = player.team;
        } else if (req.body.team !== "bench" && player.team !== req.body.team && room.players.filter((entry) => entry.team === req.body.team).length >= TRYOUT_TEAM_SIZE) {
          fail("That team is full. Drop onto a player to swap, or move someone to the waiting room first", 409);
        }
        player.team = req.body.team;
        break;
      }
      case "remove": {
        lobbyOnly();
        room.players = room.players.filter((player) => player.user_id !== req.body.user_id);
        break;
      }
      case "maps": {
        lobbyOnly();
        const pool = [...TRYOUT_HP_MAPS];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        room.maps = pool.slice(0, 3).map((name, index) => ({ game: index + 1, name, mode: "Hardpoint", image: getMapImage(name) || null, alpha_score: null, bravo_score: null }));
        break;
      }
      case "start": {
        lobbyOnly();
        if (["alpha", "bravo"].some((team) => room.players.filter((player) => player.team === team).length !== TRYOUT_TEAM_SIZE)) fail("Assign four players to each team before starting");
        if (room.maps.length !== 3) fail("Generate the three Hardpoint maps before starting");
        await eligibleRoster(tx, room);
        room.status = "live";
        room.started_at = stamp;
        break;
      }
      case "score": {
        if (room.status !== "live") fail("Scores can only be saved during a live match", 409);
        const index = Number(req.body.map_index);
        const map = room.maps[index];
        const alpha = req.body.alpha_score, bravo = req.body.bravo_score;
        if (!Number.isInteger(index) || !map || ![alpha, bravo].every((score) => Number.isInteger(score) && score >= 0 && score <= 250) || alpha === bravo || Math.max(alpha, bravo) !== 250) fail("Enter a valid Hardpoint result: the winner scores 250 and the other team scores 0–249");
        if (room.maps.slice(0, index).some((entry) => entry.alpha_score === null)) fail("Record the earlier maps first");
        if (map.alpha_score !== null) fail("This map already has a result. Reset the series to correct it", 409);
        map.alpha_score = alpha; map.bravo_score = bravo;
        const score = tryoutSeriesScore(room.maps);
        if (score.alpha === 2 || score.bravo === 2) {
          room.winner = score.alpha === 2 ? "alpha" : "bravo";
          room.status = "completed"; room.completed_at = stamp;
        }
        break;
      }
      case "reset": {
        if (room.status === "cancelled") fail("Create a new try out for a cancelled room", 409);
        const ids = room.players.map((player) => player.user_id).sort();
        for (const userId of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'tryout-join:' + userId}))`;
        if (ids.length) {
          const other = await tx.tryoutRoom.findFirst({ where: { AND: [
            { id: { not: id } }, { OR: ids.map((userId) => ({ metadata: { path: ["active_user_ids"], array_contains: [userId] } })) },
          ] } });
          if (other) fail("A player from this series has joined another active Try out. Create a new session or have them leave it before resetting.", 409);
        }
        room.status = "lobby"; room.winner = null; room.started_at = null; room.completed_at = null;
        room.maps = room.maps.map((map) => ({ ...map, alpha_score: null, bravo_score: null }));
        break;
      }
      case "cancel": room.status = "cancelled"; room.cancelled_at = stamp; break;
      case "chat": {
        if (room.status === "cancelled") fail("This room is closed", 409);
        const text = String(req.body.message || "").trim();
        if (!text || text.length > 1500) fail("Messages must be between 1 and 1500 characters");
        if (containsBlockedLanguage(text)) fail("Please keep matchroom chat respectful");
        const last = [...room.messages].reverse().find((message) => message.user_id === req.user.id);
        if (last && Date.now() - Date.parse(last.created_at) < 1500) fail("Please wait a moment before sending another message", 429);
        room.messages = [...room.messages, { id: randomUUID(), user_id: req.user.id, user_name: nameFor(req.user), is_admin: isAdmin, text, created_at: stamp }].slice(-200);
        break;
      }
      default: fail("Unknown try out action");
    }
    if (action !== "chat") room.version += 1;
    room.active_user_ids = ["lobby", "live"].includes(room.status) ? room.players.map((player) => player.user_id) : [];
    const updated = await tx.tryoutRoom.update({ where: { id }, data: { metadata: room } });
    if (isAdmin && !selfActions.includes(action)) await tx.adminAction.create({ data: { metadata: {
      action_type: "tryout_update", admin_id: req.user.id, room_id: id, action,
      target_user_id: req.body.user_id || null, team: req.body.team || null, created_date: stamp,
    } } });
    return { success: true, ...(action === "leave" ? {} : { room: roomFor(updated) }) };
  }, { timeout: 15000, maxWait: 15000 });
}

export const tryoutHandlers = { getTryouts, getTryoutRoom, createTryoutRoom, updateTryoutRoom };
