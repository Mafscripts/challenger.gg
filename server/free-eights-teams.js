import { balanceFreeEightsTeams } from "../src/lib/freeEightsSkill.js";
import { normalizeFreeEightsElo } from "../src/lib/freeEightsRanks.js";
import { screenshotRankFor } from "../src/lib/screenshotRanks.js";

export async function loadFreeEightsSkills(db, userIds) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return {};
  const [users, stats] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, metadata: true } }),
    db.eightsStats.findMany({ where: { OR: ids.map((id) => ({ metadata: { path: ["user_id"], equals: id } })) }, orderBy: { created_date: "desc" }, select: { metadata: true, free_eights_elo: true } }),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const statsById = new Map();
  for (const row of stats) if (!statsById.has(row.metadata?.user_id)) statsById.set(row.metadata?.user_id, row);
  return Object.fromEntries(ids.map((id) => {
    const row = statsById.get(id), metadata = row?.metadata;
    return [id, {
      free_eights_elo: normalizeFreeEightsElo(row?.free_eights_elo),
      screenshot_rank: screenshotRankFor(usersById.get(id)?.metadata?.screenshot_rank)?.id || null,
      eights_rating: metadata?.rating || 1000,
      eights_wins: metadata?.wins || 0, eights_losses: metadata?.losses || 0,
      monthly_wins: metadata?.monthly_wins || 0,
    }];
  }));
}

export async function generateBalancedFreeEightsTeams(db, participants, random = Math.random) {
  const skills = await loadFreeEightsSkills(db, participants.map((row) => row.user_id));
  // Participant/client rank fields never control the split. Stored account and
  // dedicated Free 8s stats replace them before applying the shared policy.
  return balanceFreeEightsTeams(participants.map((row) => ({ ...row, ...skills[row.user_id] })), random);
}
