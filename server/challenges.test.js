import test from "node:test";
import assert from "node:assert/strict";
import { createChallengeHandlers } from "./challenges.js";
import { challengeDiscordConfig, challengeVoiceMatch, challengeVoiceRoster, challengeVoiceKey } from "./challenge-discord.js";
import { voiceRosterSignature } from "./free-eights-discord.js";
import { challengeXpChange, challengeRank } from "../src/lib/challengeRanks.js";
import express from "express";
import functionRoutes from "./routes/functions.js";
import entityRoutes from "./routes/entities.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

function matches(row, where = {}) {
  if (where.AND && !where.AND.every((part) => matches(row, part))) return false;
  if (where.OR && !where.OR.some((part) => matches(row, part))) return false;
  for (const [key, value] of Object.entries(where)) {
    if (["AND", "OR"].includes(key)) continue;
    if (key === "metadata") {
      const field = value.path.reduce((object, path) => object?.[path], row.metadata);
      if ("equals" in value && field !== value.equals) return false;
      if (value.array_contains && !value.array_contains.every((expected) => field?.some((item) => Object.entries(expected).every(([name, match]) => item[name] === match)))) return false;
    } else if (typeof value === "object") {
      if (value.in && !value.in.includes(row[key])) return false;
      if (value.not && row[key] === value.not) return false;
    } else if (row[key] !== value) return false;
  }
  return true;
}
function fixture(t, size = 4) {
  const previous = Object.fromEntries(["DISCORD_FREE_8S_VOICE_ENABLED", "DISCORD_CHALLENGE_VOICE_ENABLED", "DISCORD_GUILD_ID", "DISCORD_FREE_8S_VOICE_CATEGORY_ID"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, { DISCORD_FREE_8S_VOICE_ENABLED: "true", DISCORD_CHALLENGE_VOICE_ENABLED: "true", DISCORD_GUILD_ID: "100000000000000001", DISCORD_FREE_8S_VOICE_CATEGORY_ID: "100000000000000002" });
  t.after(() => Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value));
  let tables = Object.fromEntries(["challengeMatch", "challengeStanding", "team", "teamMember", "user", "wager", "wagerParticipant", "notification", "adminAction", "discordEventDispatch", "ticket"].map((name) => [name, []]));
  let serial = 0, queue = Promise.resolve();
  const locks = [];
  const db = { mapPool: { findUnique: async () => null }, $executeRaw: async (_sql, ...values) => { locks.push(values); } };
  for (const model of Object.keys(tables)) {
    const list = (where) => tables[model].filter((row) => matches(row, where));
    const apply = (row, data) => { for (const [key, value] of Object.entries(structuredClone(data))) row[key] = value && typeof value === "object" && ("increment" in value || "decrement" in value) ? row[key] + (value.increment || 0) - (value.decrement || 0) : value; row.updated_date = new Date(); return structuredClone(row); };
    db[model] = {
      findMany: async ({ where = {}, take } = {}) => structuredClone(list(where).slice(0, take)),
      findFirst: async ({ where = {} } = {}) => structuredClone(list(where)[0] || null),
      findUnique: async ({ where }) => structuredClone(where.kind_subject_id ? tables[model].find((row) => matches(row, where.kind_subject_id)) || null : list(where)[0] || null),
      create: async ({ data }) => { const row = { id: `${model}-${++serial}`, created_date: new Date(), updated_date: new Date(), ...structuredClone(data) }; tables[model].push(row); return structuredClone(row); },
      createMany: async ({ data }) => { for (const item of data) await db[model].create({ data: item }); return { count: data.length }; },
      update: async ({ where, data }) => { const row = list(where)[0]; assert.ok(row, `${model} row exists`); return apply(row, data); },
      upsert: async ({ where, create, update }) => {
        const row = tables[model].find((row) => matches(row, where.kind_subject_id));
        return row ? apply(row, update) : db[model].create({ data: { xp: 0, wins: 0, losses: 0, ...create } });
      },
    };
  }
  db.$transaction = (fn) => {
    const operation = queue.then(async () => { const before = structuredClone(tables); try { return await fn(db); } catch (error) { tables = before; throw error; } });
    queue = operation.catch(() => {}); return operation;
  };
  const users = Array.from({ length: 16 }, (_, i) => ({ id: `p${i}`, username: `Player${i}`, role: "user", email_verified: true, metadata: { activision_id: `Player${i}#123` }, discord_user_id: String(200000000000000000n + BigInt(i)), discord_connected_at: new Date() }));
  const staff = { id: "staff", username: "Staff", role: "admin", email_verified: true, metadata: {} };
  tables.user.push(...users, staff);
  for (const [teamId, offset] of [["alpha", 0], ["bravo", 4]]) {
    tables.team.push({ id: teamId, metadata: { name: `${teamId} squad`, captain_id: users[offset].id, team_type: "challenge", roster_size: size, is_active: true } });
    tables.teamMember.push(...users.slice(offset, offset + size).map((user) => ({ id: `${teamId}-${user.id}`, metadata: { user_id: user.id, team_id: teamId, is_active: true } })));
  }
  const verified = [];
  const handlers = createChallengeHandlers({ db, checkMembership: async (user) => { verified.push(user.id); } });
  const request = (who, body) => ({ user: typeof who === "number" ? users[who] : who, userRow: typeof who === "number" ? users[who] : who, body });
  const action = (who, action, payload = {}) => handlers.challengeAction(request(who, { action, ...payload }));
  const create = async () => (await action(0, "create", { team_id: "alpha", game_id: "bo7", format_id: "hp_bo3" })).match;
  const voiceReady = (id) => {
    const row = tables.challengeMatch.find((row) => row.id === id);
    const match = { ...row.metadata, id: row.id, status: row.status };
    const config = challengeDiscordConfig();
    tables.discordEventDispatch = tables.discordEventDispatch.filter((row) => row.event_key !== challengeVoiceKey(id));
    tables.discordEventDispatch.push({ event_key: challengeVoiceKey(id), metadata: { match_id: id, guild_id: config.guildId, category_id: config.categoryId, channels: { waiting: "300000000000000001" }, waiting_room_id: "300000000000000001", checked_at: new Date().toISOString(), roster_signature: voiceRosterSignature(challengeVoiceMatch(match), challengeVoiceRoster(match)), players: Object.fromEntries(match.players.map((player) => [player.user_id, { status: "in_waiting_room" }])) } });
  };
  return { db, users, staff, handlers, action, create, request, voiceReady, verified, locks, rows: (name) => tables[name] };
}

