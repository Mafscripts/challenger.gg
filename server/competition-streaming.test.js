import test from "node:test";
import assert from "node:assert/strict";
import { competitionStreamError } from "./competition-streaming.js";
import { competitionStreamChannels, streamChannelUrl, hasCompetitionStream, requiresCompetitionStream } from "../src/lib/competitionStreaming.js";
import functionRoutes from "./routes/functions.js";
import authRoutes from "./routes/auth.js";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { prisma } from "./prisma.js";

function fixture(t) {
  const tables = Object.fromEntries(["user", "team", "teamMember", "wager", "wagerParticipant", "tournament", "tournamentParticipant", "wallet"].map(key => [key, new Map()]));
  const writes = [];
  const replace = (target, key, value) => {
    const original = target[key]; target[key] = value;
    t.after(() => { target[key] = original; });
  };
  for (const [key, rows] of Object.entries(tables)) {
    replace(prisma[key], "findUnique", async ({ where }) => structuredClone(rows.get(where.id) || null));
    replace(prisma[key], "findMany", async ({ where } = {}) => structuredClone([...rows.values()].filter(row => !where?.id?.in || where.id.in.includes(row.id))));
    for (const operation of ["create", "update", "delete", "createMany", "updateMany"]) {
      replace(prisma[key], operation, async () => { writes.push(`${key}.${operation}`); throw new Error("Unexpected mutation before eligibility check"); });
    }
  }
  const user = (id, connected = true) => tables.user.set(id, {
    id, username: id, role: "user", email_verified: true, twitch_user_id: connected ? `twitch-${id}` : null,
    metadata: { activision_id: `${id}#123`, platform: "console", twitch: connected ? `https://twitch.tv/${id}` : "" },
  });
  user("captain"); user("teammate"); user("host");
  tables.team.set("team", { id: "team", metadata: { name: "Players", captain_id: "captain", team_type: "wager", roster_size: 2 } });
  for (const id of ["captain", "teammate"]) tables.teamMember.set(id, { id, metadata: { team_id: "team", user_id: id, user_name: id, is_active: true } });
  tables.wager.set("match", { id: "match", created_date: new Date(), metadata: { host_id: "host", host_team_id: "host-team", status: "open", match_type: "wagers", team_size: "2v2", entry_fee: 5 } });
  tables.wagerParticipant.set("host", { id: "host", metadata: { user_id: "host", wager_id: "match", team: "host" } });
  tables.tournament.set("event", { id: "event", metadata: { team_size: "2v2", status: "registration", max_teams: 16, entry_type: "free" } });
  tables.wallet.set("wallet", { id: "wallet", metadata: { user_id: "captain", available_balance: 0 } });
  return { tables, writes, user };
}

async function invoke(name, f, body = {}, overrides = {}) {
  const row = f.tables.user.get("captain");
  const route = functionRoutes.stack.find(layer => layer.route?.path === "/:name").route.stack.at(-1).handle;
  return new Promise((resolve, reject) => {
    void route({ params: { name }, body, user: { ...row.metadata, ...row }, userRow: row, ...overrides }, { json: resolve }, reject);
  });
}

