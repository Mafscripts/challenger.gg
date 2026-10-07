import { serializeRow } from "./entity.js";

const activeStatuses = ["open", "in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion", "score_conflict", "disputed"];
const field = (key, value) => ({ metadata: { path: [key], equals: value } });

// Read-only Free 8s queries. Batch by stored match/user IDs; never fetch a
// separate match or roster for every row in the player's history.
export async function getFreeEightsOverview(db, userId) {
  const [open, memberships] = await Promise.all([
    db.wager.findMany({ where: { AND: [field("match_type", "8s"), field("status", "open")] }, orderBy: { created_date: "desc" }, take: 30 }),
    db.wagerParticipant.findMany({ where: field("user_id", userId), select: { metadata: true } }),
  ]);
  const openIds = open.map((row) => row.id);
  const memberIds = [...new Set(memberships.map((row) => row.metadata?.wager_id).filter((id) => typeof id === "string" && id))];
  const [active, participants] = await Promise.all([
    memberIds.length ? db.wager.findMany({ where: { AND: [
      { id: { in: memberIds } }, field("match_type", "8s"),
      { OR: activeStatuses.map((status) => field("status", status)) },
    ] }, orderBy: { created_date: "desc" }, take: 1 }) : [],
    openIds.length ? db.wagerParticipant.findMany({ where: { OR: openIds.map((id) => field("wager_id", id)) }, select: { metadata: true } }) : [],
  ]);
  const counts = Object.fromEntries(openIds.map((id) => [id, 0]));
  for (const row of participants) {
    const id = row.metadata?.wager_id;
    if (Object.hasOwn(counts, id)) counts[id]++;
  }
  return { success: true, lobbies: open.map(serializeRow), active_lobby: serializeRow(active[0]), counts };
}

export async function getFreeEightsPlayerStats(db, matchId) {
  if (typeof matchId !== "string" || !matchId || matchId.length > 200) {
    throw Object.assign(new Error("Free 8s match ID required"), { status: 400 });
  }
  const match = await db.wager.findUnique({ where: { id: matchId }, select: { metadata: true } });
  if (match?.metadata?.match_type !== "8s") {
    throw Object.assign(new Error("Free 8s match not found"), { status: 404 });
  }
  const roster = await db.wagerParticipant.findMany({ where: field("wager_id", matchId), select: { metadata: true } });
  const ids = [...new Set(roster.map((row) => row.metadata?.user_id).filter((id) => typeof id === "string" && id))];
  if (!ids.length) return { success: true, stats: {} };
  const where = { OR: ids.map((id) => field("user_id", id)) };
  const [xpRows, eightsRows] = await Promise.all([
    db.xPStats.findMany({ where, orderBy: { created_date: "desc" }, select: { metadata: true } }),
    db.eightsStats.findMany({ where, orderBy: { created_date: "desc" }, select: { metadata: true, free_eights_elo: true } }),
  ]);
  const latestByUser = (rows) => {
    const result = new Map();
    for (const row of rows) if (!result.has(row.metadata?.user_id)) result.set(row.metadata?.user_id, row);
    return result;
  };
  const xp = latestByUser(xpRows);
  const eights = latestByUser(eightsRows);
  // Only public progression fields for this match's roster are returned.
  // Missing records have defaults; database failures propagate for retry.
  return { success: true, stats: Object.fromEntries(ids.map((id) => {
    const row = eights.get(id);
    const stats = row?.metadata;
    return [id, {
      xp_level: xp.get(id)?.metadata?.level || 1,
      free_eights_elo: row?.free_eights_elo ?? 0,
      eights_rating: stats?.rating || 1000,
      eights_wins: stats?.wins || 0,
      eights_losses: stats?.losses || 0,
      monthly_wins: stats?.monthly_wins || 0,
    }];
  })) };
}
