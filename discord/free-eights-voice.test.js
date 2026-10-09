import test from "node:test";
import assert from "node:assert/strict";
import { AuditLogEvent, ChannelType, Collection, GuildChannel, PermissionFlagsBits, PermissionOverwrites, PermissionsBitField } from "discord.js";
import { canAssignFreeEightsVoice, freeEightsVoiceChannelName, syncFreeEightsVoice } from "./free-eights-voice.js";
import { freeEightsChannelKey, freeEightsDiscordJoinError, freeEightsVoiceKey, freeEightsWaitingRoomReady, publicFreeEightsVoiceStatus, voiceRosterSignature } from "../server/free-eights-discord.js";
import { editEightsTeamsAsAdmin } from "../server/eights-admin-teams.js";
import { cancelExpiredMatchfinderPost } from "../server/matchfinder-expiry.js";

const config = { enabled: true, guildId: "100000000000000001", waitingRoomId: "100000000000000002", categoryId: "100000000000000003", overflowCategoryIds: ["100000000000000005", "100000000000000006"] };
const channelId = (n) => String(300000000000000000n + BigInt(n));

// Use discord.js's effective member-permission calculation, including guild
// role grants, channel overwrites and the Administrator bypass.
function effectivePermissions(channel, id, { admin = false } = {}) {
  const roles = new Collection([[config.guildId, { permissions: new PermissionsBitField([
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak,
  ]) }]]);
  if (admin) roles.set("admin-role", { permissions: new PermissionsBitField(PermissionFlagsBits.Administrator) });
  const context = {
    guild: { id: config.guildId, ownerId: "guild-owner" },
    permissionOverwrites: { cache: new Collection(channel.permissionOverwrites.values.map((value) => {
      const resolved = PermissionOverwrites.resolve(value);
      return [resolved.id, { ...resolved, allow: new PermissionsBitField(BigInt(resolved.allow)), deny: new PermissionsBitField(BigInt(resolved.deny)) }];
    })) },
    overwritesFor: GuildChannel.prototype.overwritesFor,
  };
  return GuildChannel.prototype.memberPermissions.call(context, { id, roles: { cache: roles } }, true);
}

function fixture(count = 1, { autoJoinWaiting = true } = {}) {
  const matches = Array.from({ length: count }, (_, index) => ({ id: `match${index + 1}`, metadata: { id: `match${index + 1}`, match_type: "8s", status: "open", teams_generated_at: "2026-10-07T00:00:00Z" } }));
  const match = matches[0];
  const participants = matches.flatMap((item, matchIndex) => Array.from({ length: 8 }, (_, index) => ({ user_id: `player${matchIndex * 8 + index}`, wager_id: item.id, team: index < 4 ? "host" : "challenger" })));
  const users = participants.map((player, index) => ({ id: player.user_id, discord_user_id: String(200000000000000000n + BigInt(index)), discord_connected_at: new Date() }));
  const records = new Map();
  const moves = [];
  const logs = [];
  const writes = [];
  const channels = new Collection();
  const voices = new Collection();
  const members = new Collection();
  const audits = new Collection();
  const locks = new Set();
  let creations = 0;
  let permissionEdits = 0;
  let deletes = 0;
  let inventoryFetches = 0;
  // Discord rejects MANAGE_ROLES channel overwrites for non-administrators,
  // even when the bot already has Manage Roles through its guild role.
  const validateOverwrites = (overwrites = []) => {
    for (const overwrite of overwrites) {
      const resolved = PermissionOverwrites.resolve(overwrite);
      if ((BigInt(resolved.allow) | BigInt(resolved.deny)) & PermissionFlagsBits.ManageRoles) {
        throw Object.assign(new Error("Missing Permissions"), { status: 403, code: 50013 });
      }
    }
  };
  const channel = (id, type, name, parentId) => ({
    id, type, name, parentId,
    get members() { return members.filter((member) => member.voice.channelId === id); },
    permissionOverwrites: { async set(overwrites) { validateOverwrites(overwrites); this.values = overwrites; permissionEdits++; } },
    async setName(value) { this.name = value; },
    async delete() { channels.delete(id); deletes++; },
  });
  channels.set(config.waitingRoomId, channel(config.waitingRoomId, ChannelType.GuildVoice, "8s Waiting Room", null));
  channels.set(config.categoryId, channel(config.categoryId, ChannelType.GuildCategory, "Free 8s Test", null));
  for (const id of config.overflowCategoryIds) channels.set(id, channel(id, ChannelType.GuildCategory, "Free 8s overflow", null));
  const guild = { id: config.guildId, client: { user: { id: "100000000000000004" } }, voiceStates: { cache: voices },
    async fetchAuditLogs({ before } = {}) {
      const entries = new Collection([...audits].reverse().filter(([id]) => !before || Number(id) < Number(before)).slice(0, 100));
      return { entries };
    },
    channels: {
      cache: channels,
      async fetch(id) {
        if (!id) { inventoryFetches++; return new Collection(channels); }
        if (!channels.has(id)) throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
        return channels.get(id);
      },
      async create(options) {
        validateOverwrites(options.permissionOverwrites);
        if (channels.filter((item) => item.parentId === options.parent).size >= 50) {
          throw Object.assign(new Error("Maximum category channels"), { status: 400, code: 30013 });
        }
        creations++;
        const item = channel(channelId(creations), options.type, options.name, options.parent);
        item.userLimit = options.userLimit;
        item.permissionOverwrites.values = options.permissionOverwrites;
        // Simulate participants following their own lobby join link (not a bot move).
        if (autoJoinWaiting && options.userLimit === 8) {
          for (const overwrite of options.permissionOverwrites.slice(2)) {
            const voice = voices.get(overwrite.id);
            if (voice?.channelId === config.waitingRoomId) voice.channelId = item.id;
          }
        }
        channels.set(item.id, item);
        audits.set(String(creations), { id: String(creations), reason: options.reason, action: AuditLogEvent.ChannelCreate,
          executorId: guild.client.user.id, targetId: item.id, createdTimestamp: Date.now() });
        return item;
      },
    },
  };
  for (const user of users) {
    const voice = { id: user.discord_user_id, channelId: config.waitingRoomId,
      async setChannel(id) {
        if (this.fail) throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
        moves.push([this.id, this.channelId, id]); this.channelId = id;
      },
      async fetch() { return this; },
    };
    voices.set(user.discord_user_id, voice);
    members.set(user.discord_user_id, { id: user.discord_user_id, voice });
  }
  const db = {
    wager: { async findMany() { return matches.filter((row) => row.metadata.match_type === "8s" && !["completed", "cancelled", "expired", "closed"].includes(row.metadata.status)).map((row) => structuredClone(row)); },
      async findUnique({ where }) { return structuredClone(matches.find((row) => row.id === where.id) || null); } },
    wagerParticipant: { async findMany({ where }) { return participants.filter((row) => row.wager_id === where.metadata.equals).map((metadata) => ({ metadata: structuredClone(metadata) })); } },
    user: { async findMany({ where }) { return structuredClone(users.filter((row) => where.id.in.includes(row.id))); } },
    discordEventDispatch: {
      async findMany({ where }) { return [...records.values()].filter((row) => row.event_key.startsWith(where.event_key.startsWith)
        && (!where.metadata || row.metadata.match_id === where.metadata.equals)).map((row) => structuredClone(row)); },
      async findUnique({ where }) { return structuredClone(records.get(where.event_key) || null); },
      async upsert({ where, create, update }) { records.set(where.event_key, structuredClone({ event_key: create.event_key, metadata: update.metadata })); },
      async create({ data }) {
        if (records.has(data.event_key)) throw Object.assign(new Error("Unique key"), { code: "P2002" });
        records.set(data.event_key, structuredClone(data));
        if (data.event_key.startsWith("free8s-voice:")) writes.push(structuredClone(data.metadata));
      },
      async update({ where, data }) {
        if (!records.has(where.event_key)) throw new Error("Missing record");
        records.set(where.event_key, structuredClone({ ...records.get(where.event_key), ...data }));
      },
      async updateMany({ where, data }) {
        const record = records.get(where.event_key);
        const matches = record && (where.metadata.path
          ? record.metadata[where.metadata.path[0]] === where.metadata.equals
          : JSON.stringify(record.metadata) === JSON.stringify(where.metadata.equals));
        if (!matches) return { count: 0 };
        records.set(where.event_key, structuredClone({ ...record, ...data }));
        if (where.event_key.startsWith("free8s-voice:")) writes.push(structuredClone(data.metadata));
        return { count: 1 };
      },
    },
    async $queryRaw() { return [{ locked: true }]; },
    async $transaction(fn) {
      let lockedKey;
      const tx = { async $queryRaw(strings, key) {
        if (strings.join("").includes("pg_try_advisory_xact_lock")) {
          const result = await db.$queryRaw(strings, key);
          if (!result[0].locked || locks.has(key)) return [{ locked: false }];
          locks.add(key); lockedKey = key; return [{ locked: true }];
        }
        return [{ ok: 1 }];
      } };
      try { return await fn(tx); } finally { if (lockedKey) locks.delete(lockedKey); }
    },
  };
  const sync = (overrides = {}, options = {}) => syncFreeEightsVoice(guild, { db, config: { ...config, ...overrides }, log: (event, details) => logs.push({ event, ...details }), ...options });
  return { match, matches, participants, users, records, moves, logs, channels, voices, guild, db, sync, audits, writes,
    state: () => records.get(freeEightsVoiceKey(match.id))?.metadata,
    stats: () => ({ creations, permissionEdits, deletes }), inventoryFetches: () => inventoryFetches };
}

