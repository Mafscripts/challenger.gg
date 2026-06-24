import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { createEntity, deleteEntity, firstEntity, getEntity, listEntities, updateEntity } from "../entity.js";
import { ensureUserRecords, publicUser } from "../auth.js";
import { hasRole, rolePower } from "../roles.js";

const router = Router();

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};
const roundedMoney = (value) => Math.round(money(value) * 100) / 100;
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";
const cleanName = (value) => String(value || "").trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const WIN_XP = 150;
const LOSS_XP = 50;
const RANKED_WIN_ELO = 25;
const RANKED_LOSS_ELO = -15;
const staffRoles = ["ceo", "super_admin", "admin", "moderator"];
const walletAdjustmentRoles = new Set(["ceo", "super_admin"]);
const walletAdjustmentTypes = new Set(["credits", "money"]);
const tournamentStatusesOpenForRegistration = ["open", "registration"];
const tournamentStatusesStarted = ["live", "in_progress"];
const openTicketStatuses = ["open", "waiting_for_admin", "admin_joined", "waiting_for_user", "escalated"];
const tournamentSndMapPool = ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Colossus"];
const tournamentMatchMode = "Search and Destroy";
const tournamentBestOf = 3;

function assertStaff(req, minimumRole = "moderator") {
  if (!hasRole(req.user, minimumRole)) {
    const error = new Error(`${minimumRole.replace("_", " ")} access required`);
    error.status = 403;
    throw error;
  }
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function canModifyUserRole(actorRole, targetRole) {
  if (actorRole === "ceo") return true;
  if (targetRole === "ceo") return false;
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return !["ceo", "super_admin"].includes(targetRole);
  return false;
}

function canModerateUser(actorRole, targetRole) {
  if (actorRole === "ceo") return true;
  if (targetRole === "ceo") return false;
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return !["ceo", "super_admin"].includes(targetRole);
  if (actorRole === "moderator") return targetRole === "user";
  return false;
}

function canAdjustUserWallet(actorRole, targetRole) {
  if (!walletAdjustmentRoles.has(actorRole)) return false;
  if (actorRole === "super_admin" && targetRole === "ceo") return false;
  return true;
}

function requiredRosterSize(teamSize) {
  const value = Number.parseInt(String(teamSize || "1v1").split("v")[0], 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

async function usersWithStaffRole() {
  const users = await listEntities("User", {}, "-created_date", 500);
  return users.filter((user) => staffRoles.includes(user.role));
}

async function notifyUser(userId, { title, message, type = "system", action_url, related_entity_id, related_entity_type }) {
  if (!userId) return null;
  return createEntity("Notification", {
    user_id: userId,
    type,
    title,
    message,
    is_read: false,
    action_url,
    related_entity_id,
    related_entity_type,
    created_date: nowIso(),
  }).catch(() => null);
}

async function notifyUsers(userIds, notification) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  return Promise.all(uniqueIds.map((userId) => notifyUser(userId, notification)));
}

async function notifyStaff(notification) {
  const staff = await usersWithStaffRole();
  return notifyUsers(staff.map((user) => user.id), notification);
}

async function tournamentParticipants(tournamentId) {
  return listEntities("TournamentParticipant", { tournament_id: tournamentId }, "seed", 500);
}

function participantUserIds(participant) {
  const memberIds = Array.isArray(participant?.members)
    ? participant.members.map((member) => member?.user_id).filter(Boolean)
    : [];
  return [...new Set([participant?.captain_id, participant?.user_id, ...memberIds].filter(Boolean))];
}

function participantIds(participant) {
  const memberIds = Array.isArray(participant?.members)
    ? participant.members.map((member) => member?.user_id).filter(Boolean)
    : [];
  return [...new Set([
    participant?.id,
    participant?.team_id,
    participant?.user_id,
    participant?.captain_id,
    ...memberIds,
  ].filter(Boolean).map(String))];
}

async function notifyTournamentParticipants(tournamentId, notification) {
  const participants = await tournamentParticipants(tournamentId);
  return notifyUsers(participants.flatMap(participantUserIds), notification);
}

function tournamentUnlockRequirement(item) {
  const required = Number.parseInt(String(item?.unlock_requirement || "1"), 10);
  return Number.isFinite(required) && required > 0 ? required : 1;
}

function tournamentRewardItemIds(tournament) {
  const selectedIds = Array.isArray(tournament?.reward_item_ids) ? tournament.reward_item_ids : [];
  const snapshotIds = Array.isArray(tournament?.reward_items)
    ? tournament.reward_items.map((item) => item?.id || item?.item_id)
    : [];
  return [...new Set([...selectedIds, ...snapshotIds].filter(Boolean).map(String))];
}

function tournamentEliminationRewardItemIds(tournament) {
  const selectedIds = Array.isArray(tournament?.elimination_reward_item_ids) ? tournament.elimination_reward_item_ids : [];
  const snapshotIds = Array.isArray(tournament?.elimination_reward_items)
    ? tournament.elimination_reward_items.map((item) => item?.id || item?.item_id)
    : [];
  return [...new Set([...selectedIds, ...snapshotIds].filter(Boolean).map(String))];
}

async function marketplaceItemsByIds(itemIds = []) {
  const ids = new Set(itemIds.filter(Boolean).map(String));
  if (ids.size === 0) return [];
  const rows = await listEntities("MarketplaceItem", {}, "-created_date", 500).catch(() => []);
  return rows.filter((item) => ids.has(String(item.id)) && item.is_active !== false && item.is_available !== false);
}

async function grantMarketplaceItemsToUsers(users = [], items = [], context = {}) {
  const validUsers = users.filter(Boolean);
  const validItems = items.filter(Boolean);
  if (validUsers.length === 0 || validItems.length === 0) return [];

  const granted = [];
  for (const user of validUsers) {
    const existingInventory = await listEntities("UserInventory", { user_id: user.id }, "-acquired_date", 500).catch(() => []);
    const ownedItemIds = new Set(existingInventory.map((entry) => entry.item_id).filter(Boolean));

    for (const item of validItems) {
      if (ownedItemIds.has(item.id)) continue;
      const requiredWins = context.requiredWinsForItem?.(item);
      const sourceTournamentId = context.tournament?.id || context.tournament_id || null;
      const sourceTournamentName = context.tournament?.name || context.tournament_name || null;
      const inventory = await createEntity("UserInventory", {
        user_id: user.id,
        item_id: item.id,
        item_name: item.name,
        item_category: item.category,
        item_rarity: item.rarity,
        item_image: item.image_url,
        purchase_method: "admin_grant",
        price_paid: 0,
        unlock_type: context.unlock_type || "tournament_reward",
        unlock_key: context.unlockKeyForItem?.(item) || `${context.unlock_type || "tournament_reward"}:${sourceTournamentId || item.id}`,
        unlock_requirement: requiredWins ? String(requiredWins) : undefined,
        source_tournament_id: sourceTournamentId,
        source_tournament_name: sourceTournamentName,
        is_unlocked: true,
        is_equipped: false,
        is_tradable: item.is_tradeable !== false,
        acquired_date: nowIso(),
      });

      ownedItemIds.add(item.id);
      granted.push({ user_id: user.id, item_id: item.id, item_name: item.name, inventory_id: inventory.id });
      await notifyUser(user.id, {
        title: context.notificationTitle || "Tournament reward unlocked",
        message: context.messageForItem?.(item, user, requiredWins)
          || `${item.name} unlocked${sourceTournamentName ? ` from ${sourceTournamentName}` : ""}.`,
        type: "marketplace",
        action_url: "/inventory",
        related_entity_id: item.id,
        related_entity_type: "MarketplaceItem",
      });
    }
  }

  return granted;
}

async function grantTournamentMarketplaceUnlocks(users = [], context = {}) {
  const validUsers = users.filter(Boolean);
  if (validUsers.length === 0) return [];

  const items = (await listEntities("MarketplaceItem", { unlock_type: "tournament" }, "-created_date", 500).catch(() => []))
    .filter((item) => item.is_active !== false && item.is_available !== false);
  if (items.length === 0) return [];

  const granted = [];
  for (const user of validUsers) {
    const wins = Number(user.tournament_wins || 0);
    const eligibleItems = items.filter((item) => wins >= tournamentUnlockRequirement(item));
    const userGranted = await grantMarketplaceItemsToUsers([user], eligibleItems, {
      ...context,
      unlock_type: "tournament",
      requiredWinsForItem: tournamentUnlockRequirement,
      unlockKeyForItem: (item) => `tournament_wins:${tournamentUnlockRequirement(item)}`,
      messageForItem: (item, _user, requiredWins) => `${item.name} unlocked after winning ${requiredWins} tournament${requiredWins === 1 ? "" : "s"}.`,
    });
    granted.push(...userGranted);
  }

  return granted;
}

async function syncMarketplaceUnlocks(req) {
  const user = await userFor(req.user.id);
  const granted = await grantTournamentMarketplaceUnlocks([user]);
  return { success: true, granted };
}

async function tournamentParticipantForEntry(tournamentId, entryId) {
  if (!entryId) return null;
  const participants = await tournamentParticipants(tournamentId);
  return participants.find((participant) => participantIds(participant).includes(String(entryId))) || null;
}

async function grantTournamentEliminationRewards({ tournamentId, loserId, match, loserUserIds }) {
  const tournament = await getEntity("Tournament", tournamentId);
  const loserParticipant = await tournamentParticipantForEntry(tournamentId, loserId);
  if (loserParticipant?.id) {
    await updateEntity("TournamentParticipant", loserParticipant.id, {
      eliminated: true,
      eliminated_match_id: match.id,
      eliminated_round: match.round,
      eliminated_by: match.winner_id,
      eliminated_by_name: match.winner_name,
      eliminated_date: nowIso(),
    }).catch(() => null);
  }

  const itemIds = tournamentEliminationRewardItemIds(tournament);
  if (itemIds.length === 0 || (loserUserIds || []).length === 0) return { eliminated_participant: loserParticipant, reward_items: [] };

  const [loserUsers, items] = await Promise.all([
    Promise.all(loserUserIds.map((userId) => userFor(userId))),
    marketplaceItemsByIds(itemIds),
  ]);

  const rewardItems = await grantMarketplaceItemsToUsers(loserUsers, items, {
    tournament,
    match_id: match.id,
    unlock_type: "tournament_elimination_reward",
    unlockKeyForItem: (item) => `tournament_elimination:${tournament.id}:${loserParticipant?.id || loserId}:${item.id}`,
    notificationTitle: "Invitational item unlocked",
    messageForItem: (item) => `${item.name} unlocked for competing in ${tournament.name}.`,
  });

  return { eliminated_participant: loserParticipant, reward_items: rewardItems };
}

async function removeTournamentEliminationRewards(tournamentId, loserId) {
  if (!tournamentId || !loserId) return { removed_elimination_rewards: 0 };
  const loserParticipant = await tournamentParticipantForEntry(tournamentId, loserId);
  const loserUserIds = await tournamentParticipantUserIds(tournamentId, loserId);
  let removed = 0;

  await Promise.all(loserUserIds.map(async (userId) => {
    const inventory = await listEntities("UserInventory", { user_id: userId }, "-acquired_date", 500).catch(() => []);
    const entries = inventory.filter((item) => {
      const unlockKey = String(item.unlock_key || "");
      const participantKey = loserParticipant?.id || loserId;
      return String(item.source_tournament_id || "") === String(tournamentId)
        && item.unlock_type === "tournament_elimination_reward"
        && unlockKey.startsWith(`tournament_elimination:${tournamentId}:${participantKey}:`);
    });
    removed += entries.length;
    await Promise.all(entries.map((entry) => deleteEntity("UserInventory", entry.id).catch(() => null)));
  }));

  return { removed_elimination_rewards: removed };
}

async function grantTournamentFinalEliminationRewards(tournament, winnerId) {
  const itemIds = tournamentEliminationRewardItemIds(tournament);
  if (itemIds.length === 0) return [];

  const [participants, items] = await Promise.all([
    tournamentParticipants(tournament.id),
    marketplaceItemsByIds(itemIds),
  ]);
  const grants = [];

  for (const participant of participants) {
    if (participantIds(participant).includes(String(winnerId))) continue;
    await updateEntity("TournamentParticipant", participant.id, {
      eliminated: true,
      eliminated_date: participant.eliminated_date || nowIso(),
    }).catch(() => null);

    const users = await Promise.all(participantUserIds(participant).map((userId) => userFor(userId)));
    const participantGrants = await grantMarketplaceItemsToUsers(users, items, {
      tournament,
      unlock_type: "tournament_elimination_reward",
      unlockKeyForItem: (item) => `tournament_elimination:${tournament.id}:${participant.id}:${item.id}`,
      notificationTitle: "Invitational item unlocked",
      messageForItem: (item) => `${item.name} unlocked for competing in ${tournament.name}.`,
    });
    grants.push(...participantGrants);
  }

  return grants;
}

async function walletFor(userId) {
  const existing = await firstEntity("Wallet", { user_id: userId });
  if (existing) return existing;

  const user = await userFor(userId);
  const startingBalance = roundedMoney(user?.wallet_balance);
  return createEntity("Wallet", {
    user_id: userId,
    available_balance: startingBalance,
    pending_balance: 0,
    escrow_balance: 0,
    withdrawable_balance: startingBalance,
    total_deposits: 0,
    total_withdrawals: 0,
    total_earnings: 0,
    total_wagered: 0,
  });
}

async function userFor(userId) {
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } }).catch(() => null);
}

async function syncUserWalletBalance(userId, wallet) {
  if (!userId || !wallet) return null;
  return prisma.user.update({
    where: { id: userId },
    data: { wallet_balance: roundedMoney(wallet.available_balance) },
  }).catch(() => null);
}

async function createWalletTransaction(userId, wallet, payload) {
  if (!userId || !wallet?.id) return null;
  return createEntity("WalletTransaction", {
    user_id: userId,
    wallet_id: wallet.id,
    status: "completed",
    created_date: nowIso(),
    ...payload,
  }).catch(() => null);
}

async function escrowWagerStake({ userId, wagerId, entryFee, team }) {
  if (entryFee <= 0) return { wallet: await walletFor(userId), transaction: null };

  const wallet = await walletFor(userId);
  if (money(wallet.available_balance) < entryFee) {
    const error = new Error("Insufficient wallet balance");
    error.status = 400;
    throw error;
  }

  const updatedWallet = await updateEntity("Wallet", wallet.id, {
    available_balance: roundedMoney(money(wallet.available_balance) - entryFee),
    withdrawable_balance: roundedMoney(Math.max(0, money(wallet.withdrawable_balance) - entryFee)),
    pending_balance: roundedMoney(money(wallet.pending_balance) + entryFee),
    escrow_balance: roundedMoney(money(wallet.escrow_balance) + entryFee),
    total_wagered: roundedMoney(money(wallet.total_wagered) + entryFee),
  });
  await syncUserWalletBalance(userId, updatedWallet);

  const transaction = await createWalletTransaction(userId, updatedWallet, {
    type: "wager_escrow",
    amount: -entryFee,
    description: `Escrow for ${team || "wager"} entry`,
    reference_type: "Wager",
    reference_id: wagerId,
  });

  return { wallet: updatedWallet, transaction };
}

async function releaseWagerEscrow(wager, winnerId) {
  const entryFee = money(wager.entry_fee ?? wager.amount);
  const isPaidWager = (wager.match_type || "wagers") === "wagers" && entryFee > 0;
  if (!isPaidWager || !winnerId) return { totalPot: 0, winnerProfit: 0 };

  const participants = await listEntities("WagerParticipant", { wager_id: wager.id }, "-joined_date", 10).catch(() => []);
  const paidParticipants = participants.filter((participant) => money(participant.entry_fee_paid) > 0);
  const hasEscrowedStake = paidParticipants.some((participant) => (
    participant.escrowed === true || Boolean(participant.escrow_transaction_id)
  ));
  if (paidParticipants.length === 0 || !hasEscrowedStake) {
    const wallet = await walletFor(winnerId);
    const updatedWallet = await updateEntity("Wallet", wallet.id, {
      available_balance: roundedMoney(money(wallet.available_balance) + entryFee),
      withdrawable_balance: roundedMoney(money(wallet.withdrawable_balance) + entryFee),
      total_earnings: roundedMoney(money(wallet.total_earnings) + entryFee),
    });
    await syncUserWalletBalance(winnerId, updatedWallet);
    await createWalletTransaction(winnerId, updatedWallet, {
      type: "wager_payout",
      amount: entryFee,
      description: `Legacy wager payout for ${wager.id}`,
      reference_type: "Wager",
      reference_id: wager.id,
    });
    await prisma.user.update({
      where: { id: winnerId },
      data: {
        total_wager_earnings: { increment: entryFee },
        lifetime_earnings: { increment: entryFee },
      },
    }).catch(() => null);
    return { totalPot: entryFee, winnerProfit: entryFee, legacy: true };
  }
  const participantRows = paidParticipants.length > 0
    ? paidParticipants
    : [
      { user_id: wager.host_id, entry_fee_paid: entryFee },
      { user_id: wager.challenger_id, entry_fee_paid: entryFee },
    ].filter((participant) => participant.user_id);
  const totalPot = roundedMoney(participantRows.reduce((sum, participant) => sum + money(participant.entry_fee_paid), 0));
  const winnerStake = roundedMoney(participantRows
    .filter((participant) => participant.user_id === winnerId)
    .reduce((sum, participant) => sum + money(participant.entry_fee_paid), 0));
  const winnerProfit = roundedMoney(Math.max(0, totalPot - winnerStake));

  for (const participant of participantRows) {
    const stake = money(participant.entry_fee_paid);
    if (!participant.user_id || stake <= 0) continue;

    const wallet = await walletFor(participant.user_id);
    const isWinner = participant.user_id === winnerId;
    const updatedWallet = await updateEntity("Wallet", wallet.id, {
      available_balance: roundedMoney(money(wallet.available_balance) + (isWinner ? totalPot : 0)),
      withdrawable_balance: roundedMoney(money(wallet.withdrawable_balance) + (isWinner ? totalPot : 0)),
      pending_balance: roundedMoney(Math.max(0, money(wallet.pending_balance) - stake)),
      escrow_balance: roundedMoney(Math.max(0, money(wallet.escrow_balance) - stake)),
      total_earnings: roundedMoney(money(wallet.total_earnings) + (isWinner ? winnerProfit : 0)),
    });
    await syncUserWalletBalance(participant.user_id, updatedWallet);

    await createWalletTransaction(participant.user_id, updatedWallet, {
      type: isWinner ? "wager_payout" : "wager_loss",
      amount: isWinner ? totalPot : 0,
      description: isWinner ? `Wager payout for ${wager.id}` : `Wager lost for ${wager.id}`,
      reference_type: "Wager",
      reference_id: wager.id,
    });

    if (participant.id) {
      await updateEntity("WagerParticipant", participant.id, {
        escrow_released: true,
        escrow_released_date: nowIso(),
      }).catch(() => null);
    }
  }

  if (winnerProfit > 0) {
    await prisma.user.update({
      where: { id: winnerId },
      data: {
        total_wager_earnings: { increment: winnerProfit },
        lifetime_earnings: { increment: winnerProfit },
      },
    }).catch(() => null);
  }

  return { totalPot, winnerProfit };
}

async function refundWagerEscrow(wager, reason = "Wager refunded") {
  const participants = await listEntities("WagerParticipant", { wager_id: wager.id }, "-joined_date", 10).catch(() => []);
  await Promise.all(participants.map(async (participant) => {
    const stake = money(participant.entry_fee_paid);
    const hasEscrowedStake = participant.escrowed === true || Boolean(participant.escrow_transaction_id);
    if (!participant.user_id || stake <= 0 || participant.escrow_released === true || !hasEscrowedStake) return null;

    const wallet = await walletFor(participant.user_id);
    const updatedWallet = await updateEntity("Wallet", wallet.id, {
      available_balance: roundedMoney(money(wallet.available_balance) + stake),
      withdrawable_balance: roundedMoney(money(wallet.withdrawable_balance) + stake),
      pending_balance: roundedMoney(Math.max(0, money(wallet.pending_balance) - stake)),
      escrow_balance: roundedMoney(Math.max(0, money(wallet.escrow_balance) - stake)),
    });
    await syncUserWalletBalance(participant.user_id, updatedWallet);
    await createWalletTransaction(participant.user_id, updatedWallet, {
      type: "wager_refund",
      amount: stake,
      description: reason,
      reference_type: "Wager",
      reference_id: wager.id,
    });
    return updateEntity("WagerParticipant", participant.id, {
      escrow_released: true,
      escrow_released_date: nowIso(),
    }).catch(() => null);
  }));
}

function identityFor(user) {
  return {
    username: user?.username || user?.handle || nameFor(user),
    display_name: nameFor(user),
    handle: user?.handle || user?.username || null,
  };
}

