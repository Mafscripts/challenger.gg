import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType, Collection, PermissionFlagsBits } from "discord.js";
import { syncPartyVoice } from "./party-voice.js";
import { partyDiscordConfig } from "../server/party-voice.js";

function fixture(size, teamCount = 4) {
  const config = { ...partyDiscordConfig(), enabled: true, guildId: "100000000000000001", categoryId: "100000000000000002", waitingRoomId: "", overflowCategoryIds: [] };
  const players = Array.from({ length: size * teamCount }, (_, i) => ({ user_id: `player${i}`, side: `team-${Math.floor(i / size)}` }));
  const row = { id: "party-room", owner_id: "host", revision: 0, created_date: new Date(), updated_date: new Date(), status: "open", metadata: { players, team_size: size, teams: Array.from({length: teamCount}, (_, i) => ({id: `team-${i}`, name: `Team ${i + 1}`})), round: 1, spin: null } };
  const records = new Map([["free8s-voice:unrelated", { event_key: "free8s-voice:unrelated", metadata: { match_id: "unrelated", channels: { waiting: "free-room" }, cleaned: false } }]]);
  const channels = new Collection(), voices = new Collection(), members = new Collection(), moves = [];
  let created = 0, deleted = 0;
  const channel = (id, type, name, parentId) => ({ id, type, name, parentId,
    permissionOverwrites: { async set(values) { this.values = values; } },
    get members() { return members.filter((member) => member.voice.channelId === id); },
    async delete() { deleted++; channels.delete(id); }, async setName(value) { this.name = value; }, async setUserLimit(value) { this.userLimit = value; },
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
    partyRoom: { findMany: async () => ["closed"].includes(row.status) ? [] : [structuredClone(row)], findUnique: async ({ where }) => where.id === row.id ? structuredClone(row) : null },
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
    $transaction: async (fn) => fn({ $queryRaw: async (strings, key) => { if (key) assert.ok(key.startsWith("party-voice:")); return [{ locked: true }]; } }),
  };
  const errors = [];
  const sync = () => syncPartyVoice(guild, { db, config, log: (event, details) => { if (event === "sync-failed") errors.push(details.error); } });
  return { row, records, channels, voices, moves, config, errors, sync, counts: () => ({ created, deleted }), state: () => records.get(`party-voice:${row.id}`)?.metadata };
}

test("multi-team rooms provision private Discord voices, move linked users and clean up without touching other modes", async (t) => {
  for (const count of [2, 3, 4, 8, 16]) await t.test(`${count} teams`, async () => {
    const f = fixture(2, count);
    const other = structuredClone(f.records.get("free8s-voice:unrelated"));
    await f.sync();
    assert.deepEqual(f.errors, []);
    assert.equal(f.counts().created, 1);
    const waiting = f.channels.get(f.state().channels.waiting);
    assert.equal(waiting.userLimit, count * 2);
    for (const voice of f.voices.values()) voice.channelId = waiting.id;
    f.row.status = "ready";
    await f.sync();
    assert.deepEqual(f.errors, []);
    assert.equal(f.counts().created, count + 1);
    assert.ok(Object.values(f.state().players).every((player) => player.status === "in_team_voice"));
    for (const team of f.row.metadata.teams) {
      const channel = f.channels.get(f.state().channels[team.id]);
      assert.equal(channel.userLimit, 2);
      assert.ok(channel.name.includes(team.name));
      const everyone = channel.permissionOverwrites.values.find((entry) => entry.id === f.config.guildId);
      assert.ok(everyone.deny.includes(PermissionFlagsBits.ViewChannel));
    }
    await f.sync(); assert.equal(f.counts().created, count + 1);
    f.row.status = "open";
    await f.sync();
    assert.equal(f.counts().deleted, count);
    assert.ok([...f.voices.values()].every((voice) => voice.channelId === waiting.id));
    f.row.status = "closed";
    await f.sync();
    assert.equal(f.counts().deleted, count + 1);
    assert.ok(f.channels.has("free-room"));
    assert.deepEqual(f.records.get("free8s-voice:unrelated"), other);
  });
});

test("the shared spin must finish before the bot creates teams or moves people", async () => {
  const f = fixture(3, 4);
  f.row.status = "ready";
  f.row.metadata.spin = { started_at: new Date().toISOString(), duration_ms: 6000 };
  await f.sync();
  assert.equal(f.counts().created, 1);
  f.row.metadata.spin.started_at = new Date(Date.now() - 9000).toISOString();
  await f.sync();
  assert.equal(f.counts().created, 5);
});

test("adding teams updates an existing Waiting Room's capacity without recreating it", async () => {
  const f = fixture(2, 2);
  await f.sync();
  const waiting = f.channels.get(f.state().channels.waiting);
  assert.equal(waiting.userLimit, 4);
  f.row.metadata.teams.push({ id: "team-2", name: "Team 3" });
  await f.sync();
  assert.deepEqual(f.errors, []);
  assert.equal(waiting.userLimit, 6);
  assert.equal(f.counts().created, 1);
  f.row.metadata.team_size = 4;
  await f.sync();
  assert.equal(waiting.userLimit, 12);
});

test("large rooms use an unlimited Waiting Room rather than an invalid Discord user limit", async () => {
  const f = fixture(4, 128);
  await f.sync();
  assert.deepEqual(f.errors, []);
  assert.equal(f.channels.get(f.state().channels.waiting).userLimit, 0);
});
