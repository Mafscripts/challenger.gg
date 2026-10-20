import { serializeRow } from "./entity.js";
import { hasRole } from "./roles.js";
import { findEightsStatsRow } from "./free-eights-games.js";
import { eightsGameId } from "../src/lib/freeEightsGames.js";
import { freeEightsTeamSize } from "../src/lib/freeEightsFormat.js";
import { matchAfterProgressionReset } from "../src/lib/progressionResets.js";

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const subtract = (value, amount) => Math.max(0, Number(value || 0) - amount);
const userRow = async (delegate, userId) => (await delegate.findMany({ where: { metadata: { path: ["user_id"], equals: userId } }, orderBy: { created_date: "desc" }, take: 1 }))[0] || null;

// Keep the fields that cannot be reconstructed after a loss resets a streak.
export async function captureFreeEightsRewards(db, userIds, gameId) {
  const entries = await Promise.all(userIds.map(async (id) => {
    const [user, xp, profile, eights] = await Promise.all([
      db.user.findUnique({ where: { id } }), userRow(db.xPStats, id),
      userRow(db.playerProfile, id), findEightsStatsRow(db, id, gameId),
    ]);
    return [id, {
      user_streak: Number(user?.current_win_streak || 0),
      user_matches: Number(user?.wager_wins || 0) + Number(user?.wager_losses || 0),
      xp_streak: Number(xp?.metadata?.win_streak || 0),
      profile_streak: Number(profile?.metadata?.current_win_streak || 0),
      profile_best_streak: Number(profile?.metadata?.best_win_streak || 0),
      profile_matches: Number(profile?.metadata?.total_matches || 0),
      eights_streak: Number(eights?.metadata?.win_streak || 0),
      eights_rating: Number(eights?.metadata?.rating || 1000),
      eights_matches: Number(eights?.metadata?.matches_played || 0),
    }];
  }));
  return Object.fromEntries(entries);
}

function reverseXp(stats, amount) {
  let level = Number(stats.level || 1);
  let current = Number(stats.current_xp || 0) - amount;
  while (current < 0 && level > 1) {
    level--;
    current += 1000 + (level - 1) * 150;
  }
  return { level, current_xp: Math.max(0, current), total_xp: subtract(stats.total_xp, amount),
    weekly_xp: subtract(stats.weekly_xp, amount), xp_to_next_level: 1000 + (level - 1) * 150 };
}

