import { loadRewardBonuses } from "./competition-rewards.js";
import { cashMatchMembershipFee } from "../src/lib/premiumMembership.js";
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const cents = (value) => Math.max(0, Math.round((Number(value) || 0) * 100));
const premium = (user) => user.is_premium && (!user.premium_expires || +new Date(user.premium_expires) > Date.now());
export async function settleWagerPayout(db, wager, winnerId, completion = null) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wager-payout:${wager.id}`}))`;
    await tx.$executeRaw`SELECT id FROM "Wager" WHERE id = ${wager.id} FOR UPDATE`;
    let stored = await tx.wager.findUnique({ where: { id: wager.id } });
    if (stored && completion && stored.metadata.status !== "completed") {
      if (["cancelled", "expired", "closed"].includes(stored.metadata.status) || ![stored.metadata.host_id, stored.metadata.challenger_id].includes(winnerId) || completion.status !== "completed" || completion.winner_id !== winnerId) throw new Error("This match cannot be paid out");
      stored = await tx.wager.update({ where: { id: wager.id }, data: { metadata: { ...stored.metadata, ...completion } } });
    }
    if (!stored || stored.metadata.status !== "completed" || stored.metadata.winner_id !== winnerId) throw new Error("A confirmed winning result is required before payout");
    wager = { ...stored.metadata, id: stored.id };
    if (stored.metadata.payout_applied_at) return { totalPot: stored.metadata.payout_total, winnerProfit: stored.metadata.winner_profit, walletChanges: stored.metadata.wallet_changes || {}, alreadyCompleted: Boolean(completion) };
    const participants = await tx.wagerParticipant.findMany({ where: field("wager_id", wager.id) });
    const paid = participants.filter((row) => cents(row.metadata.entry_fee_paid) > 0);
    const legacy = !paid.some((row) => row.metadata.escrowed === true || row.metadata.escrow_transaction_id);
    const side = winnerId === wager.host_id ? "host" : "challenger";
    const winners = new Set(participants.filter((row) => row.metadata.team === side).map((row) => row.metadata.user_id));
    winners.add(winnerId);
    const usersIds = [...new Set([...participants.map((row) => row.metadata.user_id), winnerId].filter(Boolean))].sort();
    for (const id of usersIds) await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
    const users = await tx.user.findMany({ where: { id: { in: usersIds } } }), byId = new Map(users.map((row) => [row.id, row]));
    const mode = wager.match_type === "money8s" ? "money8s" : "wagers";
    const bonuses = await loadRewardBonuses(tx, [...winners], mode, new Date(stored.metadata.match_completed_date || Date.now()));
    const total = legacy ? cents(wager.entry_fee ?? wager.amount) : paid.reduce((sum, row) => sum + cents(row.metadata.entry_fee_paid), 0);
    const winning = paid.filter((row) => row.metadata.team === side).sort((a, b) => a.id.localeCompare(b.id));
    const winnerStake = legacy ? 0 : winning.reduce((sum, row) => sum + cents(row.metadata.entry_fee_paid), 0);
    if (!legacy && !winnerStake) throw new Error("The winning roster has no recorded stake; staff must review this payout");
    const gross = new Map(), stakes = new Map(); let allocated = 0;
    if (legacy) gross.set(winnerId, total);
    else winning.forEach((row, index) => {
      const amount = index === winning.length - 1 ? total - allocated : Math.floor(total * cents(row.metadata.entry_fee_paid) / winnerStake);
      allocated += amount; gross.set(row.metadata.user_id, (gross.get(row.metadata.user_id) || 0) + amount);
    });
    if (!legacy) for (const row of paid) stakes.set(row.metadata.user_id, (stakes.get(row.metadata.user_id) || 0) + cents(row.metadata.entry_fee_paid));
    const changes = {}; let fees = 0;
    for (const id of usersIds) {
      const user = byId.get(id); if (!user) throw new Error("Payout player no longer exists");
      const won = winners.has(id), stake = stakes.get(id) || 0, payoutBeforeFee = gross.get(id) || 0;
      const bonus = won && total > 0 ? Number(bonuses[id]?.[mode === "money8s" ? "money8s_cash" : "wagers_cash"] || 0) : 0;
      const feeRate = won && mode === "wagers" ? cashMatchMembershipFee(premium(user), wager.entry_fee ?? wager.amount, bonuses[id]?.cash_fee || 0) : 0;
      // Tax the profit, never the player's returned stake. Each player's item
      // changes only their share; cents and the total pot stay deterministic.
      const fee = Math.round(Math.max(0, payoutBeforeFee - stake) * feeRate / 100), payout = payoutBeforeFee - fee + bonus;
      fees += fee;
      const rows = await tx.wallet.findMany({ where: field("user_id", id), orderBy: { created_date: "asc" }, take: 1 });
      let wallet = rows[0];
      if (!wallet) wallet = await tx.wallet.create({ data: { metadata: { user_id: id, available_balance: Number(user.wallet_balance || 0), withdrawable_balance: Number(user.wallet_balance || 0), pending_balance: 0, escrow_balance: 0, total_earnings: 0 } } });
      await tx.$executeRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;
      wallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
      const data = wallet.metadata, balance = cents(data.available_balance), after = balance + payout, profit = Math.max(0, payout - stake);
      await tx.wallet.update({ where: { id: wallet.id }, data: { metadata: { ...data, available_balance: after / 100,
        withdrawable_balance: (cents(data.withdrawable_balance) + payout) / 100, pending_balance: Math.max(0, cents(data.pending_balance) - stake) / 100,
        escrow_balance: Math.max(0, cents(data.escrow_balance) - stake) / 100, total_earnings: (cents(data.total_earnings) + profit) / 100 } } });
      await tx.user.update({ where: { id }, data: { wallet_balance: after / 100, lifetime_earnings: { increment: profit / 100 }, total_wager_earnings: { increment: profit / 100 } } });
      changes[id] = { won, stake: stake / 100, payout: payout / 100, gross_payout: payoutBeforeFee / 100, platform_fee: fee / 100, fee_percent: feeRate,
        reward_bonus: bonus / 100, match_delta: (payout - stake) / 100, previous_balance: (balance + stake) / 100, new_balance: after / 100 };
      if (payout || stake) await tx.walletTransaction.create({ data: { metadata: { user_id: id, wallet_id: wallet.id, type: won ? "wager_payout" : "wager_loss", status: "completed", amount: payout / 100,
        platform_fee: fee / 100, reward_bonus: bonus / 100, reference_type: "Wager", reference_id: wager.id, description: `Match payout ${wager.id}`, created_date: new Date().toISOString() } } });
    }
    for (const row of participants) if (cents(row.metadata.entry_fee_paid)) await tx.wagerParticipant.update({ where: { id: row.id }, data: { metadata: { ...row.metadata, escrow_released: true, escrow_released_date: new Date().toISOString() } } });
    const result = { totalPot: total / 100, winnerProfit: Math.round(Object.values(changes).filter((change) => change.won).reduce((sum, change) => sum + Math.max(0, change.match_delta), 0) * 100) / 100, walletChanges: changes };
    await tx.wager.update({ where: { id: wager.id }, data: { metadata: { ...stored.metadata, payout_applied_at: new Date().toISOString(), payout_total: result.totalPot, winner_profit: result.winnerProfit, wallet_changes: changes, platform_fee_total: fees / 100 } } });
    return result;
  }, { timeout: 30000, maxWait: 15000 });
}
