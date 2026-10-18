import { serializeRow } from "./entity.js";
import { hasRole } from "./roles.js";
import { clearedCaptainDraft } from "./free-eights-captain-draft.js";
import { eightsMajorityVotes } from "../src/lib/freeEightsFormat.js";
import { eightsGameId } from "../src/lib/freeEightsGames.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;

export async function removeFreeEightsPlayer(db, actor, matchId, input = {}) {
  if (!hasRole(actor, "admin")) fail("Admin access is required", 403);
  if (!validId(matchId) || !validId(input.player_id) || !validId(input.participant_id)) fail("Select a player from this Free 8s lobby");
  const rawReason = input.reason === undefined ? "" : input.reason;
  if (typeof rawReason !== "string" || rawReason.trim().length > 500) fail("The reason must be at most 500 characters");
  const reason = rawReason.trim() || "Removed from this lobby by staff.";
  return db.$transaction(async (tx) => {
    // Match the join lock order. A removed account is released atomically and
    // a replacement cannot join while the roster is being reopened.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free8s-membership:${input.player_id}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`voice-membership:${input.player_id}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free8s-enrollment:${matchId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-free-eights-elo'))`;
    await tx.$executeRaw`SELECT id FROM "Wager" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.wager.findUnique({ where: { id: matchId } });
    const match = serializeRow(row);
    if (match?.match_type !== "8s") fail("Free 8s lobby not found", 404);
    if (!["open", "in_progress"].includes(match.status) || match.completed || match.free_eights_elo_applied_at
      || match.scores_confirmed || ["pending", "approved"].includes(match.eights_score_vote_status) || match.dispute_id) {
      fail("Resolve the score report or reset this lobby before removing a player. Completed matches cannot be changed.", 409);
    }
    const rows = await tx.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: matchId } }, orderBy: { created_date: "asc" } });
    const target = rows.find((player) => player.id === input.participant_id && player.metadata?.user_id === input.player_id);
    if (!target) fail("This player has already left or their lobby entry changed. Refresh the room.", 409);
    const remaining = rows.filter((player) => player.id !== target.id);
    const stamp = new Date().toISOString();
    const removedIds = [...new Set([...(Array.isArray(match.free_eights_removed_user_ids) ? match.free_eights_removed_user_ids : []), input.player_id])];
    const captain = (side, previous) => remaining.find((player) => player.metadata.team === side && player.metadata.user_id === previous)
      || remaining.find((player) => player.metadata.team === side);
    const alpha = captain("host", match.host_id), bravo = captain("challenger", match.challenger_id);
    await tx.wagerParticipant.delete({ where: { id: target.id } });
    for (const player of remaining) {
      await tx.wagerParticipant.update({ where: { id: player.id }, data: { metadata: { ...player.metadata,
        is_captain: player.id === alpha?.id || player.id === bravo?.id,
      } } });
    }
    const metadata = {
      ...row.metadata, ...clearedCaptainDraft(),
      host_id: alpha?.metadata.user_id || "", host_name: alpha?.metadata.user_name || "",
      challenger_id: bravo?.metadata.user_id || "", challenger_name: bravo?.metadata.user_name || "",
      status: "open", roster_locked: false, roster_lock_deadline: "", match_started_date: "", teams_generated_at: "",
      free_eights_waiting_for_voice: false, free_eights_team_balance: null, eights_team_override: null,
      series_maps: [], series_modes: [], series_images: [], series_mode_labels: [], final_map_id: "", final_map_name: "",
      eights_reshuffle_vote_user_ids: [], eights_reshuffle_vote_count: 0, eights_reshuffle_vote_required: eightsMajorityVotes(match),
      eights_reshuffle_vote_status: null, eights_reshuffle_vote_started_date: null,
      eights_score_vote_user_ids: [], eights_score_vote_count: 0, eights_score_vote_status: null,
      free_eights_removed_user_ids: removedIds,
      // A live room may already be over an hour old. Give replacements a full
      // lobby window without rewriting the match's creation/history timestamp.
      free_eights_reopened_at: stamp, posted_to_matchfinder: true,
    };
    const wager = serializeRow(await tx.wager.update({ where: { id: matchId }, data: { metadata } }));
    const targetName = target.metadata.user_name || "Player";
    await tx.adminAction.create({ data: { metadata: {
      action_type: "free_eights_player_kicked", admin_id: actor.id,
      admin_name: actor.display_name || actor.full_name || actor.username || "Admin",
      target_user_id: input.player_id, target_user_name: targetName, match_id: matchId, reason,
      description: `${targetName} was removed from Free 8s. The room remains open for a replacement.`,
      details: { reason, previous_status: match.status, participant_id: target.id, remaining_players: remaining.length },
    } } });
    await tx.notification.create({ data: { metadata: {
      user_id: input.player_id, title: "Removed from Free 8s lobby", message: reason, type: "match", is_read: false,
      action_url: `/ranked/8s?game=${eightsGameId(match)}`, related_entity_id: matchId, related_entity_type: "Wager",
    } } });
    return { success: true, wager, removed_player_id: input.player_id, removed_player_name: targetName };
  }, { timeout: 15000, maxWait: 5000 });
}