test("challenge creation keeps the selected game and its map configuration for all four games", async (t) => {
  for (const game_id of ["mw4", "mw3", "bo6", "bo7"]) await t.test(game_id, async (t) => {
    const f = fixture(t);
    const { match } = await f.action(0, "create", { team_id: "alpha", game_id, format_id: "cdl_bo3" });
    assert.equal(match.game_id, game_id);
    assert.equal(match.game_config.id, game_id);
    assert.deepEqual(match.series_mode_ids, game_id === "mw4" ? ["hp", "snd", "hijacked"] : ["hp", "snd", "hp"]);
    assert.ok(match.game_config.modes.every(mode => mode.maps.length > 0));
  });
});

test("XP decreases with own rating, rewards upsets, penalizes lower-rated losses and never goes negative", () => {
  assert.ok(challengeXpChange(8000, 8000, true) < challengeXpChange(1000, 1000, true));
  assert.ok(challengeXpChange(1000, 3000, true) > challengeXpChange(1000, 0, true));
  assert.ok(challengeXpChange(3000, 0, false) < challengeXpChange(3000, 5000, false));
  assert.equal(challengeXpChange(0, 5000, false), 0);
  assert.equal(challengeRank(9000).name, "Sovereign");
});

test("only complete captained rosters can post, money and forged identities are rejected or ignored", async (t) => {
  const f = fixture(t, 3);
  await assert.rejects(f.action(1, "create", { team_id: "alpha" }), /captain/);
  await assert.rejects(f.action(0, "create", { team_id: "alpha", amount: 5 }), /disabled/);
  f.rows("teamMember").pop();
  // Remove one actual Alpha member as well.
  f.rows("teamMember").splice(1, 1);
  await assert.rejects(f.create(), /exactly 3/);
  assert.equal(f.rows("challengeMatch").length, 0);
});

