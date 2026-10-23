import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { FULL_RESET_CATEGORIES, PROGRESSION_CATEGORIES, SEASON_LADDERS, seasonLadder } from "../src/lib/progressionResets.js";
import { getRankForElo } from "../src/lib/ranks.js";
import { isInventoryTrophy } from "./lib/trophyCounts.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const json = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const zeros = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const earnings = zeros(["lifetime_earnings", "total_wager_earnings", "biggest_wager_win", "total_earnings", "earnings", "winnings", "total_winnings", "net_earnings"]);
const record = zeros(["wins", "losses", "matches_played", "win_streak", "best_win_streak", "win_rate"]);
const trophies = zeros(["trophies", "gold_count", "silver_count", "bronze_count", "premium_count", "premium_trophies", "topfragg_count", "topfrag_count", "topfragg_trophies", "hosted_count", "hosted_trophies", "invitational_count", "invitation_count", "champion_count"]);
const ladderDelegate = { xp: "xPStats", ranked: "rankedStats", free8s: "eightsStats" };
const highestSeason = (seasons, stats, ladder) => Math.max(
  seasons.reduce((max, season) => seasonLadder(season) === ladder ? Math.max(max, Number(season.season_number) || 1) : max, 1),
  stats.reduce((max, row) => Math.max(max, Number(row.metadata?.season) || 1), 1),
);
const tableNames = { user: "User", wallet: "Wallet", playerProfile: "PlayerProfile", xPStats: "XPStats", rankedStats: "RankedStats", eightsStats: "EightsStats", xPLeaderboard: "XPLeaderboard", team: "Team", userInventory: "UserInventory", season: "Season", withdrawalRequest: "WithdrawalRequest", xPMatch: "XPMatch", rankVerification: "RankVerification", challengeStanding: "ChallengeStanding", rankedLeaderboard: "RankedLeaderboard", wagerLeaderboard: "WagerLeaderboard", tournamentLeaderboard: "TournamentLeaderboard", leaderboard: "Leaderboard" };
const name = (actor) => actor.display_name || actor.username || actor.full_name || actor.id;

function selection(body, season) {
  const allowed = (season ? SEASON_LADDERS : PROGRESSION_CATEGORIES).map((entry) => entry.id);
  if (!Array.isArray(body.categories) || !body.categories.length || body.categories.some((id) => !allowed.includes(id))) fail("Choose valid reset categories.");
  return [...new Set(body.categories)];
}
function requiredTables(categories) {
  const tables = new Set(["user", "playerProfile"]);
  if (categories.some((id) => ["money", "credits", "earnings"].includes(id))) tables.add("wallet");
  if (categories.includes("money")) tables.add("withdrawalRequest");
  for (const id of categories) if (ladderDelegate[id]) tables.add(ladderDelegate[id]);
  if (categories.includes("xp")) { tables.add("xPLeaderboard"); tables.add("xPMatch"); }
  if (categories.includes("ranked")) tables.add("rankedLeaderboard");
  if (categories.includes("records")) { tables.add("wagerLeaderboard"); tables.add("tournamentLeaderboard"); tables.add("leaderboard"); }
  if (categories.includes("game_rank")) tables.add("rankVerification");
  if (categories.includes("challenges")) tables.add("challengeStanding");
  if (categories.some((id) => ["records", "earnings", "xp"].includes(id))) tables.add("team");
  if (categories.includes("trophies")) tables.add("userInventory");
  return [...tables];
}
async function rowsFor(db, categories) {
  return Object.fromEntries(await Promise.all(requiredTables(categories).map(async (key) => [key, await db[key].findMany(key === "user" ? {
    select: { id: true, metadata: true, credits: true, wallet_balance: true, lifetime_earnings: true, created_date: true },
  } : {})])));
}
function totals(rows) {
  const users = rows.user || [], wallets = rows.wallet || [];
  const byUser = new Map();
  for (const wallet of [...wallets].sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0) || a.id.localeCompare(b.id))) {
    const id = wallet.metadata?.user_id;
    if (id && !byUser.has(id)) byUser.set(id, wallet);
  }
  return { users: users.length, wallets: wallets.length,
    money: users.reduce((sum, user) => sum + Number(byUser.get(user.id)?.metadata?.available_balance ?? user.wallet_balance ?? 0), 0),
    credits: users.reduce((sum, user) => sum + Number(user.credits || 0), 0),
    earnings: users.reduce((sum, user) => sum + Number(user.lifetime_earnings || 0), 0),
    trophy_items: (rows.userInventory || []).filter((row) => isInventoryTrophy(json(row.metadata))).length,
    xp_records: (rows.xPStats || []).length, ranked_records: (rows.rankedStats || []).length, free8s_records: (rows.eightsStats || []).length,
  };
}
export async function activeProgressionSeason(db, ladder) {
  if (!db.season) return null;
  const rows = await db.season.findMany({ where: { metadata: { path: ["is_active"], equals: true } } });
  return rows.map((row) => ({ ...json(row.metadata), id: row.id })).filter((row) => row.is_active && seasonLadder(row) === ladder)
    .sort((a, b) => Number(b.season_number) - Number(a.season_number))[0] || null;
}
export async function progressionResetOverview(db, actor) {
  if (!hasRole(actor, "super_admin")) fail("Super Admin or CEO access required", 403);
  const rows = await rowsFor(db, PROGRESSION_CATEGORIES.map((entry) => entry.id));
  const seasons = (await db.season.findMany()).map((row) => ({ ...json(row.metadata), id: row.id }));
  const next_numbers = Object.fromEntries(SEASON_LADDERS.map(({ id }) => [id, highestSeason(seasons, rows[ladderDelegate[id]], id) + 1]));
  return { success: true, totals: totals(rows), seasons, categories: PROGRESSION_CATEGORIES, next_numbers };
}

