import { serializeRow } from "./entity.js";
import { publishEightsLobbyUpdate } from "./eights-live.js";
import { wagerCancellationNotification } from "./wager-cancellation-notifications.js";
import { MATCHFINDER_POST_LIFETIME_MS, matchfinderPostExpiresAt } from "../src/lib/matchfinderPosts.js";

const matchEntities = { Wager: "wager", RankedMatch: "rankedMatch", XPMatch: "xPMatch" };
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const reason = "Automatically cancelled after 30 minutes in matchfinder";

export function isExpiredOpenMatch(match, now = Date.now()) {
  return match?.status === "open" && matchfinderPostExpiresAt(match) <= now;
}

async function refundExpiredEscrow(tx, match, participants, stamp) {
  // Refund, ledger entry, released marker and cancellation commit together.
  // Sorting payer IDs keeps wallet lock order consistent across workers.
  for (const row of [...participants].sort((a, b) => String(a.metadata?.paid_by || a.metadata?.user_id).localeCompare(String(b.metadata?.paid_by || b.metadata?.user_id)))) {
    const player = row.metadata || {};
    const stake = money(player.entry_fee_paid);
    if (stake <= 0 || player.escrow_released === true || !(player.escrowed === true || player.escrow_transaction_id)) continue;
    const userId = player.paid_by || player.user_id;
    if (!userId) throw new Error("Escrow payer is missing");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`matchfinder-refund:${userId}`}))`;
    let wallet = await tx.wallet.findFirst({ where: field("user_id", userId), orderBy: { created_date: "asc" } });
    if (!wallet) throw new Error("Escrow wallet is missing");
    await tx.$executeRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
    wallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
    const balance = wallet.metadata || {};
    const available = money(money(balance.available_balance) + stake);
    await tx.wallet.update({ where: { id: wallet.id }, data: { metadata: {
      ...balance, available_balance: available,
      withdrawable_balance: money(money(balance.withdrawable_balance) + stake),
      pending_balance: money(Math.max(0, money(balance.pending_balance) - stake)),
      escrow_balance: money(Math.max(0, money(balance.escrow_balance) - stake)),
    } } });
    await tx.user.update({ where: { id: userId }, data: { wallet_balance: available } });
    await tx.walletTransaction.create({ data: { metadata: {
      user_id: userId, wallet_id: wallet.id, status: "completed", type: "wager_refund",
      amount: stake, balance_before: money(balance.available_balance), balance_after: available,
      description: reason, reference_type: "Wager", reference_id: match.id, created_date: stamp,
    } } });
    await tx.wagerParticipant.update({ where: { id: row.id }, data: { metadata: {
      ...player, escrow_released: true, escrow_released_date: stamp,
    } } });
  }
}

export async function cancelExpiredMatchfinderPost(db, entity, id, { now = Date.now(), publish = publishEightsLobbyUpdate } = {}) {
  const delegate = matchEntities[entity];
  if (!delegate) throw new Error("Unsupported matchfinder entity");
  const result = await db.$transaction(async (tx) => {
    // Recheck after locking: a stale candidate must not cancel a started match.
    if (entity === "Wager") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`free8s-enrollment:${id}`}))`;
      await tx.$executeRaw`SELECT id FROM "Wager" WHERE id = ${id} FOR UPDATE`;
    } else if (entity === "RankedMatch") await tx.$executeRaw`SELECT id FROM "RankedMatch" WHERE id = ${id} FOR UPDATE`;
    else await tx.$executeRaw`SELECT id FROM "XPMatch" WHERE id = ${id} FOR UPDATE`;
    const row = await tx[delegate].findUnique({ where: { id } });
    const match = serializeRow(row);
    if (!isExpiredOpenMatch(match, now)) return null;
    const stamp = new Date(now).toISOString();
    const participants = entity === "Wager" ? await tx.wagerParticipant.findMany({ where: field("wager_id", id) }) : [];
    if (entity === "Wager" && match.match_type !== "8s") await refundExpiredEscrow(tx, match, participants, stamp);
    const eights = entity === "Wager" && ["8s", "money8s"].includes(match.match_type);
    const updated = await tx[delegate].update({ where: { id }, data: { metadata: {
      ...row.metadata, status: "cancelled", posted_to_matchfinder: false,
      cancel_reason: reason, cancelled_by: "system:matchfinder-expiry", cancelled_by_name: "Topfragg",
      cancelled_date: stamp, matchfinder_expired_at: new Date(matchfinderPostExpiresAt(match)).toISOString(),
      ...(eights ? {
        roster_locked: true, roster_lock_deadline: "", free_eights_waiting_for_voice: false,
        eights_score_vote_status: "cancelled", eights_score_vote_count: 0, eights_score_vote_user_ids: [],
        eights_reshuffle_vote_status: null, eights_reshuffle_vote_count: 0, eights_reshuffle_vote_user_ids: [],
      } : {}),
    } } });
    const recipients = new Set([
      match.host_id, match.challenger_id, ...participants.map((player) => player.metadata?.user_id),
      ...(match.team_alpha_player_ids || []), ...(match.team_bravo_player_ids || []),
    ].filter(Boolean));
    const notification = entity === "Wager" ? wagerCancellationNotification(match) : {
      title: `${entity === "XPMatch" ? "XP" : "Ranked"} match cancelled`,
      message: reason, type: "match", action_url: entity === "XPMatch" ? "/xp" : "/ranked",
      related_entity_type: entity, related_entity_id: id,
    };
    for (const userId of recipients) await tx.notification.create({ data: { metadata: {
      ...notification, user_id: userId, is_read: false, created_date: stamp,
    } } });
    return { match: serializeRow(updated), eights };
  }, { timeout: 15000, maxWait: 5000 });
  if (result?.eights) publish(id, "cancelled");
  return result?.match || null;
}

export async function sweepExpiredMatchfinderPosts(db, { withLock = (_key, operation) => operation(), onError = console.error, now = Date.now() } = {}) {
  let cancelled = 0;
  for (const [entity, delegate] of Object.entries(matchEntities)) {
    const candidates = await db[delegate].findMany({ where: { AND: [
      field("status", "open"), { created_date: { lte: new Date(now - MATCHFINDER_POST_LIFETIME_MS) } },
    ] }, orderBy: { created_date: "asc" }, take: 100, select: { id: true } });
    for (const { id } of candidates) {
      try {
        const prefix = entity === "Wager" ? "wager" : entity === "XPMatch" ? "xp" : "ranked";
        const result = await withLock(`${prefix}-accept:${id}`, () => cancelExpiredMatchfinderPost(db, entity, id, { now }));
        if (result) cancelled++;
      } catch (error) { onError("[Matchfinder expiry] Cancellation failed; will retry", { entity, id, error: error.message }); }
    }
  }
  return cancelled;
}

export function startMatchfinderExpiryWorker(sweep, { intervalMs = 5000, onError = console.error } = {}) {
  let running = null;
  const tick = () => {
    if (!running) running = Promise.resolve().then(sweep)
      .catch((error) => onError("[Matchfinder expiry] Sweep failed; will retry", error.message))
      .finally(() => { running = null; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return async () => { clearInterval(timer); await running; };
}
