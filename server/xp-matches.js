import { serializeRow } from "./entity.js";
import { randomUUID } from "node:crypto";
import { isExpiredOpenMatch } from "./matchfinder-expiry.js";
import { completeXPMatchRoster, normalizeMatchXP, xpMatchOutcome, xpMatchRoster, xpMatchStrength, xpMatchTeamSize } from "../src/lib/xpMatchRating.js";

const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const error = (message) => ({ success: false, error: message });
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || "Player";
const stamp = () => new Date().toISOString();

export async function getXPStandings(db) {
  const rows = await db.xPStats.findMany({ orderBy: { created_date: "desc" }, select: { id: true, metadata: true } });
  const latest = new Map();
  for (const row of rows) {
    const stats = row.metadata || {};
    if (!stats.user_id || latest.has(stats.user_id)) continue;
    latest.set(stats.user_id, { id: row.id, user_id: stats.user_id, username: stats.username || "Player",
      total_xp: normalizeMatchXP(stats.total_xp), wins: normalizeMatchXP(stats.wins), losses: normalizeMatchXP(stats.losses),
      win_streak: normalizeMatchXP(stats.win_streak) });
  }
  return [...latest.values()].filter((row) => row.total_xp + row.wins + row.losses > 0)
    .sort((a, b) => b.total_xp - a.total_xp || b.wins - a.wins || String(a.user_id).localeCompare(String(b.user_id)));
}

export async function getXPMatchPlayerRanks(db, matchId) {
  if (typeof matchId !== "string" || !matchId || matchId.length > 200) return error("XP match is required");
  const row = await db.xPMatch.findUnique({ where: { id: matchId }, select: { metadata: true } });
  if (!row) return error("XP match not found");
  const roster = new Set([...xpMatchRoster(row.metadata, "alpha"), ...xpMatchRoster(row.metadata, "bravo")]);
  const standings = await getXPStandings(db);
  const ranks = Object.fromEntries([...roster].map((id) => [id, null]));
  standings.forEach((player, index) => { if (roster.has(player.user_id)) ranks[player.user_id] = index + 1; });
  return { success: true, ranks };
}

export async function activeXPMatchFor(db, userId, excludeId = "") {
  const rows = await db.xPMatch.findMany({ where: { AND: [
    ...(excludeId ? [{ id: { not: excludeId } }] : []),
    { NOT: ["completed", "cancelled", "expired", "closed"].map((status) => field("status", status)) },
    { OR: [field("host_id", userId), field("challenger_id", userId),
      { metadata: { path: ["team_alpha_player_ids"], array_contains: [userId] } },
      { metadata: { path: ["team_bravo_player_ids"], array_contains: [userId] } }] },
  ] }, orderBy: { created_date: "desc" } });
  return rows.map(serializeRow).find((match) => !isExpiredOpenMatch(match)) || null;
}

async function partyConflict(tx, ids, excludeId) {
  if (!ids.length || new Set(ids).size !== ids.length) return error("Select a complete, distinct XP party");
  for (const id of ids) {
    if (await activeXPMatchFor(tx, id, excludeId)) return error("You or a teammate already have an active XP match. Finish or cancel it first.");
  }
  return null;
}

async function loadStats(tx, ids) {
  const rows = await tx.xPStats.findMany({ where: { OR: ids.map((id) => field("user_id", id)) }, orderBy: { created_date: "desc" } });
  const byUser = new Map();
  for (const row of rows) if (!byUser.has(row.metadata.user_id)) byUser.set(row.metadata.user_id, row);
  return byUser;
}

async function captureStrength(tx, match) {
  const ids = [...xpMatchRoster(match, "alpha"), ...xpMatchRoster(match, "bravo")];
  const stats = await loadStats(tx, ids);
  return xpMatchStrength(match, Object.fromEntries(ids.map((id) => [id, stats.get(id)?.metadata?.total_xp])));
}

