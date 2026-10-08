import test from "node:test";
import assert from "node:assert/strict";
import { Collection } from "discord.js";
import { freeEightsResultKey, freeEightsResultPayload, syncFreeEightsResults } from "./free-eights-results.js";

const now = new Date("2026-10-07T22:00:00Z");
const completed = () => ({ match_type: "8s", status: "completed", host_id: "a", challenger_id: "b",
  winner_id: "a", winner_name: "Captain", winner_score: 3, loser_score: 1,
  match_completed_date: now.toISOString(), game_mode_display: "CDL BO3" });
const roster = (id) => Array.from({ length: 8 }, (_, i) => ({ wager_id: id, user_id: `${id}-player${i}`,
  user_name: `Player ${i + 1}`, team: i < 4 ? "host" : "challenger" }));

function fixture(count = 1) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `match${String(i).padStart(4, "0")}`, metadata: completed(), updated_date: now }));
  const participants = rows.flatMap((row) => roster(row.id));
  const records = new Map(), locks = new Set(), messages = new Collection(), logs = [], sent = [];
  const guild = { id: "guild1", client: { user: { id: "bot1" } }, channels: { async fetch(id) {
    if (id !== channel.id) throw new Error("Channel unavailable");
    return channel;
  } } };
  const channel = { id: "results1", isTextBased: () => true,
    messages: { async fetch({ before, limit }) {
      if (channel.failHistory) throw new Error("Missing Read Message History");
      const all = [...messages.values()].reverse().filter((message) => !before || Number(message.id) < Number(before));
      return new Collection(all.slice(0, limit).map((message) => [message.id, message]));
    } },
    async send(payload) {
      if (channel.failSend) throw new Error("Missing Send Messages");
      sent.push(payload);
      const message = { id: String(messages.size + 1), author: { id: guild.client.user.id },
        embeds: payload.embeds.map((embed) => embed.toJSON()), createdTimestamp: Date.now() };
      messages.set(message.id, message);
      if (channel.lostResponse) throw new Error("Response lost after Discord accepted message");
      return message;
    },
  };
  const db = {
    wager: {
      async findMany({ where, cursor, take }) {
        const eligible = rows.filter((row) => where.AND.every((condition) => condition.metadata
          ? row.metadata[condition.metadata.path[0]] === condition.metadata.equals
          : row.updated_date >= condition.updated_date.gte)).sort((a, b) => a.id.localeCompare(b.id));
        return structuredClone(eligible.filter((row) => !cursor || row.id > cursor.id).slice(0, take));
      },
      async findUnique({ where }) { return structuredClone(rows.find((row) => row.id === where.id) || null); },
    },
    wagerParticipant: { async findMany({ where }) {
      return participants.filter((player) => player.wager_id === where.metadata.equals).map((metadata) => ({ metadata: structuredClone(metadata) }));
    } },
    discordEventDispatch: {
      async findUnique({ where }) { return structuredClone(records.get(where.event_key) || null); },
      async create({ data }) {
        if (records.has(data.event_key)) throw new Error("Duplicate dispatch");
        records.set(data.event_key, structuredClone(data));
      },
      async updateMany({ where, data }) {
        if (db.failReceipt) throw new Error("Receipt write interrupted");
        const row = records.get(where.event_key);
        if (!row || (where.metadata.path ? row.metadata.worker_token !== where.metadata.equals
          : JSON.stringify(row.metadata) !== JSON.stringify(where.metadata.equals))) return { count: 0 };
        records.set(where.event_key, structuredClone({ ...row, ...data }));
        return { count: 1 };
      },
    },
    async $transaction(fn) {
      let key;
      try {
        return await fn({ async $queryRaw(strings, value) {
          if (!strings.join("").includes("pg_try_advisory_xact_lock")) return [{ ok: 1 }];
          if (locks.has(value)) return [{ locked: false }];
          locks.add(value); key = value; return [{ locked: true }];
        } });
      } finally { if (key) locks.delete(key); }
    },
  };
  const sync = (options = {}) => syncFreeEightsResults(guild, { db, now, publicUrl: "https://topfragg.gg/",
    findChannel: () => channel, log: (event, details) => logs.push({ event, ...details }), ...options });
  return { rows, participants, records, messages, sent, logs, guild, channel, db, sync };
}

test("confirmed Alpha and Bravo wins show correctly oriented scores, all players and the real match route", () => {
  for (const winner of ["a", "b"]) {
    const payload = freeEightsResultPayload({ ...completed(), id: "abc", winner_id: winner }, roster("abc"), "https://topfragg.gg/");
    const embed = payload.embeds[0].toJSON();
    assert.match(embed.description, new RegExp(`Team ${winner === "a" ? "Alpha" : "Bravo"} wins 3–1`));
    assert.doesNotMatch(embed.description, /Captain/);
    assert.match(embed.fields[0].name, new RegExp(`Alpha · ${winner === "a" ? 3 : 1}`));
    assert.match(embed.fields[1].name, new RegExp(`Bravo · ${winner === "b" ? 3 : 1}`));
    assert.match(embed.fields[0].value, /Player 1/);
    assert.match(embed.fields[1].value, /Player 8/);
    assert.equal(payload.components[0].toJSON().components[0].url, "https://topfragg.gg/8s-match/abc");
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  }
});