test("BO7, BO6 and MW3 retain isolated waiting/team voices and cancellation cleanup", async () => {
  const f = fixture(3);
  ["bo7", "bo6", "mw3"].forEach((id, index) => { f.matches[index].metadata.game_id = id; });
  await f.sync();
  assert.equal(f.stats().creations, 9);
  const states = f.matches.map((match) => f.records.get(freeEightsVoiceKey(match.id)).metadata);
  const ids = states.flatMap((state) => Object.values(state.channels));
  assert.equal(new Set(ids).size, 9);
  for (const state of states) assert.equal(Object.values(state.players).filter((player) => player.status === "in_team_voice").length, 8);
  f.matches[1].metadata.status = "cancelled";
  await f.sync();
  for (const id of Object.values(states[1].channels)) assert.equal(f.channels.has(id), false);
  for (const state of [states[0], states[2]]) for (const id of Object.values(state.channels)) assert.equal(f.channels.has(id), true);
});

test("terminal BO7, BO6 and MW3 updates return both teams before slow channel deletion without scanning unrelated matches", async () => {
  for (const game_id of ["bo7", "bo6", "mw3"]) for (const status of ["cancelled", "completed"]) {
    const f = fixture(2);
    f.match.metadata.game_id = game_id;
    await f.sync();
    const state = f.state();
    const other = structuredClone(f.records.get(freeEightsVoiceKey("match2")).metadata);
    f.match.metadata.status = status;
    f.db.wager.findMany = async () => assert.fail("a direct update must not scan every lobby");
    f.db.discordEventDispatch.findMany = async () => assert.fail("a direct update must not scan every voice state");
    const inventoryFetches = f.inventoryFetches();
    let releaseDelete, startedDelete;
    const deletionGate = new Promise(resolve => { releaseDelete = resolve; });
    const deletionStarted = new Promise(resolve => { startedDelete = resolve; });
    const host = f.channels.get(state.channels.host), deleteHost = host.delete.bind(host);
    host.delete = async () => { startedDelete(); await deletionGate; return deleteHost(); };
    let activeMoves = 0, peakMoves = 0;
    for (const user of f.users.slice(0, 8)) {
      const voice = f.voices.get(user.discord_user_id), move = voice.setChannel.bind(voice);
      voice.setChannel = async id => {
        activeMoves++; peakMoves = Math.max(peakMoves, activeMoves);
        await new Promise(resolve => setImmediate(resolve));
        try { return await move(id); } finally { activeMoves--; }
      };
    }
    const cleanup = f.sync({}, { matchIds: [f.match.id], refreshInventory: false });
    await deletionStarted;
    assert.ok(f.users.slice(0, 8).every(user => f.voices.get(user.discord_user_id).channelId === config.waitingRoomId));
    assert.equal(peakMoves, 4, "move up to four independent players together");
    assert.equal(f.stats().deletes, 0, "both teams return before waiting for a channel delete");
    assert.equal(f.inventoryFetches(), inventoryFetches);
    assert.deepEqual(f.records.get(freeEightsVoiceKey("match2")).metadata, other);
    releaseDelete();
    assert.deepEqual((await cleanup).deferredMatchIds, []);
    assert.equal(f.stats().deletes, 3);
    assert.ok(f.state().cleaned);
  }
});

test("BO7, BO6 and MW3 keep partially filled lobby rooms and join links throughout repeated sweeps", async () => {
  const f = fixture(3, { autoJoinWaiting: false });
  ["bo7", "bo6", "mw3"].forEach((id, index) => {
    f.matches[index].metadata.game_id = id;
    f.matches[index].metadata.teams_generated_at = "";
  });
  for (let index = f.participants.length - 1; index >= 0; index--) {
    if (index % 8 >= 3) f.participants.splice(index, 1);
  }
  await f.sync();
  const ids = f.matches.map((match) => f.records.get(freeEightsVoiceKey(match.id)).metadata.channels.waiting);
  assert.equal(new Set(ids).size, 3);
  for (let sweep = 0; sweep < 3; sweep++) {
    await f.sync();
    for (const [index, match] of f.matches.entries()) {
      const state = f.records.get(freeEightsVoiceKey(match.id)).metadata;
      const roster = f.participants.filter((row) => row.wager_id === match.id);
      assert.equal(state.channels.waiting, ids[index]);
      assert.equal(f.channels.has(ids[index]), true);
      assert.equal(publicFreeEightsVoiceStatus(config, match.metadata, roster, state).waiting_room_url,
        `https://discord.com/channels/${config.guildId}/${ids[index]}`);
    }
  }
  assert.equal(f.stats().deletes, 0);
  assert.equal(f.stats().creations, 3);
});

test("link gate requires authenticated OAuth identity only for Free 8s", () => {
  assert.equal(freeEightsDiscordJoinError("8s", { id: "u", discord: "typed-name", discord_user_id: "bad" }).code, "FREE_EIGHTS_DISCORD_REQUIRED");
  assert.equal(freeEightsDiscordJoinError("8s", { id: "u", discord_user_id: "200000000000000001" }).success, false);
  assert.equal(freeEightsDiscordJoinError("8s", { id: "u", discord_user_id: "200000000000000001", discord_connected_at: new Date() }), null);
  for (const type of ["money8s", "wagers", "ranked", "xp", "tournament"]) assert.equal(freeEightsDiscordJoinError(type, {}), null);
});

