import { consoleRestrictedFor } from "../../src/lib/playerRestrictions.js";
import { Router } from "express";
import { getEntity, listEntities } from "../entity.js";
import { getXPStandings } from "../xp-matches.js";
import { selectHomeChampions } from "../home-champions.js";
import { prisma } from "../prisma.js";
import { withPlayerAvatars } from "../lib/playerAvatars.js";
import { EIGHTS_CONFIG_ID } from "../free-eights-games.js";
import { DEFAULT_EIGHTS_GAMES, withMw4Preview } from "../../src/lib/freeEightsGames.js";

const router = Router();
router.get("/topfragg-variant-rules", async (_req, res, next) => {
  try {
    const rules = await prisma.ruleSet.findUnique({ where: { id: "topfragg-variant" } });
    res.set("Cache-Control", "no-store").json({ success: true, rules: rules ? { body: rules.body, revision: rules.revision, updated_date: rules.updated_date } : null });
  } catch (error) { next(error); }
});
router.get("/free-eights-games", async (_req, res, next) => {
  try {
    const row = await prisma.mapPool.findUnique({ where: { id: EIGHTS_CONFIG_ID } });
    res.json({ success: true, games: withMw4Preview(row?.metadata?.games || DEFAULT_EIGHTS_GAMES), version: row?.updated_date.toISOString() || "default" });
  } catch (error) { next(error); }
});
router.get("/free-eights-map-images/:id", async (req, res, next) => {
  try {
    if (!/^free8s-image-[a-f0-9]{64}$/.test(req.params.id)) return res.sendStatus(404);
    const row = await prisma.mapPool.findUnique({ where: { id: req.params.id } });
    if (!row?.metadata?.image) return res.sendStatus(404);
    res.set("Cache-Control", "public, max-age=31536000, immutable").type("webp").send(Buffer.from(row.metadata.image, "base64"));
  } catch (error) { next(error); }
});
const CACHE_MS = 60000;
let homeCache = { expiresAt: 0, value: null };
let homePending = null;

const number = (value) => Number(value || 0);
const openStatuses = new Set(["open", "registration", "live", "in_progress"]);
const openMatchStatuses = new Set(["open", "registration", "waiting", "available"]);
const completedStatuses = new Set(["completed", "complete", "resolved"]);
const payoutTypes = new Set(["wager_payout", "tournament_prize", "prize", "payout", "eights_monthly_prize"]);

const safeTournament = (row) => ({
  id: row.id,
  name: row.name,
  status: row.status,
  start_date: row.start_date,
  prize_pool: number(row.prize_pool),
  team_size: row.team_size,
  registered_teams: number(row.registered_teams ?? row.participant_count),
  max_teams: number(row.max_teams ?? row.team_limit),
  entry_fee: number(row.entry_fee),
  entry_type: row.entry_type,
  invite_only: Boolean(row.invite_only),
  game_mode: row.game_mode,
  game_mode_display: row.game_mode_display,
  image_url: row.image_url || row.banner_url || row.cover_image_url || "",
  game_id: row.game_id,
});

const safePlayer = (row) => ({
  id: row.id,
  username: row.username,
  display_name: row.display_name || row.full_name || row.username || "Competitor",
  display_name_color: row.display_name_color || "",
  avatar_url: row.avatar_url || "",
  console_restricted: consoleRestrictedFor(row),
  tournament_wins: number(row.tournament_wins),
  lifetime_earnings: number(row.lifetime_earnings || row.total_wager_earnings),
});

const safeMatch = (row, kind) => ({
  id: row.id,
  kind,
  match_type: row.match_type,
  status: row.status,
  team_size: row.team_size,
  game_mode: row.game_mode,
  game_mode_display: row.game_mode_display,
  entry_fee: kind === "wager" ? number(row.entry_fee ?? row.amount) : 0,
  host_name: row.host_name || row.created_by_name || "Competitor",
  player_count: number(row.player_count ?? row.joined_players ?? row.participant_count),
  created_date: row.created_date,
});