test("only complete Free 8s results with eight distinct players and valid scores are publishable", () => {
  const match = { ...completed(), id: "abc" }, players = roster("abc");
  for (const override of [{ match_type: "money8s" }, { match_type: "tournament" }, { status: "cancelled" },
    { status: "awaiting_completion" }, { winner_id: "other" }, { loser_score: 3 }, { winner_score: null },
    { loser_score: -1 }, { winner_score: 2.5 }, { match_completed_date: "invalid" }, { challenger_id: "a" }]) {
    assert.equal(freeEightsResultPayload({ ...match, ...override }, players, "https://topfragg.gg"), null);
  }
  for (const invalid of [players.slice(1), [...players.slice(1), players[1]],
    players.map((row) => ({ ...row, team: "host" })), players.map((row) => ({ ...row, wager_id: "other" }))]) {
    assert.equal(freeEightsResultPayload(match, invalid, "https://topfragg.gg"), null);
  }
});

test("a restart or later metadata update cannot repost the same match", async () => {
  const f = fixture();
  await f.sync();
  f.rows[0].metadata.xp_changes = { player1: 100 };
  await f.sync();
  assert.equal(f.sent.length, 1);
  assert.equal(f.records.get(freeEightsResultKey(f.guild.id, f.rows[0].id)).metadata.message_id, "1");
  assert.equal(f.sent[0].enforceNonce, true);
  assert.equal(f.sent[0].nonce.length, 25);
});

test("two bot workers handle 40 matches concurrently without duplicated or mixed results", async () => {
  const f = fixture(40);
  await Promise.all([f.sync(), f.sync()]);
  assert.equal(f.sent.length, 40);
  assert.equal(f.records.size, 40);
  assert.equal(new Set(f.sent.map((payload) => payload.embeds[0].toJSON().footer.text)).size, 40);
});

test("a failed send remains pending and retries without stopping other matches", async () => {
  const f = fixture(2);
  const send = f.channel.send;
  f.channel.send = async (payload) => {
    if (payload.embeds[0].toJSON().footer.text.endsWith(f.rows[0].id)) throw new Error("Failed first match");
    return send(payload);
  };
  await f.sync();
  assert.equal(f.sent.length, 1);
  assert.equal([...f.records.values()][0].metadata.status, "pending");
  assert.equal([...f.records.values()][1].metadata.status, "sent");
  assert.ok(f.logs.some((row) => row.event === "result-send-failed"));
  f.channel.send = send;
  await f.sync();
  assert.equal(f.sent.length, 2);
  assert.equal([...f.records.values()][0].metadata.status, "sent");
});

for (const failure of ["lostResponse", "failReceipt"]) {
  test(`an accepted message is recovered after ${failure}, even beyond Discord's nonce window`, async () => {
    const f = fixture();
    if (failure === "lostResponse") f.channel.lostResponse = true;
    else f.db.failReceipt = true;
    await f.sync();
    assert.equal(f.sent.length, 1);
    // Make the interrupted attempt ten minutes old. This exercises history
    // recovery rather than depending on Discord's recent-nonce cache.
    [...f.records.values()][0].metadata.started_at = new Date(Date.now() - 600_000).toISOString();
    f.channel.lostResponse = false; f.db.failReceipt = false;
    await f.sync();
    assert.equal(f.sent.length, 1);
    assert.equal([...f.records.values()][0].metadata.status, "sent");
    assert.ok(f.logs.some((row) => row.event === "result-recovered"));
  });
}

test("unreadable history blocks an ambiguous retry rather than duplicating a result", async () => {
  const f = fixture();
  f.channel.lostResponse = true;
  await f.sync();
  f.channel.lostResponse = false; f.channel.failHistory = true;
  await f.sync();
  assert.equal(f.sent.length, 1);
  assert.equal([...f.records.values()][0].metadata.status, "pending");
  assert.match(f.logs.at(-1).error, /Read Message History/);
});

test("recovery searches multiple history pages and ignores a copied footer from another author", async () => {
  const f = fixture();
  f.channel.lostResponse = true;
  await f.sync();
  const original = f.messages.get("1");
  for (let i = 2; i <= 152; i++) f.messages.set(String(i), {
    id: String(i), author: { id: "other-user" }, embeds: original.embeds, createdTimestamp: Date.now(),
  });
  f.channel.lostResponse = false;
  await f.sync();
  assert.equal(f.sent.length, 1);
  assert.equal([...f.records.values()][0].metadata.message_id, "1");
});

test("Money 8s, cancelled lobbies, invalid rosters and old results never appear in the log", async () => {
  const f = fixture(5);
  f.rows[0].metadata.match_type = "money8s";
  f.rows[1].metadata.status = "cancelled";
  f.rows[2].metadata.match_completed_date = "2026-09-20T00:00:00Z";
  f.participants.find((row) => row.wager_id === f.rows[3].id).team = "challenger";
  await f.sync();
  assert.equal(f.sent.length, 1);
  assert.ok(f.sent[0].embeds[0].toJSON().footer.text.endsWith(f.rows[4].id));
});

test("pagination catches up more than 100 eligible completed matches", async () => {
  const f = fixture(105);
  await f.sync();
  await f.sync();
  assert.equal(f.sent.length, 105);
});

test("player names are clipped, Markdown escaped and never ping members", () => {
  const players = roster("abc").map((row) => ({ ...row, user_name: "**@everyone**\n".repeat(100) }));
  const payload = freeEightsResultPayload({ ...completed(), id: "abc" }, players, "https://topfragg.gg");
  for (const field of payload.embeds[0].toJSON().fields) {
    assert.ok(field.value.length <= 1024);
    assert.ok(field.value.includes("\\*"));
    assert.equal(field.value.split("\n").length, 4);
  }
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

test("a missing results channel logs a configuration issue without sending anything", async () => {
  const f = fixture();
  await f.sync({ findChannel: () => null });
  assert.equal(f.sent.length, 0);
  assert.equal(f.logs[0].event, "results-channel-unavailable");
});