test("40 matches fetch the channel inventory once per sweep and do not repeatedly rewrite unchanged permissions", async () => {
  const f = fixture(40);
  const overflow = "100000000000000005";
  f.channels.set(overflow, { id: overflow, type: ChannelType.GuildCategory, name: "ACTIVE 8s overflow" });
  const settings = { overflowCategoryIds: [overflow, config.overflowCategoryIds[1]] };
  await f.sync(settings);
  assert.equal(f.inventoryFetches(), 1);
  assert.equal(f.moves.length, 320);
  const edits = f.stats().permissionEdits;
  await f.sync(settings);
  assert.equal(f.inventoryFetches(), 2);
  assert.equal(f.stats().permissionEdits, edits);
});

test("gateway voice checks use the live inventory and still refresh observed channel changes", async () => {
  const f = fixture();
  await f.sync();
  const edits = f.stats().permissionEdits;
  const player = f.users[0];
  f.voices.get(player.discord_user_id).channelId = null;
  await f.sync({}, { refreshInventory: false });
  assert.equal(f.inventoryFetches(), 1, "a voice event must not fetch the full inventory again");
  assert.equal(f.stats().permissionEdits, edits);
  assert.equal(f.state().players[player.id].status, "not_in_waiting_room");
  assert.equal(publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, f.state()).fresh, true);
  await f.sync();
  assert.equal(f.inventoryFetches(), 2, "the periodic fallback must still refresh inventory");
});

test("gateway checks cannot refresh presence while Discord is disconnected", async () => {
  const f = fixture();
  await f.sync();
  const checked = f.state().checked_at;
  f.guild.client.isReady = () => false;
  await f.sync({}, { refreshInventory: false });
  assert.equal(f.state().checked_at, checked);
  assert.equal(f.inventoryFetches(), 1);
});

test("intermediate creation/reshuffle saves cannot publish empty or partially updated fresh player status", async () => {
  const f = fixture();
  await f.sync();
  const checkWrites = () => {
    let freshWrites = 0;
    for (const state of f.writes) {
      const publicStatus = publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, state);
      if (!publicStatus.fresh) continue;
      freshWrites++;
      assert.equal(Object.keys(state.players).length, 8);
      assert.ok(publicStatus.players.every((player) => player.status === "in_team_voice"));
    }
    assert.ok(freshWrites > 0);
  };
  checkWrites();
  f.writes.length = 0;
  f.participants[0].team = "challenger";
  f.participants[4].team = "host";
  f.match.metadata.teams_generated_at = "2026-10-07T00:02:00Z";
  await f.sync();
  checkWrites();
});

test("a disconnected gateway cannot refresh cached presence or release map generation", async () => {
  const f = fixture();
  f.match.metadata.teams_generated_at = "";
  await f.sync();
  const checked = f.state().checked_at;
  f.guild.client.isReady = () => false;
  await f.sync();
  assert.equal(f.state().checked_at, checked);
  assert.equal(f.inventoryFetches(), 1);
  assert.equal(freeEightsWaitingRoomReady(config, f.match.metadata, f.participants, f.state(), Date.parse(checked) + 21000), false);
  assert.ok(f.logs.some((row) => row.event === "gateway-not-ready"));
});

test("only canonical eight-player 4v4 Free 8s teams qualify", () => {
  const f = fixture();
  assert.equal(canAssignFreeEightsVoice(f.match.metadata, f.participants), true);
  for (const type of ["money8s", "wagers", "tournament"]) assert.equal(canAssignFreeEightsVoice({ ...f.match.metadata, match_type: type }, f.participants), false);
  assert.equal(canAssignFreeEightsVoice(f.match.metadata, f.participants.slice(1)), false);
  assert.equal(canAssignFreeEightsVoice({ ...f.match.metadata, teams_generated_at: "" }, f.participants), false);
});

test("non-administrator bot creates private voices without forbidden Manage Roles overwrites", async () => {
  const f = fixture();
  // An earlier definite 403 leaves the match eligible for a clean retry.
  await f.db.discordEventDispatch.create({ data: { event_key: freeEightsVoiceKey(f.match.id),
    metadata: { match_id: f.match.id, channels: {}, provisions: {}, error: "Missing Permissions" } } });
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
  assert.equal(f.state().error, null);
  for (const id of Object.values(f.state().channels)) {
    const overwrites = f.channels.get(id).permissionOverwrites.values;
    const botOverwrite = overwrites.find((entry) => entry.id === f.guild.client.user.id);
    assert.equal(botOverwrite.allow.includes(PermissionFlagsBits.ManageRoles), false);
    assert.equal(botOverwrite.allow.includes(PermissionFlagsBits.ManageChannels), true);
    assert.equal(botOverwrite.allow.includes(PermissionFlagsBits.MoveMembers), true);
    assert.deepEqual(overwrites[0].deny, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]);
  }
  f.participants[0].team = "challenger";
  f.participants[4].team = "host";
  f.match.metadata.teams_generated_at = "2026-10-07T00:01:00Z";
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.stats().permissionEdits, 2);
  assert.equal(f.moves.length, 10);
});

test("private channels, correct teams, offline/other-channel players and late arrivals", async () => {
  const f = fixture();
  f.voices.get(f.users[6].discord_user_id).channelId = null;
  f.voices.get(f.users[7].discord_user_id).channelId = "unrelated-voice";
  await f.sync();
  assert.equal(f.moves.length, 6);
  assert.equal(f.stats().creations, 3);
  assert.equal(f.state().players.player6.status, "not_in_waiting_room");
  assert.equal(f.state().players.player7.status, "not_in_waiting_room");
  for (const player of f.participants.slice(0, 6)) {
    const user = f.users.find((item) => item.id === player.user_id);
    assert.equal(f.voices.get(user.discord_user_id).channelId, f.state().channels[player.team]);
  }
  const alpha = f.channels.get(f.state().channels.host);
  const overwrite = alpha.permissionOverwrites.values;
  // Real discord.js resolution must work for linked users absent from its cache.
  for (const value of overwrite) assert.doesNotThrow(() => PermissionOverwrites.resolve(value));
  assert.deepEqual(overwrite[0].deny, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]);
  assert.deepEqual(overwrite.slice(2).map((item) => item.id), f.users.slice(0, 4).map((user) => user.discord_user_id));
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 6);
  f.voices.get(f.users[6].discord_user_id).channelId = f.state().waiting_room_id;
  await f.sync();
  assert.equal(f.state().players.player6.status, "in_team_voice");
  assert.equal(f.moves.length, 7);
});

test("move failure is isolated, logged, visible and retried", async () => {
  const f = fixture();
  f.voices.get(f.users[0].discord_user_id).fail = true;
  await f.sync();
  assert.equal(f.state().players.player0.status, "move_failed");
  assert.equal(f.moves.length, 7);
  assert.ok(f.logs.some((item) => item.event === "move-failed"));
  f.voices.get(f.users[0].discord_user_id).fail = false;
  await f.sync();
  assert.equal(f.state().players.player0.status, "in_team_voice");
});

test("reshuffle changes private access and moves only this match's teams", async () => {
  const f = fixture();
  await f.sync();
  f.participants[0].team = "challenger";
  f.participants[4].team = "host";
  f.match.metadata.teams_generated_at = "2026-10-07T00:01:00Z";
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.stats().permissionEdits, 2);
  assert.equal(f.moves.length, 10);
  assert.equal(f.voices.get(f.users[0].discord_user_id).channelId, f.state().channels.challenger);
});