test("complete rosters can post and accept every format; team records stay separate and one-player rosters also earn solo XP", async (t) => {
  for (const size of [1, 2, 3, 4]) await t.test(`${size}v${size}`, async (t) => {
    const f = fixture(t, size), match = await f.create();
    assert.equal(f.rows("notification")[0].metadata.user_id, "p0");
    const duplicate = await f.action(0, "join", { match_id: match.id, join_as: "team", team_id: "alpha" });
    assert.equal(duplicate.already_joined, true);
    const joined = await f.action(4, "join", { match_id: match.id, join_as: "team", team_id: "bravo" });
    assert.equal(joined.match.status, "ready_check");
    await assert.rejects(f.action(0, "start", { match_id: match.id }), /Discord waiting/);
    f.voiceReady(match.id);
    const started = await f.action(0, "start", { match_id: match.id });
    assert.equal(started.match.series_maps.length, 3);
    const report = await f.action(0, "report", { match_id: match.id, alpha: 2, bravo: 1 });
    assert.equal(report.match.status, "awaiting_confirmation");
    assert.equal(f.rows("challengeStanding").every((row) => row.wins === 0), true);
    await f.action(4, "report", { match_id: match.id, alpha: 2, bravo: 1 });
    const standings = structuredClone(f.rows("challengeStanding"));
    assert.equal(standings.filter((row) => row.kind === "team").length, 2);
    assert.equal(standings.filter((row) => row.kind === "solo").length, size === 1 ? 2 : 0);
    assert.equal(standings.find((row) => row.subject_id === "alpha").wins, 1);
    assert.equal(standings.find((row) => row.subject_id === "bravo").losses, 1);
    await f.action(4, "report", { match_id: match.id, alpha: 2, bravo: 1 });
    assert.deepEqual(f.rows("challengeStanding"), standings);
  });
});

test("solo slots cannot be overfilled or replaced by teams; only solo participants receive solo standings", async (t) => {
  const f = fixture(t, 2), match = await f.create();
  await f.action(8, "join", { match_id: match.id, join_as: "solo" });
  await assert.rejects(f.action(4, "join", { match_id: match.id, join_as: "team", team_id: "bravo" }), /already joined/);
  const results = await Promise.allSettled([9, 10].map((who) => f.action(who, "join", { match_id: match.id, join_as: "solo" })));
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(f.rows("challengeMatch")[0].metadata.players.length, 4);
  f.voiceReady(match.id); await f.action(0, "start", { match_id: match.id });
  await f.action(0, "report", { match_id: match.id, alpha: 0, bravo: 2 });
  await f.action(8, "report", { match_id: match.id, alpha: 0, bravo: 2 });
  assert.deepEqual(f.rows("challengeStanding").map((row) => [row.kind, row.subject_id, row.wins]), [["team", "alpha", 0], ["solo", "p8", 1], ["solo", "p9", 1]]);
});