export async function resetProgression(db, actor, body = {}, { now = () => new Date() } = {}) {
  const seasonal = body.mode === "season";
  if (!hasRole(actor, seasonal ? "super_admin" : "ceo")) fail(seasonal ? "Super Admin or CEO access required" : "Only the CEO can reset progression", 403);
  if (body.mode && !["reset", "season"].includes(body.mode)) fail("Choose reset or new season.");
  const fullReset = body.full_reset === true;
  if (fullReset && seasonal) fail("A full reset cannot start a season.");
  if (fullReset && body.categories?.includes("credits")) fail("A full website reset must preserve credits.");
  const categories = fullReset ? [...FULL_RESET_CATEGORIES] : selection(body, seasonal), selected = new Set(categories);
  const confirmation = fullReset ? "RESET WEBSITE" : seasonal ? "START SEASON" : "RESET SELECTED";
  if (body.confirmation !== confirmation) fail(`Type ${confirmation} to confirm.`);
  const reason = String(body.reason || "").trim();
  if (reason.length < 3 || reason.length > 500) fail("Enter a reason between 3 and 500 characters.");
  const timestamp = now().toISOString();
  const requestId = body.request_id;
  if (requestId !== undefined && (typeof requestId !== "string" || !/^[A-Za-z0-9-]{16,100}$/.test(requestId))) fail("Invalid reset request. Reopen the confirmation.");
  const number = Number(body.season_number), seasonName = String(body.season_name || "").trim();
  const start = new Date(body.start_date), end = new Date(body.end_date);
  if (seasonal) {
    if (!Number.isInteger(number) || number < 1 || number > 10000 || seasonName.length < 2 || seasonName.length > 80) fail("Enter a valid season number and name.");
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) fail("The season end must be after its start.");
    if (start.getTime() > Date.parse(timestamp) + 60000) fail("Start season applies immediately. Choose a start time at or before now.");
    if (end.getTime() <= Date.parse(timestamp)) fail("The new season must end in the future.");
    if (body.ranked_policy && !["zero", "soft"].includes(body.ranked_policy)) fail("Choose a valid Ranked reset policy.");
  }
  return db.$transaction(async (tx) => {
    // Serialize resets and protect the read/modify/write snapshots across API workers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-progression-reset'))`;
    const requestScope = JSON.stringify({ mode: seasonal ? "season" : "reset", full_reset: fullReset, categories: [...categories].sort(), reason,
      ...(seasonal ? { number, seasonName, start: start.toISOString(), end: end.toISOString(), policy: body.ranked_policy || "zero" } : {}) });
    if (requestId) {
      const previous = (await tx.adminAction.findMany({ where: { AND: [
        { metadata: { path: ["request_id"], equals: requestId } }, { metadata: { path: ["admin_id"], equals: actor.id } },
      ] }, take: 1 })).find((row) => row.metadata?.request_id === requestId && row.metadata?.admin_id === actor.id);
      if (previous) {
        if (previous.metadata.request_scope !== requestScope) fail("This reset request was already used for a different selection.", 409);
        return { ...previous.metadata.result, action: { id: previous.id, ...previous.metadata }, replayed: true };
      }
    }
    const keys = [...new Set([...requiredTables(categories), "season"])].sort();
    await tx.$executeRaw`LOCK TABLE ${Prisma.join(keys.map((key) => Prisma.raw(`"${tableNames[key]}"`)))} IN SHARE ROW EXCLUSIVE MODE`;
    const rows = await rowsFor(tx, categories), before = totals(rows);
    const seasons = (await tx.season.findMany()).map((row) => ({ ...json(row.metadata), id: row.id }));
    if (seasonal) for (const ladder of categories) {
      const previousNumber = highestSeason(seasons, rows[ladderDelegate[ladder]] || [], ladder);
      if (number <= previousNumber) fail(`${PROGRESSION_CATEGORIES.find((entry) => entry.id === ladder).label} needs a season number above ${previousNumber}.`, 409);
    }
    if (selected.has("money") && rows.wallet.some((row) => Number(row.metadata?.escrow_balance || 0) !== 0 || Number(row.metadata?.pending_balance || 0) !== 0)) {
      fail("Resolve pending payments and held match funds before resetting money balances.", 409);
    }
    if (selected.has("money") && rows.withdrawalRequest.some((row) => ["pending", "processing"].includes(row.metadata?.status))) fail("Resolve pending withdrawals before resetting money balances.", 409);
    const trophyIds = new Set((rows.userInventory || []).filter((row) => isInventoryTrophy(json(row.metadata))).map((row) => row.id));
    const affected = {}, newSeasons = [];
    const saveRows = async (key, patch) => {
      let count = 0;
      for (const row of rows[key] || []) {
        const data = patch(row);
        if (!data || !Object.keys(data).length) continue;
        await tx[key].update({ where: key === "rankVerification" ? { user_id: row.user_id } : { id: row.id }, data }); count++;
      }
      affected[key] = count;
    };
    const marker = (category) => ({ [`${category}_reset_at`]: timestamp });
    const userPatch = (row) => {
      const metadata = { ...json(row.metadata) }, data = {};
      for (const id of categories) Object.assign(metadata, marker(id));
      if (selected.has("money")) { data.wallet_balance = 0; Object.assign(metadata, zeros(["wallet_balance", "available_balance", "pending_balance", "escrow_balance", "withdrawable_balance"])); }
      if (selected.has("credits")) { data.credits = 0; Object.assign(metadata, { credits: 0, credit_balance: 0 }); }
      if (selected.has("earnings")) { Object.assign(data, { lifetime_earnings: 0, total_wager_earnings: 0, biggest_wager_win: 0 }); Object.assign(metadata, earnings); }
      if (selected.has("xp")) { data.xp_level = 1; Object.assign(metadata, { xp: 0, total_xp: 0, current_xp: 0, weekly_xp: 0, xp_level: 1, level: 1, prestige: 0 }); }
      if (selected.has("game_rank")) metadata.screenshot_rank = null;
      if (selected.has("free8s")) Object.assign(metadata, { free_eights_elo: 0, eights_wins: 0, eights_losses: 0 });
      if (selected.has("ranked")) Object.assign(metadata, { elo: 0, peak_elo: 0, ranked_elo: 0 });
      if (selected.has("records")) { Object.assign(data, { rank: "novice", division: "I" }); Object.assign(metadata, { rank: "novice", division: "I" }); Object.assign(data, { wager_wins: 0, wager_losses: 0, current_win_streak: 0, tournament_wins: 0 }); Object.assign(metadata, record, zeros(["tournament_wins", "wager_wins", "wager_losses", "total_wins", "total_losses", "total_matches"])); }
      if (selected.has("trophies")) { data.trophies = 0; Object.assign(metadata, trophies, { showcase_item_ids: (metadata.showcase_item_ids || []).filter((id) => !trophyIds.has(id)) }); }
      return { ...data, metadata };
    };
    await saveRows("user", userPatch);
    await saveRows("wallet", (row) => ({ metadata: { ...json(row.metadata),
      ...(selected.has("money") ? { ...zeros(["available_balance", "pending_balance", "escrow_balance", "withdrawable_balance", "wallet_balance"]), ...marker("money") } : {}),
      ...(selected.has("credits") ? { credits: 0, credit_balance: 0 } : {}),
      ...(selected.has("earnings") ? { ...earnings, ...marker("earnings") } : {}),
    } }));
    for (const ladder of categories.filter((id) => ladderDelegate[id])) {
      await saveRows(ladderDelegate[ladder], (row) => {
        const old = json(row.metadata), resetElo = seasonal && ladder === "ranked" && body.ranked_policy === "soft" && Number(old.elo || 0) >= 1800 ? 1800 : 0;
        const archived = { ...old }; delete archived.season_history; delete archived.reset_history;
        const historyKey = seasonal ? "season_history" : "reset_history";
        const metadata = { ...old, ...record, progression_reset_at: timestamp,
          [historyKey]: [...(Array.isArray(old[historyKey]) ? old[historyKey] : []), { ...archived, season: Number(old.season || 1), ...(ladder === "free8s" ? { free_eights_elo: row.free_eights_elo } : {}), archived_at: timestamp, reason }],
          ...(seasonal ? { season: number, season_name: seasonName, season_reset_date: timestamp } : {}),
          ...(ladder === "xp" ? { total_xp: 0, current_xp: 0, level: 1, prestige: 0, xp_to_next_level: 1000, weekly_xp: 0, daily_missions_completed: 0 } : {}),
          ...(ladder === "ranked" ? { elo: resetElo, peak_elo: resetElo } : {}),
          ...(ladder === "free8s" ? { rating: 1000, free_eights_elo: 0, peak_elo: 0, kills: 0, deaths: 0, kd_ratio: 0,
            ...(!seasonal ? { monthly_key: timestamp.slice(0, 7), monthly_wins: 0, monthly_matches: 0, monthly_xp: 0 } : {}) } : {}),
        };
        return { metadata, ...(ladder === "free8s" ? { free_eights_elo: 0 } : {}) };
      });
    }
    await saveRows("xPMatch", row => row.metadata?.status === "completed" ? { metadata: { ...json(row.metadata), progression_archived_at: timestamp } } : null);
    await saveRows("rankVerification", () => ({ status: "idle", failed_attempts: 0, attempts: [], last_submitted_at: null, reviewed_by: actor.id, review_reason: reason }));
    await saveRows("challengeStanding", () => ({ xp: 0, wins: 0, losses: 0 }));
    for (const key of ["rankedLeaderboard", "wagerLeaderboard", "tournamentLeaderboard", "leaderboard"]) {
      await saveRows(key, row => ({ metadata: { ...json(row.metadata), ...record, ...earnings, elo: 0, peak_elo: 0, score: 0, points: 0, ranking: null, rank: "novice", progression_reset_at: timestamp } }));
    }
    const rankedByUser = new Map();
    for (const row of [...(rows.rankedStats || [])].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))) {
      if (!rankedByUser.has(row.metadata?.user_id)) rankedByUser.set(row.metadata?.user_id, seasonal && body.ranked_policy === "soft" && Number(row.metadata?.elo || 0) >= 1800 ? 1800 : 0);
    }
    await saveRows("playerProfile", (row) => {
      const metadata = { ...json(row.metadata) };
      for (const id of categories) Object.assign(metadata, marker(id));
      if (selected.has("money")) Object.assign(metadata, zeros(["wallet_balance", "available_balance", "pending_balance", "escrow_balance", "withdrawable_balance"]));
      if (selected.has("credits")) metadata.credits = 0;
      if (selected.has("earnings")) Object.assign(metadata, earnings);
      if (selected.has("xp")) Object.assign(metadata, { xp: 0, total_xp: 0, current_xp: 0, level: 1, prestige: 0 });
      if (selected.has("ranked")) Object.assign(metadata, { elo: rankedByUser.get(metadata.user_id) || 0, peak_elo: rankedByUser.get(metadata.user_id) || 0, rank: getRankForElo(rankedByUser.get(metadata.user_id) || 0).tier });
      if (selected.has("records")) Object.assign(metadata, record, zeros(["total_matches", "total_wins", "total_losses", "current_win_streak", "best_win_streak", "total_playtime_hours", "tournament_wins"]));
      if (selected.has("trophies")) Object.assign(metadata, trophies, { showcase_item_ids: (metadata.showcase_item_ids || []).filter((id) => !trophyIds.has(id)) });
      return { metadata };
    });
    await saveRows("xPLeaderboard", (row) => ({ metadata: { ...json(row.metadata), ...record, xp: 0, total_xp: 0, current_xp: 0, weekly_xp: 0, score: 0, points: 0, level: 1, prestige: 0, progression_reset_at: timestamp, ...(seasonal ? { season: number } : {}) } }));
    await saveRows("team", (row) => !selected.has("records") && !selected.has("earnings") && row.metadata?.team_type !== "xp" ? null : ({ metadata: { ...json(row.metadata),
      ...(selected.has("xp") && row.metadata?.team_type === "xp" ? { xp_reset_at: timestamp } : {}),
      ...(selected.has("records") ? { ...record, ...zeros(["total_wins", "total_losses", "total_matches", "tournament_wins"]), ranking: null, records_reset_at: timestamp } : {}),
      ...(selected.has("earnings") ? { ...earnings, earnings_reset_at: timestamp } : {}),
    } }));
    for (const id of trophyIds) await tx.userInventory.delete({ where: { id } });
    affected.trophy_items_removed = trophyIds.size;
    // Record currency adjustments in the ledger as well as the administrative audit.
    if (selected.has("money") || selected.has("credits")) {
      const wallets = new Map();
      for (const row of [...(rows.wallet || [])].sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0) || a.id.localeCompare(b.id))) {
        if (!wallets.has(row.metadata?.user_id)) wallets.set(row.metadata?.user_id, row);
      }
      for (const user of rows.user) {
        if (selected.has("credits") && Number(user.credits || 0)) await tx.creditTransaction.create({ data: { metadata: { user_id: user.id, amount: -Number(user.credits), type: "admin_reset", description: reason, admin_id: actor.id, created_date: timestamp } } });
        const previous = Number(wallets.get(user.id)?.metadata?.available_balance ?? user.wallet_balance ?? 0);
        if (selected.has("money") && previous) await tx.walletTransaction.create({ data: { metadata: { user_id: user.id, wallet_id: wallets.get(user.id)?.id || null, amount: -previous, type: "admin_reset", previous_balance: previous, new_balance: 0, description: reason, admin_id: actor.id, created_date: timestamp } } });
      }
    }
    if (seasonal) for (const ladder of categories) {
      for (const season of seasons.filter((entry) => seasonLadder(entry) === ladder && entry.is_active)) {
        const { id, ...metadata } = season;
        await tx.season.update({ where: { id }, data: { metadata: { ...metadata, is_active: false, ended_date: timestamp } } });
      }
      const row = await tx.season.create({ data: { metadata: { ladder, name: seasonName, season_number: number, start_date: start.toISOString(), end_date: end.toISOString(), applied_at: timestamp,
        is_active: true, rank_resets: true, ranked_policy: body.ranked_policy || "zero", created_by: actor.id } } });
      newSeasons.push({ id: row.id, ...row.metadata });
    }
    const result = { success: true, full_reset: fullReset, credits_preserved: !selected.has("credits"), categories, affected, users_reset: rows.user.length, before, seasons: newSeasons };
    const action = await tx.adminAction.create({ data: { metadata: { admin_id: actor.id, admin_name: name(actor), admin_role: actor.role,
      ...(requestId ? { request_id: requestId, request_scope: requestScope, result } : {}),
      action_type: seasonal ? "progression_season_reset" : "progression_category_reset", description: `${seasonal ? `Started ${seasonName}` : "Reset progression"}: ${categories.join(", ")}. ${reason}`,
      details: { categories, affected, before, seasons: newSeasons.map((season) => season.id), reset_date: timestamp, reason }, created_date: timestamp } } });
    return { ...result, action: { id: action.id, ...action.metadata } };
  }, { timeout: 120000, maxWait: 15000 });
}