test("a persisted admin swap invalidates old voice status and moves both players into their new private teams", async () => {
  const f = fixture();
  Object.assign(f.match.metadata, { host_id: "player0", challenger_id: "player4", roster_lock_deadline: new Date(Date.now() + 60000).toISOString() });
  f.participants.forEach((player, i) => { player.is_captain = i === 0 || i === 4; });
  await f.sync();
  const channelsBefore = { ...f.state().channels };
  const tx = {
    $executeRaw: async () => 1,
    wager: { findUnique: f.db.wager.findUnique, update: async ({ data }) => { Object.assign(f.match, structuredClone(data)); return structuredClone(f.match); } },
    wagerParticipant: {
      findMany: async () => f.participants.map((metadata, i) => ({ id: `participant${i}`, metadata: structuredClone(metadata) })),
      update: async ({ where, data }) => { const i = Number(where.id.replace("participant", "")); Object.assign(f.participants[i], structuredClone(data.metadata)); return { id: where.id, metadata: f.participants[i] }; },
    },
    user: f.db.user, eightsStats: { findMany: async () => [] }, adminAction: { create: async () => ({}) },
  };
  await editEightsTeamsAsAdmin({ $transaction: (action) => action(tx) }, { id: "admin", role: "admin" }, f.match.id, {
    mode: "swap", first_user_id: "player0", second_user_id: "player4", expected_teams_generated_at: f.match.metadata.teams_generated_at,
  });
  assert.equal(publicFreeEightsVoiceStatus(config, { ...f.match.metadata, id: f.match.id }, f.participants, f.state()).fresh, false);
  await f.sync();
  assert.deepEqual(f.state().channels, channelsBefore);
  assert.equal(f.moves.length, 10); assert.equal(f.stats().permissionEdits, 2);
  assert.equal(f.voices.get(f.users[0].discord_user_id).channelId, f.state().channels.challenger);
  assert.equal(f.voices.get(f.users[4].discord_user_id).channelId, f.state().channels.host);
  assert.ok(effectivePermissions(f.channels.get(f.state().channels.challenger), f.users[0].discord_user_id).has(PermissionFlagsBits.Connect));
  assert.equal(effectivePermissions(f.channels.get(f.state().channels.host), f.users[0].discord_user_id).has(PermissionFlagsBits.Connect), false);
  assert.equal(f.state().roster_signature, voiceRosterSignature(f.match.metadata, f.participants));
});

test("website lobby waits for voice before generation and both winning and losing teams return after completion", async () => {
  const f = fixture();
  f.match.metadata.teams_generated_at = "";
  f.match.metadata.free_eights_waiting_for_voice = true;
  f.voices.get(f.users[7].discord_user_id).channelId = null;
  await f.sync();
  assert.equal(f.stats().creations, 1);
  assert.equal(f.moves.length, 0);
  assert.equal(freeEightsWaitingRoomReady(config, f.match.metadata, f.participants, f.state()), false);
  f.voices.get(f.users[7].discord_user_id).channelId = f.state().waiting_room_id;
  await f.sync();
  assert.equal(freeEightsWaitingRoomReady(config, f.match.metadata, f.participants, f.state()), true);
  assert.equal(f.stats().creations, 1, "presence alone cannot create voices before website generation");
  f.match.metadata.teams_generated_at = new Date().toISOString();
  f.match.metadata.free_eights_waiting_for_voice = false;
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
  f.match.metadata.status = "completed";
  f.match.metadata.winner_id = f.participants[0].user_id;
  await f.sync();
  for (const player of f.users) assert.equal(f.voices.get(player.discord_user_id).channelId, config.waitingRoomId);
  assert.equal(f.stats().deletes, 3);
  await f.sync();
  assert.equal(f.moves.length, 16, "repeated completion does not move anyone twice");
});

test("30-minute automatic cancellation removes the Discord lobby without website polling", async () => {
  const f = fixture();
  const now = Date.now();
  f.match.created_date = new Date(now - 30 * 60 * 1000);
  f.match.metadata.host_id = f.users[0].id;
  await f.sync();
  assert.equal(f.stats().creations, 3);
  const tx = {
    $executeRaw: async () => 1,
    wager: { findUnique: f.db.wager.findUnique, update: async ({ data }) => { Object.assign(f.match, structuredClone(data)); return structuredClone(f.match); } },
    wagerParticipant: f.db.wagerParticipant,
    notification: { create: async () => ({}) },
  };
  await cancelExpiredMatchfinderPost({ $transaction: (action) => action(tx) }, "Wager", f.match.id, { now, publish: () => {} });
  assert.equal(f.match.metadata.status, "cancelled");
  await f.sync();
  assert.equal(f.stats().deletes, 3);
  assert.equal(f.state().cleaned, true);
  assert.deepEqual(f.state().channels, {});
  for (const user of f.users) assert.equal(f.voices.get(user.discord_user_id).channelId, config.waitingRoomId);
  await f.sync();
  assert.equal(f.stats().deletes, 3);
});

for (const status of ["completed", "cancelled", "expired", "closed"]) {
  test(`idempotent cleanup for ${status} works without website polling`, async () => {
    const f = fixture();
    await f.sync();
    f.match.metadata.status = status;
    await f.sync();
    assert.equal(f.stats().deletes, 3);
    assert.equal(f.moves.length, 16);
    assert.deepEqual(f.state().channels, {});
    assert.equal(f.state().cleaned, true);
    await f.sync();
    assert.equal(f.stats().deletes, 3);
  });
}

test("cleanup move failure retains occupied channel and retries", async () => {
  const f = fixture();
  await f.sync();
  f.voices.get(f.users[0].discord_user_id).fail = true;
  f.match.metadata.status = "cancelled";
  await f.sync();
  assert.equal(f.stats().deletes, 2);
  assert.ok(f.state().channels.host);
  assert.equal(f.state().error, "Voice cleanup pending");
  f.voices.get(f.users[0].discord_user_id).fail = false;
  await f.sync();
  assert.equal(f.stats().deletes, 3);
  assert.equal(f.state().cleaned, true);
});

test("switch off cleans existing channels; partial roster returns players", async () => {
  const f = fixture();
  await f.sync();
  await f.sync({ enabled: false });
  assert.equal(f.stats().deletes, 3);
  const g = fixture();
  await g.sync();
  g.participants.pop();
  g.match.metadata.teams_generated_at = "";
  await g.sync();
  assert.equal(g.stats().deletes, 2);
  assert.equal(g.moves.length, 17);
  assert.ok(g.state().channels.waiting, "remaining players keep their lobby room");
});

test("recover interrupted creation by durable operation and audit channel ID for terminal match", async () => {
  const f = fixture();
  await f.sync();
  const state = f.state();
  const hostId = state.channels.host;
  delete state.channels.host;
  f.records.delete(freeEightsChannelKey(hostId)); // Only reservation persisted before process failure.
  f.match.metadata.status = "expired";
  await f.sync();
  assert.equal(f.stats().deletes, 3);
  assert.equal(f.state().cleaned, true);
});

test("advisory lock loser performs no match actions", async () => {
  const f = fixture();
  f.db.$queryRaw = async () => [{ locked: false }];
  assert.deepEqual((await f.sync({}, { matchIds: [f.match.id], refreshInventory: false })).deferredMatchIds, [f.match.id]);
  assert.equal(f.stats().creations, 0);
  assert.equal(f.moves.length, 0);
});