async function loadHomeOverview() {
  const [tournaments, users, wagers, rankedMatches, tournamentMatches, xpStats, transactions, championData] = await Promise.all([
    listEntities("Tournament", {}, "-start_date", 500).catch(() => []),
    listEntities("User", {}, "-tournament_wins", 100).catch(() => []),
    listEntities("Wager", {}, "-created_date", 500).catch(() => []),
    listEntities("RankedMatch", {}, "-created_date", 500).catch(() => []),
    listEntities("TournamentMatch", {}, "-created_date", 500).catch(() => []),
    listEntities("XPStats", {}, "-total_xp", 500).catch(() => []),
    listEntities("WalletTransaction", { status: "completed" }, "-created_date", 500).catch(() => []),
    Promise.all([
      getXPStandings(prisma, null, "mw4"),
      listEntities("User", { is_banned: false }, "-total_wager_earnings", 5),
      listEntities("User", { is_banned: false }, "-tournament_wins", 5),
    ]).catch(() => null),
  ]);

  const champions = { xp: null, wagers: null, tournaments: null };
  if (championData) {
    const picks = selectHomeChampions({ xp: championData[0], wagers: championData[1], tournaments: championData[2] });
    const ids = [...new Set(Object.values(picks).filter(Boolean).map(pick => pick.user_id))];
    const championUsers = (await Promise.all(ids.map(id => getEntity("User", id).catch(() => null)))).filter(user => user && !user.is_banned);
    const presented = await withPlayerAvatars(prisma, championUsers);
    for (const [kind, pick] of Object.entries(picks)) {
      const user = pick && presented.find(user => user.id === pick.user_id);
      if (user) champions[kind] = { ...safePlayer(user), score: pick.score };
    }
  }

  const upcoming = tournaments
    .filter((row) => openStatuses.has(String(row.status || "").toLowerCase()))
    .sort((a, b) => new Date(a.start_date || 8640000000000000) - new Date(b.start_date || 8640000000000000))
    .slice(0, 6)
    .map(safeTournament);
  const ladderPlayers = users
    .filter((row) => number(row.tournament_wins) > 0)
    .sort((a, b) => number(b.tournament_wins) - number(a.tournament_wins) || number(b.lifetime_earnings) - number(a.lifetime_earnings))
    .slice(0, 16);
  const ladder = (await withPlayerAvatars(prisma, ladderPlayers)).map(safePlayer);
  const matches = [
    ...wagers.filter((row) => openMatchStatuses.has(String(row.status || "open").toLowerCase())).map((row) => safeMatch(row, "wager")),
    ...rankedMatches.filter((row) => openMatchStatuses.has(String(row.status || "open").toLowerCase())).map((row) => safeMatch(row, "ranked")),
  ].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)).slice(0, 8);

  const value = {
    stats: {
      matches_played: wagers.filter((row) => completedStatuses.has(String(row.status || "").toLowerCase())).length
        + rankedMatches.filter((row) => completedStatuses.has(String(row.status || "").toLowerCase())).length
        + tournamentMatches.filter((row) => completedStatuses.has(String(row.status || "").toLowerCase())).length,
      tournaments: tournaments.filter((row) => String(row.status || "").toLowerCase() !== "draft").length,
      cash_paid_out: transactions
        .filter((row) => payoutTypes.has(String(row.type || row.transaction_type || "").toLowerCase()))
        .reduce((sum, row) => sum + Math.abs(number(row.amount)), 0),
      total_xp: xpStats.reduce((sum, row) => sum + number(row.total_xp ?? row.xp), 0),
    },
    tournaments: upcoming,
    champions,
    champions_available: Boolean(championData),
    ladder,
    matches,
  };
  homeCache = { value, expiresAt: Date.now() + CACHE_MS };
  return value;
}

router.get("/home-overview", async (_req, res, next) => {
  try {
    if (homeCache.value && homeCache.expiresAt > Date.now()) return res.json(homeCache.value);
    // Visitors arriving together share the existing public snapshot computation.
    if (!homePending) homePending = loadHomeOverview().finally(() => { homePending = null; });
    return res.json(await homePending);
  } catch (error) {
    return next(error);
  }
});

export default router;