test("conflicts wait for staff, settlement and reverts are audited and atomic, and later XP dependencies block reverts", async (t) => {
  const f = fixture(t, 1), match = await f.create();
  await f.action(8, "join", { match_id: match.id, join_as: "solo" }); f.voiceReady(match.id); await f.action(0, "start", { match_id: match.id });
  await f.action(0, "report", { match_id: match.id, alpha: 2, bravo: 0 });
  assert.equal((await f.action(8, "report", { match_id: match.id, alpha: 0, bravo: 2 })).match.status, "disputed");
  await assert.rejects(f.action(8, "resolve", { match_id: match.id, alpha: 2, bravo: 0, reason: "I won this" }), /staff/);
  await f.action(f.staff, "resolve", { match_id: match.id, alpha: 2, bravo: 0, reason: "Video evidence checked" });
  await assert.rejects(f.action(0, "revert", { match_id: match.id, reason: "Wrong winner" }), /Admin/);
  await f.action(f.staff, "revert", { match_id: match.id, reason: "Wrong score confirmed" });
  assert.equal(f.rows("challengeStanding").every((row) => row.xp === 0 && row.wins === 0 && row.losses === 0), true);
  await f.action(f.staff, "resolve", { match_id: match.id, alpha: 0, bravo: 2, reason: "Corrected after review" });
  assert.equal(f.rows("challengeStanding").find((row) => row.subject_id === "p8").wins, 1);
  const old = f.rows("challengeMatch")[0];
  f.rows("challengeMatch").push({ id: "later", status: "in_progress", metadata: { started_at: new Date(Date.parse(old.metadata.started_at) + 1000).toISOString(), ratings: old.metadata.ratings, players: [] } });
  await assert.rejects(f.action(f.staff, "revert", { match_id: match.id, reason: "Test later dependency" }), /newer match/);
  assert.equal(f.rows("adminAction").filter((row) => row.metadata.action_type === "challenge_revert").length, 1);
});

test("private chat and voice stay private, outsiders cannot mutate, solo captains reassign, cancellation closes the match", async (t) => {
  const f = fixture(t, 2), match = await f.create();
  await f.action(0, "chat", { match_id: match.id, message: "Team plan" });
  await assert.rejects(f.action(12, "chat", { match_id: match.id, message: "outsider" }), /Only players/);
  await assert.rejects(f.action(12, "cancel", { match_id: match.id, reason: "Outsider cancel" }), /captain/);
  const view = await f.handlers.getChallengeRoom(f.request(12, { match_id: match.id }));
  assert.deepEqual(view.match.messages, []); assert.equal(view.match.voice, null);
  await f.action(8, "join", { match_id: match.id, join_as: "solo" });
  await f.action(9, "join", { match_id: match.id, join_as: "solo" });
  await f.action(8, "leave", { match_id: match.id });
  assert.equal(f.rows("challengeMatch")[0].metadata.players.find((row) => row.user_id === "p9").captain, true);
  await f.action(0, "cancel", { match_id: match.id, reason: "Roster no longer available" });
  assert.equal(f.rows("challengeMatch")[0].status, "cancelled");
  await assert.rejects(f.action(12, "join", { match_id: match.id, join_as: "solo" }), /no longer open/);
});

test("real API requires authentication and blocks generic ladder/roster writes; client IDs cannot impersonate captains", async (t) => {
  const f = fixture(t, 2), match = await f.create();
  const override = (object, name, fn) => { const previous = object[name]; object[name] = fn; t.after(() => { object[name] = previous; }); };
  override(prisma.user, "findUnique", async ({ where }) => structuredClone(f.users.find((user) => user.id === where.id)));
  override(prisma.user, "findMany", f.db.user.findMany);
  override(prisma.challengeStanding, "findMany", f.db.challengeStanding.findMany);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.challengeMatch, "findUnique", f.db.challengeMatch.findUnique);
  override(prisma.challengeMatch, "findMany", f.db.challengeMatch.findMany);
  override(prisma.discordEventDispatch, "findUnique", f.db.discordEventDispatch.findUnique);
  override(prisma, "$transaction", f.db.$transaction);
  const app = express(); app.use(express.json()); app.use("/functions", functionRoutes); app.use("/entities", entityRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (path, body, who = 12, method = "POST") => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(who === null ? {} : { Authorization: `Bearer ${signUser(f.users[who])}` }) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const name of ["getChallengeStandings", "getChallengeOverview", "getChallengeRoom", "getChallengeActivity", "challengeAction"]) assert.equal((await request(`/functions/${name}`, {}, null)).status, 401);
  for (const entity of ["ChallengeMatch", "ChallengeStanding", "Team", "TeamMember", "TeamInvite"]) assert.equal((await request(`/entities/${entity}`, { xp: 999999, captain_id: "p12" })).status, 403);
  const view = await (await request("/functions/getChallengeRoom", { match_id: match.id })).json();
  assert.equal(view.match.can_manage, false); assert.equal(view.match.voice, null);
  const forged = await request("/functions/challengeAction", { action: "cancel", match_id: match.id, user_id: "p0", host_id: "p12", reason: "Forged captain identity" });
  assert.equal(forged.status, 403);
  assert.equal(f.rows("challengeMatch")[0].status, "open");
});