test("polling fallback prioritizes a finished match over open lobbies", async () => {
  const f = fixture(4);
  await f.sync();
  f.matches[3].metadata.status = "completed";
  const reads = [], getMatch = f.db.wager.findUnique;
  f.db.wager.findUnique = async (input) => { reads.push(input.where.id); return getMatch(input); };
  await f.sync();
  assert.equal(reads[0], "match4");
  assert.ok(f.users.slice(24).every(user => f.voices.get(user.discord_user_id).channelId === config.waitingRoomId));
});

test("a failed channel creation retries without duplicating the successful side", async () => {
  const f = fixture();
  const original = f.guild.channels.create;
  let fail = true;
  f.guild.channels.create = async (options) => {
    if (options.name.startsWith("8s Bravo") && fail) throw Object.assign(new Error("Missing Permissions"), { code: 50013, status: 403 });
    return original(options);
  };
  await f.sync();
  assert.equal(f.stats().creations, 2);
  assert.equal(f.moves.length, 0);
  assert.ok(f.state().error);
  fail = false;
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
  assert.equal(f.state().error, null);
});

test("duplicate or generic names never authorize adoption, moves or deletion", async () => {
  const f = fixture();
  await f.sync();
  const alpha = f.channels.get(f.state().channels.host);
  const duplicate = await f.guild.channels.create({ name: alpha.name, type: ChannelType.GuildVoice, parent: config.categoryId, permissionOverwrites: [] });
  const unrelated = await f.guild.channels.create({ name: "Unrelated team", type: ChannelType.GuildVoice, parent: config.categoryId, permissionOverwrites: [] });
  await f.sync();
  assert.equal(f.stats().deletes, 0);
  assert.ok(f.channels.has(duplicate.id));
  assert.ok(f.channels.has(unrelated.id));
  assert.equal(f.moves.length, 8);
});

test("voice status redacts Discord IDs and rejects stale or changed rosters", async () => {
  const f = fixture();
  await f.sync();
  const current = publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, f.state());
  assert.equal(current.fresh, true);
  assert.ok(current.players.every((player) => player.status === "in_team_voice"));
  assert.ok(!JSON.stringify(current).includes(f.users[0].discord_user_id));
  assert.equal(publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, f.state(), Date.now() + 21_000).fresh, false);
  f.participants[0].team = "challenger";
  assert.notEqual(f.state().roster_signature, voiceRosterSignature(f.match.metadata, f.participants));
  assert.equal(publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, f.state()).fresh, false);
});

test("20 simultaneous matches and overlapping duplicate sync events create exactly 60 isolated channels", async () => {
  const f = fixture(20);
  await Promise.all([f.sync(), f.sync(), f.sync()]);
  assert.equal(f.stats().creations, 60);
  assert.equal(f.moves.length, 160);
  const assigned = new Set();
  for (const match of f.matches) {
    const state = f.records.get(freeEightsVoiceKey(match.id)).metadata;
    assert.ok(state.discord_channels_created_at);
    assert.equal(state.discord_channels_cleaned_at, null);
    for (const side of ["waiting", "host", "challenger"]) {
      const id = state.channels[side];
      assert.ok(!assigned.has(id));
      assigned.add(id);
      assert.equal(f.records.get(freeEightsChannelKey(id)).metadata.match_id, match.id);
      assert.equal(f.channels.get(id).name, freeEightsVoiceChannelName(match.id, side));
    }
    for (const player of f.participants.filter((row) => row.wager_id === match.id)) {
      const identity = f.users.find((user) => user.id === player.user_id);
      assert.equal(f.voices.get(identity.discord_user_id).channelId, state.channels[player.team]);
    }
  }
  await Promise.all([f.sync(), f.sync()]);
  assert.equal(f.stats().creations, 60);
  assert.equal(f.moves.length, 160);
});

test("cleanup of one of 20 matches uses stored IDs even after rename and leaves 19 lobbies untouched", async () => {
  const f = fixture(20);
  await f.sync();
  const before = new Map(f.matches.map((match) => [match.id, structuredClone(f.records.get(freeEightsVoiceKey(match.id)).metadata.channels)]));
  for (const id of Object.values(before.get(f.match.id))) f.channels.get(id).name = "Team A";
  f.match.metadata.status = "completed";
  await Promise.all([f.sync(), f.sync()]);
  assert.equal(f.stats().deletes, 3);
  assert.equal(f.moves.length, 168);
  assert.ok(f.state().discord_channels_cleaned_at);
  assert.equal(f.state().cleaned, true);
  for (const match of f.matches.slice(1)) {
    assert.deepEqual(f.records.get(freeEightsVoiceKey(match.id)).metadata.channels, before.get(match.id));
    for (const id of Object.values(before.get(match.id))) assert.ok(f.channels.has(id));
  }
  await f.sync();
  assert.equal(f.stats().deletes, 3);
});

test("cross-match channel ID injection cannot move, edit or delete another match's channel", async () => {
  const f = fixture(2);
  await f.sync();
  const alpha = f.state().channels.host;
  const other = f.records.get(freeEightsVoiceKey(f.matches[1].id)).metadata;
  f.state().channels.host = other.channels.host;
  f.match.metadata.status = "cancelled";
  const before = f.stats();
  await f.sync();
  assert.deepEqual(f.stats(), before);
  assert.equal(f.moves.length, 16);
  assert.ok(f.logs.some((row) => row.event === "sync-failed" && row.error.includes("ownership")));
  assert.ok(f.channels.has(alpha));
  assert.ok(f.channels.has(other.channels.host));
});

test("foreign match occupant is never moved or disconnected during cleanup", async () => {
  const f = fixture(2);
  await f.sync();
  const ownAlpha = f.state().channels.host;
  const otherVoice = f.voices.get(f.users[8].discord_user_id);
  const original = otherVoice.channelId;
  otherVoice.channelId = ownAlpha; // An administrator manually moved a foreign player.
  f.match.metadata.status = "expired";
  await f.sync();
  assert.equal(otherVoice.channelId, ownAlpha);
  assert.ok(f.channels.has(ownAlpha));
  assert.ok(f.logs.some((row) => row.event === "cleanup-foreign-occupant"));
  assert.equal(f.state().cleaned, false);
  otherVoice.channelId = original;
  await f.sync();
  assert.equal(f.state().cleaned, true);
});

test("ambiguous creation success is recovered by audit ID without creating a duplicate", async () => {
  const f = fixture();
  const original = f.guild.channels.create;
  let interrupted = false;
  f.guild.channels.create = async (options) => {
    const channel = await original(options);
    if (!interrupted) { interrupted = true; throw new Error("Connection closed after Discord accepted creation"); }
    return channel;
  };
  await f.sync();
  assert.equal(f.stats().creations, 1);
  assert.equal(f.moves.length, 0);
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
  assert.ok(f.logs.some((row) => row.event === "provision-recovered"));
});

test("unconfirmed creation cannot be retried blindly or recovered from a lookalike name", async () => {
  const f = fixture();
  const original = f.guild.channels.create;
  let interrupted = false;
  f.guild.channels.create = async (options) => {
    if (!interrupted) { interrupted = true; throw new Error("Creation result unknown"); }
    return original(options);
  };
  await f.sync();
  await original({ name: `${f.match.id} • Team A`, type: ChannelType.GuildVoice, parent: config.categoryId, permissionOverwrites: [] });
  const creations = f.stats().creations;
  await f.sync();
  await f.sync();
  assert.equal(f.stats().creations, creations);
  assert.equal(f.state().channels.host, undefined);
  assert.ok(f.state().error.includes("awaiting confirmation"));
  assert.equal(f.stats().deletes, 0);
});

