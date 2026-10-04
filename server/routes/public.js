import { Router } from "express";
import { listEntities } from "../entity.js";

const router = Router();
const CACHE_MS = 60000;
let homeCache = { expiresAt: 0, value: null };

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
});

const safePlayer = (row) => ({
  id: row.id,
  username: row.username,
  display_name: row.display_name || row.full_name || row.username || "Competitor",
  display_name_color: row.display_name_color || "",
  avatar_url: row.avatar_url || "",
  tournament_wins: number(row.tournament_wins),
  lifetime_earnings: number(row.lifetime_earnings || row.total_wager_earnings),
});

const safeMatch = (row, kind) => ({
  id: row.id,
  kind,
  status: row.status,
  team_size: row.team_size,
  game_mode: row.game_mode,
  game_mode_display: row.game_mode_display,
  entry_fee: kind === "wager" ? number(row.entry_fee ?? row.amount) : 0,
  host_name: row.host_name || row.created_by_name || "Competitor",
  player_count: number(row.player_count ?? row.joined_players ?? row.participant_count),
  created_date: row.created_date,
});

router.get("/home-overview", async (_req, res, next) => {
  try {
    if (homeCache.value && homeCache.expiresAt > Date.now()) return res.json(homeCache.value);

    const [tournaments, users, wagers, rankedMatches, tournamentMatches, xpStats, transactions] = await Promise.all([
      listEntities("Tournament", {}, "-start_date", 500).catch(() => []),
      listEntities("User", {}, "-tournament_wins", 100).catch(() => []),
      listEntities("Wager", {}, "-created_date", 500).catch(() => []),
      listEntities("RankedMatch", {}, "-created_date", 500).catch(() => []),
      listEntities("TournamentMatch", {}, "-created_date", 500).catch(() => []),
      listEntities("XPStats", {}, "-total_xp", 500).catch(() => []),
      listEntities("WalletTransaction", { status: "completed" }, "-created_date", 500).catch(() => []),
    ]);

    const upcoming = tournaments
      .filter((row) => openStatuses.has(String(row.status || "").toLowerCase()))
      .sort((a, b) => new Date(a.start_date || 8640000000000000) - new Date(b.start_date || 8640000000000000))
      .slice(0, 6)
      .map(safeTournament);
    const ladder = users
      .filter((row) => number(row.tournament_wins) > 0)
      .sort((a, b) => number(b.tournament_wins) - number(a.tournament_wins) || number(b.lifetime_earnings) - number(a.lifetime_earnings))
      .slice(0, 16)
      .map(safePlayer);
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
      ladder,
      matches,
    };
    homeCache = { value, expiresAt: Date.now() + CACHE_MS };
    return res.json(value);
  } catch (error) {
    return next(error);
  }
});

export default router;
