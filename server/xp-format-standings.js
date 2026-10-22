import { PRIMARY_GAME_ID, storedGameId } from "../src/lib/mw4.js";
import { xpTeamMatchWhere } from "./lib/xpTeamMatches.js";
import { readXPLedger, getXPStandings } from "./xp-matches.js";
import { buildXPMatchRecords } from "./xp-match-records.js";
import { xpCategoryForSize, xpCategory } from "../src/lib/xpCategories.js";
import { xpMatchRoster, xpMatchTeamSize } from "../src/lib/xpMatchRating.js";
import { matchAfterProgressionReset } from "../src/lib/progressionResets.js";

export function buildXPTeamStandings(matches, teamRows, category, gameId = null) {
  const teams = new Map(teamRows.filter((row) => row.metadata.team_type === "xp" && row.metadata.is_active !== false).map((row) => [row.id, row]));
  const standings = new Map(), seen = new Set();
  const date = (row) => Date.parse(row.metadata.match_completed_date || row.metadata.completed_date || row.created_date || "") || 0;
  for (const row of [...matches].sort((a, b) => date(a) - date(b) || String(a.id).localeCompare(String(b.id)))) {
    const match = row.metadata;
    if (gameId && storedGameId(row) !== gameId) continue;
    if (seen.has(row.id) || match.status !== "completed" || (match.match_type && !["xp", "xp_match"].includes(match.match_type)) || xpCategoryForSize(match.team_size) !== category) continue;
    seen.add(row.id);
    const winning = match.winner_id === match.host_id ? "alpha" : match.winner_id === match.challenger_id ? "bravo" : null;
    if (!winning) continue;
    for (const side of ["alpha", "bravo"]) {
      const parties = match[`team_${side}_party_teams`] || [];
      const teamId = parties.length === 1 ? parties[0].team_id : !parties.length ? match[side === "alpha" ? "host_party_team_id" : "challenger_party_team_id"] : null;
      const team = teams.get(teamId), members = xpMatchRoster(match, side);
      if (!team || members.length !== xpMatchTeamSize(match) || (parties.length && parties[0].player_ids?.length !== members.length) || (!matchAfterProgressionReset(match, row, team.metadata.records_reset_at) || !matchAfterProgressionReset(match, row, team.metadata.xp_reset_at))) continue;
      if (xpCategoryForSize(team.metadata.roster_size) !== category) continue;
      const record = standings.get(teamId) || { id: teamId, team_id: teamId, name: team.metadata.name || "XP team", tag: team.metadata.tag || "", logo_url: team.metadata.logo_url || "", region: team.metadata.region || "", captain_id: team.metadata.captain_id,
        roster_size: Number(team.metadata.roster_size), total_xp: 0, wins: 0, losses: 0, win_streak: 0, matches_played: 0 };
      const won = winning === side;
      const recordedChange = Number(match.xp_rating_outcome?.change);
      const fallback = members.reduce((total, id) => total + Number(match.xp_changes?.[id]?.delta || 0), 0) / members.length;
      const delta = Number.isFinite(recordedChange) && recordedChange > 0 ? recordedChange * (won ? 1 : -1) : fallback;
      record.total_xp = Math.max(0, record.total_xp + Math.round(delta));
      record.wins += won ? 1 : 0; record.losses += won ? 0 : 1;
      record.win_streak = won ? record.win_streak + 1 : 0; record.matches_played++;
      standings.set(teamId, record);
    }
  }
  return [...standings.values()].sort((a, b) => b.total_xp - a.total_xp || b.wins - a.wins || a.team_id.localeCompare(b.team_id));
}

export async function getXPFormatStandings(db, input) {
  const category = xpCategory(input.category).id;
  const gameId = input.game_id || "bo7";
  const ledger = await readXPLedger(db, gameId), global = await getXPStandings(db, ledger);
  const matches = ledger.completed.filter((row) => xpCategoryForSize(row.metadata.team_size) === category);
  const records = buildXPMatchRecords(ledger.rows, matches), byUser = new Map(global.map((row) => [row.user_id, row]));
  const players = [...records].map(([user_id, record]) => ({ user_id, username: byUser.get(user_id)?.username || "Player", ...record,
    global_xp: byUser.get(user_id)?.total_xp || 0, tp_rank: byUser.get(user_id)?.tp_rank || null }))
    .sort((a, b) => b.total_xp - a.total_xp || b.wins - a.wins || a.user_id.localeCompare(b.user_id));
  const teamIds = [...new Set(matches.flatMap(({ metadata: match }) => [match.host_party_team_id, match.challenger_party_team_id,
    ...(match.team_alpha_party_teams || []).map((row) => row.team_id), ...(match.team_bravo_party_teams || []).map((row) => row.team_id)]).filter(Boolean))];
  const teams = teamIds.length ? await db.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, metadata: true } }) : [];
  return { success: true, category, players, game_id: gameId, teams: buildXPTeamStandings(matches, teams, category, gameId) };
}

// Team pages load only their own score ledger, separately from the fast roster response.
export async function getXPTeamsSummary(db, teamIds, gameId = PRIMARY_GAME_ID) {
  if (!teamIds.length) return {};
  const [teams, matches] = await Promise.all([
    db.team.findMany({ where: { id: { in: teamIds }, metadata: { path: ["team_type"], equals: "xp" } }, select: { id: true, metadata: true } }),
    db.xPMatch.findMany({ where: { AND: [xpTeamMatchWhere(teamIds), { metadata: { path: ["status"], equals: "completed" } }] }, select: { id: true, metadata: true, created_date: true } }),
  ]);
  const rows = ["solo", "duos", "teams"].flatMap((category) => buildXPTeamStandings(matches, teams, category, gameId));
  return Object.fromEntries(teams.map((team) => [team.id, rows.find((row) => row.team_id === team.id) || {
    team_id: team.id, total_xp: 0, wins: 0, losses: 0, win_streak: 0, matches_played: 0,
  }]));
}