test("40 simultaneous matches overflow into existing categories and retain three isolated voices per match", async () => {
  const f = fixture(40);
  const overflow = "100000000000000005";
  f.channels.set(overflow, { id: overflow, type: ChannelType.GuildCategory, name: "ACTIVE 8s overflow" });
  const settings = { overflowCategoryIds: [overflow, config.overflowCategoryIds[1]] };
  await Promise.all([f.sync(settings), f.sync(settings)]);
  await f.sync(settings); // Reconcile any Discord-enforced capacity race.
  assert.equal(f.moves.length, 320, JSON.stringify([...f.records.values()].filter((row) => row.event_key.startsWith("free8s-voice:") && Object.keys(row.metadata.channels).length < 2).map((row) => ({ match: row.metadata.match_id, channels: row.metadata.channels, error: row.metadata.error }))));
  assert.equal(f.channels.filter((item) => item.parentId === config.categoryId).size, 48);
  assert.equal(f.channels.filter((item) => item.parentId === overflow).size, 48);
  for (const match of f.matches) {
    const state = f.records.get(freeEightsVoiceKey(match.id)).metadata;
    assert.equal(Object.keys(state.channels).length, 3);
    for (const id of Object.values(state.channels)) assert.equal(f.channels.get(id).parentId, state.category_id);
    assert.equal(publicFreeEightsVoiceStatus({ ...config, ...settings }, match.metadata,
      f.participants.filter((row) => row.wager_id === match.id), state).fresh, true);
  }
  const stats = f.stats();
  await f.sync(settings);
  assert.deepEqual(f.stats(), stats);
});

test("full categories report capacity without changing the match", async () => {
  const f = fixture();
  for (let index = 0; index < 50; index++) f.channels.set(`external${index}`, {
    id: `external${index}`, parentId: config.categoryId, type: ChannelType.GuildVoice,
  });
  await f.sync({ overflowCategoryIds: [] });
  assert.equal(f.stats().creations, 0);
  assert.equal(f.moves.length, 0);
  assert.ok(f.state().error.includes("full"));
  assert.ok(f.logs.some((row) => row.event === "category-capacity-unavailable"));
  assert.equal(f.match.metadata.status, "open");
});

test("replacing an externally deleted voice safely recovers an ambiguous result without duplicate creation", async () => {
  const f = fixture();
  await f.sync();
  const deletedId = f.state().channels.host;
  f.channels.delete(deletedId);
  for (const voice of f.voices.values()) if (voice.channelId === deletedId) voice.channelId = f.state().waiting_room_id;
  const original = f.guild.channels.create;
  f.guild.channels.create = async (options) => {
    await original(options);
    throw new Error("Connection closed after replacement creation");
  };
  await f.sync();
  assert.equal(f.state().channels.host, undefined);
  assert.ok(f.records.get(freeEightsChannelKey(deletedId)).metadata.deleted_at);
  await f.sync();
  assert.equal(f.stats().creations, 4);
  assert.equal(Object.keys(f.state().channels).length, 3);
  assert.equal(f.moves.length, 12);
});

test("lock timeout after Discord creation preserves ownership for the next worker", async () => {
  const f = fixture();
  const originalTransaction = f.db.$transaction;
  const originalCreate = f.guild.channels.create;
  let expired = false;
  f.db.$transaction = async (fn) => fn({ async $queryRaw() {
    if (expired) throw new Error("Transaction lock expired");
    return [{ locked: true }];
  } });
  f.guild.channels.create = async (options) => {
    const channel = await originalCreate(options);
    expired = true;
    return channel;
  };
  await f.sync();
  assert.equal(f.stats().creations, 1);
  assert.equal(f.moves.length, 0);
  assert.ok(f.state().provisions.waiting);
  assert.ok(f.records.has(freeEightsChannelKey(channelId(1))));
  f.db.$transaction = originalTransaction;
  f.guild.channels.create = originalCreate;
  f.guild.fetchAuditLogs = async () => { throw new Error("Recovery must reuse committed ownership without audit"); };
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
  assert.equal(f.state().channels.waiting, channelId(1));
});

test("a replaced worker cannot overwrite newer match state after its Discord request returns", async () => {
  const f = fixture();
  const originalCreate = f.guild.channels.create;
  f.guild.channels.create = async (options) => {
    const channel = await originalCreate(options);
    f.state().worker_token = "newer-worker";
    f.state().marker = "newer-state";
    return channel;
  };
  await f.sync();
  assert.equal(f.state().worker_token, "newer-worker");
  assert.equal(f.state().marker, "newer-state");
  assert.equal(f.state().channels.host, undefined);
  assert.ok(f.records.has(freeEightsChannelKey(channelId(1))));
  assert.ok(f.logs.some((row) => row.event === "sync-failed" && row.error.includes("stale state write")));
  f.guild.channels.create = originalCreate;
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
});

test("a one-player lobby immediately gets a private eight-seat room; join and leave update access", async () => {
  const f = fixture(1, { autoJoinWaiting: false });
  f.match.metadata.teams_generated_at = "";
  const rest = f.participants.splice(1);
  await f.sync();
  const roomId = f.state().channels.waiting;
  const room = f.channels.get(roomId);
  assert.equal(f.stats().creations, 1);
  assert.equal(room.userLimit, 8);
  assert.notEqual(roomId, config.waitingRoomId);
  assert.equal(f.moves.length, 0, "creating a lobby never pulls players from the shared voice");
  assert.deepEqual(room.permissionOverwrites.values.slice(2).map((row) => row.id), [f.users[0].discord_user_id]);
  assert.equal(publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, f.state()).waiting_room_url,
    `https://discord.com/channels/${config.guildId}/${roomId}`);
  f.voices.get(f.users[0].discord_user_id).channelId = roomId;
  f.participants.push(rest[0]);
  await f.sync();
  assert.deepEqual(room.permissionOverwrites.values.slice(2).map((row) => row.id), f.users.slice(0, 2).map((row) => row.discord_user_id));
  f.participants.shift(); // Host leaves; the website keeps the remaining player's lobby open.
  await f.sync();
  assert.equal(f.state().channels.waiting, roomId);
  assert.equal(f.stats().deletes, 0);
  assert.deepEqual(room.permissionOverwrites.values.slice(2).map((row) => row.id), [f.users[1].discord_user_id]);
  assert.equal(f.voices.get(f.users[0].discord_user_id).channelId, config.waitingRoomId);
  f.voices.get(f.users[1].discord_user_id).channelId = roomId;
  f.participants.length = 0;
  f.match.metadata.status = "cancelled"; // Last leave closes the lobby.
  await f.sync();
  assert.equal(f.channels.has(roomId), false);
  assert.equal(f.state().cleaned, true);
  assert.equal(f.voices.get(f.users[1].discord_user_id).channelId, config.waitingRoomId);
  assert.equal(f.channels.has(config.waitingRoomId), true, "the pre-existing return voice is never deleted");
  assert.ok(f.records.get(freeEightsChannelKey(roomId)).metadata.deleted_at, "channel history survives cleanup");
});