export async function revertFreeEightsResult(db, admin, matchId, expectedCompletion) {
  if (!hasRole(admin, "admin")) fail("Admin access is required", 403);
  if (typeof matchId !== "string" || !matchId || !expectedCompletion) fail("Match and result version are required", 400);
  return db.$transaction(async (tx) => {
    // Share completion's ladder lock; all rewards and the reopened room commit together.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-free-eights-elo'))`;
    await tx.$executeRaw`SELECT id FROM "Wager" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.wager.findUnique({ where: { id: matchId } });
    const match = row?.metadata;
    if (!match || match.match_type !== "8s") fail("Free 8s match required", 400);
    if (match.status !== "completed" || match.match_completed_date !== expectedCompletion) fail("This result has changed. Refresh the room before reverting.");
    if (Number(match.entry_fee || 0) > 0 || Number(match.amount || 0) > 0 || Number(match.payout_total || 0) > 0) fail("Paid matches cannot use Free 8s result reversal", 400);
    const elo = match.free_eights_elo_changes || {};
    const rewards = match.xp_changes || {};
    const roster = await tx.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: matchId } } });
    const players = roster.map((p) => p.metadata);
    const teamSize = freeEightsTeamSize(match);
    if (players.length !== teamSize * 2 || players.some((p) => !p.user_id) || new Set(players.map((p) => p.user_id)).size !== teamSize * 2
      || !["host", "challenger"].every((team) => players.filter((p) => p.team === team).length === teamSize)) fail("A complete roster for the selected format is required");
    const winningSide = match.winner_id === match.host_id ? "host" : "challenger";
    if (![match.host_id, match.challenger_id].includes(match.winner_id)) fail("Stored match winner is invalid");
    const month = String(match.match_completed_date).slice(0, 7);
    for (const player of players) {
      const id = player.user_id;
      const won = player.team === winningSide;
      if (!elo[id] || !rewards[id] || !Number.isFinite(elo[id].delta) || !Number.isFinite(rewards[id].amount)) fail("Match rewards are still processing or their history is unavailable. Refresh and try again.");
      const amount = rewards[id].amount;
      const before = match.free_eights_reward_snapshot?.[id];
      const stats = await findEightsStatsRow(tx, id, eightsGameId(match.game_id));
      if (!stats) fail("Player's Free 8s stats could not be found");
      const data = stats.metadata;
      if (!matchAfterProgressionReset(match, row, data.progression_reset_at)) fail("This result belongs to archived progression and cannot change the current Free 8s season.");
      const wins = subtract(data.wins, won ? 1 : 0);
      const matches = subtract(data.matches_played, 1);
      const latest = before ? Number(data.matches_played) === before.eights_matches + 1
        : Date.parse(data.last_played_date) <= Date.parse(row.updated_date);
      const ratingDelta = before ? Math.max(0, before.eights_rating + (won ? 20 : -10)) - before.eights_rating : (won ? 20 : -10);
      const monthlyPatch = (record, history = false) => history
        ? { ...record, wins: subtract(record.wins, won ? 1 : 0), matches: subtract(record.matches, 1), xp: subtract(record.xp, amount) }
        : { monthly_wins: subtract(record.monthly_wins, won ? 1 : 0), monthly_matches: subtract(record.monthly_matches, 1), monthly_xp: subtract(record.monthly_xp, amount) };
      await tx.eightsStats.update({ where: { id: stats.id }, data: {
        free_eights_elo: subtract(stats.free_eights_elo, elo[id].delta),
        metadata: { ...data, wins, losses: subtract(data.losses, won ? 0 : 1), matches_played: matches,
          rating: subtract(data.rating ?? 1000, ratingDelta), win_rate: matches ? Math.round(wins / matches * 100) : 0,
          ...(latest ? { win_streak: before?.eights_streak ?? (won ? subtract(data.win_streak, 1) : Number(data.win_streak || 0)) } : {}),
          ...(data.monthly_key === month ? monthlyPatch(data) : {}),
          monthly_history: (data.monthly_history || []).map((item) => item.month === month ? monthlyPatch(item, true) : item),
        },
      } });
      const xp = await userRow(tx.xPStats, id);
      let xpLevel;
      if (xp && amount > 0 && xp.metadata?.xp_source !== "xp_matches") {
        if (!matchAfterProgressionReset(match, row, xp.metadata?.progression_reset_at)) fail("This result belongs to archived XP progression and cannot change the current season.");
        const progress = reverseXp(xp.metadata, amount);
        xpLevel = progress.level;
        const lastReward = xp.metadata.total_xp === rewards[id].new_total_xp;
        await tx.xPStats.update({ where: { id: xp.id }, data: { metadata: { ...xp.metadata, ...progress,
          ...(lastReward ? { win_streak: before?.xp_streak ?? (won ? subtract(xp.metadata.win_streak, 1) : Number(xp.metadata.win_streak || 0)) } : {}),
        } } });
      }
      const profile = await userRow(tx.playerProfile, id);
      if (profile) {
        const p = profile.metadata;
        const lastReward = before ? Number(p.total_matches) === before.profile_matches + 1
          : Date.parse(p.last_active_date) <= Date.parse(row.updated_date);
        await tx.playerProfile.update({ where: { id: profile.id }, data: { metadata: { ...p,
          total_matches: subtract(p.total_matches, 1), total_wins: subtract(p.total_wins, won ? 1 : 0),
          total_losses: subtract(p.total_losses, won ? 0 : 1), xp: subtract(p.xp, amount),
          ...(xpLevel ? { level: xpLevel } : {}),
          ...(lastReward ? { current_win_streak: before?.profile_streak ?? (won ? subtract(p.current_win_streak, 1) : Number(p.current_win_streak || 0)),
            ...(before ? { best_win_streak: before.profile_best_streak } : {}) } : {}),
        } } });
      }
      const user = await tx.user.findUnique({ where: { id } });
      if (user) await tx.user.update({ where: { id }, data: {
        wager_wins: subtract(user.wager_wins, won ? 1 : 0), wager_losses: subtract(user.wager_losses, won ? 0 : 1),
        ...(xpLevel ? { xp_level: xpLevel } : {}),
        ...((before ? Number(user.wager_wins) + Number(user.wager_losses) === before.user_matches + 1
          : xp?.metadata.total_xp === rewards[id].new_total_xp) ? { current_win_streak: before?.user_streak ?? (won ? subtract(user.current_win_streak, 1) : user.current_win_streak) } : {}),
      } });
    }
    await tx.wagerMatch.deleteMany({ where: { metadata: { path: ["wager_id"], equals: matchId } } });
    const reset = { ...match, status: "in_progress", completed: false, roster_locked: true, roster_lock_deadline: "",
      winner_id: null, winner_name: null, winner_score: null, loser_score: null, match_completed_date: null,
      free_eights_elo_changes: {}, free_eights_elo_applied_at: null, free_eights_reward_snapshot: null,
      xp_changes: {}, wallet_changes: {}, payout_total: 0, winner_profit: 0,
      scores_confirmed: false, eights_score_vote_user_ids: [], eights_score_vote_count: 0,
      eights_score_vote_status: null, eights_reshuffle_vote_user_ids: [], eights_reshuffle_vote_count: 0, eights_reshuffle_vote_status: null,
      dispute_id: null, score_conflict_date: null, disputed_date: null,
      requested_admin: false, admin_request_status: null, admin_request_ticket_id: null, admin_request_resolved_date: null,
      admin_resolved_by: null, admin_resolved_by_name: null,
      result_reverted_at: new Date().toISOString(), result_reverted_by: admin.id,
    };
    for (const prefix of ["host_reported_score", "challenger_reported_score", "reported_score"]) {
      for (const suffix of ["alpha", "bravo", "by", "date"]) reset[`${prefix}_${suffix}`] = null;
    }
    for (const key of ["confirmed_score_alpha", "confirmed_score_bravo", "confirmed_score_date", "reported_score_team",
      "eights_score_vote_alpha", "eights_score_vote_bravo", "eights_score_vote_required",
      "eights_score_vote_started_by", "eights_score_vote_started_by_name", "eights_score_vote_started_date"]) {
      reset[key] = null;
    }
    const updated = await tx.wager.update({ where: { id: matchId }, data: { metadata: reset, updated_date: new Date() } });
    await tx.adminAction.create({ data: { metadata: {
      admin_id: admin.id, admin_role: admin.role, action_type: "free_eights_result_reverted",
      description: "Free 8s result reverted; room reopened for a corrected result.",
      details: { match_id: matchId, previous_result: match },
    } } });
    return serializeRow(updated);
  }, { timeout: 15000, maxWait: 15000 });
}