async function ensurePlayerProfile(userId) {
  const user = await userFor(userId);
  if (!user) return null;
  const existing = await firstEntity("PlayerProfile", { user_id: userId });
  if (existing) return existing;
  const identity = identityFor(user);
  return createEntity("PlayerProfile", {
    user_id: userId,
    display_name: identity.display_name,
    username: identity.username,
    handle: identity.handle,
    elo: 0,
    peak_elo: 0,
    xp: 0,
    level: user.xp_level || 1,
    total_matches: 0,
    total_wins: 0,
    total_losses: 0,
    current_win_streak: 0,
    best_win_streak: 0,
    credits: user.credits || 0,
    is_premium: Boolean(user.is_premium),
    account_created_date: user.account_created_date?.toISOString?.() || user.created_date?.toISOString?.() || nowIso(),
    last_active_date: nowIso(),
  });
}

async function ensureRankedStats(userId) {
  const user = await userFor(userId);
  if (!user) return null;
  const existing = await firstEntity("RankedStats", { user_id: userId });
  if (existing) return existing;
  const identity = identityFor(user);
  return createEntity("RankedStats", {
    user_id: userId,
    username: identity.username,
    elo: 0,
    wins: 0,
    losses: 0,
    win_streak: 0,
    peak_elo: 0,
    matches_played: 0,
    region: user.region || "na",
    season: 1,
    last_played_date: nowIso(),
  });
}

async function ensureXPStats(userId) {
  const user = await userFor(userId);
  if (!user) return null;
  const existing = await firstEntity("XPStats", { user_id: userId });
  if (existing) return existing;
  const identity = identityFor(user);
  return createEntity("XPStats", {
    user_id: userId,
    username: identity.username,
    level: user.xp_level || 1,
    current_xp: 0,
    total_xp: 0,
    xp_to_next_level: 1000,
    prestige: 0,
    weekly_xp: 0,
    daily_missions_completed: 0,
    win_streak: 0,
    region: user.region || "na",
    season: 1,
    last_played_date: nowIso(),
  });
}

function applyXpProgress(stats, amount, didWin) {
  let level = Number(stats.level || 1);
  let currentXp = Number(stats.current_xp || 0) + amount;
  let xpToNext = Number(stats.xp_to_next_level || 1000);

  while (currentXp >= xpToNext) {
    currentXp -= xpToNext;
    level += 1;
    xpToNext = Math.round(1000 + ((level - 1) * 150));
  }

  return {
    level,
    current_xp: currentXp,
    total_xp: Number(stats.total_xp || 0) + amount,
    xp_to_next_level: xpToNext,
    weekly_xp: Number(stats.weekly_xp || 0) + amount,
    win_streak: didWin ? Number(stats.win_streak || 0) + 1 : 0,
    last_played_date: nowIso(),
  };
}

async function updateXPOutcome(userId, didWin) {
  const stats = await ensureXPStats(userId);
  if (!stats) return null;
  const patch = applyXpProgress(stats, didWin ? WIN_XP : LOSS_XP, didWin);
  const updated = await updateEntity("XPStats", stats.id, patch);
  await prisma.user.update({
    where: { id: userId },
    data: { xp_level: updated.level },
  }).catch(() => null);
  return updated;
}

async function updateProfileOutcome(userId, didWin, eloDelta = 0) {
  const profile = await ensurePlayerProfile(userId);
  if (!profile) return null;
  const xpAmount = didWin ? WIN_XP : LOSS_XP;
  const currentStreak = didWin ? Number(profile.current_win_streak || 0) + 1 : 0;
  const currentElo = Math.max(0, Number(profile.elo || 0) + eloDelta);
  return updateEntity("PlayerProfile", profile.id, {
    total_matches: Number(profile.total_matches || 0) + 1,
    total_wins: Number(profile.total_wins || 0) + (didWin ? 1 : 0),
    total_losses: Number(profile.total_losses || 0) + (didWin ? 0 : 1),
    current_win_streak: currentStreak,
    best_win_streak: Math.max(Number(profile.best_win_streak || 0), currentStreak),
    xp: Number(profile.xp || 0) + xpAmount,
    level: Math.max(Number(profile.level || 1), (await firstEntity("XPStats", { user_id: userId }))?.level || 1),
    elo: currentElo,
    peak_elo: Math.max(Number(profile.peak_elo || 0), currentElo),
    last_active_date: nowIso(),
  });
}

async function updateRankedOutcome(userId, didWin) {
  const stats = await ensureRankedStats(userId);
  if (!stats) return null;
  const eloDelta = didWin ? RANKED_WIN_ELO : RANKED_LOSS_ELO;
  const elo = Math.max(0, Number(stats.elo || 0) + eloDelta);
  return updateEntity("RankedStats", stats.id, {
    elo,
    wins: Number(stats.wins || 0) + (didWin ? 1 : 0),
    losses: Number(stats.losses || 0) + (didWin ? 0 : 1),
    win_streak: didWin ? Number(stats.win_streak || 0) + 1 : 0,
    peak_elo: Math.max(Number(stats.peak_elo || 0), elo),
    matches_played: Number(stats.matches_played || 0) + 1,
    last_played_date: nowIso(),
  });
}

async function applyMatchRewards({ winnerId, loserId, ranked = false }) {
  if (winnerId) {
    await updateXPOutcome(winnerId, true);
    await updateProfileOutcome(winnerId, true, ranked ? RANKED_WIN_ELO : 0);
    await prisma.user.update({
      where: { id: winnerId },
      data: { current_win_streak: { increment: 1 } },
    }).catch(() => null);
  }
  if (loserId) {
    await updateXPOutcome(loserId, false);
    await updateProfileOutcome(loserId, false, ranked ? RANKED_LOSS_ELO : 0);
    await prisma.user.update({
      where: { id: loserId },
      data: { current_win_streak: 0 },
    }).catch(() => null);
  }
  if (ranked) {
    await Promise.all([
      winnerId ? updateRankedOutcome(winnerId, true) : Promise.resolve(null),
      loserId ? updateRankedOutcome(loserId, false) : Promise.resolve(null),
    ]);
  }
}

async function applyParticipantRewards(winnerIds = [], loserIds = []) {
  const uniqueWinnerIds = [...new Set(winnerIds.filter(Boolean))];
  const uniqueLoserIds = [...new Set(loserIds.filter(Boolean))].filter((id) => !uniqueWinnerIds.includes(id));
  await Promise.all(uniqueWinnerIds.map((userId) => Promise.all([
    updateXPOutcome(userId, true),
    updateProfileOutcome(userId, true, 0),
    prisma.user.update({ where: { id: userId }, data: { current_win_streak: { increment: 1 } } }).catch(() => null),
  ])));
  await Promise.all(uniqueLoserIds.map((userId) => Promise.all([
    updateXPOutcome(userId, false),
    updateProfileOutcome(userId, false, 0),
    prisma.user.update({ where: { id: userId }, data: { current_win_streak: 0 } }).catch(() => null),
  ])));
}

async function reverseXPOutcome(userId, didWin) {
  const stats = await firstEntity("XPStats", { user_id: userId }).catch(() => null);
  if (!stats) return null;
  const amount = didWin ? WIN_XP : LOSS_XP;
  const updated = await updateEntity("XPStats", stats.id, {
    current_xp: Math.max(0, Number(stats.current_xp || 0) - amount),
    total_xp: Math.max(0, Number(stats.total_xp || 0) - amount),
    weekly_xp: Math.max(0, Number(stats.weekly_xp || 0) - amount),
    win_streak: didWin ? Math.max(0, Number(stats.win_streak || 0) - 1) : Number(stats.win_streak || 0),
    last_played_date: nowIso(),
  });
  await prisma.user.update({
    where: { id: userId },
    data: { xp_level: updated.level || stats.level || 1 },
  }).catch(() => null);
  return updated;
}

async function reverseProfileOutcome(userId, didWin) {
  const profile = await firstEntity("PlayerProfile", { user_id: userId }).catch(() => null);
  if (!profile) return null;
  const amount = didWin ? WIN_XP : LOSS_XP;
  return updateEntity("PlayerProfile", profile.id, {
    total_matches: Math.max(0, Number(profile.total_matches || 0) - 1),
    total_wins: Math.max(0, Number(profile.total_wins || 0) - (didWin ? 1 : 0)),
    total_losses: Math.max(0, Number(profile.total_losses || 0) - (didWin ? 0 : 1)),
    current_win_streak: didWin ? Math.max(0, Number(profile.current_win_streak || 0) - 1) : Number(profile.current_win_streak || 0),
    xp: Math.max(0, Number(profile.xp || 0) - amount),
    last_active_date: nowIso(),
  });
}

async function reverseParticipantRewards(winnerIds = [], loserIds = []) {
  const uniqueWinnerIds = [...new Set(winnerIds.filter(Boolean))];
  const uniqueLoserIds = [...new Set(loserIds.filter(Boolean))].filter((id) => !uniqueWinnerIds.includes(id));
  await Promise.all(uniqueWinnerIds.map(async (userId) => {
    await Promise.all([
      reverseXPOutcome(userId, true),
      reverseProfileOutcome(userId, true),
    ]);
    const user = await userFor(userId);
    if (user) {
      await prisma.user.update({
        where: { id: userId },
        data: { current_win_streak: Math.max(0, Number(user.current_win_streak || 0) - 1) },
      }).catch(() => null);
    }
  }));
  await Promise.all(uniqueLoserIds.map((userId) => Promise.all([
    reverseXPOutcome(userId, false),
    reverseProfileOutcome(userId, false),
  ])));
}

function tournamentMatchWinnerId(match) {
  if (match?.winner_id) return match.winner_id;
  const teamAScore = Number(match?.team_a_score || 0);
  const teamBScore = Number(match?.team_b_score || 0);
  if (teamAScore === teamBScore) return null;
  return teamAScore > teamBScore ? match?.team_a_id : match?.team_b_id;
}

function tournamentMatchLoserId(match, winnerId = tournamentMatchWinnerId(match)) {
  if (!winnerId) return null;
  return String(winnerId) === String(match?.team_a_id) ? match?.team_b_id : match?.team_a_id;
}

async function tournamentMatchRewardUsers(match) {
  const winnerId = tournamentMatchWinnerId(match);
  const loserId = tournamentMatchLoserId(match, winnerId);
  const winnerUserIds = Array.isArray(match?.reward_winner_user_ids) && match.reward_winner_user_ids.length
    ? match.reward_winner_user_ids
    : await tournamentParticipantUserIds(match.tournament_id, winnerId);
  const loserUserIds = Array.isArray(match?.reward_loser_user_ids) && match.reward_loser_user_ids.length
    ? match.reward_loser_user_ids
    : await tournamentParticipantUserIds(match.tournament_id, loserId);
  return { winnerId, loserId, winnerUserIds, loserUserIds };
}

async function undoTournamentMatchRewards(match) {
  const hadCompletedResult = match?.completed || match?.status === "completed" || match?.winner_id;
  const shouldUndo = hadCompletedResult && match?.rewards_applied !== false;
  if (!shouldUndo) return { rewards_reverted: false };

  const { winnerId, loserId, winnerUserIds, loserUserIds } = await tournamentMatchRewardUsers(match);
  if (!winnerId || winnerUserIds.length === 0) return { rewards_reverted: false };
  await reverseParticipantRewards(winnerUserIds, loserUserIds);
  return {
    rewards_reverted: true,
    previous_winner_id: winnerId,
    previous_loser_id: loserId,
    reward_winner_user_ids: winnerUserIds,
    reward_loser_user_ids: loserUserIds,
  };
}

function tournamentRewardAppliedPatch(winnerUserIds = [], loserUserIds = []) {
  return {
    rewards_applied: true,
    reward_winner_user_ids: [...new Set(winnerUserIds.filter(Boolean))],
    reward_loser_user_ids: [...new Set(loserUserIds.filter(Boolean))],
    rewards_applied_date: nowIso(),
    rewards_reverted_date: null,
  };
}

function tournamentRewardResetPatch() {
  return {
    rewards_applied: false,
    reward_winner_user_ids: [],
    reward_loser_user_ids: [],
    rewards_applied_date: null,
    rewards_reverted_date: nowIso(),
  };
}

async function tournamentParticipantUserIds(tournamentId, participantId) {
  if (!participantId) return [];
  const participants = await listEntities("TournamentParticipant", { tournament_id: tournamentId }, "seed", 500);
  const participant = participants.find((row) => (
    row.id === participantId ||
    row.team_id === participantId ||
    row.captain_id === participantId ||
    row.user_id === participantId
  ));
  if (!participant) {
    return (await userFor(participantId)) ? [participantId] : [];
  }
  const memberIds = Array.isArray(participant.members)
    ? participant.members.map((member) => member?.user_id).filter(Boolean)
    : [];
  return [...new Set([
    participant.user_id,
    participant.captain_id,
    ...memberIds,
  ].filter(Boolean))];
}

function participantKey(participant) {
  return participant?.team_id || participant?.user_id || participant?.id || null;
}

function participantName(participant) {
  return participant?.team_name || participant?.user_name || participant?.name || "Open slot";
}

function participantSlotFields(participant, slot) {
  return {
    [`${slot}_id`]: participantKey(participant),
    [`${slot}_name`]: participantName(participant),
    [`${slot}_participant_id`]: participant?.id || null,
    [`${slot}_seed`]: participant?.seed || null,
  };
}

function stableHash(value) {
  return String(value || "").split("").reduce((hash, char) => (
    ((hash << 5) - hash + char.charCodeAt(0)) >>> 0
  ), 0);
}

function generatedMapPoolForMatch(match, pool = tournamentSndMapPool) {
  const round = Math.max(1, Number(match?.round || 1));
  const matchNumber = Math.max(1, Number(match?.match_number || 1));
  const tournamentOffset = stableHash(match?.tournament_id) % pool.length;
  const roundOffset = (round - 1) * tournamentBestOf;
  const matchOffset = matchNumber - 1;
  const start = (tournamentOffset + roundOffset + matchOffset) % pool.length;

  return Array.from({ length: tournamentBestOf }, (_, index) => pool[(start + index) % pool.length]);
}

function mapGenerationKey(match) {
  return [
    "snd-bo3",
    match?.tournament_id || "tournament",
    `round-${match?.round || 1}`,
    `match-${match?.match_number || 1}`,
    tournamentSndMapPool.join("-").toLowerCase(),
  ].join(":");
}

function firstHostForMatch(match, participantA, participantB) {
  const seedA = Number(match.team_a_seed || participantA?.seed || (match.team_a_id ? 1 : 999999));
  const seedB = Number(match.team_b_seed || participantB?.seed || (match.team_b_id ? 2 : 999999));
  if (seedA <= seedB) {
    return {
      id: match.team_a_id,
      name: match.team_a_name || participantName(participantA),
      seed: Number.isFinite(seedA) ? seedA : null,
    };
  }
  return {
    id: match.team_b_id,
    name: match.team_b_name || participantName(participantB),
    seed: Number.isFinite(seedB) ? seedB : null,
  };
}

function secondHostForMatch(match, participantA, participantB, firstHost) {
  const seedA = Number(match.team_a_seed || participantA?.seed || (match.team_a_id ? 1 : 999999));
  const seedB = Number(match.team_b_seed || participantB?.seed || (match.team_b_id ? 2 : 999999));
  if (firstHost?.id === match.team_a_id) {
    return {
      id: match.team_b_id,
      name: match.team_b_name || participantName(participantB),
      seed: Number.isFinite(seedB) ? seedB : null,
    };
  }
  return {
    id: match.team_a_id,
    name: match.team_a_name || participantName(participantA),
    seed: Number.isFinite(seedA) ? seedA : null,
  };
}

function generatedTournamentMaps(match, participantA, participantB) {
  const selectedMaps = generatedMapPoolForMatch(match);
  const firstHost = firstHostForMatch(match, participantA, participantB);
  const secondHost = secondHostForMatch(match, participantA, participantB, firstHost);
  const hosts = [firstHost, secondHost, firstHost];

  return selectedMaps.map((map, index) => ({
    game: index + 1,
    mode: tournamentMatchMode,
    map,
    host_team_id: hosts[index]?.id || null,
    host_team_name: hosts[index]?.name || "TBD",
    host_seed: hosts[index]?.seed || null,
  }));
}

function participantMapById(participants = []) {
  const pairs = [];
  participants.forEach((participant) => {
    [participant.id, participant.team_id, participant.user_id, participant.captain_id]
      .filter(Boolean)
      .forEach((id) => pairs.push([id, participant]));
  });
  return Object.fromEntries(pairs);
}

