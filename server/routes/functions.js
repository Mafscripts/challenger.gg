import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { createEntity, firstEntity, getEntity, listEntities, updateEntity } from "../entity.js";
import { cleanUsername, ensureUserRecords } from "../auth.js";

const router = Router();

const money = (value) => Number(value || 0);
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";

async function walletFor(userId) {
  return await firstEntity("Wallet", { user_id: userId }) || await createEntity("Wallet", {
    user_id: userId,
    available_balance: 0,
    pending_balance: 0,
    escrow_balance: 0,
    withdrawable_balance: 0,
    total_deposits: 0,
    total_withdrawals: 0,
    total_earnings: 0,
    total_wagered: 0,
  });
}

async function completeRegistration(req) {
  const result = await ensureUserRecords(req.userRow, req.body || {});
  return { success: true, ...result };
}

async function createTicket(req) {
  const ticket = await createEntity("Ticket", {
    user_id: req.user.id,
    username: nameFor(req.user),
    subject: req.body.subject,
    description: req.body.description,
    category: req.body.category || "support",
    priority: req.body.priority || "normal",
    status: "open",
    created_date: new Date().toISOString(),
  });
  return { success: true, ticket };
}

async function requestAdminAlert(req) {
  const ticket = await createEntity("Ticket", {
    user_id: req.user.id,
    username: nameFor(req.user),
    subject: req.body.subject || "Admin request",
    description: req.body.description || "",
    category: req.body.match_type || "support",
    priority: req.body.priority || "high",
    status: "open",
    requested_admin: true,
    related_entity_id: req.body.match_id,
    created_date: new Date().toISOString(),
  });
  const alert = await createEntity("AdminAlert", {
    user_id: req.user.id,
    username: nameFor(req.user),
    subject: req.body.subject || "Admin request",
    message: req.body.description || "",
    priority: req.body.priority || "high",
    status: "open",
    related_entity_id: req.body.match_id,
    created_date: new Date().toISOString(),
  });
  return { success: true, ticket, alert };
}

async function createNotification(req) {
  const notification = await createEntity("Notification", {
    user_id: req.body.user_id || req.user.id,
    title: req.body.title,
    message: req.body.message,
    type: req.body.type || "system",
    is_read: false,
    created_date: new Date().toISOString(),
  });
  return { success: true, notification };
}

async function sendMessage(req) {
  const message = await createEntity("Message", {
    sender_id: req.user.id,
    sender_name: nameFor(req.user),
    recipient_id: req.body.recipient_id,
    recipient_name: req.body.recipient_name,
    subject: req.body.subject || "Message",
    content: req.body.content || req.body.message || "",
    is_read: false,
    created_date: new Date().toISOString(),
  });
  if (req.body.recipient_id) {
    await createEntity("Notification", {
      user_id: req.body.recipient_id,
      title: "New Message",
      message: `${nameFor(req.user)} sent you a message.`,
      type: "message",
      is_read: false,
      related_entity_id: message.id,
      created_date: new Date().toISOString(),
    });
  }
  return { success: true, message };
}

async function createWager(req) {
  const entryFee = money(req.body.entry_fee ?? req.body.amount);
  const wager = await createEntity("Wager", {
    ...req.body,
    host_id: req.user.id,
    host_name: nameFor(req.user),
    entry_fee: entryFee,
    amount: entryFee,
    total_prize_pool: entryFee * 2,
    status: "open",
    created_date: new Date().toISOString(),
  });
  await createEntity("WagerParticipant", {
    wager_id: wager.id,
    user_id: req.user.id,
    user_name: nameFor(req.user),
    team: "host",
    entry_fee_paid: entryFee,
    joined_date: new Date().toISOString(),
  });
  return { success: true, wager, wager_id: wager.id };
}

