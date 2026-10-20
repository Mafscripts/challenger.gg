import test from "node:test";
import assert from "node:assert/strict";
import { activeProgressionSeason, progressionResetOverview, resetProgression } from "./progression-resets.js";
import { PROGRESSION_CATEGORIES } from "../src/lib/progressionResets.js";
import { getXPStandings } from "./xp-matches.js";
import { buildProfileArena } from "./profile-arena.js";
import { trophyCountsFor, recentTrophiesFor } from "./lib/trophyCounts.js";

const ceo = { id: "ceo", role: "ceo", username: "CEO" };
const timestamp = "2026-10-19T12:00:00.000Z", now = () => new Date(timestamp);
const resetBody = (categories) => ({ categories, reason: "Test reset", confirmation: "RESET SELECTED" });
const seasonBody = (categories) => ({ categories, mode: "season", reason: "New competition season", confirmation: "START SEASON", season_number: 5, season_name: "Season 5", start_date: timestamp, end_date: "2027-01-19T12:00:00Z", ranked_policy: "soft" });
const row = (id, metadata, fields = {}) => ({ id, created_date: "2026-10-01T12:00:00Z", metadata, ...fields });
function fixture() {
  let state = {
    user: [{ id: "u", username: "Liv", credits: 21, wallet_balance: 120, lifetime_earnings: 40, total_wager_earnings: 30, biggest_wager_win: 20,
      trophies: 2, xp_level: 5, wager_wins: 4, wager_losses: 2, current_win_streak: 2, tournament_wins: 1, metadata: { avatar_url: "/avatar.png", screenshot_rank: "legend", bio: "Keep me" } }],
    wallet: [row("w", { user_id: "u", available_balance: 100, withdrawable_balance: 90, escrow_balance: 0, pending_balance: 0, total_earnings: 40, total_deposits: 800 })],
    playerProfile: [row("p", { user_id: "u", elo: 2900, peak_elo: 3000, rank: "diamond", xp: 4500, level: 5, credits: 21, total_earnings: 40,
      total_wins: 11, total_losses: 3, gold_count: 1, bronze_count: 1, showcase_item_ids: ["trophy", "frame"], avatar_url: "/avatar.png", is_premium: true })],
    xPStats: [row("x", { user_id: "u", username: "Liv", total_xp: 4500, current_xp: 500, level: 5, prestige: 2, weekly_xp: 500, wins: 3, losses: 1, matches_played: 4, season: 3 })],
    rankedStats: [row("r", { user_id: "u", elo: 2900, peak_elo: 3000, wins: 8, losses: 2, matches_played: 10, win_streak: 2, season: 4 })],
    eightsStats: [row("e", { user_id: "u", game_id: "bo7", rating: 1500, wins: 7, losses: 2, matches_played: 9, monthly_key: "2026-10", monthly_wins: 4, monthly_matches: 6, monthly_xp: 800, monthly_history: [{ month: "2026-09", wins: 10 }], season: 2 }, { free_eights_elo: 400 }),
      row("e2", { user_id: "u", game_id: "bo6", wins: 2, losses: 1, season: 2 }, { free_eights_elo: 150 })],
    xPLeaderboard: [row("cached", { user_id: "u", total_xp: 4500, level: 5 })],
    team: [row("team", { captain_id: "u", name: "Keep our team", total_wins: 10, total_losses: 2, wins: 10, losses: 2, total_earnings: 55, ranking: 4 })],
    userInventory: [row("trophy", { user_id: "u", item_category: "trophy", item_name: "Gold Trophy" }), row("frame", { user_id: "u", item_category: "frame", item_name: "Trophy Frame", is_equipped: true })],
    season: [row("sr", { name: "Ranked 4", season_number: 4, is_active: true }), row("sx", { ladder: "xp", name: "XP 3", season_number: 3, is_active: true }), row("se", { ladder: "free8s", name: "Free 8s 2", season_number: 2, is_active: true })],
    withdrawalRequest: [], walletTransaction: [], creditTransaction: [], adminAction: [], xPMatch: [],
  };
  let writes = 0, failedTable;
  const db = { $executeRaw: async () => 1 };
  for (const key of Object.keys(state)) db[key] = {
    findMany: async () => structuredClone(state[key]),
    update: async ({ where, data }) => {
      if (failedTable === key) throw new Error("Database failure");
      writes++;
      const entry = state[key].find((entry) => entry.id === where.id);
      Object.assign(entry, structuredClone(data)); return structuredClone(entry);
    },
    create: async ({ data }) => {
      if (failedTable === key) throw new Error("Database failure");
      writes++;
      const entry = { id: `${key}-${writes}`, ...structuredClone(data) }; state[key].push(entry); return structuredClone(entry);
    },
    delete: async ({ where }) => { writes++; state[key] = state[key].filter((entry) => entry.id !== where.id); },
  };
  db.$transaction = async (operation) => {
    const before = structuredClone(state);
    try { return await operation(db); } catch (error) { state = before; throw error; }
  };
  return { db, state: () => state, writes: () => writes, failAt: (key) => { failedTable = key; } };
}