test("room tables use public player presentation and the correct team or solo standing without account secrets", async (t) => {
  const f = fixture(t, 2), match = await f.create();
  Object.assign(f.rows("user")[0], { email: "private@example.com", password_hash: "secret", is_premium: true });
  Object.assign(f.rows("user")[0].metadata, { avatar_url: "/avatar.png", display_name_color: "#00ffff", twitch: "player", password_reset_token_hash: "hidden", last_login_ip: "private" });
  await f.db.challengeStanding.create({ data: { kind: "team", subject_id: "alpha", name: "Alpha", xp: 1234, wins: 8, losses: 3 } });
  const result = await f.handlers.getChallengeRoom(f.request(12, { match_id: match.id }));
  const player = result.match.players[0];
  assert.equal(player.avatar_url, "/avatar.png"); assert.equal(player.is_premium, true);
  assert.equal(player.display_name_color, "#00ffff"); assert.equal(player.twitch, "player");
  for (const key of ["email", "password_hash", "password_reset_token_hash", "last_login_ip", "metadata"]) assert.equal(player[key], undefined);
  assert.deepEqual(result.match.standings, [{ kind: "team", subject_id: "alpha", xp: 1234, wins: 8, losses: 3 }]);
  assert.equal(result.match.voice, null); assert.deepEqual(result.match.messages, []);
});

test("a failed standings write rolls back the full result, and voice readiness rejects stale or changed rosters", async (t) => {
  const f = fixture(t, 2), match = await f.create();
  await f.action(4, "join", { match_id: match.id, join_as: "team", team_id: "bravo" });
  f.voiceReady(match.id);
  f.rows("discordEventDispatch")[0].metadata.checked_at = new Date(Date.now() - 30000).toISOString();
  await assert.rejects(f.action(0, "start", { match_id: match.id }), /Discord waiting/);
  f.voiceReady(match.id);
  await f.action(0, "start", { match_id: match.id });
  const original = f.db.challengeStanding.update;
  let writes = 0;
  f.db.challengeStanding.update = async (args) => { if (++writes === 2) throw new Error("Database write failed"); return original(args); };
  await assert.rejects(f.action(f.staff, "resolve", { match_id: match.id, alpha: 2, bravo: 0, reason: "Reviewed both teams" }), /Database write failed/);
  assert.equal(f.rows("challengeMatch")[0].status, "in_progress");
  assert.ok(f.rows("challengeStanding").every((row) => row.xp === 0 && row.wins === 0 && row.losses === 0));
  f.db.challengeStanding.update = original;
  await f.action(f.staff, "resolve", { match_id: match.id, alpha: 2, bravo: 0, reason: "Reviewed both teams" });
  assert.equal(f.rows("challengeStanding").find((row) => row.subject_id === "alpha").wins, 1);
});