async function acceptWager(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  if (!wager || wager.status !== "open") {
    return { success: false, error: "Wager is not open" };
  }

  await createEntity("WagerParticipant", {
    wager_id: wager.id,
    user_id: req.user.id,
    user_name: nameFor(req.user),
    team: "challenger",
    entry_fee_paid: money(wager.entry_fee ?? wager.amount),
    joined_date: new Date().toISOString(),
  });

  const updated = await updateEntity("Wager", wager.id, {
    challenger_id: req.user.id,
    challenger_name: nameFor(req.user),
    challenger_banned_map_id: req.body.challenger_banned_map,
    challenger_banned_map_name: req.body.challenger_banned_map_name,
    final_map_id: req.body.final_map || wager.final_map_id,
    final_map_name: req.body.final_map_name || wager.final_map_name,
    status: "in_progress",
    accepted_date: new Date().toISOString(),
    match_started_date: new Date().toISOString(),
  });

  return { success: true, wager: updated, final_map_name: updated.final_map_name };
}

async function submitScore(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  const isHost = req.user.id === wager.host_id;
  const report = {
    reported_score_alpha: req.body.team_alpha_score,
    reported_score_bravo: req.body.team_bravo_score,
    reported_score_by: req.user.id,
    reported_score_team: isHost ? "host" : "challenger",
    reported_score_date: new Date().toISOString(),
    status: isHost ? "awaiting_team_bravo_report" : "awaiting_team_alpha_report",
  };
  await updateEntity("Wager", wager.id, report);
  const winner_id = Number(req.body.team_alpha_score) > Number(req.body.team_bravo_score) ? wager.host_id : wager.challenger_id;
  return {
    success: true,
    ready_to_complete: true,
    winner_id,
    winner_name: winner_id === wager.host_id ? wager.host_name : wager.challenger_name,
    winner_score: Math.max(Number(req.body.team_alpha_score), Number(req.body.team_bravo_score)),
    loser_score: Math.min(Number(req.body.team_alpha_score), Number(req.body.team_bravo_score)),
    message: "Score submitted.",
  };
}

async function completeWager(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  const winnerId = req.body.winner_id;
  const loserId = winnerId === wager.host_id ? wager.challenger_id : wager.host_id;
  const winnerName = winnerId === wager.host_id ? wager.host_name : wager.challenger_name;
  const loserName = loserId === wager.host_id ? wager.host_name : wager.challenger_name;
  const entryFee = money(wager.entry_fee ?? wager.amount);

  await updateEntity("Wager", wager.id, {
    status: "completed",
    winner_id: winnerId,
    winner_name: winnerName,
    winner_score: Math.max(Number(req.body.team_alpha_score), Number(req.body.team_bravo_score)),
    loser_score: Math.min(Number(req.body.team_alpha_score), Number(req.body.team_bravo_score)),
    match_completed_date: new Date().toISOString(),
  });

  await createEntity("WagerMatch", {
    wager_id: wager.id,
    winner_id: winnerId,
    winner_name: winnerName,
    loser_id: loserId,
    loser_name: loserName,
    entry_fee: entryFee,
    map_name: wager.final_map_name || "Map pending",
    completed_date: new Date().toISOString(),
  });

  if (winnerId) {
    const winner = await prisma.user.findUnique({ where: { id: winnerId } }).catch(() => null);
    if (winner) {
      await prisma.user.update({
        where: { id: winnerId },
        data: {
          wager_wins: winner.wager_wins + 1,
          current_win_streak: winner.current_win_streak + 1,
          total_wager_earnings: winner.total_wager_earnings + entryFee,
          wallet_balance: winner.wallet_balance + entryFee,
        },
      });
    }
  }
  if (loserId) {
    const loser = await prisma.user.findUnique({ where: { id: loserId } }).catch(() => null);
    if (loser) {
      await prisma.user.update({
        where: { id: loserId },
        data: { wager_losses: loser.wager_losses + 1, current_win_streak: 0 },
      });
    }
  }

  return { success: true, winner_id: winnerId, winner_name: winnerName };
}

async function createRankedMatch(req) {
  const match = await createEntity("RankedMatch", {
    ...req.body,
    host_id: req.user.id,
    host_name: nameFor(req.user),
    status: "open",
    created_date: new Date().toISOString(),
  });
  return { success: true, ranked_match: match, ranked_match_id: match.id };
}

async function acceptRankedMatch(req) {
  const id = req.body.ranked_match_id || req.body.id;
  const match = await getEntity("RankedMatch", id);
  if (match.status !== "open") return { success: false, error: "Ranked match is not open" };
  const updated = await updateEntity("RankedMatch", id, {
    challenger_id: req.user.id,
    challenger_name: nameFor(req.user),
    status: "in_progress",
    match_started_date: new Date().toISOString(),
  });
  return { success: true, match: updated };
}