test("category resets enforce permissions, explicit scope and confirmation before any database work", async () => {
  const f = fixture();
  for (const actor of [{ id: "normal", role: "user" }, { id: "admin", role: "admin" }, { id: "super", role: "super_admin" }]) {
    await assert.rejects(resetProgression(f.db, actor, resetBody(["credits"]), { now }), { status: 403 });
  }
  for (const body of [resetBody([]), resetBody(["everything"]), { ...resetBody(["xp"]), confirmation: "RESET ALL" }, { ...resetBody(["xp"]), reason: "" }]) {
    await assert.rejects(resetProgression(f.db, ceo, body, { now }), { status: 400 });
  }
  await assert.rejects(resetProgression(f.db, { role: "super_admin" }, seasonBody(["credits"]), { now }), { status: 400 });
  assert.equal(f.writes(), 0);
  const preview = await progressionResetOverview(f.db, ceo);
  assert.equal(preview.totals.money, 100, "wallet is canonical; do not count the user cache twice");
  assert.equal(preview.totals.credits, 21);
  assert.equal(preview.totals.trophy_items, 1);
  assert.equal(f.writes(), 0, "viewing the page cannot perform a reset");
});

test("money, credits and earnings reset separately and preserve both identity and other balances", async () => {
  for (const category of ["money", "credits", "earnings"]) {
    const f = fixture(), old = structuredClone(f.state());
    const result = await resetProgression(f.db, ceo, resetBody([category]), { now });
    const state = f.state();
    assert.equal(result.success, true);
    assert.equal(state.user[0].wallet_balance, category === "money" ? 0 : old.user[0].wallet_balance);
    assert.equal(state.wallet[0].metadata.available_balance, category === "money" ? 0 : 100);
    assert.equal(state.user[0].credits, category === "credits" ? 0 : 21);
    assert.equal(state.playerProfile[0].metadata.credits, category === "credits" ? 0 : 21);
    assert.equal(state.user[0].lifetime_earnings, category === "earnings" ? 0 : 40);
    assert.equal(state.wallet[0].metadata.total_earnings, category === "earnings" ? 0 : 40);
    assert.equal(state.team[0].metadata.total_earnings, category === "earnings" ? 0 : 55);
    assert.equal(state.team[0].metadata.total_wins, 10, "earnings and team records are independent categories");
    assert.deepEqual(state.xPStats, old.xPStats); assert.deepEqual(state.rankedStats, old.rankedStats);
    assert.deepEqual(state.eightsStats, old.eightsStats); assert.deepEqual(state.userInventory, old.userInventory);
    assert.equal(state.user[0].metadata.avatar_url, "/avatar.png");
    assert.equal(state.user[0].metadata.screenshot_rank, "legend");
    assert.equal(state.wallet[0].metadata.total_deposits, 800, "historical deposits remain an audit fact");
    assert.equal(state.walletTransaction.length, category === "money" ? 1 : 0);
    assert.equal(state.creditTransaction.length, category === "credits" ? 1 : 0);
    if (category === "money") assert.equal(state.walletTransaction[0].metadata.amount, -100);
    if (category === "credits") assert.equal(state.creditTransaction[0].metadata.amount, -21);
    assert.deepEqual(state.adminAction[0].metadata.details.categories, [category]);
  }
});