function tournamentMatchSetupPatch(match, participants = []) {
  const byId = participantMapById(participants);
  const participantA = byId[match.team_a_participant_id] || byId[match.team_a_id] || null;
  const participantB = byId[match.team_b_participant_id] || byId[match.team_b_id] || null;
  const teamASeed = match.team_a_seed || participantA?.seed || (match.team_a_id ? 1 : null);
  const teamBSeed = match.team_b_seed || participantB?.seed || (match.team_b_id ? 2 : null);
  const seededMatch = { ...match, team_a_seed: teamASeed, team_b_seed: teamBSeed };
  const firstHost = firstHostForMatch(seededMatch, participantA, participantB);
  const generationKey = mapGenerationKey(seededMatch);
  const maps = Array.isArray(match.maps) && match.maps.length === tournamentBestOf && match.map_generation_key === generationKey
    ? match.maps
    : generatedTournamentMaps(seededMatch, participantA, participantB);

  return {
    best_of: tournamentBestOf,
    game_mode: tournamentMatchMode,
    map_pool: tournamentSndMapPool,
    maps,
    team_a_seed: teamASeed,
    team_b_seed: teamBSeed,
    first_host_team_id: firstHost?.id || null,
    first_host_team_name: firstHost?.name || null,
    first_host_seed: firstHost?.seed || null,
    map_generation_key: generationKey,
    map_generated_by: match.map_generated_by || "system",
    map_generated_date: match.map_generated_date || nowIso(),
  };
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function seedPositions(size) {
  if (size <= 2) return [1, 2];
  const previous = seedPositions(size / 2);
  return previous.flatMap((seed) => [seed, size + 1 - seed]);
}

function hasBothTeams(match) {
  return Boolean(match?.team_a_id && match?.team_b_id);
}

async function notifyTournamentMatchAssigned(match) {
  if (!hasBothTeams(match)) return;
  const [teamAUserIds, teamBUserIds] = await Promise.all([
    tournamentParticipantUserIds(match.tournament_id, match.team_a_id),
    tournamentParticipantUserIds(match.tournament_id, match.team_b_id),
  ]);
  await notifyUsers([...teamAUserIds, ...teamBUserIds], {
    title: "Tournament match assigned",
    message: `${match.team_a_name || "Team A"} vs ${match.team_b_name || "Team B"}`,
    type: "match",
    action_url: `/tournament-match/${match.id}`,
    related_entity_id: match.id,
    related_entity_type: "TournamentMatch",
  });
}

async function completeTournament(tournamentId, winnerId, winnerName) {
  const tournament = await getEntity("Tournament", tournamentId);
  const winnerUserIds = await tournamentParticipantUserIds(tournamentId, winnerId);
  const updated = await updateEntity("Tournament", tournamentId, {
    status: "completed",
    winner_id: winnerId,
    winner_name: winnerName,
    completed_date: nowIso(),
  });

  await createEntity("TournamentWin", {
    tournament_id: tournamentId,
    tournament_name: tournament.name,
    winner_id: winnerId,
    winner_name: winnerName,
    user_ids: winnerUserIds,
    reward_item_ids: tournamentRewardItemIds(tournament),
    created_date: nowIso(),
  }).catch(() => null);

  const updatedWinners = await Promise.all(winnerUserIds.map((userId) => prisma.user.update({
    where: { id: userId },
    data: { tournament_wins: { increment: 1 } },
  }).catch(() => null)));

  const rewardTournament = { ...tournament, ...updated };
  const selectedRewardItems = await marketplaceItemsByIds(tournamentRewardItemIds(rewardTournament));
  const tournament_reward_items = await grantMarketplaceItemsToUsers(updatedWinners, selectedRewardItems, {
    tournament: rewardTournament,
    winner_id: winnerId,
    winner_name: winnerName,
    unlock_type: "tournament_champion_reward",
    unlockKeyForItem: (item) => `tournament_champion:${rewardTournament.id}:${item.id}`,
    notificationTitle: "Tournament champion reward unlocked",
    messageForItem: (item) => `${item.name} unlocked for winning ${rewardTournament.name}.`,
  });
  const unlocked_items = await grantTournamentMarketplaceUnlocks(updatedWinners, {
    tournament: rewardTournament,
    winner_id: winnerId,
    winner_name: winnerName,
  });
  const elimination_reward_items = await grantTournamentFinalEliminationRewards(rewardTournament, winnerId);

  await notifyTournamentParticipants(tournamentId, {
    title: "Tournament completed",
    message: `${winnerName} won ${tournament.name}.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournamentId,
    related_entity_type: "Tournament",
  });

  return { ...updated, reward_items: tournament_reward_items, elimination_reward_items, unlocked_items };
}

async function advanceTournamentWinner(match) {
  if (!match?.winner_id) return {};

  if (!match.next_match_round || !match.next_match_number) {
    const tournament = await completeTournament(match.tournament_id, match.winner_id, match.winner_name);
    return { tournament_completed: true, tournament };
  }

  const nextMatches = await listEntities("TournamentMatch", {
    tournament_id: match.tournament_id,
    round: match.next_match_round,
  }, "match_number", 256);
  const nextMatch = nextMatches.find((row) => String(row.match_number) === String(match.next_match_number));
  if (!nextMatch) return {};

  const slot = match.slot_in_next === "team_b" ? "team_b" : "team_a";
  const patch = {
    [`${slot}_id`]: match.winner_id,
    [`${slot}_name`]: match.winner_name,
    [`${slot}_source_match_id`]: match.id,
    [`${slot}_seed`]: match.winner_id === match.team_a_id ? match.team_a_seed : match.team_b_seed,
    [`${slot}_participant_id`]: match.winner_id === match.team_a_id ? match.team_a_participant_id : match.team_b_participant_id,
  };
  const candidate = { ...nextMatch, ...patch };
  if (hasBothTeams(candidate) && !["completed", "disputed"].includes(nextMatch.status)) {
    patch.status = "ready";
    patch.assigned_date = nowIso();
    const participants = await tournamentParticipants(match.tournament_id);
    Object.assign(patch, tournamentMatchSetupPatch(candidate, participants));
  }
  const updatedNext = await updateEntity("TournamentMatch", nextMatch.id, patch);
  if (patch.status === "ready") await notifyTournamentMatchAssigned(updatedNext);
  return { advanced_to: updatedNext };
}

function tournamentScoreResetPatch() {
  return {
    team_a_score: 0,
    team_b_score: 0,
    winner_id: null,
    winner_name: null,
    completed: false,
    completed_date: null,
    team_a_reported_score_alpha: null,
    team_a_reported_score_bravo: null,
    team_a_reported_score_by: null,
    team_a_reported_score_by_name: null,
    team_a_reported_score_date: null,
    team_b_reported_score_alpha: null,
    team_b_reported_score_bravo: null,
    team_b_reported_score_by: null,
    team_b_reported_score_by_name: null,
    team_b_reported_score_date: null,
    reported_score_alpha: null,
    reported_score_bravo: null,
    reported_score_by: null,
    reported_score_by_name: null,
    reported_score_team: null,
    reported_score_date: null,
    scores_confirmed: false,
    confirmed_score_alpha: null,
    confirmed_score_bravo: null,
    confirmed_score_date: null,
    confirmed_by: null,
    confirmed_by_name: null,
    dispute_id: null,
    score_conflict_date: null,
  };
}

function tournamentMatchHasScoreActivity(match) {
  if (!match) return false;
  if (match.completed || match.status === "completed" || match.winner_id) return true;
  if (["awaiting_team_a_report", "awaiting_team_b_report", "score_conflict", "disputed"].includes(match.status)) return true;
  return [
    "team_a_reported_score_alpha",
    "team_a_reported_score_bravo",
    "team_b_reported_score_alpha",
    "team_b_reported_score_bravo",
    "reported_score_alpha",
    "reported_score_bravo",
  ].some((field) => match[field] !== undefined && match[field] !== null);
}

async function clearTournamentChampionResult(tournamentId, oldWinnerId) {
  if (!tournamentId) return { removed_wins: 0, removed_rewards: 0 };
  const oldWinnerUserIds = oldWinnerId ? await tournamentParticipantUserIds(tournamentId, oldWinnerId) : [];
  let removedRewards = 0;

  await Promise.all(oldWinnerUserIds.map(async (userId) => {
    const user = await userFor(userId);
    if (user) {
      await prisma.user.update({
        where: { id: userId },
        data: { tournament_wins: Math.max(0, Number(user.tournament_wins || 0) - 1) },
      }).catch(() => null);
    }

    const inventory = await listEntities("UserInventory", { user_id: userId }, "-acquired_date", 500).catch(() => []);
    const championRewards = inventory.filter((item) => (
      String(item.source_tournament_id || "") === String(tournamentId)
      && item.unlock_type === "tournament_champion_reward"
      && String(item.unlock_key || "").startsWith(`tournament_champion:${tournamentId}:`)
    ));
    removedRewards += championRewards.length;
    await Promise.all(championRewards.map((item) => deleteEntity("UserInventory", item.id).catch(() => null)));
  }));

  const wins = await listEntities("TournamentWin", { tournament_id: tournamentId }, "-created_date", 500).catch(() => []);
  await Promise.all(wins.map((win) => deleteEntity("TournamentWin", win.id).catch(() => null)));
  return { removed_wins: wins.length, removed_rewards: removedRewards };
}

async function clearParticipantEliminationFromMatch(tournamentId, matchId) {
  const participants = await tournamentParticipants(tournamentId).catch(() => []);
  const cleared = [];
  await Promise.all(participants.map(async (participant) => {
    if (String(participant.eliminated_match_id || "") !== String(matchId)) return;
    const updated = await updateEntity("TournamentParticipant", participant.id, {
      eliminated: false,
      eliminated_match_id: null,
      eliminated_round: null,
      eliminated_by: null,
      eliminated_by_name: null,
      eliminated_date: null,
    }).catch(() => null);
    if (updated) cleared.push(updated);
  }));
  return cleared;
}

async function undoTournamentAdvancement(match, replacement = null) {
  if (!match?.winner_id) return {};

  if (match.next_match_round && match.next_match_number) {
    const nextMatches = await listEntities("TournamentMatch", {
      tournament_id: match.tournament_id,
      round: match.next_match_round,
    }, "match_number", 256);
    const nextMatch = nextMatches.find((row) => String(row.match_number) === String(match.next_match_number));
    if (!nextMatch) return {};

    const slot = match.slot_in_next === "team_b" ? "team_b" : "team_a";
    const sourceField = `${slot}_source_match_id`;
    const idField = `${slot}_id`;
    const ownsSlot = String(nextMatch[sourceField] || "") === String(match.id)
      || (!nextMatch[sourceField] && String(nextMatch[idField] || "") === String(match.winner_id));
    if (!ownsSlot) return {};

    if (tournamentMatchHasScoreActivity(nextMatch)) {
      badRequest("Cannot revert this result because the next-round match already has a score or winner. Reset that match first.");
    }

    const patch = {
      [`${slot}_id`]: null,
      [`${slot}_name`]: null,
      [`${slot}_source_match_id`]: null,
      [`${slot}_seed`]: null,
      [`${slot}_participant_id`]: null,
      status: "pending",
      assigned_date: null,
      maps: [],
      first_host_team_id: null,
      first_host_team_name: null,
      first_host_seed: null,
      map_generation_key: null,
    };
    const updatedNext = await updateEntity("TournamentMatch", nextMatch.id, patch);
    return { cleared_next_match: updatedNext };
  }

  const tournament = await getEntity("Tournament", match.tournament_id).catch(() => null);
  const nextRoundMatches = await listEntities("TournamentMatch", {
    tournament_id: match.tournament_id,
    round: Number(match.round || 0) + 1,
  }, "match_number", 256).catch(() => []);
  const downstreamMatch = nextRoundMatches.find((row) => (
    String(row.team_a_id || "") === String(match.winner_id)
    || String(row.team_b_id || "") === String(match.winner_id)
    || cleanName(row.team_a_name) === cleanName(match.winner_name)
    || cleanName(row.team_b_name) === cleanName(match.winner_name)
  ));

  if (downstreamMatch) {
    if (tournamentMatchHasScoreActivity(downstreamMatch)) {
      badRequest("Cannot revert this result because a downstream tournament match already has a score or winner. Reset that match first.");
    }
    const patch = {};
    ["team_a", "team_b"].forEach((slot) => {
      if (
        String(downstreamMatch[`${slot}_id`] || "") === String(match.winner_id)
        || cleanName(downstreamMatch[`${slot}_name`]) === cleanName(match.winner_name)
      ) {
        patch[`${slot}_id`] = replacement?.id || null;
        patch[`${slot}_name`] = replacement?.name || null;
        patch[`${slot}_source_match_id`] = replacement ? match.id : null;
        patch[`${slot}_seed`] = replacement?.seed || null;
        patch[`${slot}_participant_id`] = replacement?.participant_id || null;
      }
    });
    if (Object.keys(patch).length > 0) {
      const candidate = { ...downstreamMatch, ...patch };
      Object.assign(patch, {
        status: hasBothTeams(candidate) ? "ready" : "pending",
        assigned_date: hasBothTeams(candidate) ? nowIso() : null,
        maps: [],
        first_host_team_id: null,
        first_host_team_name: null,
        first_host_seed: null,
        map_generation_key: null,
      });
      if (hasBothTeams(candidate)) {
        const participants = await tournamentParticipants(match.tournament_id);
        Object.assign(patch, tournamentMatchSetupPatch(candidate, participants));
      }
      const updatedLegacyNext = await updateEntity("TournamentMatch", downstreamMatch.id, patch);
      if (patch.status === "ready") await notifyTournamentMatchAssigned(updatedLegacyNext);
      return replacement ? { updated_next_match: updatedLegacyNext } : { cleared_next_match: updatedLegacyNext };
    }
  }

  if (tournament?.status === "completed" || tournament?.winner_id) {
    const cleanup = await clearTournamentChampionResult(tournament.id, match.winner_id);
    const reopened = await updateEntity("Tournament", tournament.id, {
      status: "in_progress",
      winner_id: null,
      winner_name: null,
      completed_date: null,
      corrected_date: nowIso(),
    });
    return { tournament_reopened: reopened, cleanup };
  }

  return {};
}

async function advanceLegacyTournamentRound(tournamentId, completedRound) {
  const roundMatches = await listEntities("TournamentMatch", { tournament_id: tournamentId, round: completedRound }, "match_number", 256);
  if (roundMatches.length === 0 || roundMatches.some((match) => match.status !== "completed" || !match.winner_id)) {
    return {};
  }

  const existingNextRound = await listEntities("TournamentMatch", { tournament_id: tournamentId, round: Number(completedRound) + 1 }, "match_number", 256);
  if (existingNextRound.length > 0) return {};

  const winners = roundMatches.map((match) => ({
    id: match.winner_id,
    name: match.winner_name,
  }));

  if (winners.length === 1) {
    const tournament = await completeTournament(tournamentId, winners[0].id, winners[0].name);
    return { tournament_completed: true, tournament };
  }

  const created = [];
  for (let index = 0; index < winners.length; index += 2) {
    const a = winners[index];
    const b = winners[index + 1];
    created.push(await createEntity("TournamentMatch", {
      tournament_id: tournamentId,
      bracket: "winner",
      round: Number(completedRound) + 1,
      match_number: (index / 2) + 1,
      team_a_id: a?.id,
      team_a_name: a?.name,
      team_b_id: b?.id,
      team_b_name: b?.name,
      status: b ? "ready" : "completed",
      winner_id: b ? null : a?.id,
      winner_name: b ? null : a?.name,
      completed: !b,
      completed_date: b ? null : nowIso(),
      created_date: nowIso(),
    }));
  }

  await Promise.all(created.map((match) => notifyTournamentMatchAssigned(match)));
  const byeMatch = created.find((match) => match.status === "completed" && match.winner_id);
  if (byeMatch) return advanceLegacyTournamentRound(tournamentId, byeMatch.round);
  return { created_next_round: created };
}

async function matchParticipantIds(matchType, match) {
  if (matchType === "tournament") {
    const [teamAUserIds, teamBUserIds] = await Promise.all([
      tournamentParticipantUserIds(match.tournament_id, match.team_a_id),
      tournamentParticipantUserIds(match.tournament_id, match.team_b_id),
    ]);
    return [...new Set([...teamAUserIds, ...teamBUserIds].filter(Boolean))];
  }
  return [...new Set([match.host_id, match.challenger_id].filter(Boolean))];
}

async function activeTeamMembers(teamId) {
  const members = await listEntities("TeamMember", { team_id: teamId }, "-joined_date", 50);
  return members.filter((member) => member.is_active !== false);
}

function normalizeTeamType(value) {
  const type = String(value || "8s").toLowerCase();
  if (type === "eights") return "8s";
  if (["8s", "wager", "tournament", "general"].includes(type)) return type;
  return "8s";
}

function rosterLimitForTeam(team, fallback = 4) {
  const size = Number(team?.roster_size || fallback);
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

function paymentModeFor(value) {
  return value === "full_team" ? "full_team" : "own";
}

function teamTypeMatches(team, expectedType) {
  const teamType = normalizeTeamType(team?.team_type);
  return teamType === expectedType || teamType === "general";
}

function orderedRoster(members, captainId) {
  return [...(members || [])].sort((a, b) => {
    if (a.user_id === captainId) return -1;
    if (b.user_id === captainId) return 1;
    return new Date(a.joined_date || 0) - new Date(b.joined_date || 0);
  });
}

async function userActiveTeamMemberships(userId, teamType) {
  const memberships = await listEntities("TeamMember", { user_id: userId }, "-joined_date", 100).catch(() => []);
  const rows = await Promise.all(memberships
    .filter((membership) => membership.is_active !== false)
    .map(async (membership) => {
      const team = await getEntity("Team", membership.team_id).catch(() => null);
      if (!team || team.is_active === false) return null;
      if (teamType && !teamTypeMatches(team, teamType)) return null;
      return { membership, team };
    }));
  return rows.filter(Boolean);
}

async function teamRoster(teamId, { requiredSize = 1, expectedType, exactSize = false, captainId } = {}) {
  const team = await getEntity("Team", teamId || "").catch(() => null);
  if (!team || team.is_active === false) {
    const error = new Error("Select an active team");
    error.status = 400;
    throw error;
  }
  if (expectedType && !teamTypeMatches(team, expectedType)) {
    const error = new Error(`Select a ${expectedType} team`);
    error.status = 400;
    throw error;
  }
  if (captainId && team.captain_id !== captainId) {
    const error = new Error("Only the team captain can enroll this team");
    error.status = 403;
    throw error;
  }

  const members = orderedRoster(await activeTeamMembers(team.id), team.captain_id);
  if (members.length < requiredSize) {
    const error = new Error(`${team.name} needs ${requiredSize} active roster members`);
    error.status = 400;
    throw error;
  }
  if (exactSize && rosterLimitForTeam(team, requiredSize) !== requiredSize) {
    const error = new Error(`Team roster size must match ${requiredSize} players`);
    error.status = 400;
    throw error;
  }
  return { team, members, roster: members.slice(0, requiredSize) };
}

async function activeTournamentLocksForTeam(teamId) {
  const participants = await listEntities("TournamentParticipant", { team_id: teamId }, "-registered_date", 100).catch(() => []);
  const checks = await Promise.all(participants.map(async (participant) => {
    if (participant.roster_locked) return participant;
    const tournament = await getEntity("Tournament", participant.tournament_id).catch(() => null);
    if (!tournament) return null;
    const registrationEnded = tournament.registration_end && new Date(tournament.registration_end) <= new Date();
    if (registrationEnded || !tournamentStatusesOpenForRegistration.includes(tournament.status)) return participant;
    return null;
  }));
  return checks.filter(Boolean);
}

async function rosterChangeError(team) {
  if (!team || team.is_active === false) return "Team is not active";
  if (team.roster_locked) return "Roster is locked";
  const locks = await activeTournamentLocksForTeam(team.id);
  if (locks.length > 0) return "Roster is locked by tournament registration";
  return null;
}

async function findUserForTeamInvite(identifier) {
  const needle = String(identifier || "").trim().toLowerCase();
  if (!needle) return null;
  const direct = await userFor(identifier).catch(() => null);
  if (direct) return direct;
  const users = await listEntities("User", {}, "-created_date", 500).catch(() => []);
  return users.find((user) => [
    user.id,
    user.email,
    user.username,
    user.handle,
    user.display_name,
    user.full_name,
  ].filter(Boolean).some((value) => String(value).toLowerCase() === needle)) || null;
}

async function createOrReactivateTeamMember(team, user, role = "member") {
  const existingRows = await listEntities("TeamMember", { team_id: team.id, user_id: user.id }, "-joined_date", 10).catch(() => []);
  const existing = existingRows[0];
  const payload = {
    team_id: team.id,
    user_id: user.id,
    user_name: nameFor(user),
    role,
    team_type: normalizeTeamType(team.team_type),
    joined_date: nowIso(),
    is_active: true,
  };
  if (existing) return updateEntity("TeamMember", existing.id, payload);
  return createEntity("TeamMember", payload);
}

async function manageTeam(req) {
  const action = String(req.body.action || "").toLowerCase();

  if (action === "create") {
    const name = String(req.body.name || "").trim();
    const tag = String(req.body.tag || "").trim().toUpperCase().slice(0, 6);
    const teamType = normalizeTeamType(req.body.team_type);
    const rosterSize = Math.max(1, Number(req.body.roster_size || (teamType === "8s" ? 4 : 2)));
    if (!name || !tag) return { success: false, error: "Team name and tag are required" };
    if (teamType === "8s") {
      const active8sTeams = await userActiveTeamMemberships(req.user.id, "8s");
      if (active8sTeams.length > 0) {
        return { success: false, error: "Leave or disband your current 8s team before creating another" };
      }
    }

    const team = await createEntity("Team", {
      name,
      tag,
      captain_id: req.user.id,
      captain_name: nameFor(req.user),
      region: req.body.region || req.user.region || "na",
      team_type: teamType,
      roster_size: rosterSize,
      roster_locked: false,
      total_wins: 0,
      total_losses: 0,
      total_earnings: 0,
      ranking: Number(req.body.ranking || 0),
      is_active: true,
      created_date: nowIso(),
    });
    const member = await createOrReactivateTeamMember(team, req.user, "captain");
    return { success: true, team, member };
  }

  const team = await getEntity("Team", req.body.team_id || "").catch(() => null);
  if (!team) return { success: false, error: "Team not found" };

  if (action === "invite") {
    if (team.captain_id !== req.user.id) return { success: false, error: "Only the team captain can invite players" };
    const lockError = await rosterChangeError(team);
    if (lockError) return { success: false, error: lockError };
    const members = await activeTeamMembers(team.id);
    if (members.length >= rosterLimitForTeam(team)) return { success: false, error: "Team roster is full" };

    const target = await findUserForTeamInvite(req.body.user_id || req.body.player || req.body.identifier);
    if (!target) return { success: false, error: "Player not found" };
    if (target.id === req.user.id) return { success: false, error: "You are already on this team" };
    if (members.some((member) => member.user_id === target.id)) return { success: false, error: "Player is already on this team" };

    if (normalizeTeamType(team.team_type) === "8s") {
      const target8sTeams = await userActiveTeamMemberships(target.id, "8s");
      if (target8sTeams.length > 0) return { success: false, error: "Player already has an active 8s team" };
    }

    const existingInvite = await firstEntity("TeamInvite", {
      team_id: team.id,
      invited_user_id: target.id,
      status: "pending",
    }).catch(() => null);
    if (existingInvite) return { success: false, error: "Invite already pending" };

    const invite = await createEntity("TeamInvite", {
      team_id: team.id,
      team_name: team.name,
      team_type: normalizeTeamType(team.team_type),
      invited_user_id: target.id,
      invited_user_name: nameFor(target),
      invited_by: req.user.id,
      invited_by_name: nameFor(req.user),
      status: "pending",
      created_date: nowIso(),
    });
    await notifyUser(target.id, {
      title: "Team invite",
      message: `${nameFor(req.user)} invited you to ${team.name}.`,
      type: "system",
      action_url: "/teams",
      related_entity_id: invite.id,
      related_entity_type: "TeamInvite",
    });
    return { success: true, invite };
  }

  if (action === "respond_invite") {
    const invite = await getEntity("TeamInvite", req.body.invite_id || "").catch(() => null);
    if (!invite || invite.invited_user_id !== req.user.id || invite.status !== "pending") {
      return { success: false, error: "Invite is not available" };
    }
    const inviteTeam = await getEntity("Team", invite.team_id).catch(() => null);
    if (!inviteTeam || inviteTeam.is_active === false) {
      await updateEntity("TeamInvite", invite.id, { status: "cancelled", responded_date: nowIso() }).catch(() => null);
      return { success: false, error: "Team is no longer active" };
    }
    const decision = req.body.decision === "accept" ? "accepted" : "declined";
    if (decision === "declined") {
      const declined = await updateEntity("TeamInvite", invite.id, { status: "declined", responded_date: nowIso() });
      return { success: true, invite: declined };
    }
    const lockError = await rosterChangeError(inviteTeam);
    if (lockError) return { success: false, error: lockError };
    const members = await activeTeamMembers(inviteTeam.id);
    if (members.length >= rosterLimitForTeam(inviteTeam)) return { success: false, error: "Team roster is full" };
    if (normalizeTeamType(inviteTeam.team_type) === "8s") {
      const active8sTeams = await userActiveTeamMemberships(req.user.id, "8s");
      if (active8sTeams.some((row) => row.team.id !== inviteTeam.id)) {
        return { success: false, error: "Leave your current 8s team before accepting another 8s invite" };
      }
    }
    const member = await createOrReactivateTeamMember(inviteTeam, req.user, "member");
    const accepted = await updateEntity("TeamInvite", invite.id, { status: "accepted", responded_date: nowIso() });
    await notifyUser(inviteTeam.captain_id, {
      title: "Invite accepted",
      message: `${nameFor(req.user)} joined ${inviteTeam.name}.`,
      type: "system",
      action_url: "/teams",
      related_entity_id: inviteTeam.id,
      related_entity_type: "Team",
    });
    return { success: true, invite: accepted, member };
  }

  if (action === "kick") {
    if (team.captain_id !== req.user.id) return { success: false, error: "Only the team captain can kick players" };
    const lockError = await rosterChangeError(team);
    if (lockError) return { success: false, error: lockError };
    const member = await getEntity("TeamMember", req.body.member_id || "").catch(() => null);
    if (!member || member.team_id !== team.id || member.is_active === false) return { success: false, error: "Member not found" };
    if (member.user_id === team.captain_id || member.role === "captain") return { success: false, error: "Disband the team to remove the captain" };
    const updated = await updateEntity("TeamMember", member.id, { is_active: false, left_date: nowIso(), removed_by: req.user.id });
    await notifyUser(member.user_id, {
      title: "Removed from team",
      message: `You were removed from ${team.name}.`,
      type: "system",
      action_url: "/teams",
      related_entity_id: team.id,
      related_entity_type: "Team",
    });
    return { success: true, member: updated };
  }

  if (action === "leave") {
    const memberRows = await listEntities("TeamMember", { team_id: team.id, user_id: req.user.id }, "-joined_date", 10).catch(() => []);
    const member = memberRows.find((row) => row.is_active !== false);
    if (!member) return { success: false, error: "You are not on this team" };
    const lockError = await rosterChangeError(team);
    if (lockError) return { success: false, error: lockError };
    const members = await activeTeamMembers(team.id);
    if (member.user_id === team.captain_id && members.length > 1) {
      return { success: false, error: "Disband the team before the captain leaves" };
    }
    const updated = await updateEntity("TeamMember", member.id, { is_active: false, left_date: nowIso() });
    let updatedTeam = team;
    if (member.user_id === team.captain_id) {
      updatedTeam = await updateEntity("Team", team.id, { is_active: false, disbanded_date: nowIso(), disbanded_by: req.user.id });
    }
    return { success: true, member: updated, team: updatedTeam };
  }

  if (action === "disband") {
    if (team.captain_id !== req.user.id) return { success: false, error: "Only the team captain can disband the team" };
    const lockError = await rosterChangeError(team);
    if (lockError) return { success: false, error: lockError };
    const members = await activeTeamMembers(team.id);
    await Promise.all(members.map((member) => updateEntity("TeamMember", member.id, {
      is_active: false,
      left_date: nowIso(),
      removed_by: req.user.id,
    }).catch(() => null)));
    const invites = await listEntities("TeamInvite", { team_id: team.id, status: "pending" }, "-created_date", 100).catch(() => []);
    await Promise.all(invites.map((invite) => updateEntity("TeamInvite", invite.id, {
      status: "cancelled",
      responded_date: nowIso(),
    }).catch(() => null)));
    const updatedTeam = await updateEntity("Team", team.id, {
      is_active: false,
      disbanded_date: nowIso(),
      disbanded_by: req.user.id,
    });
    await notifyUsers(members.filter((member) => member.user_id !== req.user.id).map((member) => member.user_id), {
      title: "Team disbanded",
      message: `${team.name} was disbanded.`,
      type: "system",
      action_url: "/teams",
      related_entity_id: team.id,
      related_entity_type: "Team",
    });
    return { success: true, team: updatedTeam };
  }

  return { success: false, error: "Unknown team action" };
}

function wagerTeamTypeFor(matchType) {
  return matchType === "8s" ? "8s" : "wager";
}

async function createWagerParticipantsForRoster({ wager, side, team, roster, entryFee, paymentMode, payer }) {
  const isFree = entryFee <= 0;
  const captainMember = roster.find((member) => member.user_id === payer.id) || roster[0];
  const totalStake = isFree ? 0 : (paymentMode === "full_team" ? roundedMoney(entryFee * roster.length) : entryFee);
  let escrow = { transaction: null };

  if (totalStake > 0) {
    escrow = await escrowWagerStake({
      userId: payer.id,
      wagerId: wager.id,
      entryFee: totalStake,
      team: side,
    });
  }

  const created = [];
  for (const member of roster) {
    const isPayer = member.user_id === payer.id;
    const paidByCaptain = paymentMode === "full_team" && totalStake > 0;
    const paid = isFree || isPayer || paidByCaptain;
    const paidAmount = isFree ? 0 : paidByCaptain && member.user_id === captainMember.user_id ? totalStake : isPayer ? entryFee : 0;
    const participant = await createEntity("WagerParticipant", {
      wager_id: wager.id,
      user_id: member.user_id,
      user_name: member.user_name,
      team: side,
      team_id: team?.id,
      team_name: team?.name,
      is_captain: member.user_id === team?.captain_id,
      entry_fee_paid: paidAmount,
      payment_status: paid ? "paid" : "pending",
      paid_by: paid ? payer.id : null,
      escrowed: paidAmount > 0,
      escrow_transaction_id: paidAmount > 0 ? escrow.transaction?.id : null,
      joined_date: nowIso(),
    });
    created.push(participant);

    if (!paid && entryFee > 0) {
      await notifyUser(member.user_id, {
        title: "Wager entry pending",
        message: `${team?.name || "Your team"} needs your $${entryFee.toFixed(2)} entry for ${wager.team_size}.`,
        type: "wager",
        action_url: `/wagers-match/${wager.id}`,
        related_entity_id: wager.id,
        related_entity_type: "Wager",
      });
    } else if (member.user_id !== payer.id) {
      await notifyUser(member.user_id, {
        title: "Wager roster enrolled",
        message: `${team?.name || "Your team"} was enrolled in a ${wager.team_size} wager.`,
        type: "wager",
        action_url: `/wagers-match/${wager.id}`,
        related_entity_id: wager.id,
        related_entity_type: "Wager",
      });
    }
  }

  return created;
}

function participantHasPaid(participant, entryFee) {
  return entryFee <= 0 || participant.payment_status === "paid" || money(participant.entry_fee_paid) > 0;
}

async function maybeStartWager(wagerId) {
  const wager = await getEntity("Wager", wagerId);
  const requiredSize = requiredRosterSize(wager.team_size);
  const entryFee = money(wager.entry_fee ?? wager.amount);
  const participants = await listEntities("WagerParticipant", { wager_id: wager.id }, "-joined_date", 20).catch(() => []);
  const hostParticipants = participants.filter((participant) => participant.team === "host");
  const challengerParticipants = participants.filter((participant) => participant.team === "challenger");
  const hasBothRosters = hostParticipants.length >= requiredSize && challengerParticipants.length >= requiredSize;
  const allPaid = [...hostParticipants.slice(0, requiredSize), ...challengerParticipants.slice(0, requiredSize)]
    .every((participant) => participantHasPaid(participant, entryFee));
  const shouldStart = hasBothRosters && allPaid;
  const update = shouldStart
    ? {
      status: "in_progress",
      match_started_date: wager.match_started_date || nowIso(),
      match_start_deadline: wager.match_start_deadline || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }
    : {
      status: wager.challenger_id ? "accepted" : "open",
    };
  const updated = await updateEntity("Wager", wager.id, update);
  return { wager: updated, participants, ready: shouldStart };
}

async function payWagerEntry(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  if (!wager || ["completed", "cancelled", "disputed"].includes(wager.status)) {
    return { success: false, error: "Wager is not payable" };
  }
  const entryFee = money(wager.entry_fee ?? wager.amount);
  const participants = await listEntities("WagerParticipant", { wager_id: wager.id, user_id: req.user.id }, "-joined_date", 10).catch(() => []);
  const participant = participants.find((row) => row.payment_status !== "paid" && money(row.entry_fee_paid) <= 0) || participants[0];
  if (!participant) return { success: false, error: "You are not enrolled in this wager" };
  if (participantHasPaid(participant, entryFee)) return { success: true, already_paid: true, wager };

  const escrow = await escrowWagerStake({
    userId: req.user.id,
    wagerId: wager.id,
    entryFee,
    team: participant.team,
  });
  const updatedParticipant = await updateEntity("WagerParticipant", participant.id, {
    entry_fee_paid: entryFee,
    payment_status: "paid",
    paid_by: req.user.id,
    escrowed: entryFee > 0,
    escrow_transaction_id: escrow.transaction?.id,
    paid_date: nowIso(),
  });
  const startState = await maybeStartWager(wager.id);
  return { success: true, participant: updatedParticipant, ...startState };
}

async function assertTournamentRegistrationAllowed(req, tournament, team, members) {
  if (!tournamentStatusesOpenForRegistration.includes(tournament.status)) {
    return "Registration is closed";
  }
  if (Number(tournament.max_teams || 0) && Number(tournament.registered_teams || 0) >= Number(tournament.max_teams || 0)) {
    return "Tournament is full";
  }
  const suspendedUntil = req.user.suspended_until ? new Date(req.user.suspended_until) : null;
  if (req.user.is_banned || (suspendedUntil && suspendedUntil > new Date())) {
    return "Suspended or banned users cannot register";
  }

  const feeType = tournament.entry_type || (tournament.is_premium_only ? "premium" : (Number(tournament.entry_fee || 0) > 0 ? "credits" : "free"));
  const requiresPremium = feeType === "premium" || feeType === "credits_premium";
  if (requiresPremium && !req.user.is_premium) {
    return "Premium membership is required";
  }
  const requiresCredits = feeType === "credits" || feeType === "credits_premium";
  if (requiresCredits && Number(req.user.credits || 0) < Number(tournament.entry_fee || 0)) {
    return "Not enough credits";
  }

  const requiredSize = requiredRosterSize(tournament.team_size);
  if (!team) return "Select a team to register for tournaments";
  if (team.captain_id !== req.user.id) return "Only the team captain can register the team";
  if (!teamTypeMatches(team, "tournament")) return "Select a tournament team";
  if (rosterLimitForTeam(team, requiredSize) !== requiredSize) return `Team roster size must match ${tournament.team_size}`;
  if ((members || []).length !== requiredSize) return `${tournament.team_size} tournaments require exactly ${requiredSize} active roster members`;
  const memberUsers = await Promise.all((members || []).map((member) => userFor(member.user_id)));
  const bannedMember = memberUsers.find((memberUser) => {
    const memberSuspendedUntil = memberUser?.metadata?.suspended_until ? new Date(memberUser.metadata.suspended_until) : null;
    return memberUser?.is_banned || (memberSuspendedUntil && memberSuspendedUntil > new Date());
  });
  if (bannedMember) return "Suspended or banned roster members cannot register";

  const memberIds = (members || []).map((member) => member.user_id).filter(Boolean);
  const existingParticipants = await listEntities("TournamentParticipant", { tournament_id: tournament.id }, "seed", 500).catch(() => []);
  const duplicatePlayer = existingParticipants.find((participant) => {
    const participantIds = participantUserIds(participant);
    return memberIds.some((memberId) => participantIds.includes(memberId));
  });
  if (duplicatePlayer) {
    return "A roster member is already registered for this tournament";
  }

  return null;
}

async function registerTournament(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  const requiredSize = requiredRosterSize(tournament.team_size);
  const { team, members } = await teamRoster(req.body.team_id, {
    requiredSize,
    expectedType: "tournament",
    exactSize: true,
    captainId: req.user.id,
  });

  const duplicate = await firstEntity("TournamentParticipant", { tournament_id: tournament.id, team_id: team.id }).catch(() => null);
  if (duplicate) return { success: false, error: "Already registered" };

  const validationError = await assertTournamentRegistrationAllowed(req, tournament, team, members);
  if (validationError) return { success: false, error: validationError };

  const feeType = tournament.entry_type || (tournament.is_premium_only ? "premium" : (Number(tournament.entry_fee || 0) > 0 ? "credits" : "free"));
  const entryFee = Number(tournament.entry_fee || 0);
  const paymentMode = paymentModeFor(req.body.payment_mode);
  const totalEntryFee = paymentMode === "full_team" ? entryFee * requiredSize : entryFee;
  const requiresCreditPayment = feeType === "credits" || feeType === "credits_premium";
  if (requiresCreditPayment && entryFee > 0) {
    if (paymentMode === "full_team") {
      if (Number(req.user.credits || 0) < totalEntryFee) {
        return { success: false, error: "Not enough credits" };
      }
      await prisma.user.update({
        where: { id: req.user.id },
        data: { credits: { decrement: totalEntryFee } },
      });
    } else {
      const memberUsers = await Promise.all(members.map((member) => userFor(member.user_id)));
      const unpaidMember = memberUsers.find((memberUser) => Number(memberUser?.credits || 0) < entryFee);
      if (unpaidMember) return { success: false, error: `${nameFor(unpaidMember)} does not have enough credits` };
      await Promise.all(memberUsers.map((memberUser) => prisma.user.update({
        where: { id: memberUser.id },
        data: { credits: { decrement: entryFee } },
      })));
    }
  }

  const existingCount = Number(tournament.registered_teams || 0);
  const captainName = team.captain_name || nameFor(req.user);
  const teamName = team.name;
  const participantMembers = members.map((member) => ({ user_id: member.user_id, user_name: member.user_name }));

  const participant = await createEntity("TournamentParticipant", {
    tournament_id: tournament.id,
    team_id: team.id,
    team_name: teamName,
    captain_id: team.captain_id,
    captain_name: captainName,
    members: participantMembers,
    seed: existingCount + 1,
    eliminated: false,
    entry_type: feeType,
    payment_mode: paymentMode,
    entry_fee_paid: requiresCreditPayment ? (paymentMode === "full_team" ? totalEntryFee : entryFee * requiredSize) : 0,
    paid_member_ids: participantMembers.map((member) => member.user_id),
    roster_locked: true,
    registered_date: nowIso(),
  });

  await updateEntity("Tournament", tournament.id, {
    registered_teams: existingCount + 1,
  });

  await notifyUsers(participantUserIds(participant), {
    title: "Tournament registered",
    message: `${teamName} registered for ${tournament.name}.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournament.id,
    related_entity_type: "Tournament",
  });

  return { success: true, participant };
}

async function updateTournament(req) {
  assertStaff(req, "admin");
  const tournament = await updateEntity("Tournament", req.body.tournament_id, {
    ...req.body.patch,
    updated_by: req.user.id,
    updated_by_name: nameFor(req.user),
    updated_date: nowIso(),
  });
  return { success: true, tournament };
}

async function deleteTournament(req) {
  assertStaff(req, "admin");
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  const [matches, participants, wins] = await Promise.all([
    listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500).catch(() => []),
    listEntities("TournamentParticipant", { tournament_id: tournament.id }, "seed", 500).catch(() => []),
    listEntities("TournamentWin", { tournament_id: tournament.id }, "-created_date", 500).catch(() => []),
  ]);
  await Promise.all(matches.map((match) => deleteEntity("TournamentMatch", match.id).catch(() => null)));
  await Promise.all(participants.map((participant) => deleteEntity("TournamentParticipant", participant.id).catch(() => null)));
  await Promise.all(wins.map((win) => deleteEntity("TournamentWin", win.id).catch(() => null)));
  await deleteEntity("Tournament", tournament.id);
  return { success: true };
}