test("readiness and moves use only the lobby's own room, never the shared room or another lobby", async () => {
  const f = fixture(2, { autoJoinWaiting: false });
  for (const match of f.matches) match.metadata.teams_generated_at = "";
  await f.sync();
  const first = f.state();
  const second = f.records.get(freeEightsVoiceKey("match2")).metadata;
  assert.notEqual(first.waiting_room_id, second.waiting_room_id);
  assert.equal(freeEightsWaitingRoomReady(config, f.match.metadata, f.participants.slice(0, 8), first), false);
  for (const user of f.users.slice(0, 8)) f.voices.get(user.discord_user_id).channelId = first.waiting_room_id;
  for (const user of f.users.slice(8)) f.voices.get(user.discord_user_id).channelId = first.waiting_room_id; // Admin bypass.
  await f.sync();
  assert.equal(freeEightsWaitingRoomReady(config, f.match.metadata, f.participants.slice(0, 8), f.state()), true);
  assert.equal(freeEightsWaitingRoomReady(config, f.matches[1].metadata, f.participants.slice(8), f.records.get(freeEightsVoiceKey("match2")).metadata), false);
  for (const match of f.matches) match.metadata.teams_generated_at = new Date().toISOString();
  await f.sync();
  assert.equal(f.moves.length, 8);
  for (const user of f.users.slice(8)) assert.equal(f.voices.get(user.discord_user_id).channelId, first.waiting_room_id);
});

test("shared-room snapshots and another match's snapshot cannot produce a lobby join link or readiness", async () => {
  const f = fixture();
  f.match.metadata.teams_generated_at = "";
  await f.sync();
  const state = f.state();
  const legacy = { ...state, waiting_room_id: config.waitingRoomId, channels: {} };
  const foreign = { ...state, match_id: "another-match" };
  for (const snapshot of [legacy, foreign]) {
    const view = publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, snapshot);
    assert.equal(view.fresh, false);
    assert.equal(view.waiting_room_url, null);
    assert.equal(freeEightsWaitingRoomReady(config, f.match.metadata, f.participants, snapshot), false);
  }
  assert.equal(publicFreeEightsVoiceStatus(config, {}, [], null).waiting_room_url, null);
  assert.equal(publicFreeEightsVoiceStatus(config, { ...f.match.metadata, status: "completed" }, f.participants, state).waiting_room_url, null);
});

test("admin completion cleans all three voices with no return room, preserving channel history", async () => {
  const f = fixture();
  await f.sync({ waitingRoomId: "" });
  const ids = Object.values(f.state().channels);
  f.match.metadata.status = "completed";
  f.match.metadata.winner_id = f.participants[0].user_id;
  f.match.metadata.admin_resolved_by = "staff";
  await f.sync({ waitingRoomId: "" });
  assert.equal(f.stats().deletes, 3);
  assert.equal(f.state().cleaned, true);
  for (const user of f.users) assert.equal(f.voices.get(user.discord_user_id).channelId, null);
  for (const id of ids) assert.ok(f.records.get(freeEightsChannelKey(id)).metadata.deleted_at);
  await f.sync({ waitingRoomId: "" });
  assert.equal(f.stats().deletes, 3);
});

test("deleting the optional old shared room does not block cleanup", async () => {
  const f = fixture();
  await f.sync();
  f.channels.delete(config.waitingRoomId);
  f.match.metadata.status = "cancelled";
  await f.sync();
  assert.equal(f.state().cleaned, true);
  for (const user of f.users) assert.equal(f.voices.get(user.discord_user_id).channelId, null);
});

test("a departed player's failed move is retried without deleting the remaining lobby's room", async () => {
  const f = fixture();
  f.match.metadata.teams_generated_at = "";
  await f.sync();
  const room = f.state().channels.waiting;
  const leaver = f.users[0];
  f.voices.get(leaver.discord_user_id).fail = true;
  f.participants.shift();
  await f.sync();
  assert.equal(f.state().channels.waiting, room);
  assert.ok(f.state().error.includes("departed"));
  assert.equal(f.channels.get(room).permissionOverwrites.values.some((row) => row.id === leaver.discord_user_id), false);
  f.voices.get(leaver.discord_user_id).fail = false;
  await f.sync();
  assert.equal(f.state().error, null);
  assert.equal(f.voices.get(leaver.discord_user_id).channelId, config.waitingRoomId);
});

test("an externally deleted private waiting room is recreated with a new join link and ownership", async () => {
  const f = fixture();
  f.match.metadata.teams_generated_at = "";
  await f.sync();
  const oldRoom = f.state().channels.waiting;
  f.channels.delete(oldRoom);
  for (const voice of f.voices.values()) voice.channelId = null;
  await f.sync();
  assert.notEqual(f.state().channels.waiting, oldRoom);
  assert.ok(f.records.get(freeEightsChannelKey(oldRoom)).metadata.deleted_at);
  assert.equal(f.stats().creations, 2);
  const view = publicFreeEightsVoiceStatus(config, f.match.metadata, f.participants, f.state());
  assert.ok(view.waiting_room_url.endsWith(f.state().channels.waiting));
  assert.ok(view.players.every((row) => row.status === "not_in_waiting_room"));
});

test("an existing lobby room survives team-capacity exhaustion until space becomes available", async () => {
  const f = fixture();
  f.match.metadata.teams_generated_at = "";
  await f.sync({ overflowCategoryIds: [] });
  const room = f.state().channels.waiting;
  for (let n = 0; n < 49; n++) f.channels.set(`external${n}`, { id: `external${n}`, parentId: config.categoryId, type: ChannelType.GuildVoice });
  f.match.metadata.teams_generated_at = new Date().toISOString();
  await f.sync({ overflowCategoryIds: [] });
  assert.equal(f.state().channels.waiting, room);
  assert.equal(f.stats().deletes, 0);
  assert.ok(f.state().error.includes("full"));
  f.channels.delete("external0");
  f.channels.delete("external1");
  await f.sync({ overflowCategoryIds: [] });
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
});

test("a waiting-room ID from another lobby cannot authorize cleanup", async () => {
  const f = fixture(2);
  await f.sync();
  const other = f.records.get(freeEightsVoiceKey("match2")).metadata;
  f.state().channels.waiting = other.channels.waiting;
  f.state().waiting_room_id = other.waiting_room_id;
  f.match.metadata.status = "cancelled";
  const before = f.stats();
  await f.sync();
  assert.deepEqual(f.stats(), before);
  assert.ok(f.channels.has(other.channels.waiting));
  assert.ok(f.logs.some((row) => row.event === "sync-failed" && row.error.includes("ownership")));
});

test("upgrade adds a private room to legacy team voices without deleting those teams or the shared voice", async () => {
  const f = fixture();
  await f.sync();
  const state = f.state();
  const teams = { host: state.channels.host, challenger: state.channels.challenger };
  const privateRoom = state.channels.waiting;
  f.channels.delete(privateRoom);
  delete state.channels.waiting;
  delete state.provisions.waiting;
  delete state.channel_roster_signatures.waiting;
  delete state.return_room_id;
  state.waiting_room_id = config.waitingRoomId;
  await f.sync();
  assert.notEqual(f.state().channels.waiting, config.waitingRoomId);
  assert.equal(f.state().channels.host, teams.host);
  assert.equal(f.state().channels.challenger, teams.challenger);
  assert.equal(f.stats().deletes, 0);
  assert.equal(f.moves.length, 8);
  assert.equal(f.channels.has(config.waitingRoomId), true);
  f.match.metadata.status = "completed";
  await f.sync();
  assert.equal(f.state().cleaned, true);
  assert.equal(f.stats().deletes, 3);
});