test("all progression covers dedicated ELO columns, cached XP, team records and real trophy inventory", async () => {
  const f = fixture();
  await resetProgression(f.db, ceo, resetBody(PROGRESSION_CATEGORIES.map((entry) => entry.id)), { now });
  const state = f.state();
  assert.equal(state.user[0].xp_level, 1);
  assert.equal(state.xPStats[0].metadata.total_xp, 0);
  assert.equal(state.xPStats[0].metadata.level, 1);
  assert.equal(state.xPLeaderboard[0].metadata.total_xp, 0);
  assert.equal(state.rankedStats[0].metadata.elo, 0);
  assert.equal(state.playerProfile[0].metadata.elo, 0);
  assert.equal(state.playerProfile[0].metadata.rank, "bronze");
  assert.ok(state.eightsStats.every((entry) => entry.free_eights_elo === 0 && entry.metadata.wins === 0));
  assert.equal(state.eightsStats[0].metadata.monthly_xp, 0);
  assert.equal(state.team[0].metadata.total_wins, 0);
  assert.equal(state.team[0].metadata.ranking, null);
  assert.equal(state.team[0].metadata.name, "Keep our team");
  assert.equal(state.user[0].trophies, 0);
  assert.deepEqual(state.userInventory.map((entry) => entry.id), ["frame"], "cosmetics named Trophy Frame are not trophies");
  assert.deepEqual(state.playerProfile[0].metadata.showcase_item_ids, ["frame"]);
  assert.equal(state.playerProfile[0].metadata.is_premium, true);
  assert.equal(state.season.filter((entry) => entry.metadata.is_active).length, 3, "a category reset is not a season change");
});

test("a trophy-only reset leaves no displayed awards while preserving gold cosmetics and match records", async () => {
  const f = fixture();
  const state = f.state();
  Object.assign(state.userInventory[1].metadata, { item_name: "Gold Trophy Frame", item_rarity: "legendary" });
  state.userInventory.push(row("legacy-trophy", { user_id: "u", category: "trophy", item_name: "Gold Award" }));
  state.userInventory.push(row("capitalized-trophy", { user_id: "u", item_category: "Trophy", item_name: "Gold Award" }));
  state.playerProfile[0].metadata.showcase_item_ids.push("legacy-trophy", "capitalized-trophy");
  const result = await resetProgression(f.db, ceo, resetBody(["trophies"]), { now });
  const after = f.state();
  assert.equal(result.affected.trophy_items_removed, 3);
  assert.deepEqual(after.userInventory.map((item) => item.id), ["frame"]);
  const inventory = after.userInventory.map((item) => ({ ...item.metadata, id: item.id, created_date: item.created_date }));
  assert.deepEqual(trophyCountsFor(after.user[0].metadata, after.playerProfile[0].metadata, inventory),
    { gold: 0, silver: 0, bronze: 0, premium: 0, topfragg: 0, hosted: 0 });
  assert.deepEqual(recentTrophiesFor(after.user[0].metadata, after.playerProfile[0].metadata, inventory), []);
  assert.deepEqual(after.playerProfile[0].metadata.showcase_item_ids, ["frame"]);
  assert.equal(after.user[0].tournament_wins, 1, "a trophy reset preserves match records");
  assert.equal(after.user[0].credits, 21);
  assert.equal(after.playerProfile[0].metadata.elo, 2900);
  const newAward = { id: "new-win", item_category: "trophy", item_name: "Gold Tournament Trophy", acquired_date: "2026-10-20T12:00:00Z" };
  assert.equal(trophyCountsFor(after.user[0].metadata, after.playerProfile[0].metadata, [...inventory, newAward]).gold, 1);
  assert.deepEqual(recentTrophiesFor(after.user[0].metadata, after.playerProfile[0].metadata, [...inventory, newAward]).map((item) => item.id), ["new-win"]);
});

test("a ladder reset cannot reset another ladder, credits, cash or trophies", async () => {
  for (const category of ["xp", "ranked", "free8s"]) {
    const f = fixture(), old = structuredClone(f.state());
    await resetProgression(f.db, ceo, resetBody([category]), { now });
    const state = f.state();
    for (const [id, key] of [["xp", "xPStats"], ["ranked", "rankedStats"], ["free8s", "eightsStats"]]) if (id !== category) assert.deepEqual(state[key], old[key]);
    assert.deepEqual(state.wallet, old.wallet); assert.deepEqual(state.userInventory, old.userInventory);
    assert.equal(state.user[0].credits, 21); assert.equal(state.user[0].wallet_balance, 120);
  }
});

test("new seasons archive each selected ladder, keep other seasons active and reject duplicate season numbers", async () => {
  const f = fixture(), actor = { id: "super", role: "super_admin" };
  const result = await resetProgression(f.db, actor, seasonBody(["xp", "free8s"]), { now });
  assert.equal(result.seasons.length, 2);
  const state = f.state();
  assert.equal(state.xPStats[0].metadata.season, 5);
  assert.equal(state.xPStats[0].metadata.season_history[0].total_xp, 4500);
  assert.equal(state.eightsStats[0].metadata.season_history[0].free_eights_elo, 400);
  assert.equal(state.eightsStats[0].metadata.monthly_xp, 800, "a season rollover preserves the separate monthly prize period");
  assert.equal(state.rankedStats[0].metadata.elo, 2900);
  assert.equal(state.season.find((entry) => entry.id === "sr").metadata.is_active, true);
  assert.equal((await activeProgressionSeason(f.db, "xp")).season_number, 5);
  assert.equal((await activeProgressionSeason(f.db, "ranked")).season_number, 4, "legacy seasons are Ranked seasons");
  const before = structuredClone(state);
  await assert.rejects(resetProgression(f.db, actor, seasonBody(["xp", "free8s"]), { now }), { status: 409 });
  assert.deepEqual(f.state(), before);
  const ranked = fixture();
  await resetProgression(ranked.db, actor, seasonBody(["ranked"]), { now });
  assert.equal(ranked.state().rankedStats[0].metadata.elo, 1800);
  assert.equal(ranked.state().playerProfile[0].metadata.elo, 1800);
  assert.equal(ranked.state().playerProfile[0].metadata.rank, "platinum");
});