async function cancelTournament(req) {
  assertStaff(req, "admin");
  const tournament = await updateEntity("Tournament", req.body.tournament_id, {
    status: "cancelled",
    cancelled_by: req.user.id,
    cancelled_by_name: nameFor(req.user),
    cancel_reason: req.body.reason || "Cancelled by admin",
    cancelled_date: nowIso(),
  });
  await notifyTournamentParticipants(tournament.id, {
    title: "Tournament cancelled",
    message: `${tournament.name} was cancelled.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournament.id,
    related_entity_type: "Tournament",
  });
  return { success: true, tournament };
}

async function closeTournamentRegistration(req) {
  assertStaff(req, "admin");
  const tournament = await updateEntity("Tournament", req.body.tournament_id, {
    status: "closed",
    registration_closed_date: nowIso(),
    registration_closed_by: req.user.id,
  }).catch(async () => updateEntity("Tournament", req.body.tournament_id, {
    status: "in_progress",
    registration_closed_date: nowIso(),
    registration_closed_by: req.user.id,
  }));
  await notifyTournamentParticipants(tournament.id, {
    title: "Registration closed",
    message: `${tournament.name} registration has closed.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournament.id,
    related_entity_type: "Tournament",
  });
  const bracket = await generateTournamentBracket({ ...req, body: { tournament_id: tournament.id, start_immediately: false, system: true } });
  return { success: true, tournament, bracket };
}