async function completeRankedMatch(req) {
  const match = await getEntity("RankedMatch", req.body.ranked_match_id);
  const winnerId = Number(req.body.team_alpha_score) > Number(req.body.team_bravo_score) ? match.host_id : match.challenger_id;
  const winnerName = winnerId === match.host_id ? match.host_name : match.challenger_name;
  await updateEntity("RankedMatch", match.id, {
    status: "completed",
    winner_id: winnerId,
    winner_name: winnerName,
    winner_score: Math.max(Number(req.body.team_alpha_score), Number(req.body.team_bravo_score)),
    loser_score: Math.min(Number(req.body.team_alpha_score), Number(req.body.team_bravo_score)),
    match_completed_date: new Date().toISOString(),
  });
  return { success: true, winner_id: winnerId, winner_name: winnerName };
}

async function cancelRankedMatch(req) {
  const id = req.body.ranked_match_id || req.body.id;
  const match = await updateEntity("RankedMatch", id, {
    status: "cancelled",
    cancel_reason: req.body.reason || "Cancelled",
    cancelled_date: new Date().toISOString(),
  });
  return { success: true, match };
}

async function buyWithCredits(req) {
  const item = await getEntity("MarketplaceItem", req.body.item_id);
  const unlockType = item.unlock_type || (item.is_premium_only ? "premium" : "marketplace");
  const stock = item.stock_quantity === undefined || item.stock_quantity === null || item.stock_quantity === "" ? null : Number(item.stock_quantity);

  if (item.is_active === false || item.is_available === false) {
    return { success: false, error: "This item is not active." };
  }
  if (stock === 0) {
    return { success: false, error: "This item is out of stock." };
  }
  if (unlockType === "premium" && !req.userRow.is_premium) {
    return { success: false, error: "Premium subscription required." };
  }
  if (!["marketplace", "premium"].includes(unlockType)) {
    return { success: false, error: "This item must be unlocked before purchase." };
  }

  const existing = await firstEntity("UserInventory", { user_id: req.user.id, item_id: item.id });
  if (existing) {
    return { success: true, already_owned: true, inventory: existing };
  }

  const price = money(item.price_credits ?? item.price);
  if (req.userRow.credits < price) return { success: false, error: "Insufficient credits" };

  const inventory = await createEntity("UserInventory", {
    user_id: req.user.id,
    item_id: item.id,
    item_name: item.name,
    item_category: item.category,
    item_rarity: item.rarity,
    item_image: item.image_url,
    purchase_method: "credits",
    unlock_type: unlockType,
    is_unlocked: true,
    acquired_date: new Date().toISOString(),
    is_equipped: false,
  });
  await prisma.user.update({ where: { id: req.user.id }, data: { credits: req.userRow.credits - price } });
  if (stock !== null) {
    await updateEntity("MarketplaceItem", item.id, { stock_quantity: Math.max(0, stock - 1) });
  }
  await createEntity("Purchase", {
    user_id: req.user.id,
    item_id: item.id,
    item_name: item.name,
    price_credits: price,
    purchase_method: "credits",
    created_date: new Date().toISOString(),
  });
  return { success: true, inventory };
}

async function addFunds(req) {
  const userId = req.body.user_id || req.user.id;
  const amount = money(req.body.amount);
  const wallet = await walletFor(userId);
  const updatedWallet = await updateEntity("Wallet", wallet.id, {
    available_balance: money(wallet.available_balance) + amount,
    withdrawable_balance: money(wallet.withdrawable_balance) + amount,
  });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) await prisma.user.update({ where: { id: userId }, data: { wallet_balance: user.wallet_balance + amount } });
  return { success: true, wallet: updatedWallet };
}

async function forgeMoneyToCredits(req) {
  const amount = money(req.body.amount);
  const credits = Math.floor(amount * 100);
  await prisma.user.update({ where: { id: req.user.id }, data: { credits: req.userRow.credits + credits } });
  return { success: true, credits_added: credits };
}

