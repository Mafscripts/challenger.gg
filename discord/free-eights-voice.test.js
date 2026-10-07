import test from "node:test";
import assert from "node:assert/strict";
import { AuditLogEvent, ChannelType, Collection, PermissionFlagsBits, PermissionOverwrites } from "discord.js";
import { canAssignFreeEightsVoice, syncFreeEightsVoice } from "./free-eights-voice.js";
import { freeEightsChannelKey, freeEightsDiscordJoinError, freeEightsVoiceKey, publicFreeEightsVoiceStatus, voiceRosterSignature } from "../server/free-eights-discord.js";

const config = { enabled: true, guildId: "100000000000000001", waitingRoomId: "100000000000000002", categoryId: "100000000000000003" };

function fixture(count = 1) {
  const matches = Array.from({ length: count }, (_, index) => ({ id: `match${index + 1}`, metadata: { match_type: "8s", status: "open", teams_generated_at: "2026-10-07T00:00:00Z" } }));
  const match = matches[0];
  const participants = matches.flatMap((item, matchIndex) => Array.from({ length: 8 }, (_, index) => ({ user_id: `player${matchIndex * 8 + index}`, wager_id: item.id, team: index < 4 ? "host" : "challenger" })));
  const users = participants.map((player, index) => ({ id: player.user_id, discord_user_id: String(200000000000000000n + BigInt(index)), discord_connected_at: new Date() }));
  const records = new Map();
  const moves = [];
  const logs = [];
  const channels = new Collection();
  const voices = new Collection();
  const members = new Collection();
  const audits = new Collection();
  const locks = new Set();
  let creations = 0;
  let permissionEdits = 0;
  let deletes = 0;
  const channel = (id, type, name, parentId) => ({
    id, type, name, parentId,
    get members() { return members.filter((member) => member.voice.channelId === id); },
    permissionOverwrites: { async set(overwrites) { this.values = overwrites; permissionEdits++; } },
    async delete() { channels.delete(id); deletes++; },
  });
  channels.set(config.waitingRoomId, channel(config.waitingRoomId, ChannelType.GuildVoice, "8s Waiting Room", null));
  channels.set(config.categoryId, channel(config.categoryId, ChannelType.GuildCategory, "Free 8s Test", null));
  const guild = { id: config.guildId, client: { user: { id: "100000000000000004" } }, voiceStates: { cache: voices },
    async fetchAuditLogs({ before } = {}) {
      const entries = new Collection([...audits].reverse().filter(([id]) => !before || Number(id) < Number(before)).slice(0, 100));
      return { entries };
    },
    channels: {
      async fetch(id) {
        if (!id) return new Collection(channels);
        if (!channels.has(id)) throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
        return channels.get(id);
      },
      async create(options) {
        if (channels.filter((item) => item.parentId === options.parent).size >= 50) {
          throw Object.assign(new Error("Maximum category channels"), { status: 400, code: 30013 });
        }
        creations++;
        const item = channel(`channel${creations}`, options.type, options.name, options.parent);
        item.permissionOverwrites.values = options.permissionOverwrites;
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
  const sync = (overrides = {}) => syncFreeEightsVoice(guild, { db, config: { ...config, ...overrides }, log: (event, details) => logs.push({ event, ...details }) });
  return { match, matches, participants, users, records, moves, logs, channels, voices, guild, db, sync, audits,
    state: () => records.get(freeEightsVoiceKey(match.id))?.metadata,
    stats: () => ({ creations, permissionEdits, deletes }) };
}

test("link gate requires authenticated OAuth identity only for Free 8s", () => {
  assert.equal(freeEightsDiscordJoinError("8s", { id: "u", discord: "typed-name", discord_user_id: "bad" }).code, "FREE_EIGHTS_DISCORD_REQUIRED");
  assert.equal(freeEightsDiscordJoinError("8s", { id: "u", discord_user_id: "200000000000000001" }).success, false);
  assert.equal(freeEightsDiscordJoinError("8s", { id: "u", discord_user_id: "200000000000000001", discord_connected_at: new Date() }), null);
  for (const type of ["money8s", "wagers", "ranked", "xp", "tournament"]) assert.equal(freeEightsDiscordJoinError(type, {}), null);
});

test("only canonical eight-player 4v4 Free 8s teams qualify", () => {
  const f = fixture();
  assert.equal(canAssignFreeEightsVoice(f.match.metadata, f.participants), true);
  for (const type of ["money8s", "wagers", "tournament"]) assert.equal(canAssignFreeEightsVoice({ ...f.match.metadata, match_type: type }, f.participants), false);
  assert.equal(canAssignFreeEightsVoice(f.match.metadata, f.participants.slice(1)), false);
  assert.equal(canAssignFreeEightsVoice({ ...f.match.metadata, teams_generated_at: "" }, f.participants), false);
});

test("private channels, correct teams, offline/other-channel players and late arrivals", async () => {
  const f = fixture();
  f.voices.get(f.users[6].discord_user_id).channelId = null;
  f.voices.get(f.users[7].discord_user_id).channelId = "unrelated-voice";
  await f.sync();
  assert.equal(f.moves.length, 6);
  assert.equal(f.stats().creations, 2);
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
  assert.equal(f.stats().creations, 2);
  assert.equal(f.moves.length, 6);
  f.voices.get(f.users[6].discord_user_id).channelId = config.waitingRoomId;
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
  assert.equal(f.stats().creations, 2);
  assert.equal(f.stats().permissionEdits, 2);
  assert.equal(f.moves.length, 10);
  assert.equal(f.voices.get(f.users[0].discord_user_id).channelId, f.state().channels.challenger);
});

for (const status of ["completed", "cancelled", "expired", "closed"]) {
  test(`idempotent cleanup for ${status} works without website polling`, async () => {
    const f = fixture();
    await f.sync();
    f.match.metadata.status = status;
    await f.sync();
    assert.equal(f.stats().deletes, 2);
    assert.equal(f.moves.length, 16);
    assert.deepEqual(f.state().channels, {});
    assert.equal(f.state().cleaned, true);
    await f.sync();
    assert.equal(f.stats().deletes, 2);
  });
}

test("cleanup move failure retains occupied channel and retries", async () => {
  const f = fixture();
  await f.sync();
  f.voices.get(f.users[0].discord_user_id).fail = true;
  f.match.metadata.status = "cancelled";
  await f.sync();
  assert.equal(f.stats().deletes, 1);
  assert.ok(f.state().channels.host);
  assert.equal(f.state().error, "Voice cleanup pending");
  f.voices.get(f.users[0].discord_user_id).fail = false;
  await f.sync();
  assert.equal(f.stats().deletes, 2);
  assert.equal(f.state().cleaned, true);
});

test("switch off cleans existing channels; partial roster returns players", async () => {
  const f = fixture();
  await f.sync();
  await f.sync({ enabled: false });
  assert.equal(f.stats().deletes, 2);
  const g = fixture();
  await g.sync();
  g.participants.pop();
  g.match.metadata.teams_generated_at = "";
  await g.sync();
  assert.equal(g.stats().deletes, 2);
  assert.equal(g.moves.length, 16);
});

test("recover interrupted creation by durable operation and audit channel ID for terminal match", async () => {
  const f = fixture();
  await f.sync();
  const state = f.state();
  delete state.channels.host;
  f.records.delete(freeEightsChannelKey("channel1")); // Only reservation persisted before process failure.
  f.match.metadata.status = "expired";
  await f.sync();
  assert.equal(f.stats().deletes, 2);
  assert.equal(f.state().cleaned, true);
});

test("advisory lock loser performs no match actions", async () => {
  const f = fixture();
  f.db.$queryRaw = async () => [{ locked: false }];
  await f.sync();
  assert.equal(f.stats().creations, 0);
  assert.equal(f.moves.length, 0);
});

test("a failed channel creation retries without duplicating the successful side", async () => {
  const f = fixture();
  const original = f.guild.channels.create;
  let fail = true;
  f.guild.channels.create = async (options) => {
    if (options.name.endsWith("Team B") && fail) throw Object.assign(new Error("Missing Permissions"), { code: 50013, status: 403 });
    return original(options);
  };
  await f.sync();
  assert.equal(f.stats().creations, 1);
  assert.equal(f.moves.length, 0);
  assert.ok(f.state().error);
  fail = false;
  await f.sync();
  assert.equal(f.stats().creations, 2);
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

test("20 simultaneous matches and overlapping duplicate sync events create exactly 40 isolated channels", async () => {
  const f = fixture(20);
  await Promise.all([f.sync(), f.sync(), f.sync()]);
  assert.equal(f.stats().creations, 40);
  assert.equal(f.moves.length, 160);
  const assigned = new Set();
  for (const match of f.matches) {
    const state = f.records.get(freeEightsVoiceKey(match.id)).metadata;
    assert.ok(state.discord_channels_created_at);
    assert.equal(state.discord_channels_cleaned_at, null);
    for (const side of ["host", "challenger"]) {
      const id = state.channels[side];
      assert.ok(!assigned.has(id));
      assigned.add(id);
      assert.equal(f.records.get(freeEightsChannelKey(id)).metadata.match_id, match.id);
      assert.equal(f.channels.get(id).name, `${match.id} • Team ${side === "host" ? "A" : "B"}`);
    }
    for (const player of f.participants.filter((row) => row.wager_id === match.id)) {
      const identity = f.users.find((user) => user.id === player.user_id);
      assert.equal(f.voices.get(identity.discord_user_id).channelId, state.channels[player.team]);
    }
  }
  await Promise.all([f.sync(), f.sync()]);
  assert.equal(f.stats().creations, 40);
  assert.equal(f.moves.length, 160);
});

test("cleanup of one of 20 matches uses stored IDs even after rename and leaves 19 pairs untouched", async () => {
  const f = fixture(20);
  await f.sync();
  const before = new Map(f.matches.map((match) => [match.id, structuredClone(f.records.get(freeEightsVoiceKey(match.id)).metadata.channels)]));
  for (const id of Object.values(before.get(f.match.id))) f.channels.get(id).name = "Team A";
  f.match.metadata.status = "completed";
  await Promise.all([f.sync(), f.sync()]);
  assert.equal(f.stats().deletes, 2);
  assert.equal(f.moves.length, 168);
  assert.ok(f.state().discord_channels_cleaned_at);
  assert.equal(f.state().cleaned, true);
  for (const match of f.matches.slice(1)) {
    assert.deepEqual(f.records.get(freeEightsVoiceKey(match.id)).metadata.channels, before.get(match.id));
    for (const id of Object.values(before.get(match.id))) assert.ok(f.channels.has(id));
  }
  await f.sync();
  assert.equal(f.stats().deletes, 2);
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
  assert.equal(f.stats().creations, 2);
  assert.equal(f.moves.length, 0);
  await f.sync();
  assert.equal(f.stats().creations, 2);
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

test("40 simultaneous matches overflow into existing categories and retain one isolated pair per match", async () => {
  const f = fixture(40);
  const overflow = "100000000000000005";
  f.channels.set(overflow, { id: overflow, type: ChannelType.GuildCategory, name: "ACTIVE 8s overflow" });
  const settings = { overflowCategoryIds: [overflow] };
  await Promise.all([f.sync(settings), f.sync(settings)]);
  await f.sync(settings); // Reconcile any Discord-enforced capacity race.
  assert.equal(f.moves.length, 320);
  assert.equal(f.channels.filter((item) => item.parentId === config.categoryId).size, 50);
  assert.equal(f.channels.filter((item) => item.parentId === overflow).size, 30);
  for (const match of f.matches) {
    const state = f.records.get(freeEightsVoiceKey(match.id)).metadata;
    assert.equal(Object.keys(state.channels).length, 2);
    for (const id of Object.values(state.channels)) assert.equal(f.channels.get(id).parentId, state.category_id);
    assert.equal(publicFreeEightsVoiceStatus({ ...config, ...settings }, match.metadata,
      f.participants.filter((row) => row.wager_id === match.id), state).fresh, true);
  }
  const stats = f.stats();
  await f.sync(settings);
  assert.deepEqual(f.stats(), stats);
});

test("full categories leave players in the waiting room and log capacity without breaking matches", async () => {
  const f = fixture();
  for (let index = 0; index < 50; index++) f.channels.set(`external${index}`, {
    id: `external${index}`, parentId: config.categoryId, type: ChannelType.GuildVoice,
  });
  await f.sync();
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
  for (const voice of f.voices.values()) if (voice.channelId === deletedId) voice.channelId = config.waitingRoomId;
  const original = f.guild.channels.create;
  f.guild.channels.create = async (options) => {
    await original(options);
    throw new Error("Connection closed after replacement creation");
  };
  await f.sync();
  assert.equal(f.state().channels.host, undefined);
  assert.ok(f.records.get(freeEightsChannelKey(deletedId)).metadata.deleted_at);
  await f.sync();
  assert.equal(f.stats().creations, 3);
  assert.equal(Object.keys(f.state().channels).length, 2);
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
  assert.ok(f.state().provisions.host);
  assert.ok(f.records.has(freeEightsChannelKey("channel1")));
  f.db.$transaction = originalTransaction;
  f.guild.channels.create = originalCreate;
  f.guild.fetchAuditLogs = async () => { throw new Error("Recovery must reuse committed ownership without audit"); };
  await f.sync();
  assert.equal(f.stats().creations, 2);
  assert.equal(f.moves.length, 8);
  assert.equal(f.state().channels.host, "channel1");
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
  assert.ok(f.records.has(freeEightsChannelKey("channel1")));
  assert.ok(f.logs.some((row) => row.event === "sync-failed" && row.error.includes("stale state write")));
  f.guild.channels.create = originalCreate;
  await f.sync();
  assert.equal(f.stats().creations, 2);
  assert.equal(f.moves.length, 8);
});