async function extendTournamentRegistration(req) {
  assertStaff(req, "admin");
  const current = await getEntity("Tournament", req.body.tournament_id);
  const hours = Math.max(1, Number(req.body.hours || 24));
  const baseDate = current.registration_end ? new Date(current.registration_end) : new Date();
  const registrationEnd = new Date(Math.max(baseDate.getTime(), Date.now()) + (hours * 60 * 60 * 1000)).toISOString();
  const tournament = await updateEntity("Tournament", current.id, {
    status: tournamentStatusesStarted.includes(current.status) ? current.status : "registration",
    registration_end: registrationEnd,
    registration_extended_by: req.user.id,
    registration_extended_date: nowIso(),
  });
  await notifyTournamentParticipants(tournament.id, {
    title: "Registration extended",
    message: `${tournament.name} registration was extended.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournament.id,
    related_entity_type: "Tournament",
  });
  return { success: true, tournament };
}

async function completeRegistration(req) {
  const result = await ensureUserRecords(req.userRow, req.body || {});
  return { success: true, ...result };
}

function normalizeMatchType(matchType) {
  const value = String(matchType || "wager").toLowerCase();
  if (value === "ranked") return "ranked";
  if (value === "tournament") return "tournament";
  return "wager";
}

function matchEntityFor(matchType) {
  if (matchType === "ranked") return "RankedMatch";
  if (matchType === "tournament") return "TournamentMatch";
  return "Wager";
}

function matchRouteFor(matchType, match) {
  if (matchType === "ranked") return `/ranked-match/${match.id}`;
  if (matchType === "tournament") return `/tournament-match/${match.id}`;
  if (match.match_type === "8s") return `/8s-match/${match.id}`;
  if (match.match_type === "xp") return `/xp-match/${match.id}`;
  if (match.match_type === "ranked") return `/match-room/${match.id}`;
  return `/wagers-match/${match.id}`;
}

function matchRoomTeamNames(matchType, match) {
  if (matchType === "tournament") {
    return {
      teamA: match.team_a_name || "Team A",
      teamB: match.team_b_name || "Team B",
    };
  }

  return {
    teamA: match.host_team_name || match.host_name || "Team Alpha",
    teamB: match.challenger_team_name || match.challenger_name || "Team Bravo",
  };
}

async function createMatchRoomSystemMessage(matchType, match, content, actor) {
  if (!match?.id || !content) return null;
  const actorRole = actor?.role || "user";
  const senderName = actor && staffRoles.includes(actorRole)
    ? `Admin ${nameFor(actor)}`
    : actor ? nameFor(actor) : "Match Admin";
  return createEntity("ChatMessage", {
    conversation_id: match.id,
    sender_id: actor?.id || "system",
    sender_name: senderName,
    recipient_id: match.id,
    recipient_name: "Match room",
    content,
    is_read: false,
    system: true,
    match_type: matchType,
    created_date: nowIso(),
  }).catch(() => null);
}

async function openMatchAdminTicket(matchId, ticketId) {
  if (ticketId) {
    return getEntity("Ticket", ticketId).catch(() => null);
  }

  const tickets = await listEntities("Ticket", { related_entity_id: matchId }, "-created_date", 50).catch(() => []);
  return tickets.find((row) => row.requested_admin === true && openTicketStatuses.includes(row.status || "open")) || null;
}

function resultReportFor(matchType, match) {
  if (matchType === "tournament") {
    return {
      team_a_score: match.team_a_score,
      team_b_score: match.team_b_score,
      winner_id: match.winner_id,
      winner_name: match.winner_name,
      reported_score_by: match.reported_score_by,
      status: match.status,
    };
  }

  return {
    host_reported_score_alpha: match.host_reported_score_alpha,
    host_reported_score_bravo: match.host_reported_score_bravo,
    challenger_reported_score_alpha: match.challenger_reported_score_alpha,
    challenger_reported_score_bravo: match.challenger_reported_score_bravo,
    confirmed_score_alpha: match.confirmed_score_alpha,
    confirmed_score_bravo: match.confirmed_score_bravo,
    reported_score_by: match.reported_score_by,
    winner_id: match.winner_id,
    winner_name: match.winner_name,
    status: match.status,
  };
}

async function ticketMatchContext(matchTypeInput, matchId) {
  const matchType = normalizeMatchType(matchTypeInput);
  if (!matchId) return { matchType, match: null, actionUrl: "/admin", participantUserIds: [] };

  const entityName = matchEntityFor(matchType);
  const match = await getEntity(entityName, matchId);
  const [participantUserIds, chatLogs, matchHistory, disputes] = await Promise.all([
    matchParticipantIds(matchType, match).catch(() => []),
    listEntities("ChatMessage", { conversation_id: match.id }, "-created_date", 100).catch(() => []),
    listEntities("MatchHistory", { match_id: match.id }, "-created_date", 100).catch(() => []),
    listEntities("Dispute", { match_id: match.id }, "-created_date", 20).catch(() => []),
  ]);
  const tournament = matchType === "tournament" && match.tournament_id
    ? await getEntity("Tournament", match.tournament_id).catch(() => null)
    : null;

  return {
    matchType,
    match,
    entityName,
    participantUserIds,
    actionUrl: matchRouteFor(matchType, match),
    team_a_id: matchType === "tournament" ? match.team_a_id : match.host_id,
    team_a_name: matchType === "tournament" ? match.team_a_name : match.host_name,
    team_b_id: matchType === "tournament" ? match.team_b_id : match.challenger_id,
    team_b_name: matchType === "tournament" ? match.team_b_name : match.challenger_name,
    wager_amount: matchType === "wager" ? money(match.entry_fee ?? match.amount) : undefined,
    tournament_name: tournament?.name,
    chat_logs: chatLogs,
    match_history: matchHistory,
    disputes,
    result_report: resultReportFor(matchType, match),
    match_details: match,
  };
}

function ticketNotifyUserIds(ticket) {
  return [
    ticket.user_id,
    ...(ticket.participant_user_ids || []),
  ].filter(Boolean);
}

async function notifyTicketUsers(ticket, notification) {
  return notifyUsers(ticketNotifyUserIds(ticket), {
    type: "support",
    action_url: ticket.action_url || "/support",
    related_entity_id: ticket.id,
    related_entity_type: "Ticket",
    ...notification,
  });
}

function ticketMessagePayload(ticket, content, user, internal = false) {
  return {
    ticket_id: ticket.id,
    conversation_id: ticket.id,
    sender_id: user.id,
    sender_name: nameFor(user),
    sender_role: user.role || "user",
    content,
    internal: Boolean(internal),
    created_date: nowIso(),
  };
}

async function createTicket(req) {
  const ticket = await createEntity("Ticket", {
    user_id: req.user.id,
    username: nameFor(req.user),
    subject: req.body.subject || "Support request",
    description: req.body.description || "",
    category: req.body.category || "support",
    priority: req.body.priority || "medium",
    status: "open",
    request_type: "support",
    action_url: "/support",
    participant_user_ids: [req.user.id],
    messages: [],
    internal_notes: [],
    created_date: nowIso(),
  });
  await notifyStaff({
    title: "New support ticket",
    message: `${nameFor(req.user)} opened: ${ticket.subject}`,
    type: "system",
    action_url: "/admin",
    related_entity_id: ticket.id,
    related_entity_type: "Ticket",
  });
  await notifyTicketUsers(ticket, {
    title: "Ticket created",
    message: "Your support ticket was created.",
  });
  return { success: true, ticket };
}

async function requestAdminAlert(req) {
  const context = await ticketMatchContext(req.body.match_type, req.body.match_id);
  const existingTickets = context.match?.id
    ? await listEntities("Ticket", { related_entity_id: context.match.id }, "-created_date", 50).catch(() => [])
    : [];
  const existingTicket = existingTickets.find((row) => (
    row.requested_admin === true &&
    openTicketStatuses.includes(row.status || "open")
  ));
  const subject = req.body.subject || "Admin request";
  const description = req.body.description || "";
  const submittedProof = [
    ...(req.body.proof_urls || []),
    ...(req.body.evidence_urls || []),
    ...(req.body.screenshots || []),
    ...(req.body.videos || []),
  ].filter(Boolean);
  const ticketPayload = {
    user_id: existingTicket?.user_id || req.user.id,
    username: existingTicket?.username || nameFor(req.user),
    subject: existingTicket?.subject || subject,
    description: existingTicket?.description || description,
    category: context.matchType,
    priority: req.body.priority || existingTicket?.priority || "high",
    status: existingTicket ? existingTicket.status : "waiting_for_admin",
    requested_admin: true,
    request_type: req.body.request_type || existingTicket?.request_type || "admin_request",
    related_entity_id: context.match?.id || req.body.match_id,
    related_entity_type: context.entityName || context.matchType,
    action_url: context.actionUrl,
    match_type: context.matchType,
    match_id: context.match?.id || req.body.match_id,
    dispute_id: req.body.dispute_id || existingTicket?.dispute_id,
    participant_user_ids: context.participantUserIds,
    team_a_id: context.team_a_id,
    team_a_name: context.team_a_name,
    team_b_id: context.team_b_id,
    team_b_name: context.team_b_name,
    wager_amount: context.wager_amount,
    tournament_name: context.tournament_name,
    submitted_proof: submittedProof.length ? submittedProof : existingTicket?.submitted_proof || [],
    proof_urls: submittedProof.length ? submittedProof : existingTicket?.proof_urls || [],
    chat_logs: context.chat_logs || [],
    match_history: context.match_history || [],
    disputes: context.disputes || [],
    result_report: context.result_report || {},
    match_details: context.match_details || null,
    messages: existingTicket?.messages || [],
    internal_notes: existingTicket?.internal_notes || [],
    created_date: existingTicket?.created_date || nowIso(),
    updated_date: nowIso(),
  };
  const ticket = existingTicket
    ? await updateEntity("Ticket", existingTicket.id, ticketPayload)
    : await createEntity("Ticket", ticketPayload);
  const alert = await createEntity("AdminAlert", {
    user_id: req.user.id,
    username: nameFor(req.user),
    subject,
    message: description,
    priority: req.body.priority || "high",
    status: "open",
    ticket_id: ticket.id,
    match_type: context.matchType,
    related_entity_id: context.match?.id || req.body.match_id,
    created_date: nowIso(),
  });
  if (context.match?.id) {
    await updateEntity(context.entityName, context.match.id, {
      requested_admin: true,
      admin_request_status: ticket.status,
      admin_request_ticket_id: ticket.id,
      assigned_admin_id: ticket.assigned_admin_id,
      assigned_admin_name: ticket.assigned_admin_name,
      admin_request_updated_date: nowIso(),
    }).catch(() => null);
  }
  await notifyStaff({
    title: "Admin requested",
    message: `${nameFor(req.user)} requested staff for ${context.matchType} ${context.match?.id || ""}`.trim(),
    type: "match",
    action_url: context.actionUrl,
    related_entity_id: ticket.id,
    related_entity_type: "Ticket",
  });
  await notifyTicketUsers(ticket, {
    title: existingTicket ? "Admin request updated" : "Admin request created",
    message: existingTicket ? "Your admin request is still in the staff queue." : "Staff were notified for this match.",
  });
  return { success: true, ticket, alert };
}

async function joinTicket(req) {
  assertStaff(req, "moderator");
  const ticket = await getEntity("Ticket", req.body.ticket_id);
  const matchType = normalizeMatchType(ticket.match_type);
  const entityName = matchEntityFor(matchType);
  const match = ticket.match_id ? await getEntity(entityName, ticket.match_id).catch(() => null) : null;
  const firstJoin = !ticket.assigned_admin_id;
  const updated = await updateEntity("Ticket", ticket.id, {
    status: "admin_joined",
    assigned_admin_id: req.user.id,
    assigned_admin_name: nameFor(req.user),
    assigned_admin_role: req.user.role,
    joined_date: nowIso(),
    updated_date: nowIso(),
  });
  if (ticket.match_id) {
    await updateEntity(entityName, ticket.match_id, {
      admin_request_status: "admin_joined",
      assigned_admin_id: req.user.id,
      assigned_admin_name: nameFor(req.user),
      admin_request_ticket_id: ticket.id,
      requested_admin: true,
      admin_request_updated_date: nowIso(),
    }).catch(() => null);
  }
  if (match && firstJoin && ["wager", "tournament"].includes(matchType)) {
    await createMatchRoomSystemMessage(matchType, match, `Admin ${nameFor(req.user)} has joined the match room.`, req.user);
  }
  await notifyTicketUsers(updated, {
    title: "Admin joined",
    message: `${nameFor(req.user)} joined your ticket.`,
  });
  return { success: true, ticket: updated };
}

async function joinMatchRoomAsAdmin(req) {
  assertStaff(req, "moderator");
  const matchType = normalizeMatchType(req.body.match_type);
  if (!["wager", "tournament"].includes(matchType)) {
    return { success: false, error: "Admin room join is only available for wager and tournament matches" };
  }

  const entityName = matchEntityFor(matchType);
  const match = await getEntity(entityName, req.body.match_id);
  const ticket = await openMatchAdminTicket(match.id, req.body.ticket_id || match.admin_request_ticket_id);
  if (!ticket) {
    return { success: false, error: "No open admin request found for this match" };
  }

  const firstJoin = !ticket.assigned_admin_id;
  const updatedTicket = await updateEntity("Ticket", ticket.id, {
    status: "admin_joined",
    assigned_admin_id: req.user.id,
    assigned_admin_name: nameFor(req.user),
    assigned_admin_role: req.user.role,
    joined_date: ticket.joined_date || nowIso(),
    updated_date: nowIso(),
  });
  const updatedMatch = await updateEntity(entityName, match.id, {
    admin_request_status: "admin_joined",
    assigned_admin_id: req.user.id,
    assigned_admin_name: nameFor(req.user),
    admin_request_ticket_id: ticket.id,
    requested_admin: true,
    admin_request_updated_date: nowIso(),
  });

  if (firstJoin) {
    await createMatchRoomSystemMessage(matchType, match, `Admin ${nameFor(req.user)} has joined the match room.`, req.user);
  }

  const alerts = await listEntities("AdminAlert", { ticket_id: ticket.id }, "-created_date", 20).catch(() => []);
  await Promise.all(alerts.map((alert) => updateEntity("AdminAlert", alert.id, { status: "acknowledged" }).catch(() => null)));

  await notifyTicketUsers(updatedTicket, {
    title: "Admin joined",
    message: `${nameFor(req.user)} entered the match room.`,
    action_url: matchRouteFor(matchType, match),
  });

  return { success: true, ticket: updatedTicket, match: updatedMatch };
}

async function replyTicket(req) {
  const ticket = await getEntity("Ticket", req.body.ticket_id);
  const isStaff = hasRole(req.user, "moderator");
  const canReply = isStaff || ticketNotifyUserIds(ticket).includes(req.user.id);
  if (!canReply) return { success: false, error: "You cannot reply to this ticket" };
  const content = String(req.body.message || req.body.content || "").trim();
  if (!content) return { success: false, error: "Message is required" };
  const internal = Boolean(req.body.internal);
  if (internal && !isStaff) return { success: false, error: "Only staff can add internal notes" };

  const payload = ticketMessagePayload(ticket, content, req.user, internal);
  const message = await createEntity("Message", payload);
  const messages = internal ? (ticket.messages || []) : [...(ticket.messages || []), message];
  const internalNotes = internal
    ? [
      ...(ticket.internal_notes || []),
      { ...payload, id: message.id },
    ]
    : (ticket.internal_notes || []);
  const nextStatus = internal
    ? ticket.status
    : isStaff
      ? "waiting_for_user"
      : (ticket.assigned_admin_id ? "admin_joined" : "waiting_for_admin");
  const updated = await updateEntity("Ticket", ticket.id, {
    status: nextStatus,
    messages,
    internal_notes: internalNotes,
    last_message: content,
    last_message_by: req.user.id,
    last_message_by_name: nameFor(req.user),
    last_message_date: nowIso(),
    updated_date: nowIso(),
  });

  if (ticket.match_id && !internal) {
    await updateEntity(matchEntityFor(normalizeMatchType(ticket.match_type)), ticket.match_id, {
      admin_request_status: nextStatus,
      admin_request_ticket_id: ticket.id,
      admin_request_updated_date: nowIso(),
    }).catch(() => null);
  }

  if (!internal) {
    if (isStaff) {
      await notifyTicketUsers(updated, {
        title: "Admin replied",
        message: `${nameFor(req.user)} replied: ${content.slice(0, 140)}`,
        action_url: "/support",
      });
    } else if (ticket.assigned_admin_id) {
      await notifyUser(ticket.assigned_admin_id, {
        title: "Ticket reply",
        message: `${nameFor(req.user)} replied to ticket #${ticket.id.slice(-8)}.`,
        type: "support",
        action_url: "/admin",
        related_entity_id: ticket.id,
        related_entity_type: "Ticket",
      });
    } else {
      await notifyStaff({
        title: "Ticket reply",
        message: `${nameFor(req.user)} replied to ${ticket.subject || "a ticket"}.`,
        type: "support",
        action_url: "/admin",
        related_entity_id: ticket.id,
        related_entity_type: "Ticket",
      });
    }
  }

  return { success: true, ticket: updated, message };
}

async function resolveTicket(req) {
  assertStaff(req, "moderator");
  const ticket = await getEntity("Ticket", req.body.ticket_id);
  const action = req.body.action || req.body.decision;
  let actionResult = null;

  if (action && ["approve_team_a", "approve_team_b", "force_replay"].includes(action) && ticket.match_id) {
    if (ticket.dispute_id) {
      actionResult = await moderateDispute({ ...req, body: { dispute_id: ticket.dispute_id, action, notes: req.body.resolution || req.body.notes || action } });
    } else {
      const matchType = normalizeMatchType(ticket.match_type);
      const match = await getEntity(matchEntityFor(matchType), ticket.match_id);
      if (action === "force_replay") {
        actionResult = await updateEntity(matchEntityFor(matchType), match.id, {
          status: "in_progress",
          replay_forced: true,
          replay_forced_by: req.user.id,
          replay_forced_date: nowIso(),
        });
      } else if (matchType === "ranked") {
        actionResult = await completeRankedMatch({
          ...req,
          body: {
            ranked_match_id: match.id,
            team_alpha_score: action === "approve_team_a" ? 1 : 0,
            team_bravo_score: action === "approve_team_b" ? 1 : 0,
          },
        });
      } else if (matchType === "tournament") {
        actionResult = await completeTournamentMatch({
          ...req,
          body: {
            tournament_match_id: match.id,
            team_a_score: action === "approve_team_a" ? 1 : 0,
            team_b_score: action === "approve_team_b" ? 1 : 0,
          },
        });
      } else {
        actionResult = await completeWager({
          ...req,
          body: {
            wager_id: match.id,
            winner_id: action === "approve_team_a" ? match.host_id : match.challenger_id,
            team_alpha_score: action === "approve_team_a" ? 1 : 0,
            team_bravo_score: action === "approve_team_b" ? 1 : 0,
          },
        });
      }
    }
  }

  const resolution = req.body.resolution || req.body.notes || "Resolved by staff";
  const updated = await updateEntity("Ticket", ticket.id, {
    status: "resolved",
    resolution,
    action_taken: action || "resolved",
    resolved_by: req.user.id,
    resolved_by_name: nameFor(req.user),
    resolved_date: nowIso(),
    updated_date: nowIso(),
  });
  if (ticket.match_id) {
    await updateEntity(matchEntityFor(normalizeMatchType(ticket.match_type)), ticket.match_id, {
      admin_request_status: "resolved",
      admin_request_ticket_id: ticket.id,
      admin_request_resolved_date: nowIso(),
    }).catch(() => null);
  }
  await notifyTicketUsers(updated, {
    title: "Ticket resolved",
    message: resolution,
    action_url: "/support",
  });
  return { success: true, ticket: updated, result: actionResult };
}

async function adminResolveMatchRoom(req) {
  assertStaff(req, "moderator");
  const matchType = normalizeMatchType(req.body.match_type);
  if (!["wager", "tournament"].includes(matchType)) {
    return { success: false, error: "Admin match resolution is only available for wagers and tournaments" };
  }

  const action = req.body.action || req.body.decision;
  if (matchType === "tournament" && ["reset_score", "grant_team_a", "grant_team_b"].includes(action)) {
    return adminCorrectTournamentMatch({
      ...req,
      body: {
        ...req.body,
        tournament_match_id: req.body.tournament_match_id || req.body.match_id,
        action,
      },
    });
  }
  if (!["approve_team_a", "approve_team_b"].includes(action)) {
    return { success: false, error: "Choose which team receives the win" };
  }

  const entityName = matchEntityFor(matchType);
  const match = await getEntity(entityName, req.body.match_id);
  if (matchType === "tournament" && (match.completed || match.status === "completed")) {
    return adminCorrectTournamentMatch({
      ...req,
      body: {
        ...req.body,
        tournament_match_id: match.id,
        action: action === "approve_team_a" ? "grant_team_a" : "grant_team_b",
      },
    });
  }
  const { teamA, teamB } = matchRoomTeamNames(matchType, match);
  const teamAWins = action === "approve_team_a";
  const winnerName = teamAWins ? teamA : teamB;
  const loserName = teamAWins ? teamB : teamA;
  const teamAScore = teamAWins ? 1 : 0;
  const teamBScore = teamAWins ? 0 : 1;

  const result = matchType === "tournament"
    ? await completeTournamentMatch({
      ...req,
      body: {
        tournament_match_id: match.id,
        team_a_score: teamAScore,
        team_b_score: teamBScore,
        proof_urls: [],
      },
    })
    : await completeWager({
      ...req,
      body: {
        wager_id: match.id,
        winner_id: teamAWins ? match.host_id : match.challenger_id,
        team_alpha_score: teamAScore,
        team_bravo_score: teamBScore,
        proof_urls: [],
      },
    });

  if (!result?.success) {
    return result || { success: false, error: "Could not resolve match" };
  }

  const message = `Admin ${nameFor(req.user)} granted ${winnerName} the win. ${loserName} received an automatic loss.`;
  await createMatchRoomSystemMessage(matchType, match, message, req.user);

  const ticket = await openMatchAdminTicket(match.id, req.body.ticket_id || match.admin_request_ticket_id);
  if (ticket) {
    await updateEntity("Ticket", ticket.id, {
      status: "resolved",
      resolution: req.body.reason || message,
      action_taken: action,
      resolved_by: req.user.id,
      resolved_by_name: nameFor(req.user),
      resolved_date: nowIso(),
      updated_date: nowIso(),
    }).catch(() => null);
  }

  const updatedMatch = await updateEntity(entityName, match.id, {
    admin_request_status: "resolved",
    admin_request_ticket_id: ticket?.id || match.admin_request_ticket_id,
    admin_request_resolved_date: nowIso(),
    admin_resolved_by: req.user.id,
    admin_resolved_by_name: nameFor(req.user),
  }).catch(() => null);

  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "match_result_override",
    target_user_id: teamAWins ? match.team_a_id || match.host_id : match.team_b_id || match.challenger_id,
    target_username: winnerName,
    description: message,
    details: {
      match_type: matchType,
      match_id: match.id,
      action,
      loser_name: loserName,
    },
    created_date: nowIso(),
  }).catch(() => null);

  return { success: true, match: updatedMatch, result, message };
}