test("stream eligibility reads saved channels, has no platform or staff exemptions and accepts all three providers", async () => {
  const users = [
    { id: "pc", username: "PC", twitch_user_id: "", metadata: { twitch_user_id: "forged", youtube: "https://evil.example/channel" } },
    { id: "ps", username: "PlayStation", twitch_user_id: null, platform: "playstation", verified_player: true },
    { id: "xbox", username: "Xbox", twitch_user_id: null, platform: "xbox", role: "ceo" },
    { id: "linked", twitch_user_id: "12345" },
    { id: "youtube", metadata: { youtube: "https://www.youtube.com/@mychannel" } },
    { id: "kick", metadata: { kick: "https://kick.com/mychannel" } },
  ];
  const db = { user: { findMany: async () => users } };
  for (const mode of ["wagers", "wager", "money8s", "tournament"]) {
    const error = await competitionStreamError(db, mode, ["pc", "ps", "xbox", "linked", "youtube", "kick", "missing", "ps"]);
    assert.equal(error.code, "STREAM_CHANNEL_REQUIRED");
    assert.deepEqual(error.missing_user_ids, ["pc", "ps", "xbox", "missing"]);
    assert.match(error.error, /every platform, including console/);
    assert.match(error.error, /must stream all maps/);
    assert.equal(error.settings_url, "/settings#streaming");
  }
  assert.equal(hasCompetitionStream(users[0]), false);
  for (const user of users.slice(3)) assert.equal(hasCompetitionStream(user), true);
  assert.equal(await competitionStreamError(db, "wagers", ["linked", "youtube", "kick"]), null);
});

