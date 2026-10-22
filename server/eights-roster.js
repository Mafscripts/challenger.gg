import { serializeRow } from "./entity.js";
import { freeEightsTeamSize } from "../src/lib/freeEightsFormat.js";
import { captainDraftPending } from "../src/lib/freeEightsCaptainDraft.js";

const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };
const revision = (match) => JSON.stringify([
  match?.match_type, match?.status, match?.teams_generated_at, match?.host_id, match?.challenger_id,
  match?.roster_locked, match?.free_eights_waiting_for_voice, match?.free_eights_captain_draft, match?.team_size, match?.teams,
]);
const rosterKey = (players) => JSON.stringify(players.map((player) => [player.id, player.user_id, player.team])
  .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

// Team writers commit the roster and revision together. Re-read the revision
// around the roster so a concurrent commit cannot mix old and new teams.
// Uses ordinary delegates so Discord's isolated voice adapters can reuse it.
export async function readEightsRoster(db, matchId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await db.wager.findUnique({ where: { id: matchId } });
    if (!before) return { wager: null, match: null, participants: [] };
    const rows = await db.wagerParticipant.findMany({
      where: { metadata: { path: ["wager_id"], equals: matchId } }, orderBy: { created_date: "asc" },
    });
    const after = await db.wager.findUnique({ where: { id: matchId } });
    if (after && revision(before.metadata) === revision(after.metadata)) {
      return { wager: serializeRow(after), match: after.metadata, participants: rows.map(serializeRow) };
    }
  }
  fail("The lobby teams changed while loading. Please refresh the room.");
}

export async function saveEightsTeams(db, match, previousPlayers, alpha, bravo, changes) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Wager" WHERE id = ${match.id} FOR UPDATE`;
    const current = await tx.wager.findUnique({ where: { id: match.id } });
    if (!current || revision(current.metadata) !== revision(match) || current.metadata.status !== "open"
      || current.metadata.roster_locked || captainDraftPending(current.metadata)) fail("The lobby changed before teams could be saved.");
    const rows = await tx.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: match.id } } });
    const players = rows.map(serializeRow);
    if (rosterKey(players) !== rosterKey(previousPlayers)) fail("The roster changed before teams could be saved.");
    const size = freeEightsTeamSize(match), assigned = [...alpha, ...bravo];
    if (alpha.length !== size || bravo.length !== size || players.length !== size * 2
      || new Set(assigned.map((player) => player.user_id)).size !== size * 2
      || assigned.some((player) => !players.some((row) => row.id === player.id && row.user_id === player.user_id))) {
      fail("Complete, distinct teams are required.");
    }
    for (const [team, members] of [["host", alpha], ["challenger", bravo]]) {
      for (const player of members) {
        const row = rows.find((entry) => entry.id === player.id);
        await tx.wagerParticipant.update({ where: { id: row.id }, data: { metadata: {
          ...row.metadata, team, team_name: team === "host" ? "Team Alpha" : "Team Bravo",
          is_captain: player.id === members[0].id,
          ...(match.match_type === "8s" ? { free_eights_elo: player.free_eights_elo, screenshot_rank: player.screenshot_rank } : {}),
        } } });
      }
    }
    const stamp = new Date(Math.max(Date.now(), (Date.parse(match.teams_generated_at) || 0) + 1)).toISOString();
    return serializeRow(await tx.wager.update({ where: { id: match.id }, data: { metadata: {
      ...current.metadata, ...changes, teams_generated_at: stamp,
    } } }));
  }, { timeout: 15000, maxWait: 5000 });
}