async function adminCorrectTournamentMatch(req) {
  assertStaff(req, "admin");
  const action = req.body.action || req.body.decision;
  if (!["reset_score", "grant_team_a", "grant_team_b"].includes(action)) {
    return { success: false, error: "Choose reset_score, grant_team_a, or grant_team_b" };
  }

  const match = await getEntity("TournamentMatch", req.body.tournament_match_id || req.body.match_id);
  if (!match.team_a_id || !match.team_b_id) {
    return { success: false, error: "Both teams must be assigned before an admin can correct the match" };
  }

  const reason = String(req.body.reason || "Admin tournament result correction").trim().slice(0, 500);
  const previous = {
    winner_id: match.winner_id || null,
    winner_name: match.winner_name || null,
    team_a_score: Number(match.team_a_score || 0),
    team_b_score: Number(match.team_b_score || 0),
    status: match.status,
    completed: Boolean(match.completed),
  };

  if (action === "reset_score") {
    const undo = await undoTournamentAdvancement(match);
    const rewardUndo = await undoTournamentMatchRewards(match);
    const eliminationCleanup = await removeTournamentEliminationRewards(match.tournament_id, rewardUndo.previous_loser_id || tournamentMatchLoserId(match));
    await clearParticipantEliminationFromMatch(match.tournament_id, match.id);
    const updated = await updateEntity("TournamentMatch", match.id, {
      ...tournamentScoreResetPatch(),
      ...tournamentRewardResetPatch(),
      status: "ready",
      admin_corrected_by: req.user.id,
      admin_corrected_by_name: nameFor(req.user),
      admin_correction_action: action,
      admin_correction_reason: reason,
      admin_corrected_date: nowIso(),
      previous_result: previous,
    });
    const message = `Admin ${nameFor(req.user)} reset the tournament match to 0-0.`;
    await createMatchRoomSystemMessage("tournament", updated, message, req.user);

    const ticket = await openMatchAdminTicket(match.id, req.body.ticket_id || match.admin_request_ticket_id);
    if (ticket) {
      await updateEntity("Ticket", ticket.id, {
        status: "resolved",
        resolution: reason || message,
        action_taken: action,
        resolved_by: req.user.id,
        resolved_by_name: nameFor(req.user),
        resolved_date: nowIso(),
        updated_date: nowIso(),
      }).catch(() => null);
    }

    await notifyTournamentParticipants(match.tournament_id, {
      title: "Tournament match reset",
      message: `${match.team_a_name || "Team A"} vs ${match.team_b_name || "Team B"} was reset to 0-0 by an admin.`,
      type: "match",
      action_url: `/tournament-match/${match.id}`,
      related_entity_id: match.id,
      related_entity_type: "TournamentMatch",
    });

    await createEntity("AdminAction", {
      admin_id: req.user.id,
      admin_name: nameFor(req.user),
      admin_role: req.user.role,
      action_type: "tournament_match_reset",
      target_user_id: match.id,
      target_username: `${match.team_a_name || "Team A"} vs ${match.team_b_name || "Team B"}`,
      description: reason || message,
      details: {
        tournament_id: match.tournament_id,
        match_id: match.id,
        action,
        previous,
        undo,
        reward_undo: rewardUndo,
        elimination_cleanup: eliminationCleanup,
      },
      created_date: nowIso(),
    }).catch(() => null);

    return { success: true, match: updated, message, reward_undo: rewardUndo, elimination_cleanup: eliminationCleanup, ...undo };
  }

  const teamAWins = action === "grant_team_a";
  const winnerId = teamAWins ? match.team_a_id : match.team_b_id;
  const winnerName = teamAWins ? match.team_a_name : match.team_b_name;
  const loserId = teamAWins ? match.team_b_id : match.team_a_id;
  const loserName = teamAWins ? match.team_b_name : match.team_a_name;
  const teamAScore = teamAWins ? 1 : 0;
  const teamBScore = teamAWins ? 0 : 1;
  const completedDate = nowIso();
  const sameWinner = String(match.winner_id || "") === String(winnerId)
    && (match.completed || match.status === "completed");
  const shouldAdjustRewards = !sameWinner || match.rewards_applied === false;
  const rewardUndo = shouldAdjustRewards ? await undoTournamentMatchRewards(match) : { rewards_reverted: false };
  const eliminationCleanup = shouldAdjustRewards
    ? await removeTournamentEliminationRewards(match.tournament_id, rewardUndo.previous_loser_id || tournamentMatchLoserId(match))
    : { removed_elimination_rewards: 0 };
  const undo = await undoTournamentAdvancement(match, {
    id: winnerId,
    name: winnerName,
    seed: teamAWins ? match.team_a_seed : match.team_b_seed,
    participant_id: teamAWins ? match.team_a_participant_id : match.team_b_participant_id,
  });
  await clearParticipantEliminationFromMatch(match.tournament_id, match.id);

  let updated = await updateEntity("TournamentMatch", match.id, {
    ...tournamentScoreResetPatch(),
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    winner_id: winnerId,
    winner_name: winnerName,
    completed: true,
    status: "completed",
    completed_date: completedDate,
    scores_confirmed: true,
    confirmed_score_alpha: teamAScore,
    confirmed_score_bravo: teamBScore,
    confirmed_score_date: completedDate,
    confirmed_by: req.user.id,
    confirmed_by_name: nameFor(req.user),
    admin_corrected_by: req.user.id,
    admin_corrected_by_name: nameFor(req.user),
    admin_correction_action: action,
    admin_correction_reason: reason,
    admin_corrected_date: completedDate,
    previous_result: previous,
  });

  const [winnerUserIds, loserUserIds] = await Promise.all([
    tournamentParticipantUserIds(match.tournament_id, winnerId),
    tournamentParticipantUserIds(match.tournament_id, loserId),
  ]);
  if (shouldAdjustRewards) {
    await applyParticipantRewards(winnerUserIds, loserUserIds);
    updated = await updateEntity("TournamentMatch", updated.id, tournamentRewardAppliedPatch(winnerUserIds, loserUserIds));
  }
  const loserIsEliminated = !updated.loser_match_id && !updated.loser_match_round && !updated.loser_match_number;
  const elimination = loserIsEliminated
    ? await grantTournamentEliminationRewards({
      tournamentId: updated.tournament_id,
      loserId,
      match: updated,
      loserUserIds,
    })
    : {};
  const advancement = updated.next_match_round
    ? await advanceTournamentWinner(updated)
    : await advanceLegacyTournamentRound(updated.tournament_id, updated.round);

  const message = `Admin ${nameFor(req.user)} corrected the tournament result: ${winnerName || "Winning team"} wins, ${loserName || "other team"} receives the loss.`;
  await createMatchRoomSystemMessage("tournament", updated, message, req.user);

  const ticket = await openMatchAdminTicket(match.id, req.body.ticket_id || match.admin_request_ticket_id);
  if (ticket) {
    await updateEntity("Ticket", ticket.id, {
      status: "resolved",
      resolution: reason || message,
      action_taken: action,
      resolved_by: req.user.id,
      resolved_by_name: nameFor(req.user),
      resolved_date: nowIso(),
      updated_date: nowIso(),
    }).catch(() => null);
  }

  await notifyTournamentParticipants(match.tournament_id, {
    title: "Tournament result corrected",
    message: `${winnerName || "A team"} was granted the win by an admin.`,
    type: "match",
    action_url: `/tournament-match/${match.id}`,
    related_entity_id: match.id,
    related_entity_type: "TournamentMatch",
  });

  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "tournament_match_correction",
    target_user_id: winnerId,
    target_username: winnerName,
    description: reason || message,
    details: {
      tournament_id: match.tournament_id,
      match_id: match.id,
      action,
      winner_id: winnerId,
      winner_name: winnerName,
      loser_id: loserId,
      loser_name: loserName,
      previous,
      undo,
      reward_undo: rewardUndo,
      elimination_cleanup: eliminationCleanup,
    },
    created_date: nowIso(),
  }).catch(() => null);

  return { success: true, match: updated, message, elimination, reward_undo: rewardUndo, elimination_cleanup: eliminationCleanup, ...undo, ...advancement };
}

async function reopenTicket(req) {
  assertStaff(req, "moderator");
  const ticket = await getEntity("Ticket", req.body.ticket_id);
  const updated = await updateEntity("Ticket", ticket.id, {
    status: ticket.requested_admin ? "waiting_for_admin" : "open",
    reopened_by: req.user.id,
    reopened_by_name: nameFor(req.user),
    reopened_date: nowIso(),
    resolution: null,
    updated_date: nowIso(),
  });
  if (ticket.match_id) {
    await updateEntity(matchEntityFor(normalizeMatchType(ticket.match_type)), ticket.match_id, {
      admin_request_status: updated.status,
      admin_request_ticket_id: ticket.id,
      requested_admin: true,
      admin_request_updated_date: nowIso(),
    }).catch(() => null);
  }
  await notifyTicketUsers(updated, {
    title: "Ticket reopened",
    message: `${nameFor(req.user)} reopened your ticket.`,
  });
  return { success: true, ticket: updated };
}

async function escalateTicket(req) {
  const ticket = await getEntity("Ticket", req.body.ticket_id);
  const canEscalate = req.user.is_premium || hasRole(req.user, "moderator");
  if (!canEscalate) return { success: false, error: "Premium membership is required to escalate tickets" };
  if (ticket.premium_escalated && !hasRole(req.user, "moderator")) {
    return { success: false, error: "This ticket was already escalated" };
  }
  if (!ticketNotifyUserIds(ticket).includes(req.user.id) && !hasRole(req.user, "moderator")) {
    return { success: false, error: "You cannot escalate this ticket" };
  }
  const proof = [
    ...(ticket.additional_proof || []),
    ...(req.body.proof_urls || []),
    ...(req.body.evidence_urls || []),
  ].filter(Boolean);
  const updated = await updateEntity("Ticket", ticket.id, {
    status: "escalated",
    priority: "critical",
    premium_escalated: true,
    escalated_by: req.user.id,
    escalated_by_name: nameFor(req.user),
    escalated_date: nowIso(),
    escalation_reason: req.body.reason || "Premium escalation",
    additional_proof: proof,
    updated_date: nowIso(),
  });
  await notifyStaff({
    title: "Ticket escalated",
    message: `${nameFor(req.user)} escalated ticket #${ticket.id.slice(-8)}.`,
    type: "support",
    action_url: "/admin",
    related_entity_id: ticket.id,
    related_entity_type: "Ticket",
  });
  return { success: true, ticket: updated };
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
  const matchType = req.body.match_type === "8s" ? "8s" : req.body.match_type === "xp" ? "xp" : "wagers";
  const requiredSize = requiredRosterSize(req.body.team_size);
  const isTeamMatch = requiredSize > 1 && ["8s", "wagers"].includes(matchType);
  const paymentMode = paymentModeFor(req.body.payment_mode);
  let hostTeam = null;
  let hostRoster = null;

  if (isTeamMatch) {
    const result = await teamRoster(req.body.team_id, {
      requiredSize,
      expectedType: wagerTeamTypeFor(matchType),
      captainId: req.user.id,
    });
    hostTeam = result.team;
    hostRoster = result.roster;
  } else if (entryFee > 0) {
    const wallet = await walletFor(req.user.id);
    if (money(wallet.available_balance) < entryFee) {
      return { success: false, error: "Insufficient wallet balance" };
    }
  }

  const totalPrizePool = isTeamMatch ? roundedMoney(entryFee * requiredSize * 2) : roundedMoney(entryFee * 2);
  const wager = await createEntity("Wager", {
    ...req.body,
    host_id: req.user.id,
    host_name: nameFor(req.user),
    host_team_id: hostTeam?.id,
    host_team_name: hostTeam?.name,
    host_payment_mode: paymentMode,
    entry_fee: entryFee,
    amount: entryFee,
    team_entry_fee: roundedMoney(entryFee * requiredSize),
    total_prize_pool: totalPrizePool,
    required_players_per_team: requiredSize,
    roster_locked: isTeamMatch,
    match_type: matchType,
    status: "open",
    created_date: new Date().toISOString(),
  });

  if (isTeamMatch) {
    await createWagerParticipantsForRoster({
      wager,
      side: "host",
      team: hostTeam,
      roster: hostRoster,
      entryFee,
      paymentMode,
      payer: req.user,
    });
  } else {
    const escrow = await escrowWagerStake({
      userId: req.user.id,
      wagerId: wager.id,
      entryFee,
      team: "host",
    });
    await createEntity("WagerParticipant", {
      wager_id: wager.id,
      user_id: req.user.id,
      user_name: nameFor(req.user),
      team: "host",
      is_captain: true,
      entry_fee_paid: entryFee,
      payment_status: "paid",
      paid_by: req.user.id,
      escrowed: entryFee > 0,
      escrow_transaction_id: escrow.transaction?.id,
      joined_date: new Date().toISOString(),
    });
  }
  return { success: true, wager, wager_id: wager.id };
}

async function acceptWager(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  if (!wager || wager.status !== "open") {
    return { success: false, error: "Wager is not open" };
  }
  if (wager.host_id === req.user.id) {
    return { success: false, error: "You cannot accept your own wager" };
  }
  const existingParticipant = await firstEntity("WagerParticipant", { wager_id: wager.id, user_id: req.user.id }).catch(() => null);
  if (existingParticipant) {
    return { success: false, error: "You already joined this wager" };
  }
  const entryFee = money(wager.entry_fee ?? wager.amount);
  const requiredSize = Number(wager.required_players_per_team || requiredRosterSize(wager.team_size));
  const isTeamMatch = requiredSize > 1 && ["8s", "wagers"].includes(wager.match_type || "wagers");
  const paymentMode = paymentModeFor(req.body.payment_mode);
  let challengerTeam = null;
  let challengerRoster = null;

  if (isTeamMatch) {
    const result = await teamRoster(req.body.team_id, {
      requiredSize,
      expectedType: wagerTeamTypeFor(wager.match_type || "wagers"),
      captainId: req.user.id,
    });
    challengerTeam = result.team;
    challengerRoster = result.roster;
    if (challengerTeam.id === wager.host_team_id) {
      return { success: false, error: "Select a different team" };
    }
    const existingRows = await listEntities("WagerParticipant", { wager_id: wager.id }, "-joined_date", 20).catch(() => []);
    const existingUserIds = existingRows.map((participant) => participant.user_id).filter(Boolean);
    const duplicateRosterMember = challengerRoster.find((member) => existingUserIds.includes(member.user_id));
    if (duplicateRosterMember) {
      return { success: false, error: "A roster member is already enrolled in this wager" };
    }
  } else if (entryFee > 0) {
    const wallet = await walletFor(req.user.id);
    if (money(wallet.available_balance) < entryFee) {
      return { success: false, error: "Insufficient wallet balance" };
    }
  }

  if (isTeamMatch) {
    await createWagerParticipantsForRoster({
      wager,
      side: "challenger",
      team: challengerTeam,
      roster: challengerRoster,
      entryFee,
      paymentMode,
      payer: req.user,
    });
  } else {
    const escrow = await escrowWagerStake({
      userId: req.user.id,
      wagerId: wager.id,
      entryFee,
      team: "challenger",
    });
    await createEntity("WagerParticipant", {
      wager_id: wager.id,
      user_id: req.user.id,
      user_name: nameFor(req.user),
      team: "challenger",
      is_captain: true,
      entry_fee_paid: entryFee,
      payment_status: "paid",
      paid_by: req.user.id,
      escrowed: entryFee > 0,
      escrow_transaction_id: escrow.transaction?.id,
      joined_date: new Date().toISOString(),
    });
  }

  const updated = await updateEntity("Wager", wager.id, {
    challenger_id: req.user.id,
    challenger_name: nameFor(req.user),
    challenger_team_id: challengerTeam?.id,
    challenger_team_name: challengerTeam?.name,
    challenger_payment_mode: paymentMode,
    challenger_banned_map_id: req.body.challenger_banned_map,
    challenger_banned_map_name: req.body.challenger_banned_map_name,
    final_map_id: req.body.final_map || wager.final_map_id,
    final_map_name: req.body.final_map_name || wager.final_map_name,
    status: isTeamMatch ? "accepted" : "in_progress",
    accepted_date: new Date().toISOString(),
    match_started_date: isTeamMatch ? wager.match_started_date : new Date().toISOString(),
  });

  const startState = isTeamMatch ? await maybeStartWager(wager.id) : { wager: updated, ready: true };
  return { success: true, wager: startState.wager, ready: startState.ready, final_map_name: startState.wager.final_map_name };
}

async function submitScore(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  if (!wager || ["completed", "cancelled"].includes(wager.status)) {
    return { success: false, error: "Match is already closed" };
  }
  if (!wager.challenger_id) {
    return { success: false, error: "Opponent has not joined yet" };
  }
  const isHost = req.user.id === wager.host_id;
  const isChallenger = req.user.id === wager.challenger_id;
  if (!isHost && !isChallenger && !hasRole(req.user, "moderator")) {
    return { success: false, error: "Only match participants can report scores" };
  }
  const teamAlphaScore = Number(req.body.team_alpha_score);
  const teamBravoScore = Number(req.body.team_bravo_score);
  if (!Number.isFinite(teamAlphaScore) || !Number.isFinite(teamBravoScore) || teamAlphaScore < 0 || teamBravoScore < 0) {
    return { success: false, error: "Scores must be valid numbers" };
  }
  if (teamAlphaScore === teamBravoScore) {
    return { success: false, error: "Scores cannot be tied" };
  }
  const reportingTeam = isHost ? "host" : "challenger";
  const otherTeam = isHost ? "challenger" : "host";
  const otherAlpha = wager[`${otherTeam}_reported_score_alpha`];
  const otherBravo = wager[`${otherTeam}_reported_score_bravo`];
  const otherHasReport = otherAlpha !== undefined && otherAlpha !== null && otherBravo !== undefined && otherBravo !== null;
  const scoresMatch = otherHasReport && Number(otherAlpha) === teamAlphaScore && Number(otherBravo) === teamBravoScore;
  const winner_id = teamAlphaScore > teamBravoScore ? wager.host_id : wager.challenger_id;
  const winner_name = winner_id === wager.host_id ? wager.host_name : wager.challenger_name;

  const report = {
    [`${reportingTeam}_reported_score_alpha`]: teamAlphaScore,
    [`${reportingTeam}_reported_score_bravo`]: teamBravoScore,
    [`${reportingTeam}_reported_score_by`]: req.user.id,
    [`${reportingTeam}_reported_score_date`]: new Date().toISOString(),
    reported_score_alpha: teamAlphaScore,
    reported_score_bravo: teamBravoScore,
    reported_score_by: req.user.id,
    reported_score_team: reportingTeam,
    reported_score_date: new Date().toISOString(),
    status: isHost ? "awaiting_team_bravo_report" : "awaiting_team_alpha_report",
  };

  if (otherHasReport && !scoresMatch) {
    const existingDisputes = await listEntities("Dispute", { match_id: wager.id }, "-created_date", 20).catch(() => []);
    const existingOpenDispute = existingDisputes.find((row) => !["resolved", "rejected", "closed"].includes(row.status));
    const dispute = existingOpenDispute || await createEntity("Dispute", {
      wager_id: wager.id,
      match_id: wager.id,
      match_type: "wager",
      wager_details: wager,
      match_logs: [wager, { ...wager, ...report }],
      reported_by: req.user.id,
      reported_by_name: nameFor(req.user),
      reported_against: isHost ? wager.challenger_id : wager.host_id,
      reported_against_name: isHost ? wager.challenger_name : wager.host_name,
      reason: "score_conflict",
      description: "Participants reported conflicting wager scores.",
      evidence_urls: req.body.proof_urls || [],
      submitted_evidence: req.body.proof_urls || [],
      status: "pending",
      priority: "high",
      created_date: nowIso(),
    });
    await updateEntity("Wager", wager.id, {
      ...report,
      status: "score_conflict",
      dispute_id: dispute.id,
      score_conflict_date: nowIso(),
    });
    await notifyStaff({
      title: "Score conflict",
      message: `${wager.host_name || "Host"} vs ${wager.challenger_name || "Challenger"} needs review.`,
      type: "match",
      action_url: "/admin",
      related_entity_id: dispute.id,
      related_entity_type: "Dispute",
    });
    return { success: true, ready_to_complete: false, status: "score_conflict", dispute };
  }

  if (scoresMatch) {
    await updateEntity("Wager", wager.id, {
      ...report,
      status: "awaiting_completion",
      scores_confirmed: true,
      confirmed_score_alpha: teamAlphaScore,
      confirmed_score_bravo: teamBravoScore,
      confirmed_score_date: nowIso(),
    });
    return {
      success: true,
      ready_to_complete: true,
      winner_id,
      winner_name,
      winner_score: Math.max(teamAlphaScore, teamBravoScore),
      loser_score: Math.min(teamAlphaScore, teamBravoScore),
      message: "Scores confirmed.",
    };
  }

  await updateEntity("Wager", wager.id, report);
  return {
    success: true,
    ready_to_complete: false,
    status: report.status,
    winner_id,
    winner_name,
    winner_score: Math.max(teamAlphaScore, teamBravoScore),
    loser_score: Math.min(teamAlphaScore, teamBravoScore),
    message: "Score submitted. Waiting for the opponent to confirm.",
  };
}