test("retrying the same confirmed request cannot reset newly earned progression a second time", async () => {
  const f = fixture(), body = { ...resetBody(["xp"]), request_id: "b1c369d1-a244-4aa1-9976-548afcc5b9d3" };
  const first = await resetProgression(f.db, ceo, body, { now });
  f.state().xPStats[0].metadata.total_xp = 100;
  const again = await resetProgression(f.db, ceo, body, { now });
  assert.equal(again.replayed, true);
  assert.equal(again.action.id, first.action.id);
  assert.equal(f.state().xPStats[0].metadata.total_xp, 100);
  assert.equal(f.state().adminAction.length, 1);
  await assert.rejects(resetProgression(f.db, ceo, { ...body, categories: ["credits"] }, { now }), { status: 409 });
});

test("resets are atomic, cover more than 500 records, and never wipe held or pending funds", async () => {
  for (const failedTable of ["creditTransaction", "adminAction"]) {
    const f = fixture(), before = structuredClone(f.state()); f.failAt(failedTable);
    await assert.rejects(resetProgression(f.db, ceo, resetBody(["credits"]), { now }), /Database failure/);
    assert.deepEqual(f.state(), before, "a failed ledger or audit write rolls back the reset");
  }
  for (const held of ["escrow_balance", "pending_balance", "withdrawal"]) {
    const f = fixture();
    if (held === "withdrawal") f.state().withdrawalRequest.push(row("withdraw", { status: "pending" }));
    else f.state().wallet[0].metadata[held] = 30;
    const before = structuredClone(f.state());
    await assert.rejects(resetProgression(f.db, ceo, resetBody(["money"]), { now }), { status: 409 });
    assert.deepEqual(f.state(), before);
  }
  const f = fixture();
  f.state().xPStats = Array.from({ length: 620 }, (_, index) => row(`xp-${index}`, { user_id: `u-${index}`, total_xp: 1000, level: 2 }));
  const result = await resetProgression(f.db, ceo, resetBody(["xp"]), { now });
  assert.equal(result.affected.xPStats, 620);
  assert.ok(f.state().xPStats.every((entry) => entry.metadata.total_xp === 0));
});

test("old XP matches do not restore TP Rank after a reset; new matches enter the new standings", async () => {
  const f = fixture();
  f.state().xPMatch = [row("old", { status: "completed", host_id: "u", challenger_id: "opponent", winner_id: "u", match_completed_date: "2026-10-18T10:00:00Z" })];
  assert.equal((await getXPStandings(f.db))[0].tp_rank.position, 1);
  await resetProgression(f.db, ceo, resetBody(["xp"]), { now });
  assert.deepEqual(await getXPStandings(f.db), []);
  f.state().xPStats[0].metadata.total_xp = 100;
  f.state().xPMatch.push(row("new", { status: "completed", host_id: "u", challenger_id: "opponent", winner_id: "u", match_completed_date: "2026-10-19T13:00:00Z" }));
  const standing = (await getXPStandings(f.db))[0];
  assert.equal(standing.matches_played, 1);
  assert.equal(standing.total_xp, 100);
  assert.equal(standing.tp_rank.position, 1);
});

test("Arena records respect each ladder reset while recent match history remains available", () => {
  const old = row("old", { status: "completed", host_id: "u", challenger_id: "v", winner_id: "u", match_type: "ranked", match_completed_date: "2026-10-18T10:00:00Z" });
  const recent = row("new", { ...old.metadata, match_completed_date: "2026-10-19T13:00:00Z" });
  const arena = buildProfileArena({ userId: "u", ranked: [old, recent], rankedStats: [row("stats", { elo: 20, progression_reset_at: timestamp })] });
  assert.equal(arena.wins, 1);
  assert.equal(arena.recent_matches.length, 2);
});
