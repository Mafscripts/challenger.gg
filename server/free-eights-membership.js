import { dataForEntity, serializeRow } from "./entity.js";
import { matchfinderPostExpiresAt } from "../src/lib/matchfinderPosts.js";

const terminalStatuses = ["completed", "cancelled", "expired", "closed"];
const field = (key, value) => ({ metadata: { path: [key], equals: value } });

export async function findActiveFreeEightsMatch(db, userId, { excludeMatchId, membershipIds } = {}) {
  const ids = membershipIds ?? (await db.wagerParticipant.findMany({ where: field("user_id", userId), select: { metadata: true } }))
    .map((row) => row.metadata?.wager_id).filter((id) => typeof id === "string" && id);
  const rows = await db.wager.findMany({ where: { AND: [
    field("match_type", "8s"),
    { OR: [{ id: { in: [...new Set(ids)] } }, field("host_id", userId), field("challenger_id", userId)] },
    { NOT: terminalStatuses.map((status) => field("status", status)) },
    ...(excludeMatchId ? [{ id: { not: excludeMatchId } }] : []),
  ] }, orderBy: { created_date: "desc" }, take: 1 });
  return rows[0] || null;
}

const activeError = (match) => ({ success: false, code: "FREE_EIGHTS_ACTIVE_MATCH",
  error: "Finish and confirm the result of your current Free 8s match before joining another lobby.",
  active_match_id: match.id, action_url: `/8s-match/${encodeURIComponent(match.id)}` });

// Check + enrollment share one transaction and per-account PostgreSQL lock.
// No network/voice operations hold the transaction or use a second connection.
export async function createFreeEightsLobby(db, userId, payload, userName) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free8s-membership:${userId}`}))`;
    const active = await findActiveFreeEightsMatch(tx, userId);
    if (active) return activeError(active);
    const match = await tx.wager.create({ data: dataForEntity("Wager", { ...payload, match_type: "8s", host_id: userId, status: "open" }) });
    await tx.wagerParticipant.create({ data: dataForEntity("WagerParticipant", {
      wager_id: match.id, user_id: userId, user_name: userName, team: "host", is_captain: true,
      entry_fee_paid: 0, payment_status: "paid", paid_by: userId, escrowed: false,
      joined_date: new Date().toISOString(),
    }) });
    return { success: true, wager: serializeRow(match), wager_id: match.id };
  }, { timeout: 15_000, maxWait: 5_000 });
}

export async function joinFreeEightsLobby(db, userId, matchId, userName) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free8s-membership:${userId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free8s-enrollment:${matchId}`}))`;
    const match = await tx.wager.findUnique({ where: { id: matchId } });
    if (match?.metadata?.match_type !== "8s" || match.metadata.status !== "open") return { success: false, error: "Free 8s lobby is not open" };
    if (matchfinderPostExpiresAt(serializeRow(match)) <= Date.now()) return { success: false, code: "MATCH_CANCELLED", error: "This Free 8s lobby expired after 30 minutes. Join or create another match." };
    const rows = await tx.wagerParticipant.findMany({ where: field("wager_id", matchId), orderBy: { created_date: "asc" } });
    const existing = rows.find((row) => row.metadata?.user_id === userId);
    if (existing) return { success: true, rejoined: true, wager: serializeRow(match), wager_id: matchId };
    const active = await findActiveFreeEightsMatch(tx, userId, { excludeMatchId: matchId });
    if (active) return activeError(active);
    if (rows.length >= 8) return { success: false, error: "This 8s lobby is full" };
    const hosts = rows.filter((row) => row.metadata.team === "host").length;
    const challengers = rows.filter((row) => row.metadata.team === "challenger").length;
    const team = hosts <= challengers ? "host" : "challenger";
    const participant = await tx.wagerParticipant.create({ data: dataForEntity("WagerParticipant", {
      wager_id: matchId, user_id: userId, user_name: userName, team,
      is_captain: team === "challenger" && challengers === 0,
      entry_fee_paid: 0, payment_status: "paid", paid_by: userId, escrowed: false,
      joined_date: new Date().toISOString(),
    }) });
    return { success: true, participant: serializeRow(participant), enrolled: rows.map(serializeRow) };
  }, { timeout: 15_000, maxWait: 5_000 });
}