test("channel normalization accepts handles, channel IDs and canonical provider URLs but rejects unsafe or non-channel links", () => {
  const accepted = [
    ["twitch", "player_one", "https://twitch.tv/player_one"],
    ["twitch", "https://www.twitch.tv/player_one?ref=stream", "https://twitch.tv/player_one"],
    ["youtube", "@mychannel", "https://www.youtube.com/@mychannel"],
    ["youtube", "https://www.youtube.com/@ゲーマー", "https://www.youtube.com/@ゲーマー"],
    ["youtube", "mychannel", "https://www.youtube.com/@mychannel"],
    ["youtube", "youtube.com/@mychannel/live", "https://www.youtube.com/@mychannel"],
    ["youtube", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"],
    ["youtube", "https://www.youtube.com/user/legacy", "https://www.youtube.com/user/legacy"],
    ["kick", "@player_one", "https://kick.com/player_one"],
    ["kick", "kick.com/player_one", "https://kick.com/player_one"],
  ];
  for (const [provider, input, expected] of accepted) assert.equal(streamChannelUrl(provider, input), expected, input);
  for (const provider of ["twitch", "youtube", "kick"]) for (const input of ["javascript:alert(1)", "https://evil.example/channel", "https://twitch.tv.evil.example/channel", "https://user@kick.com/channel", "https://kick.com:8080/channel", {}, null, "", "has spaces"]) {
    assert.equal(streamChannelUrl(provider, input), "", `${provider}: ${input}`);
  }
  for (const [provider, input] of [["youtube", "https://youtu.be/123"], ["youtube", "https://youtube.com/watch?v=123"], ["youtube", "https://youtube.com/playlist?list=123"], ["kick", "https://kick.com/categories"], ["twitch", "https://twitch.tv/directory"], ["twitch", "https://twitch.tv/player/clip/123"]]) assert.equal(streamChannelUrl(provider, input), "");
  assert.deepEqual(competitionStreamChannels({ twitch_user_id: "123", twitch_login: "realchannel", twitch: "otherchannel" }), [{ provider: "twitch", url: "https://twitch.tv/realchannel" }]);
});

test("Free 8s, XP, Ranked and other modes do not acquire a streaming requirement", async () => {
  const db = { user: { findMany: () => { throw new Error("Unrelated mode queried Twitch eligibility"); } } };
  for (const mode of ["8s", "xp", "ranked", "challenge", "coed", "switcheroo"]) {
    assert.equal(requiresCompetitionStream(mode), false);
    assert.equal(await competitionStreamError(db, mode, ["player"]), null);
  }
});

test("cash and Money 8s creation reject missing stream channels before creating a lobby or moving money on all platforms", async t => {
  const f = fixture(t); f.user("captain", false);
  for (const match_type of ["wagers", "money8s"]) for (const platform of ["pc", "console", "playstation", "xbox"]) {
    f.tables.user.get("captain").metadata.platform = platform;
    const result = await invoke("createWager", f, { match_type, team_id: "team", team_size: "2v2", amount: 5, twitch_user_id: "forged", twitch: "https://twitch.tv/fake" });
    assert.equal(result.code, "STREAM_CHANNEL_REQUIRED", `${match_type}: ${platform}`);
  }
  assert.deepEqual(f.writes, []);
});

test("a linked captain cannot create a cash match for a teammate without a stream channel, even when covering all fees", async t => {
  const f = fixture(t); f.user("teammate", false);
  const result = await invoke("createWager", f, { team_id: "team", team_size: "2v2", amount: 5, payment_mode: "full_team", play_rule: "console_only" });
  assert.equal(result.code, "STREAM_CHANNEL_REQUIRED");
  assert.deepEqual(result.missing_user_ids, ["teammate"]);
  assert.deepEqual(f.writes, []);
});

test("cash acceptance checks the accepting player, the existing host and all incoming team members before payment", async t => {
  const f = fixture(t);
  for (const missing of ["captain", "host", "teammate"]) {
    for (const id of ["captain", "host", "teammate"]) f.user(id, id !== missing);
    const result = await invoke("acceptWager", f, { wager_id: "match", team_id: "team", payment_mode: "full_team" });
    assert.equal(result.code, "STREAM_CHANNEL_REQUIRED", missing);
    assert.deepEqual(result.missing_user_ids, [missing]);
  }
  assert.deepEqual(f.writes, []);
});

test("Money 8s direct joins and old unpaid cash entries require a stream channel before escrow", async t => {
  const f = fixture(t); f.user("captain", false);
  f.tables.wager.get("match").metadata.match_type = "money8s";
  assert.equal((await invoke("acceptWager", f, { wager_id: "match" })).code, "STREAM_CHANNEL_REQUIRED");
  f.tables.wager.get("match").metadata.match_type = "wagers";
  assert.equal((await invoke("payWagerEntry", f, { wager_id: "match" })).code, "STREAM_CHANNEL_REQUIRED");
  assert.deepEqual(f.writes, []);
});

test("every tournament roster member needs a stream channel for free, paid and premium registrations, including streamer events", async t => {
  const f = fixture(t); f.user("teammate", false);
  f.tables.team.get("team").metadata.team_type = "tournament";
  for (const entry_type of ["free", "credits", "premium", "credits_premium"]) {
    Object.assign(f.tables.tournament.get("event").metadata, { entry_type, is_streamer_tournament: true });
    const result = await invoke("registerTournament", f, { tournament_id: "event", team_id: "team", sponsored_member_ids: ["teammate"] });
    assert.equal(result.code, "STREAM_CHANNEL_REQUIRED", entry_type);
    assert.deepEqual(result.missing_user_ids, ["teammate"]);
  }
  assert.deepEqual(f.writes, []);
});

test("fully linked tournament rosters proceed to the existing registration checks", async t => {
  const f = fixture(t);
  f.tables.team.get("team").metadata.team_type = "tournament";
  f.tables.tournament.get("event").metadata.status = "closed";
  const result = await invoke("registerTournament", f, { tournament_id: "event", team_id: "team" });
  assert.equal(result.error, "Registration is closed");
  assert.notEqual(result.code, "STREAM_CHANNEL_REQUIRED");
  assert.deepEqual(f.writes, []);
});

test("a streaming eligibility lookup failure fails closed rather than enrolling accounts without a channel", async t => {
  const f = fixture(t);
  const original = prisma.user.findMany;
  prisma.user.findMany = async () => { throw new Error("Eligibility store unavailable"); };
  t.after(() => { prisma.user.findMany = original; });
  await assert.rejects(invoke("createWager", f, { match_type: "money8s", team_size: "4v4", amount: 5 }), /Eligibility store unavailable/);
  assert.deepEqual(f.writes, []);
});


test("console tournament rosters using only YouTube or Kick pass stream eligibility", async t => {
  const f = fixture(t);
  f.tables.team.get("team").metadata.team_type = "tournament";
  f.tables.tournament.get("event").metadata.status = "closed";
  for (const provider of ["youtube", "kick"]) {
    for (const id of ["captain", "teammate"]) {
      f.user(id, false);
      f.tables.user.get(id).metadata[provider] = provider === "youtube" ? `https://youtube.com/@${id}` : `https://kick.com/${id}`;
    }
    const result = await invoke("registerTournament", f, { tournament_id: "event", team_id: "team" });
    assert.equal(result.error, "Registration is closed", provider);
    assert.notEqual(result.code, "STREAM_CHANNEL_REQUIRED");
  }
  assert.deepEqual(f.writes, []);
});

test("YouTube and Kick are accepted for Money 8s before the existing wallet check", async t => {
  const f = fixture(t);
  for (const provider of ["youtube", "kick"]) {
    f.user("captain", false);
    f.tables.user.get("captain").metadata[provider] = provider === "youtube" ? "@captain" : "captain";
    const result = await invoke("createWager", f, { match_type: "money8s", team_size: "4v4", amount: 5 });
    assert.equal(result.error, "Insufficient wallet balance", provider);
    assert.notEqual(result.code, "STREAM_CHANNEL_REQUIRED");
  }
  assert.deepEqual(f.writes, []);
});


async function saveChannels(body) {
  const route = authRoutes.stack.find(layer => layer.route?.path === "/me" && layer.route.methods.patch).route.stack.at(-1).handle;
  return new Promise((resolve, reject) => {
    let status = 200;
    void route({ user: { id: "captain" }, body }, { status(value) { status = value; return this; }, json(value) { resolve({ status, value }); } }, reject);
  });
}

test("the actual settings endpoint saves normalized Twitch, YouTube and Kick channels to the account", async t => {
  const f = fixture(t); f.user("captain", false);
  const original = prisma.user.update;
  prisma.user.update = async ({ where, data }) => {
    const row = { ...f.tables.user.get(where.id), ...data };
    f.tables.user.set(where.id, row); return row;
  };
  t.after(() => { prisma.user.update = original; });
  const response = await saveChannels({ twitch: "captain", youtube: "@captain", kick: "kick.com/captain" });
  assert.equal(response.status, 200);
  assert.equal(response.value.twitch, "https://twitch.tv/captain");
  assert.equal(response.value.youtube, "https://www.youtube.com/@captain");
  assert.equal(response.value.kick, "https://kick.com/captain");
  assert.equal(await competitionStreamError(prisma, "money8s", ["captain"]), null);
});

test("settings rejects wrong-provider links and videos before changing saved account data", async t => {
  const f = fixture(t);
  for (const payload of [{ kick: "https://evil.example/captain" }, { youtube: "https://youtube.com/watch?v=123" }, { twitch: "https://kick.com/captain" }, { kick: {} }]) {
    const response = await saveChannels(payload);
    assert.equal(response.status, 400);
  }
  assert.deepEqual(f.writes, []);
});

test("settings, requirement notices and match rules expose the three providers and compulsory streaming", async t => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const root = process.cwd().replaceAll("\\", "/");
  const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom';
    import Notice from './src/components/competition/StreamRequirementNotice.jsx';
    import Settings from './src/components/settings/SocialsSection.jsx';
    import Connections from './src/components/settings/StreamConnectionsSection.jsx';
    import Rules from './src/components/match/MatchRulesPanel.jsx';
    import {loadWagerParticipants} from './src/lib/wagerParticipants.js';
    export {loadWagerParticipants};
    export const renderNotice = user => renderToStaticMarkup(<MemoryRouter><Notice user={user}/></MemoryRouter>);
    export const renderSettings = () => renderToStaticMarkup(<Settings user={{id:'player'}} onUserUpdate={()=>{}}/>);
    export const renderConnections = user => renderToStaticMarkup(<Connections user={user} onUserUpdate={()=>{}}/>);
    export const renderRules = matchType => renderToStaticMarkup(<MemoryRouter><Rules matchType={matchType}/></MemoryRouter>);
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"], external: ["react", "react-dom", "react-dom/server", "react-router-dom"], alias: { "@": `${root}/src` }, loader: { ".css": "empty" }, plugins: [{
    name: "stream-settings-read-only-render",
    setup(plugin) {
      plugin.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "stream-render" }));
      plugin.onLoad({ filter: /.*/, namespace: "stream-render" }, () => ({ contents: "export const base44 = {};", loader: "js" }));
    },
  }] });
  const mod = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const api = mod.exports;
  for (const user of [{ id: "player" }, { id: "player", youtube: "@player", verified_player: true }, { id: "player", kick: "player", platform: "console" }]) {
    const html = api.renderNotice(user);
    assert.match(html, /Streaming required/);
    assert.match(html, /must stream all maps/);
    assert.match(html, /Twitch, YouTube or Kick/);
  }
  assert.match(api.renderNotice({ id: "player" }), /href="\/settings#streaming"/);
  const connections = api.renderConnections({ id: "player", youtube: "@player", kick: "player" });
  assert.match(connections, /Connect Twitch/);
  assert.match(connections, /Connect YouTube/);
  assert.match(connections, /Connect Kick/);
  assert.match(connections, /Not connected/);
  assert.doesNotMatch(connections, /Disconnect YouTube/);
  assert.doesNotMatch(connections, /Disconnect Twitch|Twitch section below/);
  const twitchConnected = api.renderConnections({ id: "player", twitch_user_id: "12345", twitch_login: "mychannel", twitch_display_name: "My Twitch Channel" });
  assert.match(twitchConnected, /Disconnect Twitch/);
  assert.match(twitchConnected, /My Twitch Channel/);
  assert.match(twitchConnected, /href="https:\/\/www.twitch.tv\/mychannel"/);
  assert.match(twitchConnected, /Twitch live alerts/);
  assert.match(twitchConnected, /Discord Streamer role/);
  const manualTwitch = api.renderConnections({ id: "player", twitch: "https://twitch.tv/manualchannel" });
  assert.match(manualTwitch, /Connect Twitch/);
  assert.doesNotMatch(manualTwitch, /Disconnect Twitch/);
  const connected = api.renderConnections({ id: "player", stream_connections: { youtube: { id: "UCabcdefghijklmnopqrstuv", url: "https://youtube.com/channel/UCabcdefghijklmnopqrstuv", display_name: "My verified channel" } } });
  assert.match(connected, /Disconnect YouTube/);
  assert.match(connected, /My verified channel/);
  const settings = api.renderSettings();
  for (const label of ["Twitch", "YouTube", "Kick"]) assert.ok(settings.includes(label));
  for (const type of ["wager", "tournament", "money8s"]) assert.match(api.renderRules(type), /must stream every map from start to finish/);
  assert.doesNotMatch(api.renderRules("8s"), /must stream every map from start to finish/);
  const client = {
    entities: {
      User: { get: async () => ({ id: "player", youtube: "@player", kick: "player", twitch_login: "realplayer", verified_player: true }) },
      PlayerProfile: { filter: async () => [] },
    },
    profile: { trophyCounts: async () => ({}) },
  };
  for (const mode of ["wagers", "money8s", "8s"]) {
    const result = await api.loadWagerParticipants(client, { id: "room", match_type: mode }, { participantRows: [{ id: "entry", user_id: "player", team: "host" }] });
    const player = result.participants[0];
    assert.equal(player.force_stream_required, mode !== "8s");
    assert.equal(player.stream_required_by_rules, mode !== "8s");
    assert.equal(player.socials.twitch, "https://twitch.tv/realplayer");
    assert.equal(player.socials.youtube, "https://www.youtube.com/@player");
    assert.equal(player.socials.kick, "https://kick.com/player");
  }
});
