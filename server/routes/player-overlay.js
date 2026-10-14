import { Router } from "express";
import { prisma } from "../prisma.js";
import { serializeRow } from "../entity.js";
import { trophyCountsFor } from "../lib/trophyCounts.js";
import { getFreeEightsSkill } from "../../src/lib/freeEightsSkill.js";

const router = Router();
const snapshots = new Map();
const CACHE_MS = 5000;
const MAX_SNAPSHOTS = 256;
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

async function playerSnapshot(identifier) {
  const row = await prisma.user.findFirst({
    where: { OR: [{ id: identifier }, { username: { equals: identifier, mode: "insensitive" } }] },
    select: {
      id: true, username: true, display_name: true, full_name: true, metadata: true,
      lifetime_earnings: true, total_wager_earnings: true, wager_wins: true, wager_losses: true,
      is_premium: true, premium_expires: true,
    },
  });
  if (!row) {
    const error = new Error("Player not found");
    error.status = 404;
    throw error;
  }
  const ownedByPlayer = { metadata: { path: ["user_id"], equals: row.id } };
  const [profileRow, rankedRows, walletRow, inventoryRows, eightsRows] = await Promise.all([
    prisma.playerProfile.findFirst({ where: ownedByPlayer, orderBy: { created_date: "desc" }, select: { metadata: true } }),
    prisma.rankedStats.findMany({ where: ownedByPlayer, orderBy: { created_date: "desc" }, select: { metadata: true } }),
    prisma.wallet.findFirst({ where: ownedByPlayer, orderBy: { created_date: "desc" }, select: { metadata: true } }),
    prisma.userInventory.findMany({ where: ownedByPlayer, select: { metadata: true } }),
    prisma.eightsStats.findMany({ where: ownedByPlayer, orderBy: { created_date: "desc" }, select: { metadata: true, free_eights_elo: true } }),
  ]);
  const user = serializeRow(row);
  const profile = profileRow?.metadata || {};
  const ranked = rankedRows.map(item => item.metadata || {}).sort((a, b) => {
    const left = a.season ?? "";
    const right = b.season ?? "";
    return left === right ? 0 : left > right ? -1 : 1;
  })[0] || {};
  const wins = Math.max(number(profile.total_wins), number(ranked.wins) + number(user.wager_wins), number(ranked.wins), number(user.wager_wins));
  const losses = Math.max(number(profile.total_losses), number(ranked.losses) + number(user.wager_losses), number(ranked.losses), number(user.wager_losses));
  const freeEights = eightsRows.find(item => String(item.metadata?.game_id || "bo7").toLowerCase() === "bo7") || {};
  const freeEightsElo = number(freeEights.free_eights_elo);
  const freeEightsSkill = getFreeEightsSkill(freeEightsElo, user.screenshot_rank);
  const counts = trophyCountsFor(user, profile, inventoryRows.map(item => item.metadata));
  const badges = Array.isArray(user.badges) ? user.badges : [];

  // This unauthenticated response is deliberately limited to public player presentation and totals.
  // Wallet balances, transactions, inventories, email and other account metadata are never returned.
  return {
    player: {
      id: row.id,
      username: row.username || "",
      display_name: row.display_name || profile.display_name || row.full_name || row.username || "Player",
      display_name_color: String(user.display_name_color || profile.display_name_color || ""),
      avatar_url: profile.avatar_url || user.avatar_url || "",
      is_premium: Boolean(row.is_premium && (!row.premium_expires || row.premium_expires.getTime() > Date.now())),
      verified_player: Boolean(user.verified_player || user.is_verified_player || badges.some(badge => badge?.type === "verified_player")),
      streamer_badge: Boolean(user.streamer_badge || user.is_streamer || badges.some(badge => badge?.type === "streamer")),
    },
    stats: {
      earnings: Math.max(number(row.lifetime_earnings), number(row.total_wager_earnings), number(profile.total_earnings), number(walletRow?.metadata?.total_earnings)),
      wins, losses,
      win_rate: wins + losses > 0 ? Math.round(wins / (wins + losses) * 100) : 0,
      elo: number(ranked.elo || profile.elo),
      has_ranked_matches: number(ranked.matches_played) > 0 || number(ranked.wins) + number(ranked.losses) > 0,
      free_eights_elo: freeEightsElo,
      free_eights_sr: freeEightsSkill.name,
      free_eights_sr_key: freeEightsSkill.key,
      free_eights_sr_source: freeEightsSkill.source,
    },
    trophies: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.floor(number(value))])),
    updated_at: new Date().toISOString(),
  };
}

router.get("/:identifier", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const identifier = String(req.params.identifier || "").trim();
  if (!/^[a-z0-9_-]{1,128}$/i.test(identifier)) return res.status(400).json({ error: "Invalid player" });
  const cacheKey = identifier.toLowerCase();
  const now = Date.now();
  for (const [key, snapshot] of snapshots) if (snapshot.expiresAt <= now) snapshots.delete(key);
  if (!snapshots.has(cacheKey)) {
    if (snapshots.size >= MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value);
    snapshots.set(cacheKey, { expiresAt: now + CACHE_MS, promise: playerSnapshot(identifier) });
  }
  const snapshot = snapshots.get(cacheKey);
  try {
    return res.json(await snapshot.promise);
  } catch (error) {
    if (snapshots.get(cacheKey) === snapshot) snapshots.delete(cacheKey);
    return res.status(error.status === 404 ? 404 : 503).json({ error: error.status === 404 ? "Player not found" : "Player stats are temporarily unavailable" });
  }
});

export default router;