export async function createXPMatchLobby(db, payload, party) {
  if (party.size !== party.ids.length || party.size > xpMatchTeamSize(payload) || !party.ids.includes(payload.host_id)) return error("Select a complete XP party that fits this match");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-xp-enrollment'))`;
    const conflict = await partyConflict(tx, party.ids);
    if (conflict) return conflict;
    const match = serializeRow(await tx.xPMatch.create({ data: { metadata: {
      ...payload, match_type: "xp", host_party_team_id: party.team?.id || "",
      team_alpha_player_ids: party.ids, team_alpha_player_names: party.names,
      team_alpha_party_sizes: [party.size], joined_players: party.size,
    } } }));
    return { success: true, xp_match: match, xp_match_id: match.id, match };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function joinXPMatchLobby(db, matchId, party, pickMap) {
  if (party.size !== party.ids.length || ![1, 2, 3, 4].includes(party.size)) return error("Invalid XP party size");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-xp-enrollment'))`;
    await tx.$executeRaw`SELECT id FROM "XPMatch" WHERE id = ${matchId} FOR UPDATE`;
    const row = await tx.xPMatch.findUnique({ where: { id: matchId } });
    const match = serializeRow(row);
    if (!match || match.status !== "open") return error("XP match is not open");
    if (isExpiredOpenMatch(match)) return error("This XP lobby expired. Join or create another match.");
    const alpha = xpMatchRoster(match, "alpha"), bravo = xpMatchRoster(match, "bravo");
    const existing = [...alpha, ...bravo];
    if (party.ids.some((id) => existing.includes(id))) return error("You or a teammate are already in this XP match");
    const conflict = await partyConflict(tx, party.ids, matchId);
    if (conflict) return conflict;
    const size = xpMatchTeamSize(match);
    const side = ["alpha", "bravo"].filter((key) => xpMatchRoster(match, key).length + party.size <= size)
      .sort((a, b) => xpMatchRoster(match, a).length - xpMatchRoster(match, b).length)[0];
    if (!side) return error("This party no longer fits the available team slots");
    const currentNames = match[`team_${side}_player_names`] || (side === "alpha" ? [match.host_name] : []);
    const updated = { ...match,
      [`team_${side}_player_ids`]: [...xpMatchRoster(match, side), ...party.ids],
      [`team_${side}_player_names`]: [...currentNames, ...party.names],
      [`team_${side}_party_sizes`]: [...(match[`team_${side}_party_sizes`] || xpMatchRoster(match, side).map(() => 1)), party.size],
      ...(side === "bravo" && !match.challenger_id ? { challenger_id: party.ids[0], challenger_name: party.names[0], challenger_party_team_id: party.team?.id || "" } : {}),
      joined_players: existing.length + party.size, total_players: size * 2,
    };
    const full = completeXPMatchRoster(updated);
    const selected = full ? pickMap(match.game_mode) : null;
    const metadata = { ...row.metadata, ...updated, status: full ? "accepted" : "open", posted_to_matchfinder: !full,
      ...(full ? { xp_strength_snapshot: await captureStrength(tx, updated), match_started_date: stamp(),
        match_start_deadline: new Date(Date.now() + 15 * 60000).toISOString() } : {}),
      ...(selected ? { maps: selected.pool, final_map_id: selected.id, final_map_name: selected.name } : {}),
    };
    delete metadata.id; delete metadata.updated_date;
    const saved = serializeRow(await tx.xPMatch.update({ where: { id: matchId }, data: { metadata } }));
    return { success: true, xp_match_id: matchId, match: saved, roster_full: full };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function cancelXPMatchLobby(db, id, actorId, staffOverride) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-xp-enrollment'))`;
    await tx.$executeRaw`SELECT id FROM "XPMatch" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.xPMatch.findUnique({ where: { id } });
    if (!row) return error("XP match not found");
    const match = row.metadata;
    if (match.host_id !== actorId && !staffOverride) return error("Only the host or staff can cancel this XP match");
    if (["completed", "cancelled", "expired", "closed"].includes(match.status)) return error("This XP match can no longer be cancelled");
    if (!staffOverride && (match.challenger_id || xpMatchRoster(match, "bravo").length)) return error("Send a cancellation request. The opposing captain must accept before this match can be cancelled.");
    if (!staffOverride && match.status !== "open") return error("Only an unmatched open XP post can be removed directly");
    const saved = await tx.xPMatch.update({ where: { id }, data: { metadata: {
      ...match, status: "cancelled", posted_to_matchfinder: false, cancelled_date: stamp(),
    } } });
    return { success: true, match: serializeRow(saved) };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function requestXPMatchCancellation(db, id, actorId) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "XPMatch" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.xPMatch.findUnique({ where: { id } });
    if (!row) return error("XP match not found");
    const match = row.metadata;
    if (["completed", "cancelled", "expired", "closed", "score_conflict", "disputed"].includes(match.status)) return error("This match cannot receive a cancellation request. Contact staff for a dispute.");
    if (![match.host_id, match.challenger_id].includes(actorId)) return error("Only team captains can request cancellation");
    if (!match.challenger_id) return error("There is no opposing captain yet. Remove your open post instead.");
    if (match.xp_cancel_request?.status === "pending") return error("A cancellation request is already waiting for the opposing captain");
    if (match.xp_cancel_request?.status === "declined") return error("Cancellation was declined. This match must be played.");
    const recipientId = actorId === match.host_id ? match.challenger_id : match.host_id;
    const request = { id: randomUUID(), requested_by: actorId, recipient_id: recipientId, requested_at: stamp(), status: "pending" };
    const saved = await tx.xPMatch.update({ where: { id }, data: { metadata: { ...match, match_type: "xp", xp_cancel_request: request } } });
    return { success: true, match: serializeRow(saved), notify_user_id: recipientId };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function respondXPMatchCancellation(db, id, actorId, requestId, decision) {
  if (!["accept", "decline"].includes(decision)) return error("Accept or decline the cancellation request");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "XPMatch" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.xPMatch.findUnique({ where: { id } });
    if (!row) return error("XP match not found");
    const match = row.metadata, request = match.xp_cancel_request;
    if (["completed", "cancelled", "expired", "closed", "score_conflict", "disputed"].includes(match.status)) return error("This match has changed. Refresh the room.");
    if (!requestId || request?.id !== requestId || request.status !== "pending") return error("This cancellation request is no longer pending");
    if (request.recipient_id !== actorId || request.requested_by === actorId || ![match.host_id, match.challenger_id].includes(actorId)) return error("Only the opposing captain can answer this request");
    const accepted = decision === "accept";
    const saved = await tx.xPMatch.update({ where: { id }, data: { metadata: {
      ...match, xp_cancel_request: { ...request, status: accepted ? "accepted" : "declined", responded_by: actorId, responded_at: stamp() },
      ...(accepted ? { status: "cancelled", posted_to_matchfinder: false, cancelled_date: stamp(), cancellation_reason: "Both captains agreed to cancel" } : {}),
    } } });
    return { success: true, cancelled: accepted, match: serializeRow(saved), notify_user_id: request.requested_by };
  }, { timeout: 15000, maxWait: 15000 });
}

export async function submitXPMatchResult(db, actor, input, staffOverride = false) {
  const id = input.xp_match_id || input.match_id || input.ranked_match_id;
  return db.$transaction(async (tx) => {
    // Reports, every player's XP and completion commit together, once across workers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-xp-results'))`;
    await tx.$executeRaw`SELECT id FROM "XPMatch" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.xPMatch.findUnique({ where: { id } });
    if (!row) return error("XP match not found");
    const match = row.metadata;
    const isCaptain = [match.host_id, match.challenger_id].includes(actor.id);
    if (!isCaptain && !staffOverride) return error("Only captains or staff can submit scores");
    if (match.status === "completed") return { success: true, already_completed: true, match: serializeRow(row) };
    if (["cancelled", "expired", "closed"].includes(match.status)) return error("XP match is closed");
    if (!completeXPMatchRoster(match)) return error("Both XP teams must be complete before reporting a result");
    if (["disputed", "score_conflict"].includes(match.status) && !staffOverride) return error("This XP match is under dispute review");
    const alphaScore = Number(input.team_alpha_score), bravoScore = Number(input.team_bravo_score);
    const bestOf = [1, 3, 5].includes(Number(match.best_of)) ? Number(match.best_of) : 1;
    const winsNeeded = Math.floor(bestOf / 2) + 1;
    if (!Number.isInteger(alphaScore) || !Number.isInteger(bravoScore) || Math.min(alphaScore, bravoScore) < 0
      || Math.max(alphaScore, bravoScore) !== winsNeeded || alphaScore === bravoScore) return error(`Invalid BO${bestOf} score`);
    const winningSide = alphaScore > bravoScore ? "alpha" : "bravo";
    const winnerId = winningSide === "alpha" ? match.host_id : match.challenger_id;
    const staffDecision = Boolean(staffOverride && input.winner_id);
    if (staffDecision && input.winner_id !== winnerId) return error("Winner does not match the reported score");
    if (!isCaptain && !staffDecision) return error("Choose a winner to resolve this match as staff");
    const update = async (patch) => serializeRow(await tx.xPMatch.update({ where: { id }, data: { metadata: { ...match, ...patch } } }));
    if (!staffDecision && !match.reported_score_by) {
      const saved = await update({ status: actor.id === match.host_id ? "awaiting_challenger_report" : "awaiting_host_report",
        reported_score_alpha: alphaScore, reported_score_bravo: bravoScore, reported_score_by: actor.id, proof_urls: input.proof_urls || [] });
      return { success: true, status: saved.status, match: saved, message: "Waiting for opponent confirmation." };
    }
    if (!staffDecision && match.reported_score_by === actor.id) return error("Wait for the opposing captain to confirm the score");
    if (!staffDecision && (Number(match.reported_score_alpha) !== alphaScore || Number(match.reported_score_bravo) !== bravoScore)) {
      const saved = await update({ status: "score_conflict" });
      return { success: true, status: saved.status, match: saved };
    }
    const ids = [...xpMatchRoster(match, "alpha"), ...xpMatchRoster(match, "bravo")];
    let stats = await loadStats(tx, ids);
    // Lock existing progression rows before reading balances used for the update.
    for (const statsId of [...stats.values()].map((entry) => entry.id).sort()) {
      await tx.$executeRaw`SELECT id FROM "XPStats" WHERE id = ${statsId} FOR UPDATE`;
    }
    stats = await loadStats(tx, ids);
    const users = await tx.user.findMany({ where: { id: { in: ids } } });
    const usersById = new Map(users.map((user) => [user.id, user]));
    if (users.length !== ids.length) return error("An XP match player no longer exists");
    const frozen = match.xp_strength_snapshot;
    const validSnapshot = frozen?.version === 1 && Object.keys(frozen.players || {}).length === ids.length
      && ids.every((userId) => Object.hasOwn(frozen.players || {}, userId));
    const strength = xpMatchStrength(match, validSnapshot ? frozen.players
      : Object.fromEntries(ids.map((userId) => [userId, stats.get(userId)?.metadata?.total_xp])), validSnapshot ? frozen.captured_at : stamp());
    const outcome = xpMatchOutcome(strength, winningSide);
    const winners = new Set(xpMatchRoster(match, winningSide));
    const changes = {};
    for (const userId of ids) {
      const previous = stats.get(userId);
      const current = previous?.metadata || {};
      const won = winners.has(userId);
      const before = normalizeMatchXP(current.total_xp);
      const after = Math.max(0, before + (won ? outcome.change : -outcome.change));
      const delta = after - before;
      const level = Math.floor(after / 1000) + 1;
      const metadata = { ...current, user_id: userId, username: nameFor(usersById.get(userId)),
        total_xp: after, current_xp: after % 1000, level, xp_to_next_level: 1000,
        weekly_xp: Math.max(0, Number(current.weekly_xp || 0) + delta),
        wins: Number(current.wins || 0) + (won ? 1 : 0), losses: Number(current.losses || 0) + (won ? 0 : 1),
        matches_played: Number(current.matches_played || 0) + 1, win_streak: won ? Number(current.win_streak || 0) + 1 : 0,
        last_played_date: stamp(), region: current.region || usersById.get(userId).region || "na", season: current.season || 1 };
      if (previous) await tx.xPStats.update({ where: { id: previous.id }, data: { metadata } });
      else await tx.xPStats.create({ data: { metadata } });
      await tx.user.update({ where: { id: userId }, data: { xp_level: level } });
      changes[userId] = { previous_xp: before, new_xp: after, delta, won, expected_change: won ? outcome.change : -outcome.change,
        own_team_average_xp: strength[`${won ? winningSide : winningSide === "alpha" ? "bravo" : "alpha"}_average_xp`],
        opponent_team_average_xp: won ? outcome.loser_average_xp : outcome.winner_average_xp };
    }
    const saved = await update({ status: "completed", match_type: "xp", posted_to_matchfinder: false,
      winner_id: winnerId, winner_name: nameFor(usersById.get(winnerId)), winner_score: Math.max(alphaScore, bravoScore), loser_score: Math.min(alphaScore, bravoScore),
      confirmed_score_alpha: alphaScore, confirmed_score_bravo: bravoScore, reported_score_alpha: alphaScore, reported_score_bravo: bravoScore,
      reported_score_by: actor.id, proof_urls: input.proof_urls || match.proof_urls || [],
      xp_changes: changes, xp_strength_snapshot: strength, xp_rating_outcome: outcome, match_completed_date: stamp() });
    return { success: true, winner_id: winnerId, winner_name: saved.winner_name, xp_changes: changes, match: saved };
  }, { timeout: 20000, maxWait: 15000 });
}