async function generateTournamentBracket(req) {
  const tournamentId = req.body.tournament_id;
  const participants = await listEntities("TournamentParticipant", { tournament_id: tournamentId }, "seed", 256);
  if (participants.length < 2) return { success: false, error: "At least two participants are required" };
  const matches = [];
  for (let index = 0; index < participants.length; index += 2) {
    const a = participants[index];
    const b = participants[index + 1];
    matches.push(await createEntity("TournamentMatch", {
      tournament_id: tournamentId,
      bracket: "winner",
      round: 1,
      match_number: (index / 2) + 1,
      team_a_id: a?.team_id || a?.user_id || a?.id,
      team_a_name: a?.team_name || a?.user_name || a?.name,
      team_b_id: b?.team_id || b?.user_id || b?.id,
      team_b_name: b?.team_name || b?.user_name || b?.name,
      status: b ? "ready" : "bye",
      created_date: new Date().toISOString(),
    }));
  }
  await updateEntity("Tournament", tournamentId, { status: "in_progress" }).catch(() => null);
  return { success: true, match_count: matches.length, matches };
}

async function completeTournamentMatch(req) {
  const match = await getEntity("TournamentMatch", req.body.tournament_match_id);
  const teamAScore = Number(req.body.team_a_score || 0);
  const teamBScore = Number(req.body.team_b_score || 0);
  const winnerIsA = teamAScore > teamBScore;
  const updated = await updateEntity("TournamentMatch", match.id, {
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    winner_id: winnerIsA ? match.team_a_id : match.team_b_id,
    winner_name: winnerIsA ? match.team_a_name : match.team_b_name,
    completed: true,
    status: "completed",
    completed_date: new Date().toISOString(),
  });
  return { success: true, match: updated };
}

async function changeDisplayName(req) {
  const displayName = String(req.body.display_name || "").trim().slice(0, 60);
  if (!displayName) return { success: false, error: "Display name is required" };
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { display_name: displayName } });
  return { success: true, user };
}

const handlers = {
  completeRegistration,
  createWallet: completeRegistration,
  createTicket,
  requestAdminAlert,
  createNotification,
  sendNotification: createNotification,
  sendMessage,
  createWager,
  acceptWager,
  submitScore,
  completeWager,
  refundWager: async (req) => ({ success: true, wager: await updateEntity("Wager", req.body.wager_id, { status: "cancelled" }) }),
  createRankedMatch,
  acceptRankedMatch,
  completeRankedMatch,
  cancelRankedMatch,
  buyWithCredits,
  addFunds,
  depositToWallet: addFunds,
  forgeMoneyToCredits,
  withdrawFromWallet: async (req) => ({ success: true, withdrawal: await createEntity("WithdrawalRequest", { ...req.body, user_id: req.user.id, status: "pending", created_date: new Date().toISOString() }) }),
  processWithdrawal: async (req) => ({ success: true, withdrawal: await updateEntity("WithdrawalRequest", req.body.withdrawal_id, { status: req.body.status, processed_date: new Date().toISOString() }) }),
  generateTournamentBracket,
  completeTournamentMatch,
  completeTournament: async (req) => ({ success: true, tournament: await updateEntity("Tournament", req.body.tournament_id, { status: "completed", winner_id: req.body.winner_id, winner_name: req.body.winner_name }) }),
  changeDisplayName,
  adminAction: async (req) => ({ success: true, action: await createEntity("AdminAction", { ...req.body, admin_id: req.user.id, admin_name: nameFor(req.user), created_date: new Date().toISOString() }) }),
  moderateDispute: async (req) => ({ success: true, dispute: await updateEntity("Dispute", req.body.dispute_id, { ...req.body, moderator_id: req.user.id }) }),
  postDiscordCelebration: async () => ({ success: true }),
  subscribePremium: async (req) => ({ success: true, user: await prisma.user.update({ where: { id: req.user.id }, data: { is_premium: true } }) }),
  "create-checkout": async (req) => ({ success: true, checkout_url: "/thank-you", pack_id: req.body.pack_id }),
};

router.post("/:name", requireAuth, async (req, res, next) => {
  try {
    const handler = handlers[req.params.name];
    if (!handler) return res.status(404).json({ error: `Function ${req.params.name} is not implemented` });
    res.json(await handler(req));
  } catch (error) {
    next(error);
  }
});

export default router;