test("compact channel names match the website's eight-character match code", () => {
  const id = "cmuzv8yu80000ei2g4ilo3do3";
  assert.equal(freeEightsVoiceChannelName(id, "waiting"), "8s Waiting · #4ILO3DO3");
  assert.equal(freeEightsVoiceChannelName(id, "host"), "8s Alpha · #4ILO3DO3");
  assert.equal(freeEightsVoiceChannelName(id, "challenger"), "8s Bravo · #4ILO3DO3");
});

test("existing lobby channels get compact names without recreation or changing unrelated voices", async () => {
  const f = fixture();
  await f.sync();
  const ids = structuredClone(f.state().channels);
  for (const [side, id] of Object.entries(ids)) f.channels.get(id).name = `${f.match.id} • ${side} old long name`;
  const unrelated = await f.guild.channels.create({ name: "A manually named room", type: ChannelType.GuildVoice, parent: config.categoryId, permissionOverwrites: [] });
  const before = f.stats();
  let renames = 0;
  for (const id of Object.values(ids)) {
    const channel = f.channels.get(id);
    channel.setName = async (name) => { renames++; channel.name = name; };
  }
  await f.sync();
  assert.equal(renames, 3);
  assert.deepEqual(f.stats(), before);
  assert.deepEqual(f.state().channels, ids);
  assert.equal(f.moves.length, 8);
  for (const [side, id] of Object.entries(ids)) assert.equal(f.channels.get(id).name, freeEightsVoiceChannelName(f.match.id, side));
  assert.equal(unrelated.name, "A manually named room");
  await f.sync();
  assert.equal(renames, 3, "unchanged names do not cause repeated Discord requests");
});

test("a failed cosmetic rename preserves voice readiness and retries later", async () => {
  const f = fixture();
  f.match.metadata.teams_generated_at = "";
  await f.sync();
  const channel = f.channels.get(f.state().channels.waiting);
  channel.name = "The legacy long waiting-room name";
  const setName = channel.setName;
  channel.setName = async () => { throw Object.assign(new Error("Missing Permissions"), { code: 50013 }); };
  await f.sync();
  assert.equal(f.state().error, null);
  assert.equal(freeEightsWaitingRoomReady(config, f.match.metadata, f.participants, f.state()), true);
  assert.ok(f.logs.some((row) => row.event === "channel-rename-failed"));
  channel.setName = setName;
  await f.sync();
  assert.equal(channel.name, freeEightsVoiceChannelName(f.match.id, "waiting"));
});

test("started team voices are visible to outsiders without Connect; Waiting Rooms remain hidden", async () => {
  const f = fixture();
  f.match.metadata.status = "in_progress";
  await f.sync();
  const outsider = "200000000000009999";
  const alphaPlayer = f.users[0].discord_user_id;
  const bravoPlayer = f.users[4].discord_user_id;
  const waiting = f.channels.get(f.state().channels.waiting);
  const alpha = f.channels.get(f.state().channels.host);
  const bravo = f.channels.get(f.state().channels.challenger);
  assert.equal(effectivePermissions(waiting, outsider).has(PermissionFlagsBits.ViewChannel), false);
  assert.equal(effectivePermissions(waiting, outsider).has(PermissionFlagsBits.Connect), false);
  for (const channel of [alpha, bravo]) {
    assert.equal(effectivePermissions(channel, outsider).has(PermissionFlagsBits.ViewChannel), true);
    assert.equal(effectivePermissions(channel, outsider).has(PermissionFlagsBits.Connect), false);
    assert.equal(effectivePermissions(channel, outsider, { admin: true }).has(PermissionFlagsBits.Connect), true);
  }
  for (const player of [alphaPlayer, bravoPlayer]) assert.equal(effectivePermissions(waiting, player).has(PermissionFlagsBits.Connect), true);
  assert.equal(effectivePermissions(alpha, alphaPlayer).has(PermissionFlagsBits.Connect), true);
  assert.equal(effectivePermissions(alpha, bravoPlayer).has(PermissionFlagsBits.ViewChannel), true);
  assert.equal(effectivePermissions(alpha, bravoPlayer).has(PermissionFlagsBits.Connect), false);
  assert.equal(effectivePermissions(bravo, bravoPlayer).has(PermissionFlagsBits.Connect), true);
  assert.equal(effectivePermissions(bravo, alphaPlayer).has(PermissionFlagsBits.Connect), false);
});

test("start and reset change only team visibility without recreating voices or changing the roster", async () => {
  const f = fixture();
  await f.sync();
  const ids = structuredClone(f.state().channels);
  const outsider = "200000000000009999";
  for (const id of Object.values(ids)) assert.equal(effectivePermissions(f.channels.get(id), outsider).has(PermissionFlagsBits.ViewChannel), false);
  f.match.metadata.status = "in_progress";
  await f.sync();
  assert.equal(f.stats().permissionEdits, 2);
  assert.deepEqual(f.state().channels, ids);
  assert.equal(f.stats().creations, 3);
  assert.equal(f.moves.length, 8);
  for (const status of ["awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion", "score_conflict", "disputed"]) {
    f.match.metadata.status = status;
    await f.sync();
    assert.equal(effectivePermissions(f.channels.get(ids.host), outsider).has(PermissionFlagsBits.ViewChannel), true);
    assert.equal(effectivePermissions(f.channels.get(ids.challenger), outsider).has(PermissionFlagsBits.Connect), false);
    assert.equal(effectivePermissions(f.channels.get(ids.waiting), outsider).has(PermissionFlagsBits.ViewChannel), false);
  }
  assert.equal(f.stats().permissionEdits, 2, "unchanged public visibility is not rewritten");
  f.match.metadata.status = "open";
  await f.sync();
  assert.equal(f.stats().permissionEdits, 4);
  for (const id of Object.values(ids)) assert.equal(effectivePermissions(f.channels.get(id), outsider).has(PermissionFlagsBits.ViewChannel), false);
  assert.deepEqual(f.state().channels, ids);
  assert.equal(f.stats().deletes, 0);
  f.match.metadata.status = "completed";
  await f.sync();
  assert.equal(f.stats().deletes, 3);
});

test("legacy cached private permissions refresh existing ongoing rooms once on upgrade", async () => {
  const f = fixture();
  await f.sync();
  const ids = structuredClone(f.state().channels);
  for (const side of ["waiting", "host", "challenger"]) {
    f.state().channel_roster_signatures[side] = JSON.stringify(JSON.parse(f.state().channel_roster_signatures[side]).slice(0, 2));
  }
  f.match.metadata.status = "in_progress";
  await f.sync();
  assert.equal(f.stats().permissionEdits, 3);
  const outsider = "200000000000009999";
  assert.equal(effectivePermissions(f.channels.get(ids.host), outsider).has(PermissionFlagsBits.ViewChannel), true);
  assert.equal(effectivePermissions(f.channels.get(ids.challenger), outsider).has(PermissionFlagsBits.Connect), false);
  assert.equal(effectivePermissions(f.channels.get(ids.waiting), outsider).has(PermissionFlagsBits.ViewChannel), false);
  assert.deepEqual(f.state().channels, ids);
  assert.equal(f.stats().creations, 3);
  await f.sync();
  assert.equal(f.stats().permissionEdits, 3);
});
