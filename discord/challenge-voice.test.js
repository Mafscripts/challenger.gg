import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType, Collection, PermissionFlagsBits } from "discord.js";
import { syncChallengeVoice } from "./challenge-voice.js";
import { challengeDiscordConfig } from "../server/challenge-discord.js";

function fixture(size) {
  const config = { ...challengeDiscordConfig(), enabled: true, guildId: "100000000000000001", categoryId: "100000000000000002", waitingRoomId: "", overflowCategoryIds: [] };
  const players = Array.from({ length: size * 2 }, (_, i) => ({ user_id: `player${i}`, side: i < size ? "alpha" : "bravo" }));
  const row = { id: "challenge-room", status: "ready_check", metadata: { players, size } };
  const records = new Map([["free8s-voice:unrelated", { event_key: "free8s-voice:unrelated", metadata: { match_id: "unrelated", channels: { waiting: "free-room" }, cleaned: false } }]]);
  const channels = new Collection(), voices = new Collection(), members = new Collection(), moves = [];
  let created = 0, deleted = 0;
  const channel = (id, type, name, parentId) => ({ id, type, name, parentId,
    permissionOverwrites: { async set(values) { this.values = values; } },
    get members() { return members.filter((member) => member.voice.channelId === id); },
    async delete() { deleted++; channels.delete(id); }, async setName(value) { this.name = value; },
  });
  channels.set(config.categoryId, channel(config.categoryId, ChannelType.GuildCategory, "Challenge a Team"));
  channels.set("free-room", channel("free-room", ChannelType.GuildVoice, "Unrelated Free 8s", config.categoryId));
  const users = players.map((player, i) => ({ id: player.user_id, discord_user_id: String(200000000000000000n + BigInt(i)), discord_connected_at: new Date() }));
  for (const user of users) {
    const voice = { id: user.discord_user_id, channelId: null, async fetch() { return this; }, async setChannel(id) { moves.push([this.id, this.channelId, id]); this.channelId = id; } };
    voices.set(user.discord_user_id, voice); members.set(user.discord_user_id, { id: user.discord_user_id, voice });
  }
  const guild = { id: config.guildId, client: { isReady: () => true, user: { id: "100000000000000003" } }, voiceStates: { cache: voices },
    channels: { cache: channels, async fetch(id) { if (!id) return channels; if (!channels.has(id)) throw Object.assign(new Error("Unknown channel"), { code: 10003 }); return channels.get(id); },
      async create(options) { const item = channel(String(300000000000000000n + BigInt(++created)), options.type, options.name, options.parent); item.userLimit = options.userLimit; item.permissionOverwrites.values = options.permissionOverwrites; channels.set(item.id, item); return item; },
    },
  };
  const db = {
    challengeMatch: { findMany: async () => ["completed", "cancelled"].includes(row.status) ? [] : [structuredClone(row)], findUnique: async ({ where }) => where.id === row.id ? structuredClone(row) : null },
    user: { findMany: async ({ where }) => users.filter((user) => where.id.in.includes(user.id)) },
    discordEventDispatch: {
      findUnique: async ({ where }) => structuredClone(records.get(where.event_key) || null),
      findMany: async ({ where }) => [...records.values()].filter((item) => item.event_key.startsWith(where.event_key.startsWith) && (!where.metadata || item.metadata.match_id === where.metadata.equals)).map((item) => structuredClone(item)),
      create: async ({ data }) => { assert.ok(!data.event_key.startsWith("free8s")); if (records.has(data.event_key)) throw Object.assign(new Error("Duplicate"), { code: "P2002" }); records.set(data.event_key, structuredClone(data)); },
      update: async ({ where, data }) => { const previous = records.get(where.event_key); assert.ok(previous); records.set(where.event_key, { ...previous, ...structuredClone(data) }); },
      updateMany: async ({ where, data }) => {
        const previous = records.get(where.event_key);
        const match = previous && (where.metadata.path ? previous.metadata[where.metadata.path[0]] === where.metadata.equals : JSON.stringify(previous.metadata) === JSON.stringify(where.metadata.equals));
        if (!match) return { count: 0 };
        records.set(where.event_key, { ...previous, ...structuredClone(data) }); return { count: 1 };
      },
    },
    $transaction: async (fn) => fn({ $queryRaw: async (strings, key) => { if (key) assert.ok(key.startsWith("challenge-voice:")); return [{ locked: true }]; } }),
  };
  const errors = [];
  const sync = () => syncChallengeVoice(guild, { db, config, log: (event, details) => { if (event === "sync-failed") errors.push(details.error); } });
  return { row, records, channels, voices, moves, config, errors, sync, counts: () => ({ created, deleted }), state: () => records.get(`challenge-voice:${row.id}`)?.metadata };
}

test("all formats reuse durable Discord provisioning with independent names, capacities, private roster permissions and cleanup", async (t) => {
  for (const size of [1, 2, 3, 4]) await t.test(`${size}v${size}`, async () => {
    const f = fixture(size);
    const otherBefore = structuredClone(f.records.get("free8s-voice:unrelated"));
    await f.sync();
    assert.deepEqual(f.errors, []);
    assert.equal(f.counts().created, 1);
    const waiting = f.channels.get(f.state().channels.waiting);
    assert.match(waiting.name, /^CAT-/); assert.equal(waiting.userLimit, size * 2);
    const everyone = waiting.permissionOverwrites.values.find((overwrite) => overwrite.id === f.config.guildId);
    assert.ok(everyone.deny.includes(PermissionFlagsBits.ViewChannel));
    for (const voice of f.voices.values()) voice.channelId = waiting.id;
    await f.sync();
    assert.ok(Object.values(f.state().players).every((player) => player.status === "in_waiting_room"));
    f.row.status = "in_progress"; f.row.metadata.started_at = new Date().toISOString();
    await f.sync();
    assert.deepEqual(f.errors, []);
    assert.equal(f.counts().created, 3);
    assert.equal(f.channels.get(f.state().channels.host).userLimit, size);
    assert.ok(Object.values(f.state().players).every((player) => player.status === "in_team_voice"));
    for (const id of Object.values(f.state().channels)) assert.ok(f.records.has(`challenge-channel:${id}`));
    await f.sync(); assert.equal(f.counts().created, 3);
    f.row.status = "completed"; await f.sync();
    assert.deepEqual(f.errors, []);
    assert.equal(f.counts().deleted, 3);
    assert.ok(f.channels.has("free-room"));
    assert.deepEqual(f.records.get("free8s-voice:unrelated"), otherBefore);
    assert.ok([...f.voices.values()].every((voice) => voice.channelId === null));
    await f.sync(); assert.equal(f.counts().deleted, 3);
  });
});

test("cross-mode channel injection cannot authorize edits, moves or deletion", async () => {
  const f = fixture(2); await f.sync();
  const record = f.records.get(`challenge-voice:${f.row.id}`);
  record.metadata.channels.waiting = "free-room";
  await f.sync();
  assert.ok(f.errors.some((message) => /ownership/.test(message)));
  assert.ok(f.channels.has("free-room"));
  assert.equal(f.moves.length, 0);
});
