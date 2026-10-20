import test from "node:test";
import assert from "node:assert/strict";
import { competitionTwitchError } from "./competition-twitch.js";
import { hasCompetitionTwitch, requiresCompetitionTwitch } from "../src/lib/competitionTwitch.js";
import functionRoutes from "./routes/functions.js";
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
    metadata: { activision_id: `${id}#123`, platform: "console", twitch: `https://twitch.tv/${id}` },
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

test("Twitch eligibility uses saved OAuth identities, never submitted social URLs or platform exemptions", async () => {
  const users = [
    { id: "pc", username: "PC", twitch_user_id: "", twitch: "https://twitch.tv/fake", metadata: { twitch_user_id: "forged" } },
    { id: "ps", username: "PlayStation", twitch_user_id: null, platform: "playstation", verified_player: true },
    { id: "xbox", username: "Xbox", twitch_user_id: null, platform: "xbox", role: "ceo" },
    { id: "linked", twitch_user_id: "12345" },
  ];
  const db = { user: { findMany: async () => users } };
  for (const mode of ["wagers", "wager", "money8s", "tournament"]) {
    const error = await competitionTwitchError(db, mode, ["pc", "ps", "xbox", "linked", "missing", "ps"]);
    assert.equal(error.code, "TWITCH_CONNECTION_REQUIRED");
    assert.deepEqual(error.missing_user_ids, ["pc", "ps", "xbox", "missing"]);
    assert.match(error.error, /every platform, including console/);
    assert.equal(error.settings_url, "/settings#twitch");
  }
  assert.equal(hasCompetitionTwitch(users[0]), false);
  assert.equal(hasCompetitionTwitch(users[3]), true);
  assert.equal(await competitionTwitchError(db, "wagers", ["linked"]), null);
});

test("Free 8s, XP, Ranked and other modes do not acquire a Twitch requirement", async () => {
  const db = { user: { findMany: () => { throw new Error("Unrelated mode queried Twitch eligibility"); } } };
  for (const mode of ["8s", "xp", "ranked", "challenge", "coed", "switcheroo"]) {
    assert.equal(requiresCompetitionTwitch(mode), false);
    assert.equal(await competitionTwitchError(db, mode, ["player"]), null);
  }
});

test("cash and Money 8s creation reject missing Twitch before creating a lobby or moving money on all platforms", async t => {
  const f = fixture(t); f.user("captain", false);
  for (const match_type of ["wagers", "money8s"]) for (const platform of ["pc", "console", "playstation", "xbox"]) {
    f.tables.user.get("captain").metadata.platform = platform;
    const result = await invoke("createWager", f, { match_type, team_id: "team", team_size: "2v2", amount: 5, twitch_user_id: "forged", twitch: "https://twitch.tv/fake" });
    assert.equal(result.code, "TWITCH_CONNECTION_REQUIRED", `${match_type}: ${platform}`);
  }
  assert.deepEqual(f.writes, []);
});

test("a linked captain cannot create a cash match for a teammate without Twitch, even when covering all fees", async t => {
  const f = fixture(t); f.user("teammate", false);
  const result = await invoke("createWager", f, { team_id: "team", team_size: "2v2", amount: 5, payment_mode: "full_team", play_rule: "console_only" });
  assert.equal(result.code, "TWITCH_CONNECTION_REQUIRED");
  assert.deepEqual(result.missing_user_ids, ["teammate"]);
  assert.deepEqual(f.writes, []);
});

test("cash acceptance checks the accepting player, the existing host and all incoming team members before payment", async t => {
  const f = fixture(t);
  for (const missing of ["captain", "host", "teammate"]) {
    for (const id of ["captain", "host", "teammate"]) f.user(id, id !== missing);
    const result = await invoke("acceptWager", f, { wager_id: "match", team_id: "team", payment_mode: "full_team" });
    assert.equal(result.code, "TWITCH_CONNECTION_REQUIRED", missing);
    assert.deepEqual(result.missing_user_ids, [missing]);
  }
  assert.deepEqual(f.writes, []);
});

test("Money 8s direct joins and old unpaid cash entries require Twitch before escrow", async t => {
  const f = fixture(t); f.user("captain", false);
  f.tables.wager.get("match").metadata.match_type = "money8s";
  assert.equal((await invoke("acceptWager", f, { wager_id: "match" })).code, "TWITCH_CONNECTION_REQUIRED");
  f.tables.wager.get("match").metadata.match_type = "wagers";
  assert.equal((await invoke("payWagerEntry", f, { wager_id: "match" })).code, "TWITCH_CONNECTION_REQUIRED");
  assert.deepEqual(f.writes, []);
});

test("every tournament roster member needs Twitch for free, paid and premium registrations, including streamer events", async t => {
  const f = fixture(t); f.user("teammate", false);
  f.tables.team.get("team").metadata.team_type = "tournament";
  for (const entry_type of ["free", "credits", "premium", "credits_premium"]) {
    Object.assign(f.tables.tournament.get("event").metadata, { entry_type, is_streamer_tournament: true });
    const result = await invoke("registerTournament", f, { tournament_id: "event", team_id: "team", sponsored_member_ids: ["teammate"] });
    assert.equal(result.code, "TWITCH_CONNECTION_REQUIRED", entry_type);
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
  assert.notEqual(result.code, "TWITCH_CONNECTION_REQUIRED");
  assert.deepEqual(f.writes, []);
});

test("a Twitch lookup failure fails closed rather than enrolling unverified accounts", async t => {
  const f = fixture(t);
  const original = prisma.user.findMany;
  prisma.user.findMany = async () => { throw new Error("Eligibility store unavailable"); };
  t.after(() => { prisma.user.findMany = original; });
  await assert.rejects(invoke("createWager", f, { match_type: "money8s", team_size: "4v4", amount: 5 }), /Eligibility store unavailable/);
  assert.deepEqual(f.writes, []);
});
