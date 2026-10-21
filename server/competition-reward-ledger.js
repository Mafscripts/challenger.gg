import { Prisma } from "@prisma/client";
import { xpCategoryForSize } from "../src/lib/xpCategories.js";
const fields = ["status", "completed", "match_type", "game_id", "team_size", "host_id", "challenger_id", "winner_id", "winner", "xp_changes", "elo_changes", "free_eights_elo_changes", "wallet_changes", "match_completed_date", "completed_date", "completed_at", "alpha_team", "bravo_team", "players", "reward_winner_user_ids", "reward_loser_user_ids"];
const projection = Prisma.sql`jsonb_build_object(${Prisma.join(fields.flatMap((key) => [Prisma.sql`${key}::text`, Prisma.sql`metadata -> ${key}::text`]))})`;
export async function loadRewardLedger(db, start, end) {
  const read = (table, completed) => db.$queryRaw`SELECT id, created_date, ${projection} AS metadata FROM ${table}
    WHERE ${completed} AND created_date < ${end} AND updated_date >= ${start}`;
  const [xp, ranked, wagers, challenges, tournaments] = await Promise.all([
    read(Prisma.sql`"XPMatch"`, Prisma.sql`metadata->>'status' = 'completed'`),
    read(Prisma.sql`"RankedMatch"`, Prisma.sql`metadata->>'status' = 'completed'`),
    read(Prisma.sql`"Wager"`, Prisma.sql`metadata->>'status' = 'completed'`),
    read(Prisma.sql`"ChallengeMatch"`, Prisma.sql`status = 'completed'`),
    read(Prisma.sql`"TournamentMatch"`, Prisma.sql`metadata->>'status' = 'completed'`),
  ]);
  return [...xp.map((row) => ({ ...row, mode: "xp" })), ...ranked.map((row) => ({ ...row, mode: "ranked" })),
    ...wagers.map((row) => ({ ...row, mode: row.metadata.match_type === "8s" ? "free8s" : row.metadata.match_type === "money8s" ? "money8s" : "wagers" })),
    ...challenges.map((row) => ({ ...row, metadata: { ...row.metadata, status: "completed" }, mode: "challenge" })), ...tournaments.map((row) => ({ ...row, mode: "tournament" }))];
}
export function buildRewardSeasonStandings(ledger, start, end, { includeTournaments = false } = {}) {
  const boards = new Map(), seen = new Set();
  const add = (ladder, id, value, won, row, extra = {}) => {
    if (!id || !Number.isFinite(value) || typeof won !== "boolean") return;
    const board = boards.get(ladder) || new Map(); boards.set(ladder, board);
    const record = board.get(id) || { id, score: 0, wins: 0, losses: 0, matches: 0, kind: "player" };
    record.score += value; record.wins += won ? 1 : 0; record.losses += won ? 0 : 1; record.matches++;
    Object.assign(record, extra); board.set(id, record);
  };
  const time = (row) => Date.parse(row.metadata.completed_at || row.metadata.match_completed_date || row.metadata.completed_date || row.created_date);
  for (const row of [...ledger].sort((a, b) => time(a) - time(b) || String(a.id).localeCompare(String(b.id)))) {
    const stamp = time(row), m = row.metadata || {}, key = `${row.mode}:${row.id}`;
    if (seen.has(key) || !Number.isFinite(stamp) || stamp < +start || stamp >= +end || m.status !== "completed") continue;
    seen.add(key);
    if (row.mode === "tournament") {
      if (includeTournaments) {
        for (const id of m.reward_winner_user_ids || []) add("tournament", id, 1, true, row);
        for (const id of m.reward_loser_user_ids || []) add("tournament", id, 0, false, row);
      }
      continue;
    }
    if (row.mode === "challenge") {
      for (const change of m.xp_changes || []) if (change.kind === "team") add("challenge", change.subject_id, Number(change.delta), change.won, row,
        { kind: "team", name: m.alpha_team?.id === change.subject_id ? m.alpha_team.name : m.bravo_team?.name,
          player_ids: (m.players || []).filter((player) => player.team_id === change.subject_id).map((player) => player.user_id) });
      continue;
    }
    const changes = row.mode === "xp" ? m.xp_changes : row.mode === "ranked" ? m.elo_changes : row.mode === "free8s" ? m.free_eights_elo_changes : m.wallet_changes;
    for (const [id, change] of Object.entries(changes || {})) {
      const value = ["money8s", "wagers"].includes(row.mode) ? Math.round(Math.max(0, Number(change.payout || 0) - Number(change.stake || 0)) * 100) : Number(change.delta);
      const ladder = row.mode === "free8s" ? `free8s:${m.game_id || "bo7"}` : row.mode;
      const won = typeof change.won === "boolean" ? change.won : row.mode === "free8s" ? Number(change.delta) > 0 : m.xp_changes?.[id]?.won;
      add(ladder, id, value, won, row);
      if (row.mode === "xp" && xpCategoryForSize(m.team_size)) add(`xp:${xpCategoryForSize(m.team_size)}`, id, value, won, row);
    }
  }
  return Object.fromEntries([...boards].map(([ladder, board]) => [ladder, [...board.values()].sort((a, b) => b.score - a.score || b.wins - a.wins || a.id.localeCompare(b.id))]));
}
