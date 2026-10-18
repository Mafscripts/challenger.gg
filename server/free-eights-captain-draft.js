import { randomInt, randomUUID } from "node:crypto";
import { serializeRow } from "./entity.js";
import { loadFreeEightsSkills } from "./free-eights-teams.js";
import { freeEightsDiscordConfig, freeEightsVoiceKey, freeEightsWaitingRoomReady } from "./free-eights-discord.js";
import { freeEightsCapacity, freeEightsTeamSize, eightsMajorityVotes } from "../src/lib/freeEightsFormat.js";
import { eightsGameId } from "../src/lib/freeEightsGames.js";
import { captainDraftSide, captainDraftTurn, captainDraftPlayerIds } from "../src/lib/freeEightsCaptainDraft.js";
import { matchfinderPostExpiresAt } from "../src/lib/matchfinderPosts.js";

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
export const clearedCaptainDraft = () => ({ free_eights_captain_draft: null, free_eights_captain_vote_ids: [] });

// The enrollment lock serializes drafts with joins and expiry. The row lock
// makes votes, picks and final team assignments atomic across API workers.
async function mutate(db, matchId, action) {
  if (typeof matchId !== "string" || !matchId || matchId.length > 200) fail("Free 8s match ID required", 400);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free8s-enrollment:${matchId}`}))`;
    await tx.$executeRaw`SELECT id FROM "Wager" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.wager.findUnique({ where: { id: matchId } });
    const match = serializeRow(row);
    if (match?.match_type !== "8s") fail("Free 8s lobby not found", 404);
    if (match.status !== "open" || match.roster_locked || matchfinderPostExpiresAt(match) <= Date.now()) fail("This lobby is no longer open for captain selection");
    const rows = await tx.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: matchId } }, orderBy: { created_date: "asc" } });
    const players = rows.map(serializeRow);
    const save = async (changes) => serializeRow(await tx.wager.update({ where: { id: matchId }, data: { metadata: { ...row.metadata, ...changes } } }));
    return action({ tx, match, rows, players, save });
  }, { timeout: 15000, maxWait: 5000 });
}

const completeRoster = (match, players) => players.length === freeEightsCapacity(match)
  && players.every((player) => player.user_id) && new Set(players.map((player) => player.user_id)).size === players.length;
const windowClosed = (match) => match.roster_lock_deadline && Date.parse(match.roster_lock_deadline) <= Date.now();
const member = (players, userId) => { if (!players.some((player) => player.user_id === userId)) fail("Only lobby players can vote or pick", 403); };

export async function voteFreeEightsCaptainDraft(db, userId, matchId, agree) {
  if (typeof agree !== "boolean") fail("Choose whether to agree to captain selection", 400);
  return mutate(db, matchId, async ({ match, players, save }) => {
    member(players, userId);
    if (match.free_eights_captain_draft) fail("Captain selection has already been approved");
    if (windowClosed(match)) fail("The team selection window has closed");
    const rosterIds = new Set(players.map((player) => player.user_id));
    const votes = new Set((match.free_eights_captain_vote_ids || []).filter((id) => rosterIds.has(id)));
    if (agree) votes.add(userId); else votes.delete(userId);
    const approved = votes.size >= eightsMajorityVotes(match);
    const wager = await save({
      free_eights_captain_vote_ids: [...votes],
      ...(approved ? {
        free_eights_captain_draft: { id: randomUUID(), status: "pending", approved_at: new Date().toISOString(), picks: [] },
        // Keep everyone in the waiting room until both drafted teams are complete.
        teams_generated_at: "", roster_lock_deadline: "", free_eights_waiting_for_voice: true,
        free_eights_team_balance: null, eights_team_override: null,
        eights_reshuffle_vote_user_ids: [], eights_reshuffle_vote_count: 0, eights_reshuffle_vote_status: null,
      } : {}),
    });
    return { success: true, wager, approved, vote_count: votes.size, required_votes: eightsMajorityVotes(match) };
  });
}

export async function startFreeEightsCaptainDraft(db, matchId, { randomIndex = randomInt, config = freeEightsDiscordConfig() } = {}) {
  return mutate(db, matchId, async ({ tx, match, players, save }) => {
    const draft = match.free_eights_captain_draft;
    if (draft?.status !== "pending") return { success: true, wager: match };
    if (!completeRoster(match, players)) return { success: true, wager: match, waiting_for_roster: true };
    const dispatch = await tx.discordEventDispatch.findUnique({ where: { event_key: freeEightsVoiceKey(matchId) } });
    if (!freeEightsWaitingRoomReady(config, match, players, dispatch?.metadata)) return { success: true, wager: match, waiting_for_voice: true };
    const pool = [...players];
    const alpha = pool.splice(randomIndex(pool.length), 1)[0];
    const bravo = pool.splice(randomIndex(pool.length), 1)[0];
    const wager = await save({
      host_id: alpha.user_id, host_name: alpha.user_name, host_team_name: "Team Alpha",
      challenger_id: bravo.user_id, challenger_name: bravo.user_name, challenger_team_name: "Team Bravo",
      free_eights_waiting_for_voice: false,
      free_eights_captain_draft: { ...draft, status: "active", started_at: new Date().toISOString(),
        roster_ids: players.map((player) => player.user_id), captains: { host: alpha.user_id, challenger: bravo.user_id }, picks: [] },
    });
    return { success: true, wager, started: true };
  });
}

export async function pickFreeEightsCaptainPlayer(db, userId, matchId, input, { selectMaps } = {}) {
  return mutate(db, matchId, async ({ tx, match, rows, players, save }) => {
    member(players, userId);
    const draft = match.free_eights_captain_draft;
    if (draft?.status !== "active") fail("There is no active captain draft");
    if (input.draft_id !== draft.id || !Number.isInteger(input.expected_pick) || input.expected_pick !== draft.picks.length) fail("The draft changed. Refresh the room before picking again");
    const side = captainDraftSide(draft, userId);
    if (!side || side !== captainDraftTurn(draft)) fail("Wait for your captain turn", 403);
    if (!completeRoster(match, players) || players.some((player) => !draft.roster_ids.includes(player.user_id))) fail("The roster changed. Reopen the lobby before drafting");
    const assigned = ["host", "challenger"].flatMap((team) => captainDraftPlayerIds(draft, team));
    if (typeof input.player_id !== "string" || !draft.roster_ids.includes(input.player_id) || assigned.includes(input.player_id)) fail("Choose one available player", 400);
    if (captainDraftPlayerIds(draft, side).length >= freeEightsTeamSize(match)) fail("Your team is full");
    const stamp = new Date().toISOString();
    const next = { ...draft, picks: [...draft.picks, { side, user_id: input.player_id, picked_by: userId, picked_at: stamp }] };
    const completed = next.picks.length === players.length - 2;
    let changes = {};
    if (completed) {
      const alphaIds = captainDraftPlayerIds(next, "host");
      const skills = await loadFreeEightsSkills(tx, players.map((player) => player.user_id), eightsGameId(match.game_id));
      for (const row of rows) {
        const id = row.metadata.user_id, team = alphaIds.includes(id) ? "host" : "challenger";
        await tx.wagerParticipant.update({ where: { id: row.id }, data: { metadata: { ...row.metadata,
          team, team_name: team === "host" ? "Team Alpha" : "Team Bravo", is_captain: id === draft.captains[team],
          free_eights_elo: skills[id].free_eights_elo, screenshot_rank: skills[id].screenshot_rank,
        } } });
      }
      const maps = match.series_maps?.length ? null : selectMaps?.(match);
      if (!match.series_maps?.length && !maps?.length) fail("Match maps are unavailable. Try the final pick again", 503);
      changes = {
        ...(maps ? { series_maps: maps.map((map) => map.name), series_modes: maps.map((map) => map.mode),
          series_images: maps.map((map) => map.image || ""), series_mode_labels: maps.map((map) => map.mode_name || map.mode),
          final_map_id: maps[0]?.id || "", final_map_name: maps[0]?.name || "" } : {}),
        teams_generated_at: stamp, roster_locked: true, roster_lock_deadline: "", status: "in_progress",
        match_started_date: stamp, accepted_date: match.accepted_date || stamp,
        free_eights_waiting_for_voice: false, free_eights_team_balance: { strategy: "captain-draft-v1" },
      };
      next.status = "completed"; next.completed_at = stamp;
    }
    const wager = await save({ ...changes, free_eights_captain_draft: next });
    return { success: true, wager, completed };
  });
}
