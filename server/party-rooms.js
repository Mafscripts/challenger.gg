import { randomInt, randomUUID } from "node:crypto";
import { hasRole } from "./roles.js";
import { partyCandidates, partyCapacity, partyDrawMembers, partySide, partySpinning, partyValidation, PARTY_SPIN_MS } from "../src/lib/partyWheel.js";
import { createPartyBracket, recordPartyScore } from "../src/lib/partyBracket.js";
import { partyVoiceKey, partyVoiceStatus } from "./party-voice.js";
import { hasDiscordLink, freeEightsDiscordMembershipJoinError } from "./free-eights-discord.js";
import { requirePartyRoomStorage } from "./party-room-storage.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const flattenPartyRoom = (row) => ({ ...row.metadata, id: row.id, owner_id: row.owner_id, status: row.status, revision: row.revision,
  created_date: new Date(row.created_date).toISOString(), updated_date: new Date(row.updated_date).toISOString() });
// Lobby polling does not download every match's chat transcript.
export const partyRoomView = (room, matchId = null) => ({ ...room, ...(room.bracket ? { bracket: {
  ...room.bracket, matches: room.bracket.matches.map((match) => ({ ...match, messages: match.id === matchId ? match.messages : [] })),
} } : {}) });
export const partyRoomSummary = ({ id, title, mode, status, teams, team_size, players }) => ({ id, title, mode, status, teams, team_size, players: players.map(({ id }) => ({ id })) });
const save = (tx, room) => tx.partyRoom.update({ where: { id: room.id }, data: { status: room.status, revision: { increment: 1 }, metadata: Object.fromEntries(Object.entries(room).filter(([key]) => !["id", "owner_id", "revision", "status", "created_date", "updated_date"].includes(key))) } });
const cleanName = (value) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 32 || /[\u0000-\u001f]/.test(value)) fail("Player names must contain 1–32 characters");
  return value.trim();
};
const owner = (room, user) => room.owner_id === user.id || hasRole(user, "admin");
export async function createPartyRoom(db, user, input) {
  requirePartyRoomStorage(db);
  if (!["coed", "switcheroo"].includes(input.mode) || ![2, 3, 4].includes(input.team_size)) fail("Choose Co-ed or Switcheroo and a 2v2, 3v3 or 4v4 format");
  return db.$transaction(async (tx) => {
    requirePartyRoomStorage(tx);
    const key = `topfragg-party-owner:${user.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const active = await tx.partyRoom.count({ where: { owner_id: user.id, status: { not: "closed" }, updated_date: { gte: new Date(Date.now() - 86400000) } } });
    if (active >= 5) fail("Close an existing room before creating another", 409);
    const row = await tx.partyRoom.create({ data: { owner_id: user.id, metadata: { title: cleanName(input.title || (input.mode === "coed" ? "Co-ed night" : "Switcheroo night")), mode: input.mode, team_size: input.team_size,
      owner_name: user.display_name || user.username || "Host", teams: [{ id: randomUUID(), name: "Team Alpha" }, { id: randomUUID(), name: "Team Bravo" }], players: [], round: 1, history: [], spin: null, previous_teams: null } } });
    return flattenPartyRoom(row);
  });
}
export async function getPartyRoom(db, id, { matchId = null } = {}) {
  requirePartyRoomStorage(db);
  const row = await db.partyRoom.findUnique({ where: { id } });
  if (!row) fail("Room not found", 404);
  const room = flattenPartyRoom(row);
  const voice = await db.discordEventDispatch.findUnique({ where: { event_key: partyVoiceKey(id) } });
  return { room: partyRoomView(room, matchId), voice: partyVoiceStatus(room, voice?.metadata), server_time: new Date().toISOString() };
}
export async function changePartyRoom(db, id, user, input, { choose = randomInt, checkMembership = freeEightsDiscordMembershipJoinError } = {}) {
  requirePartyRoomStorage(db);
  const actions = ["add", "add_duo", "unpair", "remove", "gender", "claim", "leave", "spin", "reset", "close", "add_team", "remove_team", "rename_team", "format", "start_bracket", "match_score", "report_score", "match_message"];
  if (!actions.includes(input.action)) fail("Invalid room action");
  if (input.action === "claim") {
    if (!hasDiscordLink(user)) fail("Connect Discord in Account Settings before linking your player slot", 403);
    const membership = await checkMembership("8s", user);
    if (membership) fail(membership.error, 403);
  }
  return db.$transaction(async (tx) => {
    requirePartyRoomStorage(tx);
    await tx.$executeRaw`SELECT id FROM "PartyRoom" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.partyRoom.findUnique({ where: { id } });
    if (!row) fail("Room not found", 404);
    const room = flattenPartyRoom(row);
    if (room.status === "closed") fail("This room is closed", 409);
    if (input.revision !== room.revision) fail("The room changed. Refresh and try again.", 409);
    const isOwner = owner(room, user);
    if (!["claim", "leave", "report_score", "match_message"].includes(input.action) && !isOwner) fail("Only the host or an admin can manage the room", 403);
    if (partySpinning(room)) fail("Wait for the current spin to finish", 409);
    const player = room.players.find((entry) => entry.id === input.player_id);
    if (["add", "add_duo", "unpair", "remove", "gender", "add_team", "remove_team", "format"].includes(input.action) && room.players.some((entry) => entry.side)) fail("Start a new round before editing players or teams", 409);
    if (input.action === "reset" && room.bracket?.status === "in_progress") fail("Finish the bracket before starting a new round", 409);
    if (input.action === "add_team") {
      if (room.teams.length >= 16) fail("A room supports up to 16 teams");
      room.teams.push({ id: randomUUID(), name: cleanName(input.name || `Team ${room.teams.length + 1}`) });
    }
    if (input.action === "remove_team") {
      if (room.teams.length <= 2) fail("Keep at least two teams");
      if (!room.teams.some((team) => team.id === input.team_id)) fail("Team not found", 404);
      if (room.players.length > (room.teams.length - 1) * room.team_size) fail("Remove extra players before removing a team");
      room.teams = room.teams.filter((team) => team.id !== input.team_id);
    }
    if (input.action === "rename_team") {
      const team = room.teams.find((entry) => entry.id === input.team_id);
      if (!team) fail("Team not found", 404);
      team.name = cleanName(input.name);
    }
    if (input.action === "format") {
      if (![2, 3, 4].includes(input.team_size) || room.players.length > input.team_size * room.teams.length) fail("Choose a team size that fits your players");
      room.team_size = input.team_size;
    }
    if (input.action === "add_duo") {
      if (!Array.isArray(input.players) || input.players.length !== 2) fail("Enter both players in your duo");
      if (room.players.length + 2 > partyCapacity(room)) fail("A duo needs two empty player slots");
      const existing = new Set(room.players.map((entry) => entry.name.toLowerCase()));
      const duoId = randomUUID();
      for (const entry of input.players) {
        const name = cleanName(entry?.name);
        if (existing.has(name.toLowerCase())) fail("Use a different display name for each player");
        if (room.mode === "coed" && !["male", "female"].includes(entry.gender)) fail("Choose Male or Female for both players");
        existing.add(name.toLowerCase());
        room.players.push({ id: randomUUID(), name, duo_id: duoId, gender: room.mode === "coed" ? entry.gender : null, user_id: null, side: null });
      }
    }
    if (input.action === "unpair") {
      if (!player?.duo_id) fail("Duo not found", 404);
      const duoId = player.duo_id;
      room.players.forEach((entry) => { if (entry.duo_id === duoId) entry.duo_id = null; });
    }
    if (input.action === "add") {
      const names = input.names;
      if (!Array.isArray(names) || !names.length || room.players.length + names.length > partyCapacity(room)) fail(`This room has ${partyCapacity(room) - room.players.length} empty slots`);
      const existing = new Set(room.players.map((entry) => entry.name.toLowerCase()));
      for (const name of names) {
        const cleaned = cleanName(name);
        if (existing.has(cleaned.toLowerCase())) fail("Use a different display name for each player");
        existing.add(cleaned.toLowerCase());
        room.players.push({ id: randomUUID(), name: cleaned, gender: ["male", "female"].includes(input.gender) ? input.gender : null, user_id: null, side: null });
      }
    }
    if (input.action === "remove") {
      if (!player) fail("Player not found", 404);
      room.players = room.players.filter((entry) => entry.id !== player.id);
      if (player.duo_id) room.players.forEach((entry) => { if (entry.duo_id === player.duo_id) entry.duo_id = null; });
    }
    if (input.action === "gender") {
      if (!player || !["male", "female"].includes(input.gender)) fail("Select a player and male or female");
      player.gender = input.gender;
    }
    if (input.action === "claim") {
      if (!player) fail("Player not found", 404);
      if (player.user_id && player.user_id !== user.id) fail("This player slot is already linked", 409);
      if (room.players.some((entry) => entry.user_id === user.id && entry.id !== player.id)) fail("You already have a player slot", 409);
      player.user_id = user.id;
    }
    if (input.action === "leave") {
      const own = room.players.find((entry) => entry.user_id === user.id);
      if (!own) fail("You have no linked slot in this room", 409);
      own.user_id = null;
    }
    if (input.action === "spin") {
      if (room.bracket) fail("Start a new round before drawing new teams", 409);
      const invalid = partyValidation(room);
      if (invalid) fail(invalid);
      const entries = partyCandidates(room);
      if (!entries.length) fail("All teams are full. Start a new round.", 409);
      const selected = entries[choose(entries.length)];
      const side = partySide(room);
      const members = partyDrawMembers(room, selected);
      members.forEach((member) => { member.side = side; });
      room.spin = { id: randomUUID(), selected_id: selected.id, selected_ids: members.map((member) => member.id), side, entries: entries.map(({ id, name }) => ({ id, name })),
        started_at: new Date(Date.now() + 750).toISOString(), duration_ms: PARTY_SPIN_MS, turns: 6 + choose(3) };
      room.status = room.players.every((entry) => entry.side) ? "ready" : "drafting";
    }
    if (input.action === "start_bracket") {
      if (room.bracket) fail("This round already has a bracket", 409);
      if (room.status !== "ready" || partyValidation(room) || room.teams.some((team) => room.players.filter((entry) => entry.side === team.id).length !== room.team_size)) fail("Finish drawing all teams before starting the bracket", 409);
      const teamIds = room.teams.map((team) => team.id);
      for (let i = teamIds.length - 1; i > 0; i--) { const j = choose(i + 1); [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]]; }
      room.bracket = createPartyBracket(teamIds, { format: input.format, best_of: input.best_of, game_mode: input.game_mode, id: randomUUID() });
      room.bracket.started_by = user.id;
    }
    if (["match_score", "report_score", "match_message"].includes(input.action)) {
      const match = room.bracket?.matches.find((entry) => entry.id === input.match_id);
      if (!match) fail("Match not found", 404);
      const own = room.players.find((entry) => entry.user_id === user.id);
      const participant = own?.side && match.teams.includes(own.side);
      if (!isOwner && !participant) fail("Only these teams, the host and admins can use this matchroom", 403);
      if (input.action === "match_score") {
        recordPartyScore(room.bracket, match.id, input.scores);
        match.result_by = user.id;
      }
      if (input.action === "report_score") {
        if (!participant) fail("Link your own player slot to report a team score", 403);
        if (Object.entries(match.reports).some(([side, report]) => side !== own.side && report.user_id === user.id)) fail("One account cannot report for both teams", 403);
        if (Object.entries(match.reports).some(([side, report]) => side !== own.side && report.user_id === user.id)) fail("One account cannot report for both teams", 403);
        // Validate the report without advancing the saved bracket until both teams agree.
        recordPartyScore(structuredClone(room.bracket), match.id, input.scores);
        match.reports[own.side] = { scores: input.scores, user_id: user.id, submitted_at: new Date().toISOString() };
        const reports = match.teams.map((team) => match.reports[team]);
        if (reports.every(Boolean) && reports[0].scores.every((score, index) => score === reports[1].scores[index])) {
          recordPartyScore(room.bracket, match.id, input.scores); match.result_by = "team_agreement";
        }
      }
      if (input.action === "match_message") {
        if (typeof input.message !== "string" || !input.message.trim() || input.message.trim().length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.message)) fail("Enter a message of 1–1,000 characters");
        const last = match.messages.findLast((entry) => entry.user_id === user.id);
        if (last && Date.now() - Date.parse(last.created_at) < 3000) fail("Wait a few seconds before sending another message", 429);
        match.messages = [...match.messages, { id: randomUUID(), user_id: user.id, name: user.display_name || user.username || "Player", message: input.message.trim(), created_at: new Date().toISOString() }].slice(-100);
      }
    }
    if (input.action === "reset") {
      if (room.status === "ready") {
        room.previous_teams = Object.fromEntries(room.players.map((entry) => [entry.id, entry.side]));
        room.history = [{ round: room.round, teams: room.teams, players: room.players.map(({ id, name, side }) => ({ id, name, side })), ...(room.bracket ? { bracket: { ...room.bracket, matches: room.bracket.matches.map(({ messages, ...match }) => match) } } : {}), completed_at: new Date().toISOString() }, ...room.history].slice(0, 10);
        room.round++;
      }
      room.players.forEach((entry) => { entry.side = null; });
      room.spin = null; room.bracket = null; room.status = "open";
    }
    if (input.action === "close") { room.status = "closed"; room.closed_at = new Date().toISOString(); }
    return flattenPartyRoom(await save(tx, room));
  }, { timeout: 15000, maxWait: 10000 });
}