async function completeWager(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  if (!wager || wager.status === "completed") {
    return { success: false, error: "Match is already completed" };
  }
  if (!wager.challenger_id) {
    return { success: false, error: "Opponent has not joined yet" };
  }
  const isParticipant = req.user.id === wager.host_id || req.user.id === wager.challenger_id;
  const isStaff = hasRole(req.user, "moderator");
  if (!isParticipant && !isStaff) {
    return { success: false, error: "Only match participants can complete this wager" };
  }
  if (["disputed", "score_conflict"].includes(wager.status) && !isStaff) {
    return { success: false, error: "This match is under dispute review" };
  }

  const winnerId = req.body.winner_id;
  if (![wager.host_id, wager.challenger_id].includes(winnerId)) {
    return { success: false, error: "Winner must be a match participant" };
  }
  const teamAlphaScore = Number(req.body.team_alpha_score);
  const teamBravoScore = Number(req.body.team_bravo_score);
  const reportsMatch = (
    Number(wager.host_reported_score_alpha) === Number(wager.challenger_reported_score_alpha) &&
    Number(wager.host_reported_score_bravo) === Number(wager.challenger_reported_score_bravo) &&
    Number(wager.host_reported_score_alpha) === teamAlphaScore &&
    Number(wager.host_reported_score_bravo) === teamBravoScore
  );
  if (!isStaff && !reportsMatch) {
    return { success: false, error: "Both participants must report the same score before completion" };
  }
  if (teamAlphaScore === teamBravoScore) {
    return { success: false, error: "Scores cannot be tied" };
  }

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

  const isPaidWager = (wager.match_type || "wagers") === "wagers" && entryFee > 0;
  if (winnerId) {
    const winner = await prisma.user.findUnique({ where: { id: winnerId } }).catch(() => null);
    if (winner) {
      await prisma.user.update({
        where: { id: winnerId },
        data: {
          wager_wins: winner.wager_wins + 1,
          biggest_wager_win: isPaidWager ? Math.max(winner.biggest_wager_win || 0, entryFee) : winner.biggest_wager_win,
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
  if (isPaidWager) {
    await releaseWagerEscrow(wager, winnerId);
  }
  await applyMatchRewards({ winnerId, loserId, ranked: false });
  await notifyUsers([winnerId, loserId], {
    title: "Match completed",
    message: `${winnerName} won ${wager.game_mode_display || wager.game_mode || "the match"}.`,
    type: "match",
    action_url: `/wagers-match/${wager.id}`,
    related_entity_id: wager.id,
    related_entity_type: "Wager",
  });

  return { success: true, winner_id: winnerId, winner_name: winnerName };
}

async function refundWager(req) {
  const wager = await getEntity("Wager", req.body.wager_id);
  if (!wager) return { success: false, error: "Wager not found" };
  if (!hasRole(req.user, "moderator") && req.user.id !== wager.host_id && req.user.id !== wager.challenger_id) {
    return { success: false, error: "Only participants or staff can refund this wager" };
  }
  if (wager.status === "completed") {
    return { success: false, error: "Completed wagers cannot be refunded" };
  }

  await refundWagerEscrow(wager, req.body.reason || "Wager refunded");
  const updated = await updateEntity("Wager", wager.id, {
    status: "cancelled",
    cancel_reason: req.body.reason || "Refunded",
    cancelled_by: req.user.id,
    cancelled_by_name: nameFor(req.user),
    cancelled_date: nowIso(),
  });
  await notifyUsers([wager.host_id, wager.challenger_id], {
    title: "Wager refunded",
    message: `${wager.game_mode_display || wager.game_mode || "Match"} was cancelled and escrow was returned.`,
    type: "match",
    action_url: `/wagers-match/${wager.id}`,
    related_entity_id: wager.id,
    related_entity_type: "Wager",
  });
  return { success: true, wager: updated };
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
  if (!match || match.status === "completed") {
    return { success: false, error: "Match is already completed" };
  }
  if (!match.challenger_id) {
    return { success: false, error: "Opponent has not joined yet" };
  }
  const isHost = req.user.id === match.host_id;
  const isChallenger = req.user.id === match.challenger_id;
  const isStaff = hasRole(req.user, "moderator");
  if (!isHost && !isChallenger && !isStaff) {
    return { success: false, error: "Only match participants can report scores" };
  }
  if (["disputed", "score_conflict"].includes(match.status) && !isStaff) {
    return { success: false, error: "This match is under dispute review" };
  }
  const teamAlphaScore = Number(req.body.team_alpha_score);
  const teamBravoScore = Number(req.body.team_bravo_score);
  if (!Number.isFinite(teamAlphaScore) || !Number.isFinite(teamBravoScore) || teamAlphaScore < 0 || teamBravoScore < 0) {
    return { success: false, error: "Scores must be valid numbers" };
  }
  if (teamAlphaScore === teamBravoScore) {
    return { success: false, error: "Scores cannot be tied" };
  }

  let confirmedReportPatch = {};
  if (!isStaff) {
    const reportingTeam = isHost ? "host" : "challenger";
    const otherTeam = isHost ? "challenger" : "host";
    const otherAlpha = match[`${otherTeam}_reported_score_alpha`];
    const otherBravo = match[`${otherTeam}_reported_score_bravo`];
    const otherHasReport = otherAlpha !== undefined && otherAlpha !== null && otherBravo !== undefined && otherBravo !== null;
    const report = {
      [`${reportingTeam}_reported_score_alpha`]: teamAlphaScore,
      [`${reportingTeam}_reported_score_bravo`]: teamBravoScore,
      [`${reportingTeam}_reported_score_by`]: req.user.id,
      [`${reportingTeam}_reported_score_date`]: nowIso(),
      reported_score_alpha: teamAlphaScore,
      reported_score_bravo: teamBravoScore,
      reported_score_by: req.user.id,
      reported_score_team: reportingTeam,
      reported_score_date: nowIso(),
      status: isHost ? "awaiting_team_bravo_report" : "awaiting_team_alpha_report",
    };

    if (!otherHasReport) {
      const updated = await updateEntity("RankedMatch", match.id, report);
      return {
        success: true,
        ready_to_complete: false,
        status: updated.status,
        message: "Score submitted. Waiting for the opponent to confirm.",
      };
    }

    if (Number(otherAlpha) !== teamAlphaScore || Number(otherBravo) !== teamBravoScore) {
      const existingDisputes = await listEntities("Dispute", { match_id: match.id }, "-created_date", 20).catch(() => []);
      const existingOpenDispute = existingDisputes.find((row) => !["resolved", "rejected", "closed"].includes(row.status));
      const dispute = existingOpenDispute || await createEntity("Dispute", {
        match_id: match.id,
        match_type: "ranked",
        wager_details: match,
        match_logs: [match, { ...match, ...report }],
        reported_by: req.user.id,
        reported_by_name: nameFor(req.user),
        reported_against: isHost ? match.challenger_id : match.host_id,
        reported_against_name: isHost ? match.challenger_name : match.host_name,
        reason: "score_conflict",
        description: "Participants reported conflicting ranked scores.",
        evidence_urls: req.body.proof_urls || [],
        submitted_evidence: req.body.proof_urls || [],
        status: "pending",
        priority: "high",
        created_date: nowIso(),
      });
      await updateEntity("RankedMatch", match.id, {
        ...report,
        status: "score_conflict",
        dispute_id: dispute.id,
        score_conflict_date: nowIso(),
      });
      await notifyStaff({
        title: "Ranked score conflict",
        message: `${match.host_name || "Host"} vs ${match.challenger_name || "Challenger"} needs review.`,
        type: "match",
        action_url: "/admin",
        related_entity_id: dispute.id,
        related_entity_type: "Dispute",
      });
      return { success: true, ready_to_complete: false, status: "score_conflict", dispute };
    }
    confirmedReportPatch = report;
  }

  const winnerId = teamAlphaScore > teamBravoScore ? match.host_id : match.challenger_id;
  const loserId = winnerId === match.host_id ? match.challenger_id : match.host_id;
  const winnerName = winnerId === match.host_id ? match.host_name : match.challenger_name;
  await updateEntity("RankedMatch", match.id, {
    ...confirmedReportPatch,
    status: "completed",
    winner_id: winnerId,
    winner_name: winnerName,
    winner_score: Math.max(teamAlphaScore, teamBravoScore),
    loser_score: Math.min(teamAlphaScore, teamBravoScore),
    confirmed_score_alpha: teamAlphaScore,
    confirmed_score_bravo: teamBravoScore,
    scores_confirmed: true,
    confirmed_score_date: nowIso(),
    match_completed_date: new Date().toISOString(),
  });
  await applyMatchRewards({ winnerId, loserId, ranked: true });
  await notifyUsers([winnerId, loserId], {
    title: "Ranked match completed",
    message: `${winnerName} won. ELO and XP updated.`,
    type: "match",
    action_url: `/ranked-match/${match.id}`,
    related_entity_id: match.id,
    related_entity_type: "RankedMatch",
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
  if (amount <= 0) return { success: false, error: "Amount must be greater than zero" };
  const wallet = await walletFor(userId);
  const updatedWallet = await updateEntity("Wallet", wallet.id, {
    available_balance: roundedMoney(money(wallet.available_balance) + amount),
    withdrawable_balance: roundedMoney(money(wallet.withdrawable_balance) + amount),
    total_deposits: roundedMoney(money(wallet.total_deposits) + amount),
  });
  await syncUserWalletBalance(userId, updatedWallet);
  await createWalletTransaction(userId, updatedWallet, {
    type: "deposit",
    amount,
    description: req.body.description || "Wallet deposit",
    reference_type: req.body.reference_type,
    reference_id: req.body.reference_id,
  });
  return { success: true, wallet: updatedWallet };
}

async function adminAdjustWallet(req) {
  const actorRole = req.user?.role || "user";
  if (!walletAdjustmentRoles.has(actorRole)) {
    return { success: false, error: "CEO or Super Admin access required" };
  }

  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "User not found" };
  if (!canAdjustUserWallet(actorRole, target.role || "user")) {
    return { success: false, error: "Super Admin cannot adjust CEO accounts" };
  }

  const adjustmentType = String(req.body.type || "").toLowerCase();
  if (!walletAdjustmentTypes.has(adjustmentType)) {
    return { success: false, error: "Adjustment type must be credits or money" };
  }

  const rawAmount = money(req.body.amount);
  if (rawAmount <= 0) return { success: false, error: "Amount must be greater than zero" };

  const amount = adjustmentType === "money" ? roundedMoney(rawAmount) : rawAmount;
  if (amount <= 0) return { success: false, error: "Amount must be greater than zero" };
  const reason = String(req.body.reason || "").trim();
  if (!reason) return { success: false, error: "Reason is required" };

  const timestamp = nowIso();
  const targetName = nameFor(target);
  const actorName = nameFor(req.user);
  let updatedUser = null;
  let updatedWallet = null;
  let transaction = null;
  let beforeAmount = 0;
  let afterAmount = 0;

  if (adjustmentType === "credits") {
    beforeAmount = money(target.credits);
    const row = await prisma.user.update({
      where: { id: target.id },
      data: { credits: { increment: amount } },
    });
    updatedUser = publicUser(row);
    afterAmount = money(row.credits);
  } else {
    const wallet = await walletFor(target.id);
    beforeAmount = roundedMoney(wallet.available_balance);
    afterAmount = roundedMoney(beforeAmount + amount);
    updatedWallet = await updateEntity("Wallet", wallet.id, {
      available_balance: afterAmount,
      withdrawable_balance: roundedMoney(money(wallet.withdrawable_balance) + amount),
      total_deposits: roundedMoney(money(wallet.total_deposits) + amount),
    });
    const row = await prisma.user.update({
      where: { id: target.id },
      data: { wallet_balance: roundedMoney(updatedWallet.available_balance) },
    });
    updatedUser = publicUser(row);
    transaction = await createWalletTransaction(target.id, updatedWallet, {
      type: "admin_adjustment",
      amount,
      balance_before: beforeAmount,
      balance_after: roundedMoney(updatedWallet.available_balance),
      description: `Admin money addition: ${reason}`,
      reference_type: "AdminAction",
      adjusted_by: req.user.id,
      adjusted_by_name: actorName,
      reason,
    });
  }

  const action = await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: actorName,
    admin_role: actorRole,
    action_type: "wallet_adjust",
    target_user_id: target.id,
    target_username: targetName,
    description: `Added ${amount} ${adjustmentType} to ${targetName}: ${reason}`,
    details: {
      target_user_id: target.id,
      target_user_name: targetName,
      amount,
      type: adjustmentType,
      reason,
      performed_by: req.user.id,
      performed_by_name: actorName,
      performed_by_role: actorRole,
      timestamp,
      balance_before: beforeAmount,
      balance_after: afterAmount,
      wallet_id: updatedWallet?.id,
      wallet_transaction_id: transaction?.id,
    },
    created_date: timestamp,
  });

  await createEntity("Notification", {
    user_id: target.id,
    type: "system",
    title: adjustmentType === "credits" ? "Credits added" : "Money added",
    message: adjustmentType === "credits"
      ? `${amount.toLocaleString()} credits were added to your account.`
      : `$${amount.toFixed(2)} was added to your wallet.`,
    is_read: false,
    action_url: adjustmentType === "money" ? "/wallet" : "/marketplace#credits-store",
    related_entity_id: action.id,
    related_entity_type: "AdminAction",
    created_date: timestamp,
  });

  return {
    success: true,
    type: adjustmentType,
    amount,
    user: updatedUser,
    wallet: updatedWallet,
    action,
    transaction,
  };
}

async function forgeMoneyToCredits(req) {
  const amount = money(req.body.amount);
  const credits = Math.floor(amount * 100);
  await prisma.user.update({ where: { id: req.user.id }, data: { credits: req.userRow.credits + credits } });
  return { success: true, credits_added: credits };
}

async function generateTournamentBracket(req) {
  if (!hasRole(req.user, "admin") && req.body.system !== true) {
    return { success: false, error: "Admin access required" };
  }
  const tournamentId = req.body.tournament_id;
  const tournament = await getEntity("Tournament", tournamentId);
  const participants = await listEntities("TournamentParticipant", { tournament_id: tournamentId }, "seed", 256);
  if (participants.length < 2) return { success: false, error: "At least two participants are required" };
  const existing = await listEntities("TournamentMatch", { tournament_id: tournamentId }, "round", 500);
  if (existing.length > 0) return { success: true, match_count: existing.length, matches: existing, already_generated: true };
  const bracketSize = nextPowerOfTwo(participants.length);
  const seededParticipants = seedPositions(bracketSize).map((seed) => participants[seed - 1] || null);
  const totalRounds = Math.log2(bracketSize);
  const matches = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const matchCount = bracketSize / (2 ** round);
    for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
      const isRoundOne = round === 1;
      const a = isRoundOne ? seededParticipants[(matchNumber - 1) * 2] : null;
      const b = isRoundOne ? seededParticipants[((matchNumber - 1) * 2) + 1] : null;
      const hasA = Boolean(a);
      const hasB = Boolean(b);
      const hasBye = isRoundOne && hasA !== hasB;
      const winner = hasBye ? (a || b) : null;
      const matchPayload = {
        tournament_id: tournamentId,
        bracket: "winner",
        round,
        match_number: matchNumber,
        ...(a ? participantSlotFields(a, "team_a") : {}),
        ...(b ? participantSlotFields(b, "team_b") : {}),
        status: isRoundOne ? (hasA && hasB ? "ready" : "completed") : "pending",
        winner_id: winner ? participantKey(winner) : null,
        winner_name: winner ? participantName(winner) : null,
        completed: Boolean(winner),
        completed_date: winner ? nowIso() : null,
        next_match_round: round < totalRounds ? round + 1 : null,
        next_match_number: round < totalRounds ? Math.ceil(matchNumber / 2) : null,
        slot_in_next: round < totalRounds ? (matchNumber % 2 === 1 ? "team_a" : "team_b") : null,
        is_final: round === totalRounds,
        created_date: nowIso(),
      };
      matches.push(await createEntity("TournamentMatch", {
        ...matchPayload,
        ...(hasA && hasB ? tournamentMatchSetupPatch(matchPayload, participants) : {}),
      }));
    }
  }

  await updateEntity("Tournament", tournamentId, {
    status: req.body.start_immediately === true ? "in_progress" : "closed",
    registration_locked: true,
    bracket_generated: true,
    bracket_generated_date: nowIso(),
  }).catch(() => null);
  await notifyTournamentParticipants(tournamentId, {
    title: "Bracket generated",
    message: `${tournament.name} bracket is ready.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournamentId,
    related_entity_type: "Tournament",
  });
  const participantByTeamId = Object.fromEntries(participants.map((participant) => [participant.team_id, participant]));
  await Promise.all(matches.map((match) => {
    const teamA = participantByTeamId[match.team_a_id];
    const teamB = participantByTeamId[match.team_b_id];
    return notifyUsers([
      ...participantUserIds(teamA),
      ...participantUserIds(teamB),
    ], {
      title: "Tournament match assigned",
      message: `${match.team_a_name || "Open slot"} vs ${match.team_b_name || "Open slot"}`,
      type: "match",
      action_url: `/tournament-match/${match.id}`,
      related_entity_id: match.id,
      related_entity_type: "TournamentMatch",
    });
  }));

  for (const match of matches.filter((row) => row.status === "completed" && row.winner_id)) {
    await advanceTournamentWinner(match);
  }

  const refreshedMatches = await listEntities("TournamentMatch", { tournament_id: tournamentId }, "round", 500);
  return { success: true, match_count: refreshedMatches.length, matches: refreshedMatches };
}

async function ensureTournamentMatchSetup(req) {
  const matchId = req.body.tournament_match_id || req.body.match_id;
  if (!matchId) return { success: false, error: "Tournament match id is required" };
  const match = await getEntity("TournamentMatch", matchId);
  if (!match.team_a_id || !match.team_b_id) {
    return { success: false, error: "Both teams must be assigned before maps can be generated" };
  }

  const participants = await tournamentParticipants(match.tournament_id);
  const patch = tournamentMatchSetupPatch(match, participants);
  const updated = await updateEntity("TournamentMatch", match.id, patch);
  return { success: true, match: updated };
}

async function startTournament(req) {
  assertStaff(req, "admin");
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  const matches = await listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500);
  let bracket = matches;
  if (matches.length === 0) {
    const generated = await generateTournamentBracket({ ...req, body: { tournament_id: tournament.id, start_immediately: true } });
    if (!generated.success) return generated;
    bracket = generated.matches || [];
  }
  const updated = await updateEntity("Tournament", tournament.id, {
    status: "in_progress",
    registration_locked: true,
    started_by: req.user.id,
    started_by_name: nameFor(req.user),
    started_date: nowIso(),
  });
  await notifyTournamentParticipants(tournament.id, {
    title: "Tournament started",
    message: `${tournament.name} has started.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournament.id,
    related_entity_type: "Tournament",
  });
  return { success: true, tournament: updated, matches: bracket };
}

async function syncTournamentLifecycle(req) {
  const tournaments = await listEntities("Tournament", {}, "-start_date", 500);
  const now = Date.now();
  const synced = [];

  for (const tournament of tournaments) {
    const registrationEnd = tournament.registration_end ? new Date(tournament.registration_end).getTime() : null;
    if (
      registrationEnd &&
      registrationEnd <= now &&
      tournamentStatusesOpenForRegistration.includes(tournament.status) &&
      tournament.registration_locked !== true
    ) {
      const generated = await generateTournamentBracket({ ...req, body: { tournament_id: tournament.id, start_immediately: true, system: true } });
      if (generated.success) synced.push({ tournament_id: tournament.id, action: "bracket_generated" });
    }
  }

  return { success: true, synced };
}

async function createTournamentScoreConflict({ req, match, report, reportingSide }) {
  const existingDisputes = await listEntities("Dispute", { match_id: match.id }, "-created_date", 20).catch(() => []);
  const existingOpenDispute = existingDisputes.find((row) => !["resolved", "rejected", "closed"].includes(row.status));
  const dispute = existingOpenDispute || await createEntity("Dispute", {
    match_id: match.id,
    match_type: "tournament",
    tournament_match_id: match.id,
    wager_details: match,
    match_logs: [match, { ...match, ...report }],
    reported_by: req.user.id,
    reported_by_name: nameFor(req.user),
    reported_against: reportingSide === "team_a" ? match.team_b_id : match.team_a_id,
    reported_against_name: reportingSide === "team_a" ? match.team_b_name : match.team_a_name,
    reason: "score_conflict",
    description: "Teams reported conflicting tournament match scores.",
    evidence_urls: req.body.proof_urls || [],
    submitted_evidence: req.body.proof_urls || [],
    status: "pending",
    priority: "high",
    created_date: nowIso(),
  });

  await updateEntity("TournamentMatch", match.id, {
    ...report,
    status: "score_conflict",
    dispute_id: dispute.id,
    score_conflict_date: nowIso(),
  });
  await notifyStaff({
    title: "Tournament score conflict",
    message: `${match.team_a_name || "Team A"} vs ${match.team_b_name || "Team B"} needs review.`,
    type: "match",
    action_url: `/tournament-match/${match.id}`,
    related_entity_id: dispute.id,
    related_entity_type: "Dispute",
  });

  return { success: true, ready_to_complete: false, status: "score_conflict", dispute };
}

async function finalizeTournamentMatch(match, teamAScore, teamBScore, patch = {}) {
  const winnerIsA = teamAScore > teamBScore;
  const winnerId = winnerIsA ? match.team_a_id : match.team_b_id;
  const loserId = winnerIsA ? match.team_b_id : match.team_a_id;
  let updated = await updateEntity("TournamentMatch", match.id, {
    ...patch,
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    winner_id: winnerId,
    winner_name: winnerIsA ? match.team_a_name : match.team_b_name,
    completed: true,
    status: "completed",
    completed_date: new Date().toISOString(),
  });
  const [winnerUserIds, loserUserIds] = await Promise.all([
    tournamentParticipantUserIds(match.tournament_id, winnerId),
    tournamentParticipantUserIds(match.tournament_id, loserId),
  ]);
  await applyParticipantRewards(winnerUserIds, loserUserIds);
  updated = await updateEntity("TournamentMatch", updated.id, tournamentRewardAppliedPatch(winnerUserIds, loserUserIds));
  await notifyUsers([...winnerUserIds, ...loserUserIds], {
    title: "Tournament match completed",
    message: `${updated.winner_name} won ${teamAScore}-${teamBScore}.`,
    type: "match",
    action_url: `/tournament-match/${match.id}`,
    related_entity_id: match.id,
    related_entity_type: "TournamentMatch",
  });
  const loserIsEliminated = !updated.loser_match_id && !updated.loser_match_round && !updated.loser_match_number;
  const elimination = loserIsEliminated
    ? await grantTournamentEliminationRewards({
      tournamentId: updated.tournament_id,
      loserId,
      match: updated,
      loserUserIds,
    })
    : {};
  const advancement = updated.next_match_round
    ? await advanceTournamentWinner(updated)
    : await advanceLegacyTournamentRound(updated.tournament_id, updated.round);
  return { success: true, match: updated, elimination, ...advancement };
}

async function completeTournamentMatch(req) {
  const match = await getEntity("TournamentMatch", req.body.tournament_match_id);
  if (!match || match.status === "completed" || match.completed) {
    return { success: false, error: "Match is already completed" };
  }
  const [teamAUserIds, teamBUserIds] = await Promise.all([
    tournamentParticipantUserIds(match.tournament_id, match.team_a_id),
    tournamentParticipantUserIds(match.tournament_id, match.team_b_id),
  ]);
  const involvedUserIds = [...new Set([...teamAUserIds, ...teamBUserIds])];
  const isStaff = hasRole(req.user, "moderator");
  const isParticipant = involvedUserIds.includes(req.user.id);
  const canStaffOverride = isStaff && !isParticipant;
  if (!isStaff && !isParticipant) {
    return { success: false, error: "Only tournament match participants can submit results" };
  }
  if (["disputed", "score_conflict"].includes(match.status) && !canStaffOverride) {
    return { success: false, error: "This match is under dispute review" };
  }
  const teamAScore = Number(req.body.team_a_score || 0);
  const teamBScore = Number(req.body.team_b_score || 0);
  if (!Number.isFinite(teamAScore) || !Number.isFinite(teamBScore) || teamAScore < 0 || teamBScore < 0) {
    return { success: false, error: "Scores must be valid numbers" };
  }
  if (!match.team_a_id || !match.team_b_id) {
    return { success: false, error: "Both tournament slots must be assigned before completion" };
  }
  if (teamAScore === teamBScore) {
    return { success: false, error: "Tournament match scores cannot be tied" };
  }

  if (canStaffOverride) {
    return finalizeTournamentMatch(match, teamAScore, teamBScore, {
      scores_confirmed: true,
      confirmed_score_alpha: teamAScore,
      confirmed_score_bravo: teamBScore,
      confirmed_score_date: nowIso(),
      confirmed_by: req.user.id,
      confirmed_by_name: nameFor(req.user),
    });
  }

  const reportingSide = teamAUserIds.includes(req.user.id) ? "team_a" : "team_b";
  const otherSide = reportingSide === "team_a" ? "team_b" : "team_a";
  const otherAlpha = match[`${otherSide}_reported_score_alpha`];
  const otherBravo = match[`${otherSide}_reported_score_bravo`];
  const otherHasReport = otherAlpha !== undefined && otherAlpha !== null && otherBravo !== undefined && otherBravo !== null;
  const scoresMatch = otherHasReport && Number(otherAlpha) === teamAScore && Number(otherBravo) === teamBScore;
  const report = {
    [`${reportingSide}_reported_score_alpha`]: teamAScore,
    [`${reportingSide}_reported_score_bravo`]: teamBScore,
    [`${reportingSide}_reported_score_by`]: req.user.id,
    [`${reportingSide}_reported_score_by_name`]: nameFor(req.user),
    [`${reportingSide}_reported_score_date`]: nowIso(),
    reported_score_alpha: teamAScore,
    reported_score_bravo: teamBScore,
    reported_score_by: req.user.id,
    reported_score_by_name: nameFor(req.user),
    reported_score_team: reportingSide,
    reported_score_date: nowIso(),
    status: reportingSide === "team_a" ? "awaiting_team_b_report" : "awaiting_team_a_report",
  };

  if (otherHasReport && !scoresMatch) {
    return createTournamentScoreConflict({ req, match, report, reportingSide });
  }

  if (scoresMatch) {
    return finalizeTournamentMatch(match, teamAScore, teamBScore, {
      ...report,
      scores_confirmed: true,
      confirmed_score_alpha: teamAScore,
      confirmed_score_bravo: teamBScore,
      confirmed_score_date: nowIso(),
    });
  }

  const updated = await updateEntity("TournamentMatch", match.id, report);
  await notifyUsers(otherSide === "team_a" ? teamAUserIds : teamBUserIds, {
    title: "Score report submitted",
    message: `${reportingSide === "team_a" ? match.team_a_name : match.team_b_name} reported ${teamAScore}-${teamBScore}. Please confirm or dispute.`,
    type: "match",
    action_url: `/tournament-match/${match.id}`,
    related_entity_id: match.id,
    related_entity_type: "TournamentMatch",
  });

  return {
    success: true,
    ready_to_complete: false,
    status: updated.status,
    match: updated,
    message: "Score submitted. Waiting for the other team to confirm.",
  };
}

async function createDispute(req) {
  const matchType = req.body.match_type || "wager";
  const matchId = req.body.match_id || req.body.wager_id || req.body.ranked_match_id || req.body.tournament_match_id;
  let match = null;
  if (matchType === "ranked") match = await getEntity("RankedMatch", matchId);
  else if (matchType === "tournament") match = await getEntity("TournamentMatch", matchId);
  else match = await getEntity("Wager", matchId);

  const involvedUserIds = await matchParticipantIds(matchType, match);
  if (!hasRole(req.user, "moderator") && !involvedUserIds.includes(req.user.id)) {
    return { success: false, error: "Only match participants can submit disputes" };
  }

  const submittedEvidence = [
    ...(req.body.evidence_urls || []),
    ...(req.body.screenshots || []),
    ...(req.body.videos || []),
  ];
  const existingDisputes = await listEntities("Dispute", { match_id: match.id }, "-created_date", 20).catch(() => []);
  const existingOpenDispute = existingDisputes.find((row) => !["resolved", "rejected", "closed"].includes(row.status));
  if (existingOpenDispute) {
    if (req.user.is_premium && req.body.escalated) {
      const updated = await updateEntity("Dispute", existingOpenDispute.id, {
        priority: "critical",
        premium_escalated: true,
        escalation_reason: req.body.description || "Premium secondary review requested",
        additional_evidence_urls: [
          ...(existingOpenDispute.additional_evidence_urls || []),
          ...submittedEvidence,
        ],
        escalated_by: req.user.id,
        escalated_by_name: nameFor(req.user),
        escalated_date: nowIso(),
      });
      await notifyStaff({
        title: "Dispute escalated",
        message: `${nameFor(req.user)} requested premium review for ${matchType} dispute #${existingOpenDispute.id.slice(-8)}.`,
        type: "match",
        action_url: "/admin",
        related_entity_id: existingOpenDispute.id,
        related_entity_type: "Dispute",
      });
      return { success: true, dispute: updated, escalated: true };
    }
    return { success: true, dispute: existingOpenDispute, already_exists: true };
  }

  const [chatLogs, matchHistory] = await Promise.all([
    listEntities("ChatMessage", { conversation_id: match.id }, "-created_date", 100).catch(() => []),
    listEntities("MatchHistory", { match_id: match.id }, "-created_date", 100).catch(() => []),
  ]);
  const dispute = await createEntity("Dispute", {
    wager_id: matchType === "wager" ? match.id : undefined,
    match_id: match.id,
    match_type: matchType,
    wager_details: match,
    match_logs: [match],
    match_history: matchHistory,
    chat_logs: chatLogs,
    reported_by: req.user.id,
    reported_by_name: nameFor(req.user),
    reported_against: req.body.reported_against,
    reported_against_name: req.body.reported_against_name,
    reason: req.body.reason || "score_dispute",
    description: req.body.description || "",
    evidence_urls: req.body.evidence_urls || [],
    screenshots: req.body.screenshots || [],
    videos: req.body.videos || [],
    submitted_evidence: submittedEvidence,
    status: "pending",
    priority: req.user.is_premium ? "high" : (req.body.priority || "medium"),
    premium_escalated: Boolean(req.user.is_premium && req.body.escalated),
    created_date: nowIso(),
  });

  const entityName = matchType === "ranked" ? "RankedMatch" : matchType === "tournament" ? "TournamentMatch" : "Wager";
  await updateEntity(entityName, match.id, {
    status: "disputed",
    dispute_id: dispute.id,
    disputed_date: nowIso(),
  }).catch(() => null);

  await notifyStaff({
    title: "New dispute",
    message: `${nameFor(req.user)} opened a ${matchType} dispute.`,
    type: "match",
    action_url: "/admin",
    related_entity_id: dispute.id,
    related_entity_type: "Dispute",
  });

  const ticketResult = await requestAdminAlert({
    ...req,
    body: {
      match_type: matchType,
      match_id: match.id,
      request_type: "dispute",
      dispute_id: dispute.id,
      subject: `${matchType} dispute ${match.id}`,
      description: req.body.description || `Dispute opened for ${matchType} match ${match.id}.`,
      priority: req.user.is_premium ? "critical" : "high",
      proof_urls: submittedEvidence,
    },
  }).catch(() => null);
  const linkedDispute = ticketResult?.ticket?.id
    ? await updateEntity("Dispute", dispute.id, { ticket_id: ticketResult.ticket.id }).catch(() => dispute)
    : dispute;

  return { success: true, dispute: linkedDispute, ticket: ticketResult?.ticket };
}

async function escalateDispute(req) {
  const dispute = await getEntity("Dispute", req.body.dispute_id);
  if (!req.user.is_premium && !hasRole(req.user, "moderator")) {
    return { success: false, error: "Premium membership is required to escalate disputes" };
  }
  const updated = await updateEntity("Dispute", dispute.id, {
    priority: "critical",
    premium_escalated: true,
    escalation_reason: req.body.reason || "",
    additional_evidence_urls: req.body.evidence_urls || dispute.additional_evidence_urls || [],
    escalated_by: req.user.id,
    escalated_by_name: nameFor(req.user),
    escalated_date: nowIso(),
  });
  await notifyStaff({
    title: "Dispute escalated",
    message: `${nameFor(req.user)} escalated dispute #${dispute.id.slice(-8)}.`,
    type: "match",
    action_url: "/admin",
    related_entity_id: dispute.id,
    related_entity_type: "Dispute",
  });
  if (dispute.ticket_id) {
    await updateEntity("Ticket", dispute.ticket_id, {
      status: "escalated",
      priority: "critical",
      premium_escalated: true,
      escalation_reason: req.body.reason || "",
      additional_proof: req.body.evidence_urls || [],
      updated_date: nowIso(),
    }).catch(() => null);
  }
  return { success: true, dispute: updated };
}

async function moderateDispute(req) {
  assertStaff(req, "moderator");
  const dispute = await getEntity("Dispute", req.body.dispute_id);
  const action = req.body.action || req.body.decision;
  const matchType = dispute.match_type || (dispute.wager_id ? "wager" : "wager");
  const matchId = dispute.match_id || dispute.wager_id;
  const entityName = matchType === "ranked" ? "RankedMatch" : matchType === "tournament" ? "TournamentMatch" : "Wager";
  const match = await getEntity(entityName, matchId);
  let result = null;

  if (action === "approve_team_a" || action === "approve_team_b") {
    if (matchType === "ranked") {
      const winnerId = action === "approve_team_a" ? match.host_id : match.challenger_id;
      const teamAlphaScore = action === "approve_team_a" ? 1 : 0;
      const teamBravoScore = action === "approve_team_b" ? 1 : 0;
      result = await completeRankedMatch({ ...req, body: { ranked_match_id: match.id, team_alpha_score: teamAlphaScore, team_bravo_score: teamBravoScore } });
    } else if (matchType === "tournament") {
      result = await completeTournamentMatch({
        ...req,
        body: {
          tournament_match_id: match.id,
          team_a_score: action === "approve_team_a" ? 1 : 0,
          team_b_score: action === "approve_team_b" ? 1 : 0,
        },
      });
    } else {
      const winnerId = action === "approve_team_a" ? match.host_id : match.challenger_id;
      result = await completeWager({
        ...req,
        body: {
          wager_id: match.id,
          winner_id: winnerId,
          team_alpha_score: action === "approve_team_a" ? 1 : 0,
          team_bravo_score: action === "approve_team_b" ? 1 : 0,
        },
      });
    }
  } else if (action === "force_replay") {
    result = await updateEntity(entityName, match.id, {
      status: "in_progress",
      dispute_id: null,
      replay_forced: true,
      replay_forced_by: req.user.id,
      replay_forced_date: nowIso(),
    });
  } else if (action === "reject_dispute") {
    result = await updateEntity(entityName, match.id, {
      status: ["disputed", "score_conflict"].includes(match.status) ? "in_progress" : match.status,
      dispute_id: null,
      dispute_rejected: true,
      dispute_rejected_by: req.user.id,
      dispute_rejected_date: nowIso(),
    });
  } else {
    return { success: false, error: "Unknown dispute action" };
  }

  const updated = await updateEntity("Dispute", dispute.id, {
    status: "resolved",
    decision: action,
    resolution: req.body.notes || action,
    resolved_by: req.user.id,
    resolved_by_name: nameFor(req.user),
    resolved_date: nowIso(),
  });

  const notifyIds = [
    dispute.reported_by,
    dispute.reported_against,
    ...(await matchParticipantIds(matchType, match)),
  ].filter(Boolean);
  await notifyUsers(notifyIds, {
    title: "Dispute resolved",
    message: `Dispute #${dispute.id.slice(-8)} was resolved: ${String(action).replace(/_/g, " ")}.`,
    type: "match",
    action_url: matchType === "ranked" ? `/ranked-match/${match.id}` : matchType === "tournament" ? `/tournament-match/${match.id}` : `/wagers-match/${match.id}`,
    related_entity_id: dispute.id,
    related_entity_type: "Dispute",
  });

  return { success: true, dispute: updated, result };
}

async function updateUserRole(req) {
  assertStaff(req, "super_admin");
  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "User not found" };
  const nextRole = req.body.role || "user";
  if (!rolePower[nextRole]) return { success: false, error: "Invalid role" };
  if (!canModifyUserRole(req.user.role, target.role)) {
    return { success: false, error: "Role hierarchy prevents modifying this account" };
  }
  if (!canModifyUserRole(req.user.role, nextRole)) {
    return { success: false, error: "Role hierarchy prevents assigning this role" };
  }
  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      role: nextRole,
      admin_role: nextRole !== "user" ? nextRole : null,
      is_admin: nextRole !== "user",
      metadata: {
        ...(target.metadata || {}),
        badges: nextRole !== "user" ? [{ name: nextRole === "ceo" ? "CEO" : nextRole.replace("_", " "), type: nextRole }] : [],
      },
    },
  });
  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "role_change",
    target_user_id: target.id,
    target_username: nameFor(target),
    description: `Changed ${nameFor(target)} role to ${nextRole}`,
    details: { role: nextRole },
    created_date: nowIso(),
  }).catch(() => null);
  return { success: true, user };
}

