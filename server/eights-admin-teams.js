import { serializeRow } from "./entity.js";
import { hasRole } from "./roles.js";
import { loadFreeEightsSkills } from "./free-eights-teams.js";
import { getFreeEightsSkill } from "../src/lib/freeEightsSkill.js";
import { eightsReshuffleWindowMs } from "../src/lib/eightsLobbyTimer.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validRoster = (players) => players.length === 8 && players.every((player) => player.user_id)
  && new Set(players.map((player) => player.user_id)).size === 8
  && ["host", "challenger"].every((side) => players.filter((player) => player.team === side).length === 4);

// Uniform over all different 4v4 assignments, excluding the current split and
// its mirror. Rank and ELO never select or correct an administrator's teams.
export function randomEightsTeams(players, random = Math.random) {
  if (!validRoster(players)) fail("A complete, distinct 4v4 roster is required");
  const candidates = [];
  for (let a = 1; a < 6; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 8; c++) {
    const indices = new Set([0, a, b, c]);
    const alpha = players.filter((_, index) => indices.has(index));
    const bravo = players.filter((_, index) => !indices.has(index));
    if (alpha.every((player) => player.team === "host") || alpha.every((player) => player.team === "challenger")) continue;
    candidates.push({ alpha, bravo }, { alpha: bravo, bravo: alpha });
  }
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
}

export async function editEightsTeamsAsAdmin(db, user, matchId, input, random = Math.random) {
  if (!hasRole(user, "admin")) fail("Admin access is required", 403);
  if (typeof matchId !== "string" || !matchId || matchId.length > 200) fail("8s match ID required");
  if (!["random", "swap"].includes(input.mode)) fail("Invalid team action");
  return db.$transaction(async (tx) => {
    // The roster, captains, timer and audit become visible together. Lock the
    // match row before reading it so simultaneous admins cannot overwrite it.
    await tx.$executeRaw`SELECT id FROM "Wager" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.wager.findUnique({ where: { id: matchId } });
    const match = row?.metadata;
    if (!match || !["8s", "money8s"].includes(match.match_type)) fail("8s lobby not found", 404);
    if (match.status !== "open" || match.roster_locked || !match.teams_generated_at || match.free_eights_waiting_for_voice
      || !Number.isFinite(Date.parse(match.roster_lock_deadline)) || Date.parse(match.roster_lock_deadline) <= Date.now()) {
      fail("The reshuffle window has closed. Reset the lobby before editing teams.", 409);
    }
    if (typeof input.expected_teams_generated_at !== "string" || input.expected_teams_generated_at !== match.teams_generated_at) {
      fail("Teams changed. Refresh the room and try again.", 409);
    }
    const rows = await tx.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: matchId } }, orderBy: { created_date: "asc" } });
    const players = rows.map(serializeRow);
    if (!validRoster(players)) fail("A complete, distinct 4v4 roster is required", 409);
    let alpha, bravo;
    if (input.mode === "random") ({ alpha, bravo } = randomEightsTeams(players, random));
    else {
      const first = players.find((player) => player.user_id === input.first_user_id);
      const second = players.find((player) => player.user_id === input.second_user_id);
      if (!first || !second || first.user_id === second.user_id || first.team === second.team) {
        fail("Choose two different players from opposite teams");
      }
      alpha = players.filter((player) => player.team === "host" && player !== first && player !== second);
      bravo = players.filter((player) => player.team === "challenger" && player !== first && player !== second);
      alpha.push(first.team === "challenger" ? first : second);
      bravo.push(first.team === "host" ? first : second);
    }
    if (match.match_type === "8s") {
      const skills = await loadFreeEightsSkills(tx, players.map((player) => player.user_id));
      alpha = alpha.map((player) => ({ ...player, ...skills[player.user_id] }));
      bravo = bravo.map((player) => ({ ...player, ...skills[player.user_id] }));
    }
    const captain = (team, previous) => team.find((player) => player.user_id === previous) || team.find((player) => player.is_captain) || team[0];
    const alphaCaptain = captain(alpha, match.host_id), bravoCaptain = captain(bravo, match.challenger_id);
    const stamp = new Date(Math.max(Date.now(), (Date.parse(match.teams_generated_at) || 0) + 1)).toISOString();
    for (const [team, members, leader] of [["host", alpha, alphaCaptain], ["challenger", bravo, bravoCaptain]]) {
      for (const player of members) {
        const original = rows.find((entry) => entry.id === player.id);
        await tx.wagerParticipant.update({ where: { id: player.id }, data: { metadata: {
          ...original.metadata, team, team_name: team === "host" ? "Team Alpha" : "Team Bravo", is_captain: player.user_id === leader.user_id,
          ...(match.match_type === "8s" ? { free_eights_elo: player.free_eights_elo, screenshot_rank: player.screenshot_rank } : {}),
        } } });
      }
    }
    const override = { mode: input.mode, admin_id: user.id, updated_at: stamp };
    const metadata = {
      ...match, host_id: alphaCaptain.user_id, host_name: alphaCaptain.user_name || "Team Alpha Captain",
      challenger_id: bravoCaptain.user_id, challenger_name: bravoCaptain.user_name || "Team Bravo Captain",
      teams_generated_at: stamp, eights_team_override: override,
      roster_lock_deadline: new Date(Date.now() + eightsReshuffleWindowMs(match.match_type)).toISOString(),
      eights_reshuffle_vote_user_ids: [], eights_reshuffle_vote_count: 0, eights_reshuffle_vote_status: null,
      eights_reshuffle_vote_started_date: null,
    };
    if (match.match_type === "8s") {
      const strength = (team) => team.reduce((sum, player) => sum + getFreeEightsSkill(player.free_eights_elo, player.screenshot_rank).strength, 0);
      metadata.free_eights_team_balance = {
        strategy: input.mode === "random" ? "admin-random-v1" : "admin-swap-v1", partitions_checked: 0,
        team_a_strength: strength(alpha), team_b_strength: strength(bravo), strength_gap: Math.abs(strength(alpha) - strength(bravo)),
        players: Object.fromEntries([...alpha, ...bravo].map((player) => {
          const skill = getFreeEightsSkill(player.free_eights_elo, player.screenshot_rank);
          return [player.user_id, { rank: skill.name, source: skill.source, free_eights_elo: skill.elo, strength: skill.strength }];
        })),
      };
    }
    const updated = await tx.wager.update({ where: { id: matchId }, data: { metadata } });
    await tx.adminAction.create({ data: { metadata: {
      action: "eights_team_edit", admin_id: user.id, match_id: matchId, mode: input.mode,
      before: players.map((player) => ({ user_id: player.user_id, team: player.team })),
      after: [...alpha.map((player) => ({ user_id: player.user_id, team: "host" })), ...bravo.map((player) => ({ user_id: player.user_id, team: "challenger" }))],
    } } });
    return { wager: serializeRow(updated), swap: input.mode === "swap" ? [input.first_user_id, input.second_user_id] : null };
  }, { timeout: 15000, maxWait: 15000 });
}