test("Free 8s players cannot also post challenges, and public profile history never includes another account's active rooms", async (t) => {
  const f = fixture(t, 1);
  f.rows("wager").push({ id: "free8s", metadata: { match_type: "8s", status: "in_progress", host_id: "p0" } });
  await assert.rejects(f.create(), /Finish your Free 8s/);
  f.rows("wager").pop();
  const match = await f.create();
  assert.equal((await f.handlers.getChallengeActivity(f.request(0, {}))).matches.length, 1);
  assert.equal((await f.handlers.getChallengeActivity(f.request(12, { user_id: "p0" }))).matches.length, 0);
  assert.equal((await f.handlers.getChallengeActivity(f.request(12, {}))).matches.length, 0);
  f.rows("challengeMatch")[0].status = "completed";
  const publicHistory = await f.handlers.getChallengeActivity(f.request(12, { user_id: "p0" }));
  assert.equal(publicHistory.matches[0].id, match.id);
  assert.equal(publicHistory.matches[0].profile_side, "alpha");
  assert.equal(publicHistory.matches[0].messages, undefined);
});

test("challenge support requests reach the inbox once, and staff can reply without joining the roster", async t => {
  const f = fixture(t), match = await f.create();
  const beforeRoster = structuredClone(match.players);
  const requested = await f.action(0, "support", { match_id: match.id });
  assert.ok(requested.match.support_ticket_id);
  assert.equal(f.rows("ticket").length, 1);
  assert.equal(f.rows("ticket")[0].metadata.match_type, "challenge");
  assert.ok(f.rows("notification").some(row => row.metadata.type === "admin_request"));
  await f.action(0, "support", { match_id: match.id });
  assert.equal(f.rows("ticket").length, 1);
  assert.equal(f.rows("challengeMatch")[0].metadata.messages.filter(message => message.system && message.text.startsWith("Admin requested")).length, 1);
  const clientId = crypto.randomUUID();
  const replied = await f.action(f.staff, "chat", { match_id: match.id, message: "Staff reply from support center", client_message_id: clientId });
  assert.deepEqual(replied.match.players, beforeRoster);
  assert.equal(replied.match.messages.at(-1).staff, true);
  const retry = await f.action(f.staff, "chat", { match_id: match.id, message: "Staff reply from support center", client_message_id: clientId });
  assert.equal(retry.match.messages.length, replied.match.messages.length);
});

test("support center staff messages reach Challenge a Team chat without roster or ownership changes", async t => {
  const f = fixture(t), match = await f.create();
  const requested = await f.action(0, "support", { match_id: match.id });
  const ticket = f.rows("ticket")[0]; ticket.metadata.assigned_admin_id = "another-staff";
  const methods = [["ticket", "findUnique", f.db.ticket.findUnique], ["challengeMatch", "findUnique", f.db.challengeMatch.findUnique], ["challengeMatch", "update", f.db.challengeMatch.update]];
  for (const [model, method, action] of methods) { const previous = prisma[model][method]; prisma[model][method] = action; t.after(() => { prisma[model][method] = previous; }); }
  const previousTransaction = prisma.$transaction, previousQuery = prisma.$queryRaw;
  prisma.$transaction = f.db.$transaction;
  prisma.$queryRaw = async strings => String(Array.isArray(strings) ? strings.join("") : strings.sql).includes('FROM "Ticket"') ? f.rows("ticket") : [];
  t.after(() => { prisma.$transaction = previousTransaction; prisma.$queryRaw = previousQuery; });
  const handler = functionRoutes.stack.find(layer => layer.route?.path === "/:name" && layer.route.methods.post).route.stack.at(-1).handle;
  const body = { kind: "ticket", id: requested.match.support_ticket_id, content: "Reviewing the evidence now", client_message_id: crypto.randomUUID(), match_id: "untrusted" };
  const invoke = () => new Promise((resolve, reject) => handler({ params: { name: "sendSupportCaseMatchMessage" }, body, user: f.staff }, { status() { return this; }, json: resolve }, reject));
  const before = structuredClone(f.rows("challengeMatch")[0].metadata.players);
  const result = await invoke();
  assert.equal(result.success, true); assert.equal(result.message.sender_staff, true);
  assert.equal(result.message.content, body.content);
  assert.deepEqual(f.rows("challengeMatch")[0].metadata.players, before);
  assert.equal(f.rows("ticket")[0].metadata.assigned_admin_id, "another-staff");
  assert.equal((await invoke()).message.id, result.message.id);
});