function banExpiration(duration) {
  if (!duration || duration === "permanent") return null;
  const hours = {
    "24h": 24,
    "3d": 72,
    "7d": 168,
    "14d": 336,
    "30d": 720,
  }[duration] || Number(duration) * 24;
  return Number.isFinite(hours) ? new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString() : null;
}

async function moderateUser(req) {
  assertStaff(req, "moderator");
  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "User not found" };
  if (!canModerateUser(req.user.role, target.role)) {
    return { success: false, error: "Role hierarchy prevents moderating this account" };
  }

  const action = req.body.action || "warning";
  const reason = req.body.reason || "Moderation action";
  const expiresDate = action === "temporary_ban" || action === "suspension" ? banExpiration(req.body.duration || "24h") : null;
  const metadata = {
    ...(target.metadata || {}),
    moderation_history: [
      ...((target.metadata || {}).moderation_history || []),
      {
        action,
        reason,
        moderator_id: req.user.id,
        moderator_name: nameFor(req.user),
        date: nowIso(),
        expires_date: expiresDate,
      },
    ],
    suspended_until: action === "suspension" ? expiresDate : (action === "remove_ban" ? null : (target.metadata || {}).suspended_until),
    ban_expires: ["temporary_ban", "email_ban", "ip_ban"].includes(action) ? expiresDate : (action === "remove_ban" ? null : (target.metadata || {}).ban_expires),
  };

  if (["ban", "temporary_ban", "email_ban", "ip_ban"].includes(action)) {
    await createEntity("Ban", {
      user_id: target.id,
      username: nameFor(target),
      banned_by: req.user.id,
      banned_by_name: nameFor(req.user),
      banned_by_role: req.user.role,
      reason,
      ban_type: action === "ban" || !expiresDate ? "permanent" : "temporary",
      duration_days: expiresDate ? Math.ceil((new Date(expiresDate) - new Date()) / 86400000) : undefined,
      expires_date: expiresDate,
      scope: [action.replace("_ban", "")],
      ip: target.metadata?.last_login_ip || target.metadata?.registration_ip || target.last_login_ip || target.registration_ip,
      email: target.email,
      status: "active",
      created_date: nowIso(),
    }).catch(() => null);
  }
  if (action === "remove_ban") {
    const bans = await listEntities("Ban", { user_id: target.id }, "-created_date", 100).catch(() => []);
    await Promise.all(bans
      .filter((ban) => ban.status === "active")
      .map((ban) => updateEntity("Ban", ban.id, {
        status: "removed",
        removed_by: req.user.id,
        removed_by_name: nameFor(req.user),
        removed_date: nowIso(),
      }).catch(() => null)));
  }

  const shouldBan = ["ban", "temporary_ban", "email_ban", "ip_ban"].includes(action);
  const shouldRemoveBan = action === "remove_ban";
  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      is_banned: shouldRemoveBan ? false : shouldBan ? true : target.is_banned,
      ban_reason: shouldRemoveBan ? null : shouldBan ? reason : target.ban_reason,
      metadata,
    },
  });

  await notifyUser(target.id, {
    title: "Account moderation update",
    message: action === "warning" ? `Warning: ${reason}` : `Moderation action: ${action.replace(/_/g, " ")}`,
    type: "system",
    action_url: "/settings",
    related_entity_id: target.id,
    related_entity_type: "User",
  });

  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: action,
    target_user_id: target.id,
    target_username: nameFor(target),
    description: reason,
    details: { expires_date: expiresDate },
    created_date: nowIso(),
  }).catch(() => null);

  return { success: true, user };
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
  joinTicket,
  joinMatchRoomAsAdmin,
  replyTicket,
  resolveTicket,
  adminResolveMatchRoom,
  adminCorrectTournamentMatch,
  reopenTicket,
  escalateTicket,
  createNotification,
  sendNotification: createNotification,
  sendMessage,
  manageTeam,
  createWager,
  acceptWager,
  payWagerEntry,
  submitScore,
  completeWager,
  refundWager,
  createRankedMatch,
  acceptRankedMatch,
  completeRankedMatch,
  cancelRankedMatch,
  buyWithCredits,
  syncMarketplaceUnlocks,
  addFunds,
  depositToWallet: addFunds,
  adminAdjustWallet,
  forgeMoneyToCredits,
  registerTournament,
  updateTournament,
  deleteTournament,
  cancelTournament,
  closeTournamentRegistration,
  extendTournamentRegistration,
  withdrawFromWallet: async (req) => ({ success: true, withdrawal: await createEntity("WithdrawalRequest", { ...req.body, user_id: req.user.id, status: "pending", created_date: new Date().toISOString() }) }),
  processWithdrawal: async (req) => ({ success: true, withdrawal: await updateEntity("WithdrawalRequest", req.body.withdrawal_id, { status: req.body.status, processed_date: new Date().toISOString() }) }),
  generateTournamentBracket,
  ensureTournamentMatchSetup,
  startTournament,
  syncTournamentLifecycle,
  completeTournamentMatch,
  completeTournament: async (req) => ({ success: true, tournament: await completeTournament(req.body.tournament_id, req.body.winner_id, req.body.winner_name) }),
  createDispute,
  escalateDispute,
  moderateDispute,
  updateUserRole,
  moderateUser,
  changeDisplayName,
  adminAction: async (req) => ({ success: true, action: await createEntity("AdminAction", { ...req.body, admin_id: req.user.id, admin_name: nameFor(req.user), created_date: new Date().toISOString() }) }),
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
