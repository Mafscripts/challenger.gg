import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { createEntity, deleteEntity, firstEntity, getEntity, listEntities, serializeRow, updateEntity } from "../entity.js";
import { ensureUserRecords, hashPassword, publicUser } from "../auth.js";
import { hasRole, rolePower } from "../roles.js";

const router = Router();

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};
const roundedMoney = (value) => Math.round(money(value) * 100) / 100;
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";
const activisionIdFor = (user) => String(user?.activision_id || user?.metadata?.activision_id || "").trim();
const activisionSettingsMessage = "Add your Activision ID in Settings > Gaming IDs before joining competitive matches.";
const cleanName = (value) => String(value || "").trim().toLowerCase();
const nowIso = () => new Date().toISOString();
const WIN_XP = 150;
const LOSS_XP = 50;
const RANKED_WIN_ELO = 25;
const RANKED_LOSS_ELO = -15;
const RANKED_ELO_SCALE = 400;
const RANKED_MIN_CHANGE = 5;
const RANKED_MAX_CHANGE = 40;
const adminPremiumGrantDays = 30;
const staffRoles = ["ceo", "super_admin", "admin", "moderator"];
const walletAdjustmentRoles = new Set(["ceo", "super_admin"]);
const walletAdjustmentTypes = new Set(["credits", "money"]);
const publicCommerceEnabled = String(process.env.PUBLIC_COMMERCE_ENABLED || "").toLowerCase() === "true";
const blockedPublicCommerceFunctions = new Set([
  "buyWithCredits",
  "create-checkout",
  "depositToWallet",
  "forgeMoneyToCredits",
  "subscribePremium",
  "withdrawFromWallet",
]);
const commerceUnavailableMessage = "Purchases are temporarily unavailable during public testing. Credits and funds can only be granted by Topfragg staff.";
const tournamentStatusesOpenForRegistration = ["open", "registration"];
const tournamentStatusesStarted = ["live", "in_progress"];
const openTicketStatuses = ["open", "waiting_for_admin", "admin_joined", "waiting_for_user", "escalated"];
const tournamentTeamSizeOptions = new Set(Array.from({ length: 8 }, (_, index) => `${index + 1}v${index + 1}`));
const tournamentSndMapPool = ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Colossus"];
const tournamentHpMapPool = ["Sake", "Colossus", "Den", "Scar", "Gridlock", "Hacienda"];
const tournamentOverloadMapPool = ["Scar", "Gridlock", "Den", "Exposure"];
const tournamentSndHpSndModes = [
  { game_mode: "snd", mode: "Search and Destroy" },
  { game_mode: "hp", mode: "Hardpoint" },
  { game_mode: "snd", mode: "Search and Destroy" },
];
const tournamentHpOverloadSndModes = [
  { game_mode: "hp", mode: "Hardpoint" },
  { game_mode: "overload", mode: "Overload" },
  { game_mode: "snd", mode: "Search and Destroy" },
];
const tournamentHpOverloadSndHpSndModes = [
  { game_mode: "hp", mode: "Hardpoint" },
  { game_mode: "overload", mode: "Overload" },
  { game_mode: "snd", mode: "Search and Destroy" },
  { game_mode: "hp", mode: "Hardpoint" },
  { game_mode: "snd", mode: "Search and Destroy" },
];
const tournamentSndModes = Array.from({ length: 3 }, () => ({ game_mode: "snd", mode: "Search and Destroy" }));
const tournamentHpModes = Array.from({ length: 3 }, () => ({ game_mode: "hp", mode: "Hardpoint" }));
const tournamentOverloadModes = Array.from({ length: 3 }, () => ({ game_mode: "overload", mode: "Overload" }));
const tournamentBo1SndModes = [{ game_mode: "snd", mode: "Search and Destroy" }];
const defaultTournamentBestOf = 3;
const tournamentStartWindowMinutes = 15;
const tournamentSeriesDefinitions = {
  bo1_snd: { label: "Search and Destroy", games: tournamentBo1SndModes },
  snd: { label: "Search and Destroy", games: tournamentSndModes },
  hp: { label: "Hardpoint", games: tournamentHpModes },
  overload: { label: "Overload", games: tournamentOverloadModes },
  snd_hp_snd: { label: "SND / HP / SND", games: tournamentSndHpSndModes },
  bo3_hp_overload_snd: { label: "HP / Overload / SND", games: tournamentHpOverloadSndModes },
  bo5_hp_overload_snd_hp_snd: { label: "HP / Overload / SND / HP / SND", games: tournamentHpOverloadSndHpSndModes },
};
const roleBadgeTypes = new Set(["ceo", "super_admin", "admin", "moderator"]);
const specialUserBadgeTypes = new Set(["verified_player", "streamer"]);
const specialUserBadgeLabels = {
  verified_player: "Verified Player",
  streamer: "Streamer",
};
const streamerTournamentTypes = new Set(["streamer", "streamer_tournament"]);
const streamerSwitchFormats = new Set(["2v2", "4v4"]);

function isStreamerUser(user) {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  return Boolean(
    user?.streamer_badge
    || user?.is_streamer
    || badges.some((badge) => badge?.type === "streamer")
  );
}

function isStreamerTournament(tournament) {
  return Boolean(
    tournament?.is_streamer_tournament
    || streamerTournamentTypes.has(String(tournament?.tournament_type || "").toLowerCase())
    || streamerTournamentTypes.has(String(tournament?.source || "").toLowerCase())
  );
}

function streamerTournamentBanEntry(tournament, userId) {
  const bannedIds = Array.isArray(tournament?.banned_user_ids) ? tournament.banned_user_ids : [];
  const bannedUsers = Array.isArray(tournament?.banned_users) ? tournament.banned_users : [];
  return bannedUsers.find((entry) => String(entry?.user_id || "") === String(userId))
    || (bannedIds.map(String).includes(String(userId)) ? { user_id: userId } : null);
}

function canModerateStreamerTournament(user, tournament) {
  return Boolean(
    hasRole(user, "moderator")
    || String(tournament?.host_id || tournament?.created_by || "") === String(user?.id || "")
  );
}

function streamerDefaultMapPool() {
  return [...new Set([...tournamentSndMapPool, ...tournamentHpMapPool, ...tournamentOverloadMapPool])];
}

function normalizeStreamerSwitchFormat(value) {
  const format = String(value || "4v4").toLowerCase();
  return streamerSwitchFormats.has(format) ? format : "4v4";
}

function streamerEntrySlotCount(format) {
  return normalizeStreamerSwitchFormat(format) === "4v4" ? 2 : 1;
}

function cleanManualPlayerName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 32);
}

function normalizeStreamerSwitchEntries(value, format) {
  const slotCount = streamerEntrySlotCount(format);
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  return rows.map((entry, index) => {
    const rawNames = Array.isArray(entry?.player_names)
      ? entry.player_names
      : [
        entry?.player_one,
        entry?.player_two,
        entry?.player_name,
        entry?.name,
      ];
    const playerNames = rawNames
      .map(cleanManualPlayerName)
      .filter(Boolean)
      .slice(0, slotCount);
    if (playerNames.length !== slotCount) return null;
    const dedupeKey = playerNames.map((name) => name.toLowerCase()).join("|");
    if (seen.has(dedupeKey)) return null;
    seen.add(dedupeKey);
    return {
      id: String(entry?.id || globalThis.crypto?.randomUUID?.() || `switch-entry-${Date.now()}-${index}`),
      player_names: playerNames,
      linked_user_ids: Array.isArray(entry?.linked_user_ids) ? entry.linked_user_ids.filter(Boolean) : [],
      created_date: entry?.created_date || nowIso(),
    };
  }).filter(Boolean);
}

function shuffledCopy(rows) {
  const copy = [...rows];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function streamerManualMember(name, index) {
  return {
    user_id: null,
    user_name: name,
    username: name,
    handle: name,
    display_name: name,
    manual_name: true,
    slot: index + 1,
  };
}

function streamerTeamName(playerNames, index) {
  const first = cleanManualPlayerName(playerNames[0]);
  return first ? `Team ${index + 1} - ${first}` : `Team ${index + 1}`;
}

function streamerTeamPlayerCount(format) {
  return normalizeStreamerSwitchFormat(format) === "4v4" ? 4 : 2;
}

function streamerTeamId(tournamentId, index) {
  return `streamer-team-${tournamentId}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${index}`}`;
}

function buildStreamerSwitchTeams(entries, format, tournamentId) {
  const shuffledEntries = shuffledCopy(entries);
  const generatedTeams = [];
  for (let index = 0; index < shuffledEntries.length; index += 2) {
    const pair = [shuffledEntries[index], shuffledEntries[index + 1]];
    const playerNames = pair.flatMap((entry) => entry.player_names);
    generatedTeams.push({
      id: streamerTeamId(tournamentId, index),
      name: streamerTeamName(playerNames, generatedTeams.length),
      seed: generatedTeams.length + 1,
      player_names: playerNames,
      source_entry_ids: pair.map((entry) => entry.id),
    });
  }
  return generatedTeams;
}

function normalizeStreamerSwitchTeams(value, format, tournamentId) {
  const playerCount = streamerTeamPlayerCount(format);
  const rows = Array.isArray(value) ? value : [];
  return rows.map((team, index) => {
    const rawNames = Array.isArray(team?.player_names)
      ? team.player_names
      : [team?.player_one, team?.player_two, team?.player_three, team?.player_four, team?.name].filter(Boolean);
    const playerNames = rawNames.map(cleanManualPlayerName).filter(Boolean).slice(0, playerCount);
    return {
      id: String(team?.id || streamerTeamId(tournamentId, index)),
      name: cleanManualPlayerName(team?.name) || streamerTeamName(playerNames, index),
      seed: Number(team?.seed || index + 1),
      player_names: playerNames,
      source_entry_ids: Array.isArray(team?.source_entry_ids) ? team.source_entry_ids.filter(Boolean) : [],
    };
  }).filter((team) => team.player_names.length > 0);
}

function streamerSwitchTeamsValidationError(teams, format, maxTeams = 64) {
  const playerCount = streamerTeamPlayerCount(format);
  if (teams.length < 2) return "Spin or add at least two teams before locking the bracket";
  if (teams.length > Number(maxTeams || 64)) return `This lobby is capped at ${maxTeams} generated teams`;
  const seen = new Set();
  for (const team of teams) {
    if (team.player_names.length !== playerCount) {
      return `${team.name || "Each team"} needs exactly ${playerCount} players`;
    }
    for (const name of team.player_names) {
      const key = name.toLowerCase();
      if (seen.has(key)) return `${name} is listed more than once`;
      seen.add(key);
    }
  }
  return null;
}

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
  const users = await prisma.user.findMany({
    select: {
      id: true,
      role: true,
      admin_role: true,
      is_admin: true,
    },
  });
  return users.filter((user) => (
    staffRoles.includes(String(user.role || "").toLowerCase())
    || staffRoles.includes(String(user.admin_role || "").toLowerCase())
    || user.is_admin === true
  ));
}

function effectiveChatRole(user) {
  const candidates = [
    String(user?.role || "user").toLowerCase(),
    String(user?.admin_role || "user").toLowerCase(),
    user?.is_admin ? "admin" : "user",
  ];
  return candidates.reduce((best, candidate) => (
    (rolePower[candidate] || 0) > (rolePower[best] || 0) ? candidate : best
  ), "user");
}

async function notifyUser(userId, {
  title,
  message,
  type = "system",
  action_url,
  related_entity_id,
  related_entity_type,
  ...metadata
}) {
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
    ...metadata,
    created_date: nowIso(),
  }).catch(() => null);
}

async function notifyUsers(userIds, notification) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  return Promise.all(uniqueIds.map((userId) => notifyUser(userId, notification)));
}

async function notifyStaff(notification) {
  const staff = await usersWithStaffRole();
  const { exclude_user_ids: excludeUserIds, ...payload } = notification;
  const excludeIds = new Set((excludeUserIds || []).filter(Boolean));
  return notifyUsers(staff.filter((user) => !excludeIds.has(user.id)).map((user) => user.id), payload);
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

function identityValuesFor(value) {
  return [
    value?.id,
    value?.user_id,
    value?.captain_id,
    value?.team_id,
    value?.username,
    value?.handle,
    value?.display_name,
    value?.full_name,
    value?.email,
    value?.user_name,
    value?.name,
  ].filter(Boolean);
}

function participantIdentityValues(participant) {
  const members = Array.isArray(participant?.members) ? participant.members : [];
  const memberValues = members.flatMap(identityValuesFor);
  return [
    participant?.id,
    participant?.team_id,
    participant?.user_id,
    participant?.captain_id,
    participant?.captain_name,
    participant?.user_name,
    ...memberValues,
    ...(members.length ? [] : [participant?.team_name, participant?.name]),
  ].filter(Boolean);
}

function participantIncludesUserIdentity(participant, user) {
  if (!participant || !user?.id) return false;
  const userId = String(user.id);
  if (participantIds(participant).includes(userId)) return true;

  const userKeys = new Set(identityValuesFor(user).map(cleanName).filter(Boolean));
  return participantIdentityValues(participant).some((value) => userKeys.has(cleanName(value)));
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

function tournamentPlacementTrophyItemIds(tournament, placement) {
  const selectedIds = Array.isArray(tournament?.placement_trophy_item_ids?.[placement])
    ? tournament.placement_trophy_item_ids[placement]
    : [];
  const snapshotIds = Array.isArray(tournament?.placement_trophy_items?.[placement])
    ? tournament.placement_trophy_items[placement].map((item) => item?.id || item?.item_id)
    : [];
  return [...new Set([...selectedIds, ...snapshotIds].filter(Boolean).map(String))];
}

const tournamentPlacementTrophyConfig = {
  1: { tier: "gold", label: "Gold", rarity: "legendary" },
  2: { tier: "silver", label: "Silver", rarity: "epic" },
  3: { tier: "bronze", label: "Bronze", rarity: "rare" },
};

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

async function grantStandardTournamentPlacementTrophy(tournament, participantId, userIds = [], placement = 1) {
  const config = tournamentPlacementTrophyConfig[placement];
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (!config || uniqueUserIds.length === 0) return [];

  const grants = [];
  for (const userId of uniqueUserIds) {
    const unlockKey = `tournament_placement:${tournament.id}:${participantId}:${placement}:${userId}`;
    const inventory = await listEntities("UserInventory", { user_id: userId }, "-acquired_date", 500).catch(() => []);
    const existing = inventory.find((item) => String(item.unlock_key || "") === unlockKey);
    if (existing) {
      grants.push({ user_id: userId, inventory_id: existing.id, placement, existing: true });
      continue;
    }

    const trophy = await createEntity("UserInventory", {
      user_id: userId,
      item_id: `standard_tournament_${config.tier}_trophy`,
      item_name: `${config.label} Tournament Trophy - ${tournament.name || "Tournament"}`,
      item_category: "trophy",
      item_rarity: config.rarity,
      item_image: tournament.image_url || tournament.banner_url || null,
      purchase_method: "admin_grant",
      price_paid: 0,
      unlock_type: "tournament_placement_trophy",
      unlock_key: unlockKey,
      source_tournament_id: tournament.id,
      source_tournament_name: tournament.name,
      tournament_placement: placement,
      trophy_tier: config.tier,
      is_unlocked: true,
      is_equipped: false,
      is_tradable: false,
      acquired_date: nowIso(),
    });
    grants.push({ user_id: userId, inventory_id: trophy.id, placement, tier: config.tier });

    await notifyUser(userId, {
      title: `${config.label} tournament trophy earned`,
      message: `You finished #${placement} in ${tournament.name || "the tournament"}. Your ${config.label} trophy is now in your profile cabinet.`,
      type: "tournament",
      action_url: `/profile/${userId}`,
      related_entity_id: tournament.id,
      related_entity_type: "Tournament",
    });
  }

  return grants;
}

async function grantTournamentPlacementRewards(tournament, participantId, userIds = [], placement = 1) {
  if (!participantId || (userIds || []).length === 0) return { standard: [], custom: [] };
  const standard = await grantStandardTournamentPlacementTrophy(tournament, participantId, userIds, placement);
  const customItemIds = tournamentPlacementTrophyItemIds(tournament, placement);
  const customItems = await marketplaceItemsByIds(customItemIds);
  const users = await Promise.all([...new Set(userIds.filter(Boolean))].map((userId) => userFor(userId)));
  const custom = await grantMarketplaceItemsToUsers(users.filter(Boolean), customItems, {
    tournament,
    participant_id: participantId,
    placement,
    unlock_type: "tournament_placement_reward",
    unlockKeyForItem: (item) => `tournament_placement_reward:${tournament.id}:${participantId}:${placement}:${item.id}`,
    notificationTitle: `#${placement} tournament trophy unlocked`,
    messageForItem: (item) => `${item.name} unlocked for finishing #${placement} in ${tournament.name}.`,
  });
  return { standard, custom };
}

async function grantTournamentMarketplaceUnlocks(users = [], context = {}) {
  const validUsers = users.filter(Boolean);
  if (validUsers.length === 0) return [];

  const items = (await listEntities("MarketplaceItem", { unlock_type: "tournament" }, "-created_date", 500).catch(() => []))
    .filter((item) => (
      item.is_active !== false
      && item.is_available !== false
      && item.category !== "trophy"
    ));
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

function activisionIdErrorForUsers(users = []) {
  const missing = (users || []).filter((user) => user && !activisionIdFor(user));
  if (missing.length === 0) return null;
  if (missing.length === 1) {
    return `${nameFor(missing[0])} needs an Activision ID. ${activisionSettingsMessage}`;
  }
  const names = missing.slice(0, 3).map(nameFor).join(", ");
  const suffix = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
  return `${names}${suffix} need an Activision ID. Every roster member must add one in Settings > Gaming IDs.`;
}

async function activisionIdErrorForMembers(members = []) {
  const users = await Promise.all((members || []).map((member) => userFor(member.user_id)));
  return activisionIdErrorForUsers(users);
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

function tournamentPlacementPrize(tournament, placement = 1) {
  const prizePool = roundedMoney(tournament?.prize_pool);
  const distribution = tournament?.prize_distribution || {};
  const amountKey = placement === 2 ? "second_amount" : "first_amount";
  const legacyKey = placement === 2 ? "second" : "first";
  const amount = Number(distribution[amountKey]);
  if (Number.isFinite(amount) && amount > 0) return roundedMoney(amount);

  const legacy = Number(distribution[legacyKey]);
  if (Number.isFinite(legacy) && legacy > 100) return roundedMoney(legacy);
  if (Number.isFinite(legacy) && legacy > 0) {
    return roundedMoney(prizePool * (legacy / 100));
  }
  return placement === 1 ? prizePool : 0;
}

function splitPrizeCents(totalPrize, winnerCount) {
  const count = Math.max(1, Number(winnerCount || 0));
  const totalCents = Math.round(roundedMoney(totalPrize) * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents - (baseCents * count);

  return Array.from({ length: count }, (_value, index) => (
    (baseCents + (index < remainder ? 1 : 0)) / 100
  ));
}

async function awardTournamentPrize(tournament, participantId, winnerUserIds = [], placement = 1) {
  const totalPrize = tournamentPlacementPrize(tournament, placement);
  const userIds = [...new Set((winnerUserIds || []).filter(Boolean))];
  if (totalPrize <= 0 || userIds.length === 0) {
    return { total_prize: 0, paid_user_ids: [], payouts: [] };
  }

  const prizeShares = splitPrizeCents(totalPrize, userIds.length);
  const payouts = [];

  for (let index = 0; index < userIds.length; index += 1) {
    const userId = userIds[index];
    const amount = roundedMoney(prizeShares[index]);
    if (amount <= 0) continue;

    const existingTransactions = await listEntities("WalletTransaction", { user_id: userId }, "-created_date", 500).catch(() => []);
    const alreadyPaid = existingTransactions.some((transaction) => (
      transaction.type === "tournament_prize"
      && transaction.reference_type === "Tournament"
      && String(transaction.reference_id || "") === String(tournament.id)
      && (Number(transaction.placement || 1) === placement)
    ));
    if (alreadyPaid) continue;

    const wallet = await walletFor(userId);
    const balanceBefore = roundedMoney(wallet.available_balance);
    const balanceAfter = roundedMoney(balanceBefore + amount);
    const updatedWallet = await updateEntity("Wallet", wallet.id, {
      available_balance: balanceAfter,
      withdrawable_balance: roundedMoney(money(wallet.withdrawable_balance) + amount),
      total_earnings: roundedMoney(money(wallet.total_earnings) + amount),
    });
    await prisma.user.update({
      where: { id: userId },
      data: {
        wallet_balance: roundedMoney(updatedWallet.available_balance),
        lifetime_earnings: { increment: amount },
      },
    }).catch(() => null);

    const transaction = await createWalletTransaction(userId, updatedWallet, {
      type: "tournament_prize",
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: `Tournament prize - ${tournament.name || tournament.id}`,
      reference_type: "Tournament",
      reference_id: tournament.id,
      participant_id: participantId,
      placement,
    });
    payouts.push({ user_id: userId, amount, wallet_id: updatedWallet.id, transaction_id: transaction?.id });
  }

  const winnerParticipant = await tournamentParticipantForEntry(tournament.id, participantId).catch(() => null);
  if (winnerParticipant) {
    await updateEntity("TournamentParticipant", winnerParticipant.id, {
      prize_won: totalPrize,
      final_rank: placement,
      prize_paid_date: nowIso(),
    }).catch(() => null);
  }

  if (payouts.length > 0) {
    await notifyUsers(payouts.map((payout) => payout.user_id), {
      title: "Tournament prize paid",
      message: `$${totalPrize.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for place #${placement} in ${tournament.name || "the tournament"} was split across the roster.`,
      type: "tournament",
      action_url: "/wallet",
      related_entity_id: tournament.id,
      related_entity_type: "Tournament",
    });
  }

  return { total_prize: totalPrize, paid_user_ids: payouts.map((payout) => payout.user_id), payouts };
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

async function updateRankedOutcome(userId, didWin, requestedEloDelta = null) {
  const stats = await ensureRankedStats(userId);
  if (!stats) return null;
  const eloDelta = Number.isFinite(requestedEloDelta)
    ? Number(requestedEloDelta)
    : (didWin ? RANKED_WIN_ELO : RANKED_LOSS_ELO);
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

async function applyRankedRosterRewards(winnerIds = [], loserIds = []) {
  const changes = {};
  const winners = [...new Set(winnerIds.filter(Boolean))];
  const losers = [...new Set(loserIds.filter(Boolean))].filter((id) => !winners.includes(id));
  const allIds = [...winners, ...losers];
  const statsEntries = await Promise.all(allIds.map(async (userId) => [userId, await ensureRankedStats(userId)]));
  const statsByUser = Object.fromEntries(statsEntries);
  const averageElo = (ids) => ids.length
    ? ids.reduce((total, userId) => total + Number(statsByUser[userId]?.elo || 0), 0) / ids.length
    : 0;
  const winnerAverageElo = averageElo(winners);
  const loserAverageElo = averageElo(losers);
  const winnerExpectedScore = 1 / (1 + (10 ** ((loserAverageElo - winnerAverageElo) / RANKED_ELO_SCALE)));
  const loserExpectedScore = 1 - winnerExpectedScore;
  const clampChange = (value) => Math.max(RANKED_MIN_CHANGE, Math.min(RANKED_MAX_CHANGE, Math.round(value)));
  const winnerEloGain = clampChange(50 * (1 - winnerExpectedScore));
  const loserEloLoss = clampChange(40 * loserExpectedScore);

  const apply = async (userId, didWin) => {
    const before = statsByUser[userId];
    const requestedDelta = didWin ? winnerEloGain : -loserEloLoss;
    await updateXPOutcome(userId, didWin);
    await updateProfileOutcome(userId, didWin, requestedDelta);
    const after = await updateRankedOutcome(userId, didWin, requestedDelta);
    await prisma.user.update({
      where: { id: userId },
      data: { current_win_streak: didWin ? { increment: 1 } : 0 },
    }).catch(() => null);
    changes[userId] = {
      won: didWin,
      previous_elo: Number(before?.elo || 0),
      new_elo: Number(after?.elo || 0),
      delta: Number(after?.elo || 0) - Number(before?.elo || 0),
      opponent_team_average_elo: Math.round(didWin ? loserAverageElo : winnerAverageElo),
    };
  };
  await Promise.all([...winners.map((id) => apply(id, true)), ...losers.map((id) => apply(id, false))]);
  return changes;
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

function tournamentParticipantMatchesSlot(participant, match, slot) {
  if (!participant || !match) return false;
  const slotIds = slot === "team_a"
    ? [match.team_a_participant_id, match.team_a_id]
    : [match.team_b_participant_id, match.team_b_id];
  const ids = new Set(participantIds(participant));
  if (slotIds.some((value) => value && ids.has(String(value)))) return true;

  const participantName = cleanName(participant.team_name || participant.user_name || participant.name);
  const slotName = cleanName(slot === "team_a" ? match.team_a_name : match.team_b_name);
  return Boolean(participantName && slotName && participantName === slotName);
}

async function tournamentMatchParticipantInfo(match, user) {
  const participants = await listEntities("TournamentParticipant", { tournament_id: match.tournament_id }, "seed", 500).catch(() => []);
  const participantA = participants.find((participant) => tournamentParticipantMatchesSlot(participant, match, "team_a"));
  const participantB = participants.find((participant) => tournamentParticipantMatchesSlot(participant, match, "team_b"));
  const teamAUserIds = participantA ? participantUserIds(participantA) : await tournamentParticipantUserIds(match.tournament_id, match.team_a_id);
  const teamBUserIds = participantB ? participantUserIds(participantB) : await tournamentParticipantUserIds(match.tournament_id, match.team_b_id);
  const teamAMatch = teamAUserIds.includes(user?.id) || participantIncludesUserIdentity(participantA, user);
  const teamBMatch = teamBUserIds.includes(user?.id) || participantIncludesUserIdentity(participantB, user);

  return {
    teamAUserIds: teamAMatch ? [...new Set([...teamAUserIds, user.id])] : teamAUserIds,
    teamBUserIds: teamBMatch ? [...new Set([...teamBUserIds, user.id])] : teamBUserIds,
    isParticipant: teamAMatch || teamBMatch,
    reportingSide: teamAMatch ? "team_a" : teamBMatch ? "team_b" : null,
  };
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

function normalizeMapPool(value, fallback) {
  const rows = Array.isArray(value)
    ? value
    : String(value || "").split(/[\n,]+/);
  const cleaned = rows.map((row) => String(row || "").trim()).filter(Boolean);
  return [...new Set(cleaned.length > 0 ? cleaned : fallback)];
}

function tournamentMapPoolsFor(tournament = {}) {
  const pools = tournament?.map_pools || {};
  return {
    snd: normalizeMapPool(pools.snd || tournament?.snd_map_pool || tournament?.snd_maps || tournament?.maps, tournamentSndMapPool),
    hp: normalizeMapPool(pools.hp || tournament?.hp_map_pool || tournament?.hp_maps, tournamentHpMapPool),
    overload: normalizeMapPool(pools.overload || tournament?.overload_map_pool || tournament?.overload_maps, tournamentOverloadMapPool),
  };
}

function streamerMapPoolsForBody(body = {}, tournament = {}) {
  const source = body.map_pools || {};
  const existing = tournamentMapPoolsFor(tournament);
  return {
    snd: normalizeMapPool(source.snd || body.snd_maps || existing.snd, tournamentSndMapPool).slice(0, 40),
    hp: normalizeMapPool(source.hp || body.hp_maps || existing.hp, tournamentHpMapPool).slice(0, 40),
    overload: normalizeMapPool(source.overload || body.overload_maps || existing.overload, tournamentOverloadMapPool).slice(0, 40),
  };
}

function combinedMapPool(pools = {}) {
  return [...new Set([
    ...(Array.isArray(pools.snd) ? pools.snd : []),
    ...(Array.isArray(pools.hp) ? pools.hp : []),
    ...(Array.isArray(pools.overload) ? pools.overload : []),
  ])];
}

function mapPoolForGameMode(gameMode, pools) {
  if (gameMode === "hp") return pools.hp;
  if (gameMode === "overload") return pools.overload;
  return pools.snd;
}

function tournamentMapSeriesFor(gameMode, mapPools = {}) {
  const key = String(gameMode || "").toLowerCase();
  const definition = tournamentSeriesDefinitions[key] || tournamentSeriesDefinitions.snd;
  const pools = {
    snd: normalizeMapPool(mapPools.snd, tournamentSndMapPool),
    hp: normalizeMapPool(mapPools.hp, tournamentHpMapPool),
    overload: normalizeMapPool(mapPools.overload, tournamentOverloadMapPool),
  };

  return {
    key: tournamentSeriesDefinitions[key] ? key : "snd",
    label: definition.label,
    bestOf: definition.games.length,
    games: definition.games.map((game) => ({
      ...game,
      pool: mapPoolForGameMode(game.game_mode, pools),
    })),
  };
}

function tournamentMapSeriesForMatch(match, tournament = null) {
  const source = tournament || match || {};
  return tournamentMapSeriesFor(
    tournament?.game_mode || match?.tournament_game_mode || match?.series_key || match?.game_mode,
    tournamentMapPoolsFor(source)
  );
}

function generatedMapForSeriesGame(match, game, index, series) {
  const pool = game.pool || tournamentSndMapPool;
  const round = Math.max(1, Number(match?.round || 1));
  const sameModeOffset = series.games
    .slice(0, index)
    .filter((entry) => entry.game_mode === game.game_mode)
    .length;
  const tournamentOffset = stableHash(`${match?.tournament_id}:${game.game_mode}`) % pool.length;
  const roundOffset = (round - 1) * series.games.length;
  const bracketOffset = match?.bracket === "loser" ? 1 : match?.bracket === "grand_final" ? 2 : 0;
  const mapIndex = (tournamentOffset + roundOffset + bracketOffset + sameModeOffset) % pool.length;

  return pool[mapIndex];
}

function generatedMapPoolForMatch(match, series = tournamentMapSeriesForMatch(match)) {
  return series.games.map((game, index) => generatedMapForSeriesGame(match, game, index, series));
}

function mapGenerationKey(match, series = tournamentMapSeriesForMatch(match)) {
  return [
    `bo${series.bestOf || series.games.length}-${series.key}`,
    match?.tournament_id || "tournament",
    match?.bracket || "winner",
    `round-${match?.round || 1}`,
    `match-${match?.match_number || 1}`,
    series.games.map((game) => `${game.game_mode}:${game.pool.join("-")}`).join("|").toLowerCase(),
  ].join(":");
}

function shouldGenerateTournamentMatchSetup(match) {
  return !(match?.is_final && !hasBothTeams(match));
}

function firstHostForMatch(match, participantA, participantB) {
  const hasA = Boolean(match.team_a_id || participantA);
  const hasB = Boolean(match.team_b_id || participantB);
  if (!hasA && !hasB) return null;
  if (hasA && !hasB) {
    return {
      id: match.team_a_id || participantKey(participantA),
      name: match.team_a_name || participantName(participantA),
      seed: Number(match.team_a_seed || participantA?.seed) || null,
    };
  }
  if (hasB && !hasA) {
    return {
      id: match.team_b_id || participantKey(participantB),
      name: match.team_b_name || participantName(participantB),
      seed: Number(match.team_b_seed || participantB?.seed) || null,
    };
  }
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
  const hasA = Boolean(match.team_a_id || participantA);
  const hasB = Boolean(match.team_b_id || participantB);
  if (!firstHost || !hasA || !hasB) return null;
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

function generatedTournamentMaps(match, participantA, participantB, series = tournamentMapSeriesForMatch(match)) {
  const selectedMaps = generatedMapPoolForMatch(match, series);
  const firstHost = firstHostForMatch(match, participantA, participantB);
  const secondHost = secondHostForMatch(match, participantA, participantB, firstHost);
  // Hosting is intentionally only assigned for the first two maps. Any
  // deciding map is agreed in the match room and therefore remains TBD.
  const hosts = series.games.map((_, index) => (
    index === 0 ? firstHost : index === 1 ? secondHost : null
  ));

  return selectedMaps.map((map, index) => ({
    game: index + 1,
    game_mode: series.games[index]?.game_mode || "snd",
    mode: series.games[index]?.mode || "Search and Destroy",
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

function tournamentMatchSetupPatch(match, participants = [], tournament = null) {
  const byId = participantMapById(participants);
  const participantA = byId[match.team_a_participant_id] || byId[match.team_a_id] || null;
  const participantB = byId[match.team_b_participant_id] || byId[match.team_b_id] || null;
  const teamASeed = match.team_a_seed || participantA?.seed || (match.team_a_id ? 1 : null);
  const teamBSeed = match.team_b_seed || participantB?.seed || (match.team_b_id ? 2 : null);
  const seededMatch = { ...match, team_a_seed: teamASeed, team_b_seed: teamBSeed };
  const series = tournamentMapSeriesForMatch(seededMatch, tournament);
  const firstHost = firstHostForMatch(seededMatch, participantA, participantB);
  const generationKey = mapGenerationKey(seededMatch, series);
  const maps = Array.isArray(match.maps) && match.maps.length === series.bestOf && match.map_generation_key === generationKey
    ? match.maps
    : generatedTournamentMaps(seededMatch, participantA, participantB, series);

  return {
    best_of: series.bestOf,
    game_mode: series.label,
    tournament_game_mode: series.key,
    map_sequence: series.games.map((game, index) => ({
      game: index + 1,
      game_mode: game.game_mode,
      mode: game.mode,
    })),
    map_pool: [...new Set(series.games.flatMap((game) => game.pool))],
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

function streamerMatchSetupPatch(match, tournament = null, participants = []) {
  const base = tournamentMatchSetupPatch(match, participants, tournament);
  if (tournament?.map_pools || tournament?.snd_maps || tournament?.hp_maps || tournament?.overload_maps) {
    return {
      ...base,
      map_generation_key: `streamer:${base.map_generation_key}`,
      map_generated_by: match.map_generated_by || "streamer",
    };
  }

  const customMaps = normalizeMapPool(
    tournament?.streamer_maps || tournament?.maps,
    base.map_pool?.length ? base.map_pool : streamerDefaultMapPool()
  );
  const roundOffset = Math.max(0, Number(match?.round || 1) - 1) * Math.max(1, base.maps.length || 1);
  const maps = base.maps.map((row, index) => ({
    ...row,
    map: customMaps[(roundOffset + index) % customMaps.length] || row.map,
    selected_by: "streamer",
  }));

  return {
    ...base,
    maps,
    map_pool: customMaps,
    map_generation_key: `streamer:${base.map_generation_key}:${customMaps.join("|").toLowerCase()}`,
    map_generated_by: match.map_generated_by || "streamer",
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
    title: match.start_deadline ? "Your tournament match is ready" : "Tournament match assigned",
    message: match.start_deadline
      ? `${match.team_a_name || "Team A"} vs ${match.team_b_name || "Team B"}. Open the match room and start within ${tournamentStartWindowMinutes} minutes.`
      : `${match.team_a_name || "Team A"} vs ${match.team_b_name || "Team B"}. The start timer will appear when the tournament begins.`,
    type: "match",
    action_url: `/tournament-match/${match.id}`,
    related_entity_id: match.id,
    related_entity_type: "TournamentMatch",
  });
}

async function tournamentThirdPlaceEntries(tournamentId, winnerId, runnerUpId) {
  const [matches, participants] = await Promise.all([
    listEntities("TournamentMatch", { tournament_id: tournamentId }, "round", 500).catch(() => []),
    tournamentParticipants(tournamentId).catch(() => []),
  ]);
  const completedMatches = matches.filter((match) => (
    (match.completed || match.status === "completed")
    && match.winner_id
    && match.team_a_id
    && match.team_b_id
  ));
  const lowerFinal = completedMatches
    .filter((match) => ["loser", "lower"].includes(String(match.bracket || "").toLowerCase()))
    .sort((a, b) => Number(b.round || 0) - Number(a.round || 0))[0];
  if (lowerFinal) {
    const thirdId = tournamentMatchLoserId(lowerFinal, lowerFinal.winner_id);
    if (!thirdId || [winnerId, runnerUpId].filter(Boolean).map(String).includes(String(thirdId))) return [];
    const participant = participants.find((row) => participantIds(row).includes(String(thirdId)));
    return [{
      participant,
      participantId: participant?.id || thirdId,
      entryId: thirdId,
      name: String(thirdId) === String(lowerFinal.team_a_id) ? lowerFinal.team_a_name : lowerFinal.team_b_name,
      userIds: participant ? participantUserIds(participant) : await tournamentParticipantUserIds(tournamentId, thirdId),
    }];
  }
  const finalRound = Math.max(0, ...completedMatches.map((match) => Number(match.round || 0)));
  if (finalRound < 2) return [];

  const semifinalRound = finalRound - 1;
  const semifinalMatches = completedMatches.filter((match) => (
    Number(match.round || 0) === semifinalRound
    && !["loser", "lower"].includes(String(match.bracket || "winner").toLowerCase())
  ));
  const excludedIds = new Set([winnerId, runnerUpId].filter(Boolean).map(String));
  const seen = new Set();
  const entries = [];

  for (const match of semifinalMatches) {
    const loserId = tournamentMatchLoserId(match, match.winner_id);
    if (!loserId || excludedIds.has(String(loserId))) continue;
    const participant = participants.find((row) => participantIds(row).includes(String(loserId)));
    const canonicalId = participant?.id || loserId;
    if (seen.has(String(canonicalId))) continue;
    seen.add(String(canonicalId));
    entries.push({
      participant,
      participantId: canonicalId,
      entryId: loserId,
      name: String(loserId) === String(match.team_a_id) ? match.team_a_name : match.team_b_name,
      userIds: participant ? participantUserIds(participant) : await tournamentParticipantUserIds(tournamentId, loserId),
    });
  }

  return entries;
}

async function completeTournament(tournamentId, winnerId, winnerName, runnerUpId = null, runnerUpName = null) {
  const tournament = await getEntity("Tournament", tournamentId);
  if (tournament.status === "completed" || tournament.winner_id) {
    return tournament;
  }
  const [winnerUserIds, runnerUpUserIds, winnerParticipant, runnerUpParticipant, thirdPlaceEntries] = await Promise.all([
    tournamentParticipantUserIds(tournamentId, winnerId),
    runnerUpId ? tournamentParticipantUserIds(tournamentId, runnerUpId) : [],
    tournamentParticipantForEntry(tournamentId, winnerId).catch(() => null),
    runnerUpId ? tournamentParticipantForEntry(tournamentId, runnerUpId).catch(() => null) : null,
    tournamentThirdPlaceEntries(tournamentId, winnerId, runnerUpId),
  ]);
  const updated = await updateEntity("Tournament", tournamentId, {
    status: "completed",
    winner_id: winnerId,
    winner_name: winnerName,
    runner_up_id: runnerUpId,
    runner_up_name: runnerUpName,
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
  const firstPrize = await awardTournamentPrize(tournament, winnerId, winnerUserIds, 1);
  const secondPrize = await awardTournamentPrize(tournament, runnerUpId, runnerUpUserIds, 2);
  const prize = { first: firstPrize, second: secondPrize };

  const rewardTournament = { ...tournament, ...updated };
  const placementEntries = [
    { placement: 1, participant: winnerParticipant, participantId: winnerParticipant?.id || winnerId, userIds: winnerUserIds },
    { placement: 2, participant: runnerUpParticipant, participantId: runnerUpParticipant?.id || runnerUpId, userIds: runnerUpUserIds },
    ...thirdPlaceEntries.map((entry) => ({ placement: 3, ...entry })),
  ].filter((entry) => entry.participantId && entry.userIds.length > 0);
  await Promise.all(placementEntries.map((entry) => (
    entry.participant?.id
      ? updateEntity("TournamentParticipant", entry.participant.id, { final_rank: entry.placement }).catch(() => null)
      : Promise.resolve(null)
  )));
  const placement_trophies = [];
  for (const entry of placementEntries) {
    placement_trophies.push({
      placement: entry.placement,
      participant_id: entry.participantId,
      rewards: await grantTournamentPlacementRewards(
        rewardTournament,
        entry.participantId,
        entry.userIds,
        entry.placement,
      ),
    });
  }
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

  return { ...updated, prize, placement_trophies, reward_items: tournament_reward_items, elimination_reward_items, unlocked_items };
}

function tournamentOutcomeRoute(match, outcome = "winner") {
  const loserRoute = outcome === "loser";
  return {
    id: loserRoute ? match?.loser_match_id : match?.next_match_id,
    round: loserRoute ? match?.loser_match_round : match?.next_match_round,
    number: loserRoute ? match?.loser_match_number : match?.next_match_number,
    bracket: loserRoute ? match?.loser_match_bracket : match?.next_match_bracket,
    slot: (loserRoute ? match?.loser_slot_in_next : match?.slot_in_next) === "team_b" ? "team_b" : "team_a",
  };
}

function tournamentOutcomeEntry(match, outcome = "winner") {
  const entryId = outcome === "loser" ? tournamentMatchLoserId(match, match?.winner_id) : match?.winner_id;
  if (!entryId) return null;
  const fromTeamA = String(entryId) === String(match?.team_a_id || "");
  return {
    id: entryId,
    name: fromTeamA ? match?.team_a_name : match?.team_b_name,
    seed: fromTeamA ? match?.team_a_seed : match?.team_b_seed,
    participant_id: fromTeamA ? match?.team_a_participant_id : match?.team_b_participant_id,
  };
}

function tournamentMatchLoserIsEliminated(match) {
  const hasLoserRoute = Boolean(match?.loser_match_id || (match?.loser_match_round && match?.loser_match_number));
  const winnerBracketChampionContinues = Boolean(
    match?.double_elimination_reset_eligible
    && match?.bracket === "grand_final"
    && Number(match?.round || 1) === 1
    && String(match?.winner_id || "") === String(match?.team_b_id || "")
  );
  return !hasLoserRoute && !winnerBracketChampionContinues;
}

async function tournamentRouteTarget(match, outcome = "winner") {
  const route = tournamentOutcomeRoute(match, outcome);
  if (route.id) {
    const direct = await getEntity("TournamentMatch", route.id).catch(() => null);
    if (direct) return { route, target: direct };
  }
  if (!route.round || !route.number) return { route, target: null };
  const candidates = await listEntities("TournamentMatch", {
    tournament_id: match.tournament_id,
    round: route.round,
  }, "match_number", 256);
  const target = candidates.find((row) => (
    String(row.match_number) === String(route.number)
    && (!route.bracket || String(row.bracket || "winner") === String(route.bracket))
  ));
  return { route, target: target || null };
}

async function prepareTournamentMatchWhenReady(match, patch = {}) {
  const candidate = { ...match, ...patch };
  const hasRealResult = Boolean(match?.winner_id && (match?.completed || match?.status === "completed"));
  if (!hasBothTeams(candidate) || hasRealResult || match.status === "disputed") return patch;
  const assignedDate = patch.assigned_date || match.assigned_date || nowIso();
  const [tournament, participants] = await Promise.all([
    getEntity("Tournament", match.tournament_id).catch(() => null),
    tournamentParticipants(match.tournament_id),
  ]);
  Object.assign(patch, {
    status: "ready",
    completed: false,
    completed_date: null,
    empty_bracket_slot: false,
    assigned_date: assignedDate,
    ...(tournamentStatusesStarted.includes(tournament?.status) ? tournamentStartWindowPatch(assignedDate) : {}),
    ...(isStreamerTournament(tournament)
      ? streamerMatchSetupPatch(candidate, tournament, participants)
      : tournamentMatchSetupPatch(candidate, participants, tournament)),
  });
  return patch;
}

async function sendTournamentOutcomeToRoute(match, outcome = "winner") {
  const { route, target } = await tournamentRouteTarget(match, outcome);
  const entry = tournamentOutcomeEntry(match, outcome);
  if (!target || !entry) return null;

  const patch = {
    [`${route.slot}_id`]: entry.id,
    [`${route.slot}_name`]: entry.name,
    [`${route.slot}_source_match_id`]: match.id,
    [`${route.slot}_source_outcome`]: outcome,
    [`${route.slot}_seed`]: entry.seed || null,
    [`${route.slot}_participant_id`]: entry.participant_id || null,
  };
  await prepareTournamentMatchWhenReady(target, patch);
  const updatedTarget = await updateEntity("TournamentMatch", target.id, patch);
  if (patch.status === "ready" && target.status !== "ready") await notifyTournamentMatchAssigned(updatedTarget);
  return updatedTarget;
}

async function createDoubleEliminationReset(match, tournament) {
  const existing = await listEntities("TournamentMatch", {
    tournament_id: match.tournament_id,
    bracket: "grand_final",
    round: 2,
  }, "match_number", 10).catch(() => []);
  if (existing[0]) return existing[0];

  const assignedDate = nowIso();
  const resetPayload = {
    tournament_id: match.tournament_id,
    tournament_game_mode: tournament?.game_mode || match.tournament_game_mode || "snd",
    bracket: "grand_final",
    round: 2,
    match_number: 1,
    match_label: "Grand Final Reset",
    double_elimination_reset: true,
    is_final: true,
    team_a_id: match.team_a_id,
    team_a_name: match.team_a_name,
    team_a_seed: match.team_a_seed,
    team_a_participant_id: match.team_a_participant_id,
    team_a_source_match_id: match.id,
    team_a_source_outcome: "loser",
    team_b_id: match.team_b_id,
    team_b_name: match.team_b_name,
    team_b_seed: match.team_b_seed,
    team_b_participant_id: match.team_b_participant_id,
    team_b_source_match_id: match.id,
    team_b_source_outcome: "winner",
    status: "ready",
    assigned_date: assignedDate,
    ...(tournamentStatusesStarted.includes(tournament?.status) ? tournamentStartWindowPatch(assignedDate) : {}),
    created_date: assignedDate,
  };
  const participants = await tournamentParticipants(match.tournament_id);
  Object.assign(resetPayload, tournamentMatchSetupPatch(resetPayload, participants, tournament));
  const resetMatch = await createEntity("TournamentMatch", resetPayload);
  await updateEntity("TournamentMatch", match.id, {
    next_match_id: resetMatch.id,
    next_match_round: 2,
    next_match_number: 1,
    next_match_bracket: "grand_final",
    slot_in_next: "team_b",
    loser_match_id: resetMatch.id,
    loser_match_round: 2,
    loser_match_number: 1,
    loser_match_bracket: "grand_final",
    loser_slot_in_next: "team_a",
  });
  await notifyTournamentMatchAssigned(resetMatch);
  return resetMatch;
}

async function routeTournamentResult(match) {
  if (!match?.winner_id) return {};
  const winnerRoute = tournamentOutcomeRoute(match, "winner");
  const loserRoute = tournamentOutcomeRoute(match, "loser");
  const hasWinnerRoute = Boolean(winnerRoute.id || (winnerRoute.round && winnerRoute.number));
  const hasLoserRoute = Boolean(loserRoute.id || (loserRoute.round && loserRoute.number));

  const advancedTo = hasWinnerRoute ? await sendTournamentOutcomeToRoute(match, "winner") : null;
  const loserSentTo = hasLoserRoute ? await sendTournamentOutcomeToRoute(match, "loser") : null;
  if (advancedTo || loserSentTo) {
    return {
      ...(advancedTo ? { advanced_to: advancedTo } : {}),
      ...(loserSentTo ? { loser_sent_to: loserSentTo } : {}),
    };
  }
  if (hasWinnerRoute || hasLoserRoute) return {};

  const tournament = await getEntity("Tournament", match.tournament_id).catch(() => null);
  const isResetEligibleGrandFinal = Boolean(
    match.double_elimination_reset_eligible
    && match.bracket === "grand_final"
    && Number(match.round || 1) === 1
  );
  if (isResetEligibleGrandFinal && String(match.winner_id) === String(match.team_b_id)) {
    const resetMatch = await createDoubleEliminationReset(match, tournament);
    return { advanced_to: resetMatch, grand_final_reset: true };
  }

  const runnerUpId = tournamentMatchLoserId(match, match.winner_id);
  const runnerUpName = String(runnerUpId || "") === String(match.team_a_id || "") ? match.team_a_name : match.team_b_name;
  const completedTournament = await completeTournament(match.tournament_id, match.winner_id, match.winner_name, runnerUpId, runnerUpName);
  return { tournament_completed: true, tournament: completedTournament };
}

async function resolveTournamentBracketByes(tournamentId) {
  const resolved = [];
  for (let pass = 0; pass < 64; pass += 1) {
    const matches = await listEntities("TournamentMatch", { tournament_id: tournamentId }, "round", 500);
    const byId = Object.fromEntries(matches.map((row) => [String(row.id), row]));
    const candidate = matches.find((row) => {
      if (row.completed || row.status === "completed" || row.status === "disputed") return false;
      if (!row.team_a_source_match_id || !row.team_b_source_match_id) return false;
      if (hasBothTeams(row) && row.status !== "pending" && row.status !== "reset") return false;
      return ["a", "b"].every((slot) => {
        const source = byId[String(row[`team_${slot}_source_match_id`])];
        if (!(source?.completed || source?.status === "completed")) return false;
        const outcome = row[`team_${slot}_source_outcome`] === "loser" ? "loser" : "winner";
        const expectedEntry = tournamentOutcomeEntry(source, outcome);
        // If this source has a real entrant, wait until routing has actually
        // populated the slot. This prevents a target from being closed as an
        // empty bye while sequential source advancement is still running.
        return !expectedEntry || Boolean(row[`team_${slot}_id`]);
      });
    });
    if (!candidate) break;

    if (hasBothTeams(candidate)) {
      const patch = {};
      await prepareTournamentMatchWhenReady(candidate, patch);
      const ready = await updateEntity("TournamentMatch", candidate.id, patch);
      if (candidate.status !== "ready") await notifyTournamentMatchAssigned(ready);
      resolved.push(ready);
      continue;
    }

    const populatedSlot = candidate.team_a_id ? "team_a" : candidate.team_b_id ? "team_b" : null;
    const byePatch = populatedSlot ? {
      status: "completed",
      completed: true,
      completed_date: nowIso(),
      winner_id: candidate[`${populatedSlot}_id`],
      winner_name: candidate[`${populatedSlot}_name`],
      bye: true,
    } : {
      status: "completed",
      completed: true,
      completed_date: nowIso(),
      empty_bracket_slot: true,
    };
    const completedBye = await updateEntity("TournamentMatch", candidate.id, byePatch);
    resolved.push(completedBye);
    if (completedBye.winner_id) await routeTournamentResult(completedBye);
  }
  return resolved;
}

async function advanceTournamentWinner(match) {
  if (!match?.winner_id) return {};
  const advancement = await routeTournamentResult(match);
  const resolvedByes = await resolveTournamentBracketByes(match.tournament_id);
  return {
    ...advancement,
    ...(resolvedByes.length > 0 ? { resolved_byes: resolvedByes } : {}),
  };
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
    is_forfeit: false,
    forfeit_reason: null,
    forfeited_by_id: null,
    forfeited_by_name: null,
    forfeit_winner_id: null,
    forfeit_winner_name: null,
    forfeit_date: null,
    match_result_badge: null,
    match_result_note: null,
  };
}

function tournamentRequiredWins(match) {
  const bestOf = tournamentBestOf(match);
  return Math.floor(bestOf / 2) + 1;
}

function tournamentBestOf(match) {
  const requested = Math.trunc(Number(match?.best_of || defaultTournamentBestOf));
  return Number.isFinite(requested) && requested > 0 ? requested : defaultTournamentBestOf;
}

function tournamentScoreRule(match) {
  const bestOf = tournamentBestOf(match);
  const winsNeeded = tournamentRequiredWins({ best_of: bestOf });
  return {
    bestOf,
    winsNeeded,
    label: `BO${bestOf} results must end ${winsNeeded}-0 through ${winsNeeded}-${winsNeeded - 1}`,
  };
}

function tournamentScoreError(match, teamAScore, teamBScore) {
  const { winsNeeded, label } = tournamentScoreRule(match);
  if (
    !Number.isInteger(teamAScore)
    || !Number.isInteger(teamBScore)
    || teamAScore < 0
    || teamBScore < 0
  ) {
    return `Scores must be whole, non-negative numbers. ${label}.`;
  }
  const highScore = Math.max(teamAScore, teamBScore);
  const lowScore = Math.min(teamAScore, teamBScore);
  if (highScore !== winsNeeded || lowScore >= winsNeeded) {
    return `${label}.`;
  }
  return null;
}

function tournamentStartWindowPatch(startDate = nowIso()) {
  const parsedStart = new Date(startDate);
  const start = Number.isFinite(parsedStart.getTime()) ? parsedStart : new Date();
  return {
    scheduled_start_date: start.toISOString(),
    start_deadline: new Date(start.getTime() + (tournamentStartWindowMinutes * 60 * 1000)).toISOString(),
    start_window_minutes: tournamentStartWindowMinutes,
  };
}

function tournamentStartWindowBase(match, tournament) {
  const dates = [match?.assigned_date, tournament?.started_date]
    .map((value) => new Date(value || "").getTime())
    .filter(Number.isFinite);
  return dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : nowIso();
}

function tournamentSupportWindowError(match) {
  const deadline = new Date(match?.start_deadline || "").getTime();
  if (!Number.isFinite(deadline)) {
    return "The match start timer is not available yet. Refresh the match room.";
  }
  if (Date.now() < deadline) {
    return "Admin support and disputes unlock when the 15-minute match start timer expires.";
  }
  return null;
}

function tournamentForfeitScore(match, teamAWins) {
  const winsNeeded = tournamentRequiredWins(match);
  return {
    teamAScore: teamAWins ? winsNeeded : 0,
    teamBScore: teamAWins ? 0 : winsNeeded,
  };
}

function tournamentForfeitPatch({ winnerId, winnerName, loserId, loserName, reason, date }) {
  const cleanReason = reason || "Admin granted win";
  return {
    is_forfeit: true,
    forfeit_reason: cleanReason,
    forfeited_by_id: loserId || null,
    forfeited_by_name: loserName || null,
    forfeit_winner_id: winnerId || null,
    forfeit_winner_name: winnerName || null,
    forfeit_date: date || nowIso(),
    match_result_badge: "Match forfeited",
    match_result_note: `${loserName || "Losing team"} forfeited to ${winnerName || "Winning team"}.`,
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
  const participants = await tournamentParticipants(tournamentId).catch(() => []);
  const oldWinnerUserIds = oldWinnerId ? await tournamentParticipantUserIds(tournamentId, oldWinnerId) : [];
  const oldWinnerSet = new Set(oldWinnerUserIds.map(String));
  const affectedUserIds = [...new Set(participants.flatMap(participantUserIds).filter(Boolean))];
  let removedRewards = 0;

  await Promise.all(affectedUserIds.map(async (userId) => {
    const user = oldWinnerSet.has(String(userId)) ? await userFor(userId) : null;
    if (user && oldWinnerSet.has(String(userId))) {
      await prisma.user.update({
        where: { id: userId },
        data: { tournament_wins: Math.max(0, Number(user.tournament_wins || 0) - 1) },
      }).catch(() => null);
    }

    const inventory = await listEntities("UserInventory", { user_id: userId }, "-acquired_date", 500).catch(() => []);
    const tournamentRewards = inventory.filter((item) => (
      String(item.source_tournament_id || "") === String(tournamentId)
      && (
        (item.unlock_type === "tournament_champion_reward" && String(item.unlock_key || "").startsWith(`tournament_champion:${tournamentId}:`))
        || item.unlock_type === "tournament_placement_trophy"
        || item.unlock_type === "tournament_placement_reward"
      )
    ));
    removedRewards += tournamentRewards.length;
    await Promise.all(tournamentRewards.map((item) => deleteEntity("UserInventory", item.id).catch(() => null)));
  }));

  await Promise.all(participants.map((participant) => updateEntity("TournamentParticipant", participant.id, {
    final_rank: null,
  }).catch(() => null)));

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

  const structuredRoutes = [
    { outcome: "winner", entry: tournamentOutcomeEntry(match, "winner") },
    { outcome: "loser", entry: tournamentOutcomeEntry(match, "loser") },
  ].filter(({ outcome }) => {
    const route = tournamentOutcomeRoute(match, outcome);
    return Boolean(route.id || (route.round && route.number));
  });
  if (structuredRoutes.length > 0) {
    if (match.double_elimination_reset_eligible && match.next_match_id) {
      const resetMatch = await getEntity("TournamentMatch", match.next_match_id).catch(() => null);
      if (resetMatch?.double_elimination_reset) {
        if (tournamentMatchHasScoreActivity(resetMatch)) {
          badRequest("Cannot revert the Grand Final because the reset match already has a score or winner. Reset that match first.");
        }
        await deleteEntity("TournamentMatch", resetMatch.id);
        await updateEntity("TournamentMatch", match.id, {
          next_match_id: null,
          next_match_round: null,
          next_match_number: null,
          next_match_bracket: null,
          slot_in_next: null,
          loser_match_id: null,
          loser_match_round: null,
          loser_match_number: null,
          loser_match_bracket: null,
          loser_slot_in_next: null,
        });
        return { removed_grand_final_reset: resetMatch };
      }
    }
    const cleared = [];
    for (const { outcome, entry } of structuredRoutes) {
      const { route, target } = await tournamentRouteTarget(match, outcome);
      if (!target) continue;
      const sourceField = `${route.slot}_source_match_id`;
      const idField = `${route.slot}_id`;
      const ownsSlot = String(target[sourceField] || "") === String(match.id)
        || (!target[sourceField] && entry && String(target[idField] || "") === String(entry.id));
      if (!ownsSlot) continue;
      if (tournamentMatchHasScoreActivity(target)) {
        badRequest("Cannot revert this result because a downstream tournament match already has a score or winner. Reset that match first.");
      }
      const targetPatch = {
        [`${route.slot}_id`]: null,
        [`${route.slot}_name`]: null,
        [`${route.slot}_seed`]: null,
        [`${route.slot}_participant_id`]: null,
        status: "pending",
        assigned_date: null,
        scheduled_start_date: null,
        start_deadline: null,
        maps: [],
        first_host_team_id: null,
        first_host_team_name: null,
        first_host_seed: null,
        map_generation_key: null,
      };
      cleared.push(await updateEntity("TournamentMatch", target.id, targetPatch));
    }
    if (cleared.length > 0) {
      return {
        cleared_next_match: cleared[0],
        cleared_downstream_matches: cleared,
      };
    }
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
        const [participants, activeTournament] = await Promise.all([
          tournamentParticipants(match.tournament_id),
          getEntity("Tournament", match.tournament_id).catch(() => null),
        ]);
        Object.assign(
          patch,
          isStreamerTournament(activeTournament)
            ? streamerMatchSetupPatch(candidate, activeTournament, participants)
            : tournamentMatchSetupPatch(candidate, participants, activeTournament)
        );
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
      runner_up_id: null,
      runner_up_name: null,
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
    const finalMatch = roundMatches[0];
    const runnerUpId = tournamentMatchLoserId(finalMatch, winners[0].id);
    const runnerUpName = String(runnerUpId || "") === String(finalMatch?.team_a_id || "") ? finalMatch?.team_a_name : finalMatch?.team_b_name;
    const tournament = await completeTournament(tournamentId, winners[0].id, winners[0].name, runnerUpId, runnerUpName);
    return { tournament_completed: true, tournament };
  }

  const tournament = await getEntity("Tournament", tournamentId).catch(() => null);
  const created = [];
  for (let index = 0; index < winners.length; index += 2) {
    const a = winners[index];
    const b = winners[index + 1];
    created.push(await createEntity("TournamentMatch", {
      tournament_id: tournamentId,
      tournament_game_mode: tournament?.game_mode || "snd",
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
  if (matchType === "wager") {
    const participants = await listEntities("WagerParticipant", { wager_id: match.id }, "-joined_date", 100).catch(() => []);
    return [...new Set([
      match.host_id,
      match.challenger_id,
      ...participants.map((participant) => participant.user_id),
    ].filter(Boolean))];
  }
  return [...new Set([match.host_id, match.challenger_id].filter(Boolean))];
}

async function activeTeamMembers(teamId) {
  const members = await listEntities("TeamMember", { team_id: teamId }, "-joined_date", 50);
  return hydrateTeamMemberIdentities(members.filter((member) => member.is_active !== false));
}

async function hydrateTeamMemberIdentities(members = []) {
  return Promise.all((members || []).map(async (member) => {
    const user = await userFor(member.user_id).catch(() => null);
    if (!user) return member;

    const userName = nameFor(user);
    if (member.id && member.user_name !== userName) {
      await updateEntity("TeamMember", member.id, {
        user_name: userName,
      }).catch(() => null);
    }

    return {
      ...member,
      user_name: userName,
      username: user.username || member.username,
      handle: user.handle || member.handle,
      display_name: user.display_name || member.display_name,
      full_name: user.full_name || member.full_name,
      email: user.email || member.email,
    };
  }));
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
  const rawIdentifier = String(identifier || "").trim();
  const needle = rawIdentifier.toLowerCase();
  if (!needle) return null;
  const direct = await userFor(rawIdentifier).catch(() => null);
  if (direct) return direct;

  const indexedMatch = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: rawIdentifier, mode: "insensitive" } },
        { username: { equals: rawIdentifier, mode: "insensitive" } },
        { handle: { equals: rawIdentifier, mode: "insensitive" } },
        { display_name: { equals: rawIdentifier, mode: "insensitive" } },
        { full_name: { equals: rawIdentifier, mode: "insensitive" } },
      ],
    },
  }).catch(() => null);
  if (indexedMatch) return publicUser(indexedMatch);

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

async function syncTeamNameReferences(teamId, teamName) {
  const [invites, participants, teamAMatches, teamBMatches] = await Promise.all([
    listEntities("TeamInvite", { team_id: teamId }, "-created_date", 500).catch(() => []),
    listEntities("TournamentParticipant", { team_id: teamId }, "-registered_date", 500).catch(() => []),
    listEntities("TournamentMatch", { team_a_id: teamId }, "round", 500).catch(() => []),
    listEntities("TournamentMatch", { team_b_id: teamId }, "round", 500).catch(() => []),
  ]);

  await Promise.all([
    ...invites.map((invite) => updateEntity("TeamInvite", invite.id, { team_name: teamName }).catch(() => null)),
    ...participants.map((participant) => updateEntity("TournamentParticipant", participant.id, { team_name: teamName }).catch(() => null)),
    ...teamAMatches.map((match) => updateEntity("TournamentMatch", match.id, { team_a_name: teamName }).catch(() => null)),
    ...teamBMatches.map((match) => updateEntity("TournamentMatch", match.id, { team_b_name: teamName }).catch(() => null)),
  ]);
}

async function manageTeam(req) {
  const action = String(req.body.action || "").toLowerCase();

  if (action === "create") {
    const name = String(req.body.name || "").trim();
    const tag = String(req.body.tag || "").trim().toUpperCase().slice(0, 6);
    const teamType = normalizeTeamType(req.body.team_type);
    const rosterSize = Math.min(4, Math.max(1, Number(req.body.roster_size || (teamType === "8s" ? 4 : 2))));
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
      banner_url: req.body.banner_url || "",
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

  if (action === "update_assets") {
    if (team.captain_id !== req.user.id) return { success: false, error: "Only the team captain can update team visuals" };
    const updated = await updateEntity("Team", team.id, {
      banner_url: String(req.body.banner_url || "").trim(),
      logo_url: String(req.body.logo_url || team.logo_url || "").trim(),
      updated_by: req.user.id,
      updated_by_name: nameFor(req.user),
      updated_date: nowIso(),
    });
    return { success: true, team: updated };
  }

  if (action === "update_profile" || action === "rename") {
    if (team.captain_id !== req.user.id) return { success: false, error: "Only the team captain can update the team name" };
    const name = String(req.body.name || "").trim().slice(0, 40);
    if (!name) return { success: false, error: "Team name is required" };

    const updated = await updateEntity("Team", team.id, {
      name,
      updated_by: req.user.id,
      updated_by_name: nameFor(req.user),
      updated_date: nowIso(),
    });
    if (name !== team.name) await syncTeamNameReferences(team.id, name);
    return { success: true, team: updated };
  }

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

    const targetTeams = await userActiveTeamMemberships(target.id, normalizeTeamType(team.team_type));
    if (targetTeams.length > 0) return { success: false, error: "Player needs to leave current team" };

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
  const activisionError = activisionIdErrorForUsers([req.userRow]);
  if (activisionError) return { success: false, error: activisionError, code: "ACTIVISION_ID_REQUIRED" };
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
  const inviteOnly = tournament.invite_only === true || feeType === "invitational";
  const invitedUserIds = Array.isArray(tournament.invited_user_ids)
    ? tournament.invited_user_ids.map(String)
    : [];
  if (inviteOnly && !invitedUserIds.includes(String(req.user.id))) {
    return "This tournament is invite only";
  }
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
  if (normalizeTeamType(team.team_type) !== "tournament") {
    return "Select a dedicated tournament team. Wager and general teams cannot enter tournaments";
  }
  if (rosterLimitForTeam(team, requiredSize) !== requiredSize) return `Team roster size must match ${tournament.team_size}`;
  if ((members || []).length !== requiredSize) return `${tournament.team_size} tournaments require exactly ${requiredSize} active roster members`;
  const memberIds = (members || []).map((member) => member.user_id).filter(Boolean);
  if (new Set(memberIds).size !== memberIds.length) return "Team roster has duplicate player records";
  const memberUsers = await Promise.all((members || []).map((member) => userFor(member.user_id)));
  const activisionError = activisionIdErrorForUsers(memberUsers);
  if (activisionError) return activisionError;
  const bannedMember = memberUsers.find((memberUser) => {
    const memberSuspendedUntil = memberUser?.metadata?.suspended_until ? new Date(memberUser.metadata.suspended_until) : null;
    return memberUser?.is_banned || (memberSuspendedUntil && memberSuspendedUntil > new Date());
  });
  if (bannedMember) return "Suspended or banned roster members cannot register";

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
  if (normalizeTeamType(team.team_type) !== "tournament") {
    return { success: false, error: "Select a dedicated tournament team. Wager and general teams cannot enter tournaments" };
  }

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
  const captainUser = await userFor(team.captain_id).catch(() => null);
  const captainName = captainUser ? nameFor(captainUser) : team.captain_name || nameFor(req.user);
  if (team.captain_name !== captainName) {
    await updateEntity("Team", team.id, { captain_name: captainName }).catch(() => null);
  }
  const teamName = team.name;
  const participantMembers = members.map((member) => ({
    user_id: member.user_id,
    user_name: member.user_name,
    username: member.username,
    handle: member.handle,
    display_name: member.display_name,
  }));

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

async function createStreamerTournament(req) {
  if (!isStreamerUser(req.user)) {
    return { success: false, error: "Streamer badge is required to post streamer tournaments" };
  }

  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!name) return { success: false, error: "Tournament name is required" };

  const switchFormat = normalizeStreamerSwitchFormat(req.body.switch_format || req.body.team_size || "4v4");
  const teamSize = String(req.body.team_size || switchFormat);
  const validTeamSize = tournamentTeamSizeOptions.has(teamSize) ? teamSize : switchFormat;
  const requestedMaxTeams = Number(req.body.max_teams || 8);
  const maxTeams = Math.max(2, Math.min(64, Number.isFinite(requestedMaxTeams) ? requestedMaxTeams : 8));
  const gameMode = String(req.body.game_mode || "snd_hp_snd");
  const startDate = req.body.start_date ? new Date(req.body.start_date) : null;
  const description = String(req.body.description || "").trim().slice(0, 500);

  const tournament = await createEntity("Tournament", {
    name,
    title: name,
    description,
    game_mode: tournamentSeriesDefinitions[gameMode] ? gameMode : "snd_hp_snd",
    game: "Call of Duty",
    region: req.body.region || req.user.region || "global",
    team_size: validTeamSize,
    entry_fee: 0,
    entry_type: "free",
    prize_pool: 0,
    max_teams: maxTeams,
    registered_teams: 0,
    format: "single_elimination",
    bracket_type: "single_elimination",
    status: "open",
    rules: "Streamer-hosted lobby. The streamer host moderates lobby chat. No tickets or disputes are created from this lobby.",
    maps: streamerDefaultMapPool(),
    map_pools: {
      snd: tournamentSndMapPool,
      hp: tournamentHpMapPool,
      overload: tournamentOverloadMapPool,
    },
    switcheroo_enabled: true,
    switch_format: switchFormat,
    switch_entries: [],
    switch_teams: [],
    switch_bracket_generated: false,
    streamer_maps: streamerDefaultMapPool(),
    start_date: startDate && Number.isFinite(startDate.getTime()) ? startDate.toISOString() : undefined,
    created_by: req.user.id,
    created_by_name: nameFor(req.user),
    host_id: req.user.id,
    host_name: nameFor(req.user),
    tournament_type: "streamer",
    source: "streamer",
    is_streamer_tournament: true,
    streamer_chat_enabled: true,
    streamer_moderator_ids: [req.user.id],
    banned_user_ids: [],
    banned_users: [],
    created_date: nowIso(),
  });

  await createEntity("ChatMessage", {
    conversation_id: tournament.id,
    sender_id: req.user.id,
    sender_name: nameFor(req.user),
    sender_role: effectiveChatRole(req.user),
    recipient_id: tournament.id,
    recipient_name: "Streamer tournament lobby",
    content: `${nameFor(req.user)} opened the streamer tournament lobby.`,
    is_read: false,
    match_type: "streamer_tournament",
    system: true,
    created_date: nowIso(),
  }).catch(() => null);

  return { success: true, tournament };
}

async function clearStreamerSwitchBracket(tournament) {
  const [matches, participants] = await Promise.all([
    listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500).catch(() => []),
    listEntities("TournamentParticipant", { tournament_id: tournament.id }, "seed", 500).catch(() => []),
  ]);

  if (matches.some(tournamentMatchHasScoreActivity)) {
    return { success: false, error: "This switch bracket already has completed or reported matches" };
  }

  await Promise.all(matches.map((match) => deleteEntity("TournamentMatch", match.id).catch(() => null)));
  await Promise.all(participants.map((participant) => deleteEntity("TournamentParticipant", participant.id).catch(() => null)));
  return { success: true };
}

async function saveStreamerSwitchEntries(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can edit this switcheroo" };
  }

  const switchFormat = normalizeStreamerSwitchFormat(req.body.switch_format || tournament.switch_format || tournament.team_size);
  const entries = normalizeStreamerSwitchEntries(req.body.entries, switchFormat);
  const reset = await clearStreamerSwitchBracket(tournament);
  if (!reset.success) return reset;

  const updated = await updateEntity("Tournament", tournament.id, {
    team_size: switchFormat,
    switch_format: switchFormat,
    switch_entries: entries,
    switch_teams: [],
    switch_bracket_generated: false,
    bracket_generated: false,
    registration_locked: false,
    registered_teams: 0,
    status: "open",
    updated_by: req.user.id,
    updated_by_name: nameFor(req.user),
    updated_date: nowIso(),
  });

  return { success: true, tournament: updated, entries };
}

async function updateStreamerTournamentMaps(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can edit maps" };
  }

  const mapPools = req.body.map_pools || req.body.snd_maps || req.body.hp_maps || req.body.overload_maps
    ? streamerMapPoolsForBody(req.body, tournament)
    : {
      snd: normalizeMapPool(req.body.maps || req.body.streamer_maps, tournamentSndMapPool).slice(0, 40),
      hp: tournamentMapPoolsFor(tournament).hp,
      overload: tournamentMapPoolsFor(tournament).overload,
    };
  const maps = combinedMapPool(mapPools);
  const updated = await updateEntity("Tournament", tournament.id, {
    maps,
    map_pools: mapPools,
    streamer_maps: maps,
    updated_by: req.user.id,
    updated_by_name: nameFor(req.user),
    updated_date: nowIso(),
  });
  const [participants, matches] = await Promise.all([
    tournamentParticipants(tournament.id).catch(() => []),
    listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500).catch(() => []),
  ]);
  const refreshedMatches = [];

  for (const match of matches) {
    if (tournamentMatchHasScoreActivity(match)) continue;
    if (!shouldGenerateTournamentMatchSetup(match)) continue;
    const refreshed = await updateEntity("TournamentMatch", match.id, streamerMatchSetupPatch({
      ...match,
      maps: [],
      map_generation_key: null,
    }, updated, participants)).catch(() => null);
    if (refreshed) refreshedMatches.push(refreshed);
  }

  return { success: true, tournament: updated, refreshed_matches: refreshedMatches };
}

async function rollStreamerSwitchTeams(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can roll this switcheroo" };
  }

  const switchFormat = normalizeStreamerSwitchFormat(req.body.switch_format || tournament.switch_format || tournament.team_size);
  const entries = normalizeStreamerSwitchEntries(req.body.entries || tournament.switch_entries, switchFormat);
  if (entries.length < 4) {
    return { success: false, error: switchFormat === "4v4" ? "Add at least four duos to make two 4v4 teams" : "Add at least four players to make two 2v2 teams" };
  }
  if (entries.length % 2 !== 0) {
    return { success: false, error: switchFormat === "4v4" ? "4v4 switcheroo needs an even number of duos" : "2v2 switcheroo needs an even number of players" };
  }

  const generatedTeams = buildStreamerSwitchTeams(entries, switchFormat, tournament.id);
  const validationError = streamerSwitchTeamsValidationError(generatedTeams, switchFormat, tournament.max_teams);
  if (validationError) return { success: false, error: validationError };

  const reset = await clearStreamerSwitchBracket(tournament);
  if (!reset.success) return reset;

  const updatedTournament = await updateEntity("Tournament", tournament.id, {
    team_size: switchFormat,
    switch_format: switchFormat,
    switch_entries: entries,
    switch_teams: generatedTeams,
    switch_bracket_generated: false,
    bracket_generated: false,
    registration_locked: false,
    registered_teams: 0,
    status: tournament.status === "cancelled" ? "cancelled" : "open",
    last_switch_roll_date: nowIso(),
    updated_by: req.user.id,
    updated_by_name: nameFor(req.user),
    updated_date: nowIso(),
  });

  return { success: true, tournament: updatedTournament, entries, teams: generatedTeams };
}

async function saveStreamerSwitchTeams(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can edit these teams" };
  }

  const switchFormat = normalizeStreamerSwitchFormat(req.body.switch_format || tournament.switch_format || tournament.team_size);
  const teams = normalizeStreamerSwitchTeams(req.body.teams, switchFormat, tournament.id);
  const validationError = streamerSwitchTeamsValidationError(teams, switchFormat, tournament.max_teams);
  if (validationError) return { success: false, error: validationError };

  const reset = await clearStreamerSwitchBracket(tournament);
  if (!reset.success) return reset;

  const updatedTournament = await updateEntity("Tournament", tournament.id, {
    team_size: switchFormat,
    switch_format: switchFormat,
    switch_teams: teams.map((team, index) => ({ ...team, seed: index + 1 })),
    switch_bracket_generated: false,
    bracket_generated: false,
    registration_locked: false,
    registered_teams: 0,
    status: tournament.status === "cancelled" ? "cancelled" : "open",
    updated_by: req.user.id,
    updated_by_name: nameFor(req.user),
    updated_date: nowIso(),
  });

  return { success: true, tournament: updatedTournament, teams: updatedTournament.switch_teams || teams };
}

async function generateStreamerSwitchBracket(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can generate this bracket" };
  }

  const switchFormat = normalizeStreamerSwitchFormat(req.body.switch_format || tournament.switch_format || tournament.team_size);
  const entries = normalizeStreamerSwitchEntries(req.body.entries || tournament.switch_entries, switchFormat);
  let generatedTeams = normalizeStreamerSwitchTeams(req.body.teams || tournament.switch_teams, switchFormat, tournament.id);
  if (generatedTeams.length === 0 && entries.length >= 4 && entries.length % 2 === 0) {
    generatedTeams = buildStreamerSwitchTeams(entries, switchFormat, tournament.id);
  }
  const validationError = streamerSwitchTeamsValidationError(generatedTeams, switchFormat, tournament.max_teams);
  if (validationError) return { success: false, error: validationError };
  generatedTeams = generatedTeams.map((team, index) => ({ ...team, seed: index + 1 }));

  const reset = await clearStreamerSwitchBracket(tournament);
  if (!reset.success) return reset;

  const participants = [];
  for (const team of generatedTeams) {
    const participant = await createEntity("TournamentParticipant", {
      tournament_id: tournament.id,
      team_id: team.id,
      team_name: team.name,
      captain_id: "",
      captain_name: team.player_names[0] || team.name,
      user_id: "",
      user_name: team.name,
      members: team.player_names.map(streamerManualMember),
      switch_player_names: team.player_names,
      seed: team.seed,
      eliminated: false,
      entry_type: "streamer_switch",
      payment_mode: "free",
      entry_fee_paid: 0,
      paid_member_ids: [],
      roster_locked: true,
      registered_date: nowIso(),
      created_date: nowIso(),
    });
    participants.push(participant);
  }

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
      const readyDate = isRoundOne && hasA && hasB ? nowIso() : null;
      const matchPayload = {
        tournament_id: tournament.id,
        tournament_game_mode: tournament.game_mode || "snd_hp_snd",
        bracket: "winner",
        match_type: "streamer_tournament",
        is_streamer_tournament: true,
        round,
        match_number: matchNumber,
        ...(a ? participantSlotFields(a, "team_a") : {}),
        ...(b ? participantSlotFields(b, "team_b") : {}),
        status: isRoundOne ? (hasA && hasB ? "ready" : "completed") : "pending",
        ...(readyDate ? { assigned_date: readyDate, ...tournamentStartWindowPatch(readyDate) } : {}),
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
        ...(!hasBye && shouldGenerateTournamentMatchSetup(matchPayload) ? streamerMatchSetupPatch(matchPayload, tournament, participants) : {}),
      }));
    }
  }

  const switchTeams = generatedTeams.map((team, index) => ({
    ...team,
    participant_id: participants[index]?.id || null,
  }));
  const updatedTournament = await updateEntity("Tournament", tournament.id, {
    team_size: switchFormat,
    switch_format: switchFormat,
    switch_entries: entries,
    switch_teams: switchTeams,
    switch_bracket_generated: true,
    bracket_generated: true,
    bracket_generated_date: nowIso(),
    registration_locked: true,
    registered_teams: participants.length,
    status: "in_progress",
    updated_by: req.user.id,
    updated_by_name: nameFor(req.user),
    updated_date: nowIso(),
  });

  await createEntity("ChatMessage", {
    conversation_id: tournament.id,
    sender_id: req.user.id,
    sender_name: nameFor(req.user),
    sender_role: effectiveChatRole(req.user),
    recipient_id: tournament.id,
    recipient_name: "Streamer tournament lobby",
    content: `${nameFor(req.user)} generated the ${switchFormat} switcheroo bracket.`,
    is_read: false,
    match_type: "streamer_tournament",
    system: true,
    created_date: nowIso(),
  }).catch(() => null);

  for (const match of matches.filter((row) => row.status === "completed" && row.winner_id)) {
    await advanceTournamentWinner(match);
  }

  const refreshedMatches = await listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500);
  return {
    success: true,
    tournament: updatedTournament,
    participants,
    teams: switchTeams,
    matches: refreshedMatches,
    match_count: refreshedMatches.length,
  };
}

async function advanceStreamerTournamentMatch(req) {
  const match = await getEntity("TournamentMatch", req.body.tournament_match_id || req.body.match_id);
  const tournament = await getEntity("Tournament", match.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can advance this bracket" };
  }
  if (match.completed || match.status === "completed") {
    return { success: true, match, already_completed: true };
  }
  if (!match.team_a_id || !match.team_b_id) {
    return { success: false, error: "Both teams must be assigned before advancing" };
  }

  const requestedWinnerId = String(req.body.winner_id || "");
  const winnerSlot = String(req.body.winner_slot || "").toLowerCase();
  const winnerIsA = winnerSlot === "team_a"
    || winnerSlot === "a"
    || requestedWinnerId === String(match.team_a_id);
  const winnerIsB = winnerSlot === "team_b"
    || winnerSlot === "b"
    || requestedWinnerId === String(match.team_b_id);
  if (!winnerIsA && !winnerIsB) {
    return { success: false, error: "Choose the winning team" };
  }

  const winsNeeded = tournamentRequiredWins(match);
  const teamAScore = Number.isFinite(Number(req.body.team_a_score))
    ? Number(req.body.team_a_score)
    : winnerIsA ? winsNeeded : 0;
  const teamBScore = Number.isFinite(Number(req.body.team_b_score))
    ? Number(req.body.team_b_score)
    : winnerIsB ? winsNeeded : 0;
  const scoreError = tournamentScoreError(match, teamAScore, teamBScore);
  if (scoreError) {
    return { success: false, error: scoreError };
  }

  const updated = await updateEntity("TournamentMatch", match.id, {
    team_a_score: teamAScore,
    team_b_score: teamBScore,
    winner_id: winnerIsA ? match.team_a_id : match.team_b_id,
    winner_name: winnerIsA ? match.team_a_name : match.team_b_name,
    completed: true,
    status: "completed",
    completed_date: nowIso(),
    scores_confirmed: true,
    confirmed_score_alpha: teamAScore,
    confirmed_score_bravo: teamBScore,
    confirmed_score_date: nowIso(),
    confirmed_by: req.user.id,
    confirmed_by_name: nameFor(req.user),
    advanced_by: req.user.id,
    advanced_by_name: nameFor(req.user),
  });
  const advancement = await advanceTournamentWinner(updated);

  return { success: true, match: updated, ...advancement };
}

async function overturnStreamerTournamentMatch(req) {
  const match = await getEntity("TournamentMatch", req.body.tournament_match_id || req.body.match_id);
  const tournament = await getEntity("Tournament", match.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can overturn this result" };
  }
  if (!match.team_a_id || !match.team_b_id) {
    return { success: false, error: "Both teams must be assigned before overturning a result" };
  }
  if (!match.completed && match.status !== "completed" && !match.winner_id) {
    return { success: false, error: "Only completed matches can be overturned" };
  }

  const requestedWinnerId = String(req.body.winner_id || "");
  const winnerSlot = String(req.body.winner_slot || "").toLowerCase();
  const winnerIsA = winnerSlot === "team_a"
    || winnerSlot === "a"
    || requestedWinnerId === String(match.team_a_id);
  const winnerIsB = winnerSlot === "team_b"
    || winnerSlot === "b"
    || requestedWinnerId === String(match.team_b_id);
  if (!winnerIsA && !winnerIsB) {
    return { success: false, error: "Choose the corrected winning team" };
  }

  const winnerId = winnerIsA ? match.team_a_id : match.team_b_id;
  if (String(match.winner_id || "") === String(winnerId)) {
    return { success: false, error: "That team is already marked as the winner" };
  }

  const winnerName = winnerIsA ? match.team_a_name : match.team_b_name;
  const loserId = winnerIsA ? match.team_b_id : match.team_a_id;
  const loserName = winnerIsA ? match.team_b_name : match.team_a_name;
  const reason = String(req.body.reason || "Streamer host overturned the result").trim().slice(0, 500);
  const previous = {
    winner_id: match.winner_id || null,
    winner_name: match.winner_name || null,
    team_a_score: Number(match.team_a_score || 0),
    team_b_score: Number(match.team_b_score || 0),
    status: match.status,
    completed: Boolean(match.completed),
  };

  const rewardUndo = await undoTournamentMatchRewards(match);
  const eliminationCleanup = await removeTournamentEliminationRewards(match.tournament_id, rewardUndo.previous_loser_id || tournamentMatchLoserId(match));
  const undo = await undoTournamentAdvancement(match);
  await clearParticipantEliminationFromMatch(match.tournament_id, match.id);

  const { teamAScore, teamBScore } = tournamentForfeitScore(match, winnerIsA);
  const completedDate = nowIso();
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
    is_forfeit: true,
    forfeit_reason: reason,
    forfeited_by_id: loserId || null,
    forfeited_by_name: loserName || null,
    forfeit_winner_id: winnerId || null,
    forfeit_winner_name: winnerName || null,
    forfeit_date: completedDate,
    match_result_badge: "Result overturned",
    match_result_note: `${winnerName || "Winning team"} was granted the win by the streamer host.`,
    streamer_corrected_by: req.user.id,
    streamer_corrected_by_name: nameFor(req.user),
    streamer_correction_reason: reason,
    streamer_corrected_date: completedDate,
    previous_result: previous,
  });

  const [winnerUserIds, loserUserIds] = await Promise.all([
    tournamentParticipantUserIds(match.tournament_id, winnerId),
    tournamentParticipantUserIds(match.tournament_id, loserId),
  ]);
  await applyParticipantRewards(winnerUserIds, loserUserIds);
  updated = await updateEntity("TournamentMatch", updated.id, tournamentRewardAppliedPatch(winnerUserIds, loserUserIds));
  const loserIsEliminated = tournamentMatchLoserIsEliminated(updated);
  const elimination = loserIsEliminated
    ? await grantTournamentEliminationRewards({
      tournamentId: updated.tournament_id,
      loserId,
      match: updated,
      loserUserIds,
    })
    : {};
  const advancement = (updated.next_match_id || updated.next_match_round || updated.loser_match_id || updated.is_final || updated.bracket !== "winner")
    ? await advanceTournamentWinner(updated)
    : await advanceLegacyTournamentRound(updated.tournament_id, updated.round);

  await createEntity("ChatMessage", {
    conversation_id: tournament.id,
    sender_id: req.user.id,
    sender_name: nameFor(req.user),
    sender_role: effectiveChatRole(req.user),
    recipient_id: tournament.id,
    recipient_name: "Streamer tournament lobby",
    content: `${nameFor(req.user)} overturned a match result: ${winnerName || "Winning team"} was granted the win.`,
    is_read: false,
    match_type: "streamer_tournament",
    system: true,
    created_date: nowIso(),
  }).catch(() => null);

  const refreshedMatches = await listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500);
  return {
    success: true,
    match: updated,
    matches: refreshedMatches,
    message: `${winnerName || "Winning team"} was granted the win.`,
    elimination,
    reward_undo: rewardUndo,
    elimination_cleanup: eliminationCleanup,
    ...undo,
    ...advancement,
  };
}

async function moderateStreamerTournamentUser(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (!isStreamerTournament(tournament)) {
    return { success: false, error: "Streamer tournament not found" };
  }
  if (!canModerateStreamerTournament(req.user, tournament)) {
    return { success: false, error: "Only the streamer host or staff can moderate this lobby" };
  }

  const targetUserId = String(req.body.user_id || "").trim();
  if (!targetUserId) return { success: false, error: "User id is required" };
  if (String(targetUserId) === String(req.user.id)) {
    return { success: false, error: "You cannot ban yourself from your own lobby" };
  }

  const target = await getEntity("User", targetUserId).catch(() => null);
  if (!target) return { success: false, error: "User not found" };

  const action = String(req.body.action || "ban").toLowerCase();
  const bannedUsers = Array.isArray(tournament.banned_users) ? tournament.banned_users : [];
  const bannedUserIds = new Set((tournament.banned_user_ids || []).map(String));
  const reason = String(req.body.reason || "Streamer lobby moderation").trim().slice(0, 200);
  let nextBannedUsers = bannedUsers;

  if (action === "unban") {
    bannedUserIds.delete(targetUserId);
    nextBannedUsers = bannedUsers.filter((entry) => String(entry?.user_id || "") !== targetUserId);
  } else {
    bannedUserIds.add(targetUserId);
    const entry = {
      user_id: target.id,
      user_name: nameFor(target),
      banned_by: req.user.id,
      banned_by_name: nameFor(req.user),
      reason,
      banned_date: nowIso(),
    };
    nextBannedUsers = [
      ...bannedUsers.filter((row) => String(row?.user_id || "") !== targetUserId),
      entry,
    ];
  }

  const updated = await updateEntity("Tournament", tournament.id, {
    banned_user_ids: [...bannedUserIds],
    banned_users: nextBannedUsers,
    updated_date: nowIso(),
  });

  await createEntity("ChatMessage", {
    conversation_id: tournament.id,
    sender_id: req.user.id,
    sender_name: nameFor(req.user),
    sender_role: effectiveChatRole(req.user),
    recipient_id: tournament.id,
    recipient_name: "Streamer tournament lobby",
    content: `${nameFor(target)} was ${action === "unban" ? "unbanned from" : "banned from"} the lobby.`,
    is_read: false,
    match_type: "streamer_tournament",
    system: true,
    created_date: nowIso(),
  }).catch(() => null);

  return { success: true, tournament: updated };
}

function tournamentRegistrationIsLocked(tournament) {
  const registrationEnded = tournament?.registration_end && new Date(tournament.registration_end) <= new Date();
  return Boolean(
    tournament?.registration_locked
    || tournament?.bracket_generated
    || registrationEnded
    || !tournamentStatusesOpenForRegistration.includes(tournament?.status)
  );
}

async function refundTournamentEntry(tournament, participant) {
  const feeType = participant.entry_type || (tournament.is_premium_only ? "premium" : (Number(tournament.entry_fee || 0) > 0 ? "credits" : "free"));
  const requiresCredits = feeType === "credits" || feeType === "credits_premium";
  const totalPaid = roundedMoney(participant.entry_fee_paid);
  if (!requiresCredits || totalPaid <= 0) return [];

  if (participant.payment_mode === "full_team") {
    const refundUserId = participant.captain_id;
    if (!refundUserId) return [];
    await prisma.user.update({
      where: { id: refundUserId },
      data: { credits: { increment: totalPaid } },
    });
    return [{ user_id: refundUserId, amount: totalPaid }];
  }

  const paidIds = Array.isArray(participant.paid_member_ids) && participant.paid_member_ids.length > 0
    ? participant.paid_member_ids
    : participantUserIds(participant);
  const uniquePaidIds = [...new Set(paidIds.filter(Boolean))];
  if (uniquePaidIds.length === 0) return [];

  const entryFee = roundedMoney(tournament.entry_fee);
  let remaining = totalPaid;
  const refunds = [];
  for (const userId of uniquePaidIds) {
    const amount = roundedMoney(Math.min(entryFee > 0 ? entryFee : totalPaid / uniquePaidIds.length, remaining));
    if (amount <= 0) continue;
    await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
    });
    refunds.push({ user_id: userId, amount });
    remaining = roundedMoney(remaining - amount);
  }
  return refunds;
}

async function reseedTournamentParticipants(tournamentId) {
  const remaining = await tournamentParticipants(tournamentId);
  const ordered = [...remaining].sort((a, b) => (
    Number(a.seed || 0) - Number(b.seed || 0)
    || new Date(a.registered_date || a.created_date || 0) - new Date(b.registered_date || b.created_date || 0)
  ));
  return Promise.all(ordered.map((participant, index) => (
    Number(participant.seed || 0) === index + 1
      ? participant
      : updateEntity("TournamentParticipant", participant.id, { seed: index + 1 }).catch(() => participant)
  )));
}

async function leaveTournament(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (tournamentRegistrationIsLocked(tournament)) {
    return { success: false, error: "Registration is already locked" };
  }

  const existingMatches = await listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 1).catch(() => []);
  if (existingMatches.length > 0) {
    return { success: false, error: "Bracket has already been generated" };
  }

  const participants = await tournamentParticipants(tournament.id);
  const requestedParticipantId = String(req.body.participant_id || "");
  const requestedTeamId = String(req.body.team_id || "");
  const participant = participants.find((row) => (
    (requestedParticipantId && String(row.id || "") === requestedParticipantId)
    || (requestedTeamId && String(row.team_id || "") === requestedTeamId)
    || String(row.captain_id || "") === String(req.user.id)
  ));

  if (!participant) return { success: false, error: "Your team is not registered for this tournament" };
  if (String(participant.captain_id || "") !== String(req.user.id)) {
    return { success: false, error: "Only the team captain can leave the tournament" };
  }

  const refunds = await refundTournamentEntry(tournament, participant);
  await deleteEntity("TournamentParticipant", participant.id);
  const registeredTeams = Math.max(0, Number(tournament.registered_teams || participants.length) - 1);
  const updatedTournament = await updateEntity("Tournament", tournament.id, {
    registered_teams: registeredTeams,
    updated_date: nowIso(),
  });
  await reseedTournamentParticipants(tournament.id);

  await notifyUsers(participantUserIds(participant), {
    title: "Tournament registration removed",
    message: `${participant.team_name || "Your team"} left ${tournament.name}.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournament.id,
    related_entity_type: "Tournament",
  });

  return { success: true, tournament: updatedTournament, participant, refunds };
}

async function updateTournament(req) {
  assertStaff(req, "admin");
  const previousTournament = await getEntity("Tournament", req.body.tournament_id);
  const patch = req.body.patch || {};
  const requestedBracketType = patch.bracket_type || patch.format;
  if (
    previousTournament.bracket_generated
    && requestedBracketType
    && requestedBracketType !== (previousTournament.bracket_type || previousTournament.format || "single_elimination")
  ) {
    return { success: false, error: "The bracket format cannot be changed after the bracket has been generated" };
  }
  if (requestedBracketType) {
    const normalizedBracketType = requestedBracketType === "double_elimination" ? "double_elimination" : "single_elimination";
    patch.bracket_type = normalizedBracketType;
    patch.format = normalizedBracketType;
  }
  const tournament = await updateEntity("Tournament", req.body.tournament_id, {
    ...patch,
    updated_by: req.user.id,
    updated_by_name: nameFor(req.user),
    updated_date: nowIso(),
  });
  const shouldRefreshMaps = Object.prototype.hasOwnProperty.call(patch, "map_pools")
    || Object.prototype.hasOwnProperty.call(patch, "maps")
    || Object.prototype.hasOwnProperty.call(patch, "game_mode");
  const refreshedMatches = [];

  if (shouldRefreshMaps) {
    const [participants, matches] = await Promise.all([
      tournamentParticipants(tournament.id).catch(() => []),
      listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500).catch(() => []),
    ]);
    for (const match of matches) {
      if (tournamentMatchHasScoreActivity(match)) continue;
      if (!shouldGenerateTournamentMatchSetup(match)) continue;
      const setupMatch = {
        ...match,
        maps: [],
        map_generation_key: null,
      };
      const updatedMatch = await updateEntity(
        "TournamentMatch",
        match.id,
        isStreamerTournament(tournament)
          ? streamerMatchSetupPatch(setupMatch, tournament, participants)
          : tournamentMatchSetupPatch(setupMatch, participants, tournament)
      ).catch(() => null);
      if (updatedMatch) refreshedMatches.push(updatedMatch);
    }
  }

  const previousInviteIds = new Set((previousTournament.invited_user_ids || []).map(String));
  const invitedUserIds = (tournament.invited_user_ids || []).map(String);
  const newlyInvited = invitedUserIds.filter((userId) => !previousInviteIds.has(userId));
  if (newlyInvited.length > 0) {
    await Promise.all(newlyInvited.map(async (userId) => {
      const content = `You're officially invited to compete in ${tournament.name}! Assemble your team, claim your spot, and get ready to battle for the title. As the invited captain, you can join with any eligible team you lead.`;
      await Promise.all([
        notifyUser(userId, {
          title: "Tournament invitation",
          message: content,
          type: "tournament",
          action_url: `/tournaments?tournament=${tournament.id}`,
          related_entity_id: tournament.id,
          related_entity_type: "Tournament",
        }),
        createEntity("Message", {
          sender_id: req.user.id,
          sender_name: "Topfragg Tournaments",
          recipient_id: userId,
          subject: `You're invited to compete: ${tournament.name}`,
          content,
          is_read: false,
          action_url: `/tournaments?tournament=${tournament.id}`,
          related_entity_id: tournament.id,
          related_entity_type: "Tournament",
          message_type: "tournament_invitation",
          created_date: nowIso(),
        }),
      ]);
    }));
  }

  return { success: true, tournament, refreshed_matches: refreshedMatches };
}

async function createTournament(req) {
  assertStaff(req, "admin");
  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!name) return { success: false, error: "Tournament name is required" };
  const invitedUserIds = [...new Set((req.body.invited_user_ids || []).filter(Boolean).map(String))];
  const bracketType = (req.body.bracket_type || req.body.format) === "double_elimination"
    ? "double_elimination"
    : "single_elimination";
  const tournament = await createEntity("Tournament", {
    ...req.body,
    name,
    title: name,
    format: bracketType,
    bracket_type: bracketType,
    invited_user_ids: invitedUserIds,
    invite_only: req.body.invite_only === true || req.body.entry_type === "invitational",
    registered_teams: 0,
    created_by: req.user.id,
    created_by_name: nameFor(req.user),
    created_date: nowIso(),
  });
  if (tournament.invite_only && invitedUserIds.length > 0) {
    await Promise.all(invitedUserIds.map(async (userId) => {
      const content = `You're officially invited to compete in ${tournament.name}! Assemble your team, claim your spot, and get ready to battle for the title. As the invited captain, you can join with any eligible team you lead.`;
      await Promise.all([
        notifyUser(userId, {
          title: "Tournament invitation",
          message: content,
          type: "tournament",
          action_url: `/tournaments?tournament=${tournament.id}`,
          related_entity_id: tournament.id,
          related_entity_type: "Tournament",
        }),
        createEntity("Message", {
          sender_id: req.user.id,
          sender_name: "Topfragg Tournaments",
          recipient_id: userId,
          subject: `You're invited to compete: ${tournament.name}`,
          content,
          is_read: false,
          action_url: `/tournaments?tournament=${tournament.id}`,
          related_entity_id: tournament.id,
          related_entity_type: "Tournament",
          message_type: "tournament_invitation",
          created_date: nowIso(),
        }),
      ]);
    }));
  }
  return { success: true, tournament };
}

async function deleteTournament(req) {
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  if (!hasRole(req.user, "admin") && !(isStreamerTournament(tournament) && canModerateStreamerTournament(req.user, tournament))) {
    return { success: false, error: "Only admins or the streamer host can delete this tournament" };
  }
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
  const current = await getEntity("Tournament", req.body.tournament_id);
  if (!hasRole(req.user, "admin") && !(isStreamerTournament(current) && canModerateStreamerTournament(req.user, current))) {
    return { success: false, error: "Only admins or the streamer host can cancel this tournament" };
  }
  const tournament = await updateEntity("Tournament", current.id, {
    status: "cancelled",
    cancelled_by: req.user.id,
    cancelled_by_name: nameFor(req.user),
    cancel_reason: req.body.reason || (isStreamerTournament(current) ? "Cancelled by streamer host" : "Cancelled by admin"),
    cancelled_date: nowIso(),
  });
  await notifyTournamentParticipants(tournament.id, {
    title: "Tournament cancelled",
    message: `${tournament.name} was cancelled.`,
    type: "tournament",
    action_url: isStreamerTournament(current) ? `/streamer-tournament/${tournament.id}` : "/tournaments",
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
  if (value === "streamer" || value === "streamer_tournament") return "streamer_tournament";
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
  const actorRole = effectiveChatRole(actor);
  const senderName = actor && staffRoles.includes(actorRole)
    ? `${actorRole === "moderator" ? "Moderator" : "Admin"} ${nameFor(actor)}`
    : actor ? nameFor(actor) : "Match Admin";
  return createEntity("ChatMessage", {
    conversation_id: match.id,
    sender_id: actor?.id || "system",
    sender_name: senderName,
    sender_role: actorRole,
    staff_badge: staffRoles.includes(actorRole),
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
    is_streamer_tournament: isStreamerTournament(tournament),
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
    sender_role: effectiveChatRole(user),
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
  if (context.matchType === "tournament" && context.is_streamer_tournament) {
    return { success: false, error: "Streamer tournaments use host moderation instead of admin tickets" };
  }
  if (context.matchType === "tournament" && !hasRole(req.user, "moderator")) {
    const supportWindowError = tournamentSupportWindowError(context.match);
    if (supportWindowError) return { success: false, error: supportWindowError };
  }
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
  const requesterIsStaff = hasRole(req.user, "moderator");
  const requeueAdminRequest = existingTicket?.status === "admin_joined" && !requesterIsStaff;
  const nextTicketStatus = requeueAdminRequest
    ? "waiting_for_admin"
    : existingTicket ? existingTicket.status : "waiting_for_admin";
  const ticketPayload = {
    user_id: existingTicket?.user_id || req.user.id,
    username: existingTicket?.username || nameFor(req.user),
    subject: existingTicket?.subject || subject,
    description: existingTicket?.description || description,
    category: context.matchType,
    priority: req.body.priority || existingTicket?.priority || "high",
    status: nextTicketStatus,
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
    assigned_admin_id: requeueAdminRequest ? null : existingTicket?.assigned_admin_id,
    assigned_admin_name: requeueAdminRequest ? null : existingTicket?.assigned_admin_name,
    assigned_admin_role: requeueAdminRequest ? null : existingTicket?.assigned_admin_role,
    joined_date: requeueAdminRequest ? null : existingTicket?.joined_date,
    requeued_by: requeueAdminRequest ? req.user.id : existingTicket?.requeued_by,
    requeued_by_name: requeueAdminRequest ? nameFor(req.user) : existingTicket?.requeued_by_name,
    requeued_date: requeueAdminRequest ? nowIso() : existingTicket?.requeued_date,
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
    match_id: context.match?.id || req.body.match_id,
    action_url: context.actionUrl,
    related_entity_id: context.match?.id || req.body.match_id,
    related_entity_type: context.entityName || context.matchType,
    requested_by_user_id: req.user.id,
    requested_by_name: nameFor(req.user),
    created_date: nowIso(),
  });
  if (context.match?.id) {
    await updateEntity(context.entityName, context.match.id, {
      requested_admin: true,
      admin_request_status: ticket.status,
      admin_request_ticket_id: ticket.id,
      assigned_admin_id: requeueAdminRequest ? null : ticket.assigned_admin_id,
      assigned_admin_name: requeueAdminRequest ? null : ticket.assigned_admin_name,
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
    requested_by_user_id: req.user.id,
    requested_by_name: nameFor(req.user),
    exclude_user_ids: [req.user.id],
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
        actionResult = await adminCorrectTournamentMatch({
          ...req,
          body: {
            ...req.body,
            tournament_match_id: match.id,
            action: action === "approve_team_a" ? "grant_team_a" : "grant_team_b",
            reason: req.body.resolution || req.body.notes || "Admin granted win",
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
  if (matchType === "tournament") {
    return adminCorrectTournamentMatch({
      ...req,
      body: {
        ...req.body,
        tournament_match_id: match.id,
        action: action === "approve_team_a" ? "grant_team_a" : "grant_team_b",
        reason: req.body.reason || "Admin granted win",
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
    const [resetParticipants, resetTournament] = await Promise.all([
      tournamentParticipants(match.tournament_id),
      getEntity("Tournament", match.tournament_id).catch(() => null),
    ]);
    const resetSetup = isStreamerTournament(resetTournament)
      ? streamerMatchSetupPatch(match, resetTournament, resetParticipants)
      : tournamentMatchSetupPatch(match, resetParticipants, resetTournament);
    const updated = await updateEntity("TournamentMatch", match.id, {
      ...tournamentScoreResetPatch(),
      ...tournamentRewardResetPatch(),
      ...resetSetup,
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
  const { teamAScore, teamBScore } = tournamentForfeitScore(match, teamAWins);
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
    ...tournamentForfeitPatch({
      winnerId,
      winnerName,
      loserId,
      loserName,
      reason,
      date: completedDate,
    }),
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
  const loserIsEliminated = tournamentMatchLoserIsEliminated(updated);
  const elimination = loserIsEliminated
    ? await grantTournamentEliminationRewards({
      tournamentId: updated.tournament_id,
      loserId,
      match: updated,
      loserUserIds,
    })
    : {};
  const advancement = (updated.next_match_id || updated.next_match_round || updated.loser_match_id || updated.is_final || updated.bracket !== "winner")
    ? await advanceTournamentWinner(updated)
    : await advanceLegacyTournamentRound(updated.tournament_id, updated.round);

  const message = `Admin ${nameFor(req.user)} marked the tournament match forfeited: ${winnerName || "Winning team"} wins ${teamAScore}-${teamBScore}.`;
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
    title: "Tournament match forfeited",
    message: `${winnerName || "A team"} was granted the win ${teamAScore}-${teamBScore}.`,
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
      score: `${teamAScore}-${teamBScore}`,
      is_forfeit: true,
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
  const recipientId = String(req.body.recipient_id || "").trim();
  const content = String(req.body.content || req.body.message || "").trim();
  if (!recipientId) return { success: false, error: "Choose a player first" };
  if (recipientId === req.user.id) return { success: false, error: "You cannot message yourself" };
  if (!content) return { success: false, error: "Message is required" };
  if (content.length > 1000) return { success: false, error: "Message is too long" };

  const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
  if (!recipient || recipient.is_banned) return { success: false, error: "Player is not available" };

  const message = await createEntity("Message", {
    sender_id: req.user.id,
    sender_name: nameFor(req.user),
    recipient_id: recipient.id,
    recipient_name: nameFor(recipient),
    subject: "Direct message",
    content,
    message_type: "direct_message",
    conversation_key: [req.user.id, recipient.id].sort().join(":"),
    is_read: false,
    created_date: new Date().toISOString(),
  });
  await createEntity("Notification", {
    user_id: recipient.id,
    title: "New Message",
    message: `${nameFor(req.user)} sent you a message.`,
    type: "message",
    is_read: false,
    action_url: `/messages?conversation=${encodeURIComponent(req.user.id)}`,
    related_entity_id: message.id,
    related_entity_type: "Message",
    created_date: new Date().toISOString(),
  });
  return { success: true, message };
}

const messageUserSummary = async (user) => {
  if (!user) return null;
  const profile = await firstEntity("PlayerProfile", { user_id: user.id }).catch(() => null);
  return {
    id: user.id,
    name: nameFor(user),
    username: user.username || "",
    handle: user.handle || user.username || "",
    avatar_url: profile?.avatar_url || user.avatar_url || "",
    role: user.role || "user",
    is_premium: Boolean(user.is_premium),
    premium_expires: user.premium_expires || null,
  };
};

async function searchMessageRecipients(req) {
  const recipientId = String(req.body.recipient_id || "").trim();
  const query = String(req.body.query || "").trim().slice(0, 50);
  if (!recipientId && query.length < 2) return { success: true, users: [] };

  const users = await prisma.user.findMany({
    where: recipientId
      ? { id: recipientId, is_banned: false }
      : {
        id: { not: req.user.id },
        is_banned: false,
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { handle: { contains: query, mode: "insensitive" } },
          { display_name: { contains: query, mode: "insensitive" } },
          { full_name: { contains: query, mode: "insensitive" } },
        ],
      },
    take: recipientId ? 1 : 12,
  });
  const safeUsers = (await Promise.all(users.map(messageUserSummary))).filter(user => user?.id !== req.user.id);
  return { success: true, users: safeUsers };
}

async function getDirectMessages(req) {
  const [incoming, outgoing] = await Promise.all([
    listEntities("Message", { recipient_id: req.user.id }, "-created_date", 500).catch(() => []),
    listEntities("Message", { sender_id: req.user.id }, "-created_date", 500).catch(() => []),
  ]);
  const messages = [...incoming, ...outgoing]
    .filter(message => message.message_type === "direct_message")
    .filter((message, index, rows) => rows.findIndex(row => row.id === message.id) === index)
    .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  const userIds = [...new Set(messages.flatMap(message => [message.sender_id, message.recipient_id]))]
    .filter(id => id && id !== req.user.id);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } } })
    : [];
  return {
    success: true,
    messages,
    users: (await Promise.all(users.map(messageUserSummary))).filter(Boolean),
  };
}

async function markDirectConversationRead(req) {
  const otherUserId = String(req.body.other_user_id || "").trim();
  if (!otherUserId) return { success: false, error: "Conversation is required" };
  const incoming = await listEntities("Message", {
    sender_id: otherUserId,
    recipient_id: req.user.id,
  }, "-created_date", 500).catch(() => []);
  const unread = incoming.filter(message => message.message_type === "direct_message" && !message.is_read);
  await Promise.all(unread.map(message => updateEntity("Message", message.id, { is_read: true })));

  if (unread.length) {
    const unreadIds = new Set(unread.map(message => message.id));
    const notifications = await listEntities("Notification", { user_id: req.user.id }, "-created_date", 500).catch(() => []);
    await Promise.all(notifications
      .filter(notification => unreadIds.has(notification.related_entity_id) && !notification.is_read)
      .map(notification => updateEntity("Notification", notification.id, { is_read: true })));
  }
  return { success: true, read_count: unread.length };
}

async function sendMatchRoomMessage(req) {
  const matchType = normalizeMatchType(req.body.match_type);
  const matchId = req.body.match_id || req.body.conversation_id;
  const content = String(req.body.content || req.body.message || "").trim();

  if (!matchId) return { success: false, error: matchType === "streamer_tournament" ? "Tournament id is required" : "Match id is required" };
  if (!content) return { success: false, error: "Message is required" };
  if (content.length > 500) return { success: false, error: "Message is too long" };

  if (matchType === "streamer_tournament") {
    const tournament = await getEntity("Tournament", matchId);
    if (!isStreamerTournament(tournament)) {
      return { success: false, error: "Streamer tournament not found" };
    }
    if (streamerTournamentBanEntry(tournament, req.user.id) && !canModerateStreamerTournament(req.user, tournament)) {
      return { success: false, error: "You are banned from this streamer lobby chat" };
    }

    const message = await createEntity("ChatMessage", {
      conversation_id: tournament.id,
      sender_id: req.user.id,
      sender_name: nameFor(req.user),
      sender_role: effectiveChatRole(req.user),
      recipient_id: tournament.id,
      recipient_name: "Streamer tournament lobby",
      content,
      is_read: false,
      match_type: matchType,
      created_date: nowIso(),
    });

    return { success: true, message };
  }

  const match = await getEntity(matchEntityFor(matchType), matchId);
  const participantIds = await matchParticipantIds(matchType, match);
  const participantIdSet = new Set(participantIds.map(String));
  const isTournamentParticipant = matchType === "tournament"
    ? (await tournamentMatchParticipantInfo(match, req.user)).isParticipant
    : false;
  if (!hasRole(req.user, "moderator") && !participantIdSet.has(String(req.user.id)) && !isTournamentParticipant) {
    return { success: false, error: "Only match participants can chat in this room" };
  }

  const message = await createEntity("ChatMessage", {
    conversation_id: match.id,
    sender_id: req.user.id,
    sender_name: nameFor(req.user),
    sender_role: effectiveChatRole(req.user),
    recipient_id: match.id,
    recipient_name: "Match room",
    content,
    is_read: false,
    match_type: matchType,
    created_date: nowIso(),
  });

  return { success: true, message };
}

async function createWager(req) {
  const activisionError = activisionIdErrorForUsers([req.userRow]);
  if (activisionError) return { success: false, error: activisionError, code: "ACTIVISION_ID_REQUIRED" };
  const entryFee = money(req.body.entry_fee ?? req.body.amount);
  const matchType = req.body.match_type === "8s" ? "8s" : req.body.match_type === "xp" ? "xp" : "wagers";
  const requiredSize = requiredRosterSize(req.body.team_size);
  const isTeamMatch = matchType === "wagers" || (matchType === "8s" && requiredSize > 1);
  const paymentMode = paymentModeFor(req.body.payment_mode);
  const allowedPlayRules = new Set(["controller_only", "mixed_pc_allowed", "console_only"]);
  const playRule = allowedPlayRules.has(req.body.play_rule) ? req.body.play_rule : "controller_only";
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
    if (matchType === "wagers" && normalizeTeamType(hostTeam.team_type) !== "wager") {
      return { success: false, error: "Select a dedicated wager team. Tournament and general teams cannot enter wagers." };
    }
    const rosterActivisionError = await activisionIdErrorForMembers(hostRoster);
    if (rosterActivisionError) return { success: false, error: rosterActivisionError, code: "ACTIVISION_ID_REQUIRED" };
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
    play_rule: playRule,
    maps: RANKED_MAPS_BY_MODE[req.body.game_mode] || RANKED_MAPS_BY_MODE.snd,
    series_maps: [],
    final_map_id: "",
    final_map_name: "",
    host_banned_map_id: "",
    host_banned_map_name: "",
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
  const activisionError = activisionIdErrorForUsers([req.userRow]);
  if (activisionError) return { success: false, error: activisionError, code: "ACTIVISION_ID_REQUIRED" };
  const wager = await getEntity("Wager", req.body.wager_id);
  if (!wager || wager.status !== "open") {
    return { success: false, error: "Wager is not open" };
  }
  if (wager.host_id === req.user.id) {
    return { success: false, error: "You cannot accept your own wager" };
  }
  if ((wager.match_type || "wagers") === "wagers" && !wager.host_team_id) {
    return { success: false, error: "This wager was posted without a wager team. The host must cancel and repost it with a dedicated wager team." };
  }
  const existingParticipant = await firstEntity("WagerParticipant", { wager_id: wager.id, user_id: req.user.id }).catch(() => null);
  if (existingParticipant) {
    return { success: false, error: "You already joined this wager" };
  }
  const entryFee = money(wager.entry_fee ?? wager.amount);
  const requiredSize = Number(wager.required_players_per_team || requiredRosterSize(wager.team_size));
  const wagerMatchType = wager.match_type || "wagers";
  const isTeamMatch = wagerMatchType === "wagers" || (wagerMatchType === "8s" && requiredSize > 1);
  const paymentMode = paymentModeFor(req.body.payment_mode);
  let challengerTeam = null;
  let challengerRoster = null;
  const enrolledParticipants = await listEntities("WagerParticipant", { wager_id: wager.id }, "-joined_date", 20).catch(() => []);
  const enrolledActivisionError = await activisionIdErrorForMembers(enrolledParticipants);
  if (enrolledActivisionError) return { success: false, error: enrolledActivisionError, code: "ACTIVISION_ID_REQUIRED" };

  if (isTeamMatch) {
    const result = await teamRoster(req.body.team_id, {
      requiredSize,
      expectedType: wagerTeamTypeFor(wager.match_type || "wagers"),
      captainId: req.user.id,
    });
    challengerTeam = result.team;
    challengerRoster = result.roster;
    if ((wager.match_type || "wagers") === "wagers" && normalizeTeamType(challengerTeam.team_type) !== "wager") {
      return { success: false, error: "Select a dedicated wager team. Tournament and general teams cannot enter wagers." };
    }
    const rosterActivisionError = await activisionIdErrorForMembers(challengerRoster);
    if (rosterActivisionError) return { success: false, error: rosterActivisionError, code: "ACTIVISION_ID_REQUIRED" };
    if (challengerTeam.id === wager.host_team_id) {
      return { success: false, error: "Select a different team" };
    }
    const existingUserIds = enrolledParticipants.map((participant) => participant.user_id).filter(Boolean);
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

  const selectedMaps = randomWagerMaps(wager.game_mode, wager.best_of);
  const updated = await updateEntity("Wager", wager.id, {
    challenger_id: req.user.id,
    challenger_name: nameFor(req.user),
    challenger_team_id: challengerTeam?.id,
    challenger_team_name: challengerTeam?.name,
    challenger_payment_mode: paymentMode,
    challenger_banned_map_id: "",
    challenger_banned_map_name: "",
    maps: RANKED_MAPS_BY_MODE[wager.game_mode] || RANKED_MAPS_BY_MODE.snd,
    series_maps: selectedMaps.map((map) => map.name),
    final_map_id: selectedMaps[0]?.id || "",
    final_map_name: selectedMaps[0]?.name || "",
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
  if (!hasRole(req.user, "moderator") && wager.status === "open" && req.user.id !== wager.host_id) {
    return { success: false, error: "Only the host can cancel an open wager" };
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
    action_url: "/wallet",
    related_entity_id: wager.id,
    related_entity_type: "Wager",
  });
  return { success: true, wager: updated };
}

const RANKED_MAPS_BY_MODE = {
  snd: ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Fringe"],
  hp: ["Sake", "Colossus", "Den", "Scar", "Gridlock", "Hacienda"],
  overload: ["Scar", "Gridlock", "Den", "Exposure"],
};

function randomRankedMap(gameMode, excludedNames = []) {
  const pool = RANKED_MAPS_BY_MODE[gameMode] || RANKED_MAPS_BY_MODE.snd;
  const excluded = new Set(excludedNames.filter(Boolean).map((name) => String(name).toLowerCase()));
  const available = pool.filter((name) => !excluded.has(name.toLowerCase()));
  const candidates = available.length > 0 ? available : pool;
  const name = candidates[Math.floor(Math.random() * candidates.length)];
  return { pool, name, id: name.toLowerCase().replace(/\s+/g, "_") };
}

function randomWagerMaps(gameMode, bestOf = 1) {
  const sourcePool = [...(RANKED_MAPS_BY_MODE[gameMode] || RANKED_MAPS_BY_MODE.snd)];
  const requestedCount = Math.max(1, Number(bestOf) || 1);
  const selected = [];

  while (selected.length < requestedCount) {
    const round = [...sourcePool];
    for (let index = round.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [round[index], round[swapIndex]] = [round[swapIndex], round[index]];
    }
    if (selected.length > 0 && round.length > 1 && round[0] === selected[selected.length - 1]) {
      [round[0], round[1]] = [round[1], round[0]];
    }
    for (const name of round) {
      selected.push(name);
      if (selected.length === requestedCount) break;
    }
  }
  return selected.map((name) => ({ name, id: name.toLowerCase().replace(/\s+/g, "_") }));
}

async function previousRankedMapFor(userId, excludeMatchId = "") {
  if (!userId) return "";
  const matches = await listEntities("RankedMatch", {}, "-created_date", 100);
  const previous = matches.find((row) => (
    row.id !== excludeMatchId
    && row.final_map_name
    && (row.host_id === userId || row.challenger_id === userId || rankedRosterIds(row, "alpha").includes(userId) || rankedRosterIds(row, "bravo").includes(userId))
  ));
  return previous?.final_map_name || "";
}

const ACTIVE_RANKED_STATUSES = new Set(["open", "in_progress", "pending_confirmation", "awaiting_confirmation", "score_conflict", "disputed"]);

async function activeRankedMatchFor(userId, excludeMatchId = "") {
  if (!userId) return null;
  const matches = await listEntities("RankedMatch", {}, "-created_date", 100);
  return matches.find((row) => (
    row.id !== excludeMatchId
    && ACTIVE_RANKED_STATUSES.has(row.status)
    && (row.host_id === userId || row.challenger_id === userId || rankedRosterIds(row, "alpha").includes(userId) || rankedRosterIds(row, "bravo").includes(userId))
  )) || null;
}

const rankedTeamSize = (match) => Math.max(1, Number.parseInt(String(match?.team_size || "1v1").split("v")[0], 10) || 1);
const rankedRosterIds = (match, side) => {
  const stored = match?.[`team_${side}_player_ids`];
  if (Array.isArray(stored) && stored.length > 0) return [...new Set(stored.filter(Boolean))];
  if (side === "alpha") return match?.host_id ? [match.host_id] : [];
  return match?.challenger_id ? [match.challenger_id] : [];
};
const rankedRosterNames = (match, side) => {
  const stored = match?.[`team_${side}_player_names`];
  if (Array.isArray(stored) && stored.length > 0) return stored;
  if (side === "alpha") return match?.host_name ? [match.host_name] : [];
  return match?.challenger_name ? [match.challenger_name] : [];
};

async function createRankedMatch(req) {
  const activisionError = activisionIdErrorForUsers([req.userRow]);
  if (activisionError) return { success: false, error: activisionError, code: "ACTIVISION_ID_REQUIRED" };
  if (!Object.prototype.hasOwnProperty.call(RANKED_MAPS_BY_MODE, req.body.game_mode)) {
    return { success: false, error: "Invalid ranked game mode" };
  }
  const activeMatch = await activeRankedMatchFor(req.user.id);
  if (activeMatch) return { success: false, error: "You already have an active ranked match", active_match_id: activeMatch.id };
  const match = await createEntity("RankedMatch", {
    ...req.body,
    host_id: req.user.id,
    host_name: nameFor(req.user),
    best_of: 1,
    maps: RANKED_MAPS_BY_MODE[req.body.game_mode],
    final_map_id: "",
    final_map_name: "",
    team_alpha_player_ids: [req.user.id],
    team_alpha_player_names: [nameFor(req.user)],
    team_bravo_player_ids: [],
    team_bravo_player_names: [],
    status: "open",
    match_start_deadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    created_date: new Date().toISOString(),
  });
  return { success: true, ranked_match: match, ranked_match_id: match.id };
}

async function acceptRankedMatch(req) {
  const activisionError = activisionIdErrorForUsers([req.userRow]);
  if (activisionError) return { success: false, error: activisionError, code: "ACTIVISION_ID_REQUIRED" };
  const id = req.body.ranked_match_id || req.body.id;
  const match = await getEntity("RankedMatch", id);
  if (match.status !== "open") return { success: false, error: "Ranked match is not open" };
  if (match.host_id === req.user.id) return { success: false, error: "You cannot accept your own ranked match" };
  const slotsPerTeam = rankedTeamSize(match);
  const alphaIds = rankedRosterIds(match, "alpha");
  const bravoIds = rankedRosterIds(match, "bravo");
  const alphaNames = rankedRosterNames(match, "alpha");
  const bravoNames = rankedRosterNames(match, "bravo");
  if ([...alphaIds, ...bravoIds].includes(req.user.id)) return { success: true, match, already_joined: true };
  if (alphaIds.length >= slotsPerTeam && bravoIds.length >= slotsPerTeam) return { success: false, error: "Ranked match is full" };
  const [challengerActiveMatch, hostActiveMatch] = await Promise.all([
    activeRankedMatchFor(req.user.id, match.id),
    activeRankedMatchFor(match.host_id, match.id),
  ]);
  if (challengerActiveMatch) return { success: false, error: "You already have an active ranked match", active_match_id: challengerActiveMatch.id };
  if (hostActiveMatch) return { success: false, error: "The host already has another active ranked match" };
  const host = await userFor(match.host_id);
  const hostActivisionError = activisionIdErrorForUsers([host]);
  if (hostActivisionError) return { success: false, error: hostActivisionError, code: "ACTIVISION_ID_REQUIRED" };
  const joinAlpha = alphaIds.length <= bravoIds.length && alphaIds.length < slotsPerTeam;
  if (joinAlpha) {
    alphaIds.push(req.user.id);
    alphaNames.push(nameFor(req.user));
  } else {
    bravoIds.push(req.user.id);
    bravoNames.push(nameFor(req.user));
  }
  const rosterFull = alphaIds.length >= slotsPerTeam && bravoIds.length >= slotsPerTeam;
  const [hostPreviousMap, challengerPreviousMap] = await Promise.all([
    previousRankedMapFor(match.host_id, match.id),
    previousRankedMapFor(req.user.id, match.id),
  ]);
  const shouldReroll = rosterFull && (!match.final_map_name || [hostPreviousMap, challengerPreviousMap]
    .filter(Boolean)
    .some((name) => name.toLowerCase() === String(match.final_map_name).toLowerCase()));
  const selected = shouldReroll
    ? randomRankedMap(match.game_mode, [hostPreviousMap, challengerPreviousMap])
    : null;
  const deadline = match.match_start_deadline || new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const updated = await updateEntity("RankedMatch", id, {
    challenger_id: match.challenger_id || (!joinAlpha ? req.user.id : ""),
    challenger_name: match.challenger_name || (!joinAlpha ? nameFor(req.user) : ""),
    team_alpha_player_ids: alphaIds,
    team_alpha_player_names: alphaNames,
    team_bravo_player_ids: bravoIds,
    team_bravo_player_names: bravoNames,
    joined_players: alphaIds.length + bravoIds.length,
    total_players: slotsPerTeam * 2,
    status: rosterFull ? "in_progress" : "open",
    match_started_date: rosterFull ? new Date().toISOString() : "",
    match_start_deadline: deadline,
    best_of: 1,
    ...(selected ? {
      maps: selected.pool,
      final_map_id: selected.id,
      final_map_name: selected.name,
    } : {}),
  });
  return { success: true, match: updated, roster_full: rosterFull };
}

async function ensureRankedMatchMap(req) {
  const id = req.body.ranked_match_id || req.body.match_id || req.body.id;
  const match = await getEntity("RankedMatch", id);
  if (!match) return { success: false, error: "Ranked match not found" };
  const isParticipant = req.user.id === match.host_id || req.user.id === match.challenger_id;
  if (!isParticipant && !hasRole(req.user, "moderator")) return { success: false, error: "Forbidden" };
  if (match.final_map_name) return { success: true, match };
  const slotsPerTeam = rankedTeamSize(match);
  const rosterFull = rankedRosterIds(match, "alpha").length >= slotsPerTeam && rankedRosterIds(match, "bravo").length >= slotsPerTeam;
  if (!rosterFull) return { success: true, match, waiting_for_opponent: true };

  const [hostPreviousMap, challengerPreviousMap] = await Promise.all([
    previousRankedMapFor(match.host_id, match.id),
    previousRankedMapFor(match.challenger_id, match.id),
  ]);
  const selected = randomRankedMap(match.game_mode, [hostPreviousMap, challengerPreviousMap]);
  const updated = await updateEntity("RankedMatch", id, {
    best_of: 1,
    maps: selected.pool,
    final_map_id: selected.id,
    final_map_name: selected.name,
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
  const slotsPerTeam = rankedTeamSize(match);
  if (rankedRosterIds(match, "alpha").length < slotsPerTeam || rankedRosterIds(match, "bravo").length < slotsPerTeam || match.status === "open") {
    return { success: false, error: "All ranked roster slots must be filled before scores can be submitted" };
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
  const bestOf = Math.max(1, Math.trunc(Number(match.best_of) || 1));
  const winsNeeded = Math.floor(bestOf / 2) + 1;
  const validFinalScore = Number.isInteger(teamAlphaScore)
    && Number.isInteger(teamBravoScore)
    && teamAlphaScore <= winsNeeded
    && teamBravoScore <= winsNeeded
    && ((teamAlphaScore === winsNeeded && teamBravoScore < winsNeeded) || (teamBravoScore === winsNeeded && teamAlphaScore < winsNeeded));
  if (!validFinalScore) {
    return { success: false, error: `Invalid BO${bestOf} score. One team must finish on ${winsNeeded} map ${winsNeeded === 1 ? "win" : "wins"}.` };
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
  const winnerName = winnerId === match.host_id ? match.host_name : match.challenger_name;
  const alphaWon = teamAlphaScore > teamBravoScore;
  const winnerIds = rankedRosterIds(match, alphaWon ? "alpha" : "bravo");
  const loserIds = rankedRosterIds(match, alphaWon ? "bravo" : "alpha");
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
  const eloChanges = await applyRankedRosterRewards(winnerIds, loserIds);
  const completedMatch = await updateEntity("RankedMatch", match.id, { elo_changes: eloChanges });
  await notifyUsers([...winnerIds, ...loserIds], {
    title: "Ranked match completed",
    message: `${winnerName} won. ELO and XP updated.`,
    type: "match",
    action_url: `/ranked-match/${match.id}`,
    related_entity_id: match.id,
    related_entity_type: "RankedMatch",
  });
  return { success: true, winner_id: winnerId, winner_name: winnerName, elo_changes: eloChanges, match: completedMatch };
}

async function cancelRankedMatch(req) {
  const id = req.body.ranked_match_id || req.body.id;
  const existing = await getEntity("RankedMatch", id);
  const staff = hasRole(req.user, "moderator");
  const staffOverride = staff;
  if (req.user.id !== existing.host_id && !staffOverride) {
    return { success: false, error: "Only the host can cancel this ranked match" };
  }
  if (["completed", "cancelled"].includes(existing.status)) {
    return { success: false, error: "This ranked match can no longer be cancelled" };
  }
  const joinedOpponentCount = Math.max(0, rankedRosterIds(existing, "alpha").length + rankedRosterIds(existing, "bravo").length - 1);
  const deadline = existing.match_start_deadline
    ? new Date(existing.match_start_deadline).getTime()
    : existing.created_date
      ? new Date(existing.created_date).getTime() + 15 * 60 * 1000
      : 0;
  if (!staffOverride && joinedOpponentCount === 0 && (!deadline || Date.now() < deadline)) {
    return { success: false, error: "The host can cancel an empty ranked lobby after the 15-minute timer" };
  }
  if (!staffOverride && joinedOpponentCount > 0) {
    return { success: false, error: !deadline || Date.now() < deadline
      ? "A cancellation vote becomes available after the 15-minute timer"
      : "Cancellation requires approval from the opposing captain" };
  }
  const match = await updateEntity("RankedMatch", id, {
    status: "cancelled",
    cancel_reason: req.body.reason || "Cancelled",
    cancelled_date: new Date().toISOString(),
  });
  return { success: true, match };
}

async function voteRankedCancellation(req) {
  const id = req.body.ranked_match_id || req.body.id;
  const action = String(req.body.action || "request").toLowerCase();
  const match = await getEntity("RankedMatch", id);
  if (["completed", "cancelled"].includes(match.status)) return { success: false, error: "This ranked match is already closed" };

  if (action === "request") {
    if (req.user.id !== match.host_id) return { success: false, error: "Only the host can start a cancellation vote" };
    if (!match.challenger_id) return { success: false, error: "No opposing captain has joined yet" };
    const deadline = match.match_start_deadline ? new Date(match.match_start_deadline).getTime() : 0;
    if (!deadline || Date.now() < deadline) return { success: false, error: "The cancellation vote unlocks after the 15-minute timer" };
    if (match.cancel_vote_status === "pending") return { success: true, match, already_pending: true };
    if (match.cancel_vote_status === "rejected") return { success: false, error: "The opposing captain already rejected this cancellation vote" };

    const updated = await updateEntity("RankedMatch", id, {
      cancel_vote_status: "pending",
      cancel_vote_requested_by: req.user.id,
      cancel_vote_requested_by_name: nameFor(req.user),
      cancel_vote_requested_date: nowIso(),
    });
    await notifyUsers([match.challenger_id], {
      title: "Ranked cancellation vote",
      message: `${match.host_name || "The host"} requested to cancel the match. Your approval is required.`,
      type: "match",
      action_url: `/ranked-match/${match.id}`,
      related_entity_id: match.id,
      related_entity_type: "RankedMatch",
    });
    return { success: true, match: updated };
  }

  if (!["approve", "reject"].includes(action)) return { success: false, error: "Invalid cancellation vote action" };
  if (req.user.id !== match.challenger_id) return { success: false, error: "Only the opposing captain can decide this cancellation vote" };
  if (match.cancel_vote_status !== "pending") return { success: false, error: "There is no pending cancellation vote" };

  if (action === "reject") {
    const updated = await updateEntity("RankedMatch", id, {
      cancel_vote_status: "rejected",
      cancel_vote_decided_by: req.user.id,
      cancel_vote_decided_date: nowIso(),
    });
    return { success: true, match: updated, cancelled: false };
  }

  const updated = await updateEntity("RankedMatch", id, {
    status: "cancelled",
    cancel_reason: "Approved by both team captains",
    cancel_vote_status: "approved",
    cancel_vote_decided_by: req.user.id,
    cancel_vote_decided_date: nowIso(),
    cancelled_date: nowIso(),
  });
  return { success: true, match: updated, cancelled: true };
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
  assertStaff(req, "admin");
  const userId = req.body.user_id;
  if (!userId) return { success: false, error: "Target user is required" };
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

async function adminAdjustRankedElo(req) {
  if (!hasRole(req.user, "admin")) return { success: false, error: "Admin access required" };
  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "Player not found" };
  const operation = ["set", "add", "subtract"].includes(req.body.operation) ? req.body.operation : "set";
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000 || (operation !== "set" && amount === 0)) {
    return { success: false, error: "Enter a valid whole ELO amount between 0 and 1,000,000" };
  }
  const reason = String(req.body.reason || "").trim();
  if (reason.length < 3) return { success: false, error: "A clear reason is required" };

  const stats = await ensureRankedStats(target.id);
  const profile = await ensurePlayerProfile(target.id);
  const beforeElo = Math.max(0, Number(stats?.elo || 0));
  const afterElo = operation === "set"
    ? amount
    : operation === "add"
      ? beforeElo + amount
      : Math.max(0, beforeElo - amount);
  const appliedDelta = afterElo - beforeElo;
  const timestamp = nowIso();
  const updatedStats = await updateEntity("RankedStats", stats.id, {
    elo: afterElo,
    peak_elo: Math.max(Number(stats.peak_elo || 0), afterElo),
    last_admin_adjustment_date: timestamp,
  });
  if (profile) {
    await updateEntity("PlayerProfile", profile.id, {
      elo: afterElo,
      peak_elo: Math.max(Number(profile.peak_elo || 0), afterElo),
      last_active_date: timestamp,
    });
  }
  const action = await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "ranked_elo_adjustment",
    target_user_id: target.id,
    target_username: nameFor(target),
    description: `${operation === "set" ? "Set" : appliedDelta >= 0 ? "Added" : "Removed"} Ranked ELO for ${nameFor(target)} from ${beforeElo} to ${afterElo}: ${reason}`,
    details: { before_elo: beforeElo, after_elo: afterElo, operation, requested_amount: amount, applied_delta: appliedDelta, reason },
    created_date: timestamp,
  });
  await notifyUser(target.id, {
    title: "Ranked ELO corrected",
    message: `Your Ranked ELO was adjusted from ${beforeElo} to ${afterElo}. Reason: ${reason}`,
    type: "system",
    action_url: "/ranked",
    related_entity_id: action.id,
    related_entity_type: "AdminAction",
  });
  return { success: true, ranked_stats: updatedStats, before_elo: beforeElo, after_elo: afterElo, applied_delta: appliedDelta, action };
}

async function adminUpdateRankedStats(req) {
  if (!hasRole(req.user, "admin")) return { success: false, error: "Admin access required" };
  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "Player not found" };
  const reason = String(req.body.reason || "").trim();
  if (reason.length < 3) return { success: false, error: "A clear reason is required" };

  const fields = ["wins", "losses", "win_streak", "peak_elo", "matches_played"];
  const updates = {};
  for (const field of fields) {
    const value = Number(req.body[field]);
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
      return { success: false, error: `${field.replace(/_/g, " ")} must be a whole number between 0 and 1,000,000` };
    }
    updates[field] = value;
  }
  if (updates.matches_played < updates.wins + updates.losses) {
    return { success: false, error: "Season matches cannot be lower than wins plus losses" };
  }

  const stats = await ensureRankedStats(target.id);
  const before = Object.fromEntries(fields.map((field) => [field, Number(stats?.[field] || 0)]));
  const timestamp = nowIso();
  const updatedStats = await updateEntity("RankedStats", stats.id, { ...updates, last_admin_adjustment_date: timestamp });
  const profile = await ensurePlayerProfile(target.id);
  if (profile) {
    await updateEntity("PlayerProfile", profile.id, {
      total_wins: updates.wins,
      total_losses: updates.losses,
      current_win_streak: updates.win_streak,
      peak_elo: updates.peak_elo,
      last_active_date: timestamp,
    });
  }
  const action = await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "ranked_stats_adjustment",
    target_user_id: target.id,
    target_username: nameFor(target),
    description: `Updated Ranked season stats for ${nameFor(target)}: ${reason}`,
    details: { before, after: updates, reason },
    created_date: timestamp,
  });
  await notifyUser(target.id, {
    title: "Ranked record corrected",
    message: `Your Ranked season record was corrected by staff. Reason: ${reason}`,
    type: "system",
    action_url: "/ranked",
    related_entity_id: action.id,
    related_entity_type: "AdminAction",
  });
  return { success: true, ranked_stats: updatedStats, before, after: updates, action };
}

async function adminResetRankedSeason(req) {
  if (!hasRole(req.user, "super_admin")) return { success: false, error: "Super Admin or CEO access required" };
  const reason = String(req.body.reason || "New Ranked season").trim();
  if (reason.length < 3) return { success: false, error: "A reset reason is required" };
  const seasonNumber = Number(req.body.season_number);
  const seasonName = String(req.body.season_name || "").trim();
  const startDate = new Date(req.body.start_date);
  const endDate = new Date(req.body.end_date);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1 || seasonNumber > 10_000) return { success: false, error: "Enter a valid new season number" };
  if (seasonName.length < 2) return { success: false, error: "Enter a name for the new season" };
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    return { success: false, error: "The season end date must be after its start date" };
  }
  // A season reset must cover the complete ladder, not only the first entity page.
  const statsRows = (await prisma.rankedStats.findMany()).map(serializeRow);
  const timestamp = nowIso();
  let bronzeResets = 0;
  let platinumResets = 0;

  await Promise.all(statsRows.map(async (stats) => {
    const oldElo = Math.max(0, Number(stats.elo || 0));
    const resetElo = oldElo >= 1800 ? 1800 : 0;
    if (resetElo === 1800) platinumResets += 1;
    else bronzeResets += 1;
    const history = Array.isArray(stats.season_history) ? stats.season_history : [];
    await updateEntity("RankedStats", stats.id, {
      elo: resetElo,
      peak_elo: resetElo,
      wins: 0,
      losses: 0,
      win_streak: 0,
      matches_played: 0,
      season: seasonNumber,
      season_history: [...history.slice(-4), {
        season: Number(stats.season || 1),
        final_elo: oldElo,
        peak_elo: Number(stats.peak_elo || oldElo),
        wins: Number(stats.wins || 0),
        losses: Number(stats.losses || 0),
        matches_played: Number(stats.matches_played || 0),
        reset_date: timestamp,
      }],
      season_reset_date: timestamp,
    });
    const profile = await ensurePlayerProfile(stats.user_id);
    if (profile) await updateEntity("PlayerProfile", profile.id, { elo: resetElo, peak_elo: resetElo });
  }));

  const existingSeasons = await listEntities("Season", {}, "-season_number", 1000);
  await Promise.all(existingSeasons.filter((season) => season.is_active).map((season) => (
    updateEntity("Season", season.id, { is_active: false, end_date: timestamp })
  )));
  const season = await createEntity("Season", {
    name: seasonName,
    season_number: seasonNumber,
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
    is_active: true,
    rank_resets: true,
    created_date: timestamp,
  });

  const action = await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "ranked_season_reset",
    description: `Started ${seasonName} (Season ${seasonNumber}) and reset Ranked for ${statsRows.length} players: ${reason}`,
    details: { players_reset: statsRows.length, bronze_resets: bronzeResets, platinum_resets: platinumResets, season_id: season.id, season_name: seasonName, season_number: seasonNumber, start_date: startDate.toISOString(), end_date: endDate.toISOString(), reason, reset_date: timestamp },
    created_date: timestamp,
  });
  return { success: true, players_reset: statsRows.length, bronze_resets: bronzeResets, platinum_resets: platinumResets, season, action };
}

async function forgeMoneyToCredits(req) {
  const amount = money(req.body.amount);
  const credits = Math.floor(amount * 100);
  await prisma.user.update({ where: { id: req.user.id }, data: { credits: req.userRow.credits + credits } });
  return { success: true, credits_added: credits };
}

async function generateTournamentBracket(req) {
  assertStaff(req, "admin");
  const tournamentId = req.body.tournament_id;
  const tournament = await getEntity("Tournament", tournamentId);
  const participants = await listEntities("TournamentParticipant", { tournament_id: tournamentId }, "seed", 256);
  if (participants.length < 2) return { success: false, error: "At least two participants are required" };
  const existing = await listEntities("TournamentMatch", { tournament_id: tournamentId }, "round", 500);
  if (existing.length > 0) return { success: true, match_count: existing.length, matches: existing, already_generated: true };
  const preserveSeeds = req.body.preserve_seeds === true;
  const preservedSeedMap = req.body.preserved_seed_map && typeof req.body.preserved_seed_map === "object"
    ? req.body.preserved_seed_map
    : {};
  const orderedParticipants = [...participants];
  if (!preserveSeeds) {
    for (let index = orderedParticipants.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [orderedParticipants[index], orderedParticipants[swapIndex]] = [orderedParticipants[swapIndex], orderedParticipants[index]];
    }
  }
  const participantsWithSeeds = await Promise.all(orderedParticipants.map((participant, index) => {
    const preservedSeed = Number(preservedSeedMap[participant.id] || preservedSeedMap[participant.team_id]);
    const seed = preserveSeeds
      ? (preservedSeed > 0 ? preservedSeed : (Number(participant.seed) > 0 ? Number(participant.seed) : index + 1))
      : index + 1;
    return Number(participant.seed) === seed
      ? participant
      : updateEntity("TournamentParticipant", participant.id, { seed });
  }));
  participantsWithSeeds.sort((a, b) => Number(a.seed || 0) - Number(b.seed || 0));
  const bracketSize = nextPowerOfTwo(participantsWithSeeds.length);
  // Place seeds in a balanced bracket (1 v last, 8 v 9, etc.). For a field that
  // is not a power of two this distributes byes across the bracket instead of
  // creating real matches on the left and dead routing branches on the right.
  const seededParticipants = seedPositions(bracketSize)
    .map((seed) => participantsWithSeeds[seed - 1] || null);
  const totalRounds = Math.log2(bracketSize);
  const doubleElimination = (tournament.bracket_type || tournament.format) === "double_elimination";
  const matches = [];
  const matchByKey = new Map();
  const matchKey = (bracket, round, matchNumber) => `${bracket}:${round}:${matchNumber}`;

  const createBracketMatch = async (payload) => {
    const created = await createEntity("TournamentMatch", payload);
    matches.push(created);
    matchByKey.set(matchKey(created.bracket || "winner", created.round, created.match_number), created);
    return created;
  };

  const linkRoute = async (source, target, outcome, slot) => {
    if (!source || !target) return;
    const loserRoute = outcome === "loser";
    const sourcePatch = loserRoute ? {
      loser_match_id: target.id,
      loser_match_round: target.round,
      loser_match_number: target.match_number,
      loser_match_bracket: target.bracket || "winner",
      loser_slot_in_next: slot,
    } : {
      next_match_id: target.id,
      next_match_round: target.round,
      next_match_number: target.match_number,
      next_match_bracket: target.bracket || "winner",
      slot_in_next: slot,
    };
    const targetPatch = {
      [`${slot}_source_match_id`]: source.id,
      [`${slot}_source_outcome`]: outcome,
    };
    Object.assign(source, await updateEntity("TournamentMatch", source.id, sourcePatch));
    Object.assign(target, await updateEntity("TournamentMatch", target.id, targetPatch));
  };

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
      const readyDate = isRoundOne && hasA && hasB && req.body.start_immediately === true ? nowIso() : null;
      const matchPayload = {
        tournament_id: tournamentId,
        tournament_game_mode: tournament.game_mode || "snd",
        bracket: "winner",
        round,
        match_number: matchNumber,
        ...(a ? participantSlotFields(a, "team_a") : {}),
        ...(b ? participantSlotFields(b, "team_b") : {}),
        status: isRoundOne ? (hasA && hasB ? "ready" : "completed") : "pending",
        ...(readyDate ? { assigned_date: readyDate, ...tournamentStartWindowPatch(readyDate) } : {}),
        winner_id: winner ? participantKey(winner) : null,
        winner_name: winner ? participantName(winner) : null,
        completed: Boolean(winner),
        completed_date: winner ? nowIso() : null,
        next_match_round: round < totalRounds ? round + 1 : null,
        next_match_number: round < totalRounds ? Math.ceil(matchNumber / 2) : null,
        slot_in_next: round < totalRounds ? (matchNumber % 2 === 1 ? "team_a" : "team_b") : null,
        is_final: !doubleElimination && round === totalRounds,
        bracket_final: round === totalRounds,
        created_date: nowIso(),
      };
      await createBracketMatch({
        ...matchPayload,
        ...(!hasBye && hasBothTeams(matchPayload) ? tournamentMatchSetupPatch(matchPayload, participantsWithSeeds, tournament) : {}),
      });
    }
  }

  if (doubleElimination && totalRounds >= 2) {
    const totalLowerRounds = (totalRounds * 2) - 2;
    for (let lowerRound = 1; lowerRound <= totalLowerRounds; lowerRound += 1) {
      const winnerRound = Math.floor((lowerRound + 1) / 2) + 1;
      const matchCount = bracketSize / (2 ** winnerRound);
      for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
        await createBracketMatch({
          tournament_id: tournamentId,
          tournament_game_mode: tournament.game_mode || "snd",
          bracket: "loser",
          round: lowerRound,
          match_number: matchNumber,
          status: "pending",
          completed: false,
          is_final: false,
          bracket_final: lowerRound === totalLowerRounds,
          created_date: nowIso(),
        });
      }
    }
  }

  if (doubleElimination) {
    await createBracketMatch({
      tournament_id: tournamentId,
      tournament_game_mode: tournament.game_mode || "snd",
      bracket: "grand_final",
      round: 1,
      match_number: 1,
      match_label: "Grand Final",
      status: "pending",
      completed: false,
      is_final: true,
      double_elimination_reset_eligible: true,
      created_date: nowIso(),
    });
  }

  for (let round = 1; round <= totalRounds; round += 1) {
    const matchCount = bracketSize / (2 ** round);
    for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
      const source = matchByKey.get(matchKey("winner", round, matchNumber));
      if (round < totalRounds) {
        const target = matchByKey.get(matchKey("winner", round + 1, Math.ceil(matchNumber / 2)));
        await linkRoute(source, target, "winner", matchNumber % 2 === 1 ? "team_a" : "team_b");
      } else if (doubleElimination) {
        await linkRoute(source, matchByKey.get(matchKey("grand_final", 1, 1)), "winner", "team_a");
      }

      if (!doubleElimination) continue;
      if (totalRounds === 1) {
        await linkRoute(source, matchByKey.get(matchKey("grand_final", 1, 1)), "loser", "team_b");
      } else if (round === 1) {
        await linkRoute(
          source,
          matchByKey.get(matchKey("loser", 1, Math.ceil(matchNumber / 2))),
          "loser",
          matchNumber % 2 === 1 ? "team_a" : "team_b"
        );
      } else {
        // Cross incoming Winners Bracket losers so a team cannot immediately
        // rematch the opponent it just faced before dropping down.
        const lowerMatchCount = bracketSize / (2 ** round);
        const crossedMatchNumber = lowerMatchCount - matchNumber + 1;
        await linkRoute(source, matchByKey.get(matchKey("loser", (round * 2) - 2, crossedMatchNumber)), "loser", "team_b");
      }
    }
  }

  if (doubleElimination && totalRounds >= 2) {
    const totalLowerRounds = (totalRounds * 2) - 2;
    for (let lowerRound = 1; lowerRound <= totalLowerRounds; lowerRound += 1) {
      const winnerRound = Math.floor((lowerRound + 1) / 2) + 1;
      const matchCount = bracketSize / (2 ** winnerRound);
      for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
        const source = matchByKey.get(matchKey("loser", lowerRound, matchNumber));
        if (lowerRound === totalLowerRounds) {
          await linkRoute(source, matchByKey.get(matchKey("grand_final", 1, 1)), "winner", "team_b");
        } else if (lowerRound % 2 === 1) {
          await linkRoute(source, matchByKey.get(matchKey("loser", lowerRound + 1, matchNumber)), "winner", "team_a");
        } else {
          await linkRoute(
            source,
            matchByKey.get(matchKey("loser", lowerRound + 1, Math.ceil(matchNumber / 2))),
            "winner",
            matchNumber % 2 === 1 ? "team_a" : "team_b"
          );
        }
      }
    }
  }

  await updateEntity("Tournament", tournamentId, {
    status: req.body.start_immediately === true ? "in_progress" : "closed",
    registration_locked: true,
    bracket_generated: true,
    bracket_generated_date: nowIso(),
    ...(req.body.start_immediately === true ? {
      started_by: req.user.id,
      started_by_name: nameFor(req.user),
      started_date: nowIso(),
    } : {}),
  }).catch(() => null);
  await notifyTournamentParticipants(tournamentId, {
    title: "Bracket generated",
    message: `${tournament.name} bracket is ready.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournamentId,
    related_entity_type: "Tournament",
  });
  const participantByTeamId = Object.fromEntries(participantsWithSeeds.map((participant) => [participant.team_id, participant]));
  await Promise.all(matches.filter((match) => hasBothTeams(match) && match.status === "ready").map((match) => {
    const teamA = participantByTeamId[match.team_a_id];
    const teamB = participantByTeamId[match.team_b_id];
    return notifyUsers([
      ...participantUserIds(teamA),
      ...participantUserIds(teamB),
    ], {
      title: req.body.start_immediately === true ? "Your tournament match is ready" : "Tournament match assigned",
      message: req.body.start_immediately === true
        ? `${match.team_a_name || "Open slot"} vs ${match.team_b_name || "Open slot"}. Open the match room and start within ${tournamentStartWindowMinutes} minutes.`
        : `${match.team_a_name || "Open slot"} vs ${match.team_b_name || "Open slot"}`,
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

async function resetTournamentBracket(req) {
  assertStaff(req, "admin");
  const tournamentId = req.body.tournament_id;
  if (!tournamentId) return { success: false, error: "Tournament id is required" };

  const tournament = await getEntity("Tournament", tournamentId);
  const [matches, participants, wins] = await Promise.all([
    listEntities("TournamentMatch", { tournament_id: tournamentId }, "round", 500).catch(() => []),
    listEntities("TournamentParticipant", { tournament_id: tournamentId }, "seed", 500).catch(() => []),
    listEntities("TournamentWin", { tournament_id: tournamentId }, "-created_date", 500).catch(() => []),
  ]);

  // Completed tournaments can already have paid prizes and inventory rewards. Those
  // financial mutations must never be silently reversed by a bracket-only reset.
  if (wins.length > 0) {
    return {
      success: false,
      error: "This tournament already has awarded results. Remove or reverse the awards before resetting the bracket.",
    };
  }

  const requestedMaxTeams = Number(req.body.max_teams);
  const currentMaxTeams = Number(tournament.max_teams || 0);
  const maxTeams = Number.isFinite(requestedMaxTeams) && requestedMaxTeams > 0
    ? Math.max(participants.length, Math.floor(requestedMaxTeams))
    : Math.max(participants.length, currentMaxTeams);
  // Capture the exact database values before deleting any match or resetting
  // participant state. This is passed directly into regeneration so ordering
  // differences in entity queries can never reshuffle the seeds.
  const preservedSeedMap = Object.fromEntries(participants.flatMap((participant, index) => {
    const seed = Number(participant.seed) > 0 ? Number(participant.seed) : index + 1;
    return [[participant.id, seed], ...(participant.team_id ? [[participant.team_id, seed]] : [])];
  }));

  await Promise.all(matches.map((match) => deleteEntity("TournamentMatch", match.id)));
  await Promise.all(participants.map((participant, index) => updateEntity("TournamentParticipant", participant.id, {
    seed: Number(participant.seed) > 0 ? Number(participant.seed) : index + 1,
    status: "registered",
    eliminated: false,
    eliminated_date: null,
    final_rank: null,
    wins: 0,
    losses: 0,
    roster_locked: false,
  })));

  const resetDate = nowIso();
  const updated = await updateEntity("Tournament", tournamentId, {
    status: "registration",
    registration_locked: false,
    registration_end: null,
    registration_closed_date: null,
    registration_closed_by: null,
    bracket_generated: false,
    bracket_generated_date: null,
    started_date: null,
    started_by: null,
    started_by_name: null,
    completed_date: null,
    completed_by: null,
    completed_by_name: null,
    winner_id: null,
    winner_name: null,
    runner_up_id: null,
    runner_up_name: null,
    max_teams: maxTeams,
    registered_teams: participants.length,
    bracket_reset_date: resetDate,
    bracket_reset_by: req.user.id,
    bracket_reset_by_name: nameFor(req.user),
  });

  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "tournament_reset_bracket",
    target_user_id: tournamentId,
    target_username: tournament.name,
    description: req.body.regenerate_immediately === true
      ? `Repaired bracket while preserving seeds for ${tournament.name}`
      : `Reset bracket and reopened registration for ${tournament.name}`,
    details: {
      tournament_id: tournamentId,
      deleted_match_count: matches.length,
      retained_participant_count: participants.length,
      max_teams: maxTeams,
    },
    created_date: resetDate,
  }).catch(() => null);

  if (req.body.regenerate_immediately === true) {
    const regenerated = await generateTournamentBracket({
      ...req,
      body: {
        tournament_id: tournamentId,
        start_immediately: false,
        preserve_seeds: true,
        preserved_seed_map: preservedSeedMap,
        system: true,
      },
    });
    return {
      success: regenerated.success === true,
      tournament: updated,
      deleted_match_count: matches.length,
      retained_participant_count: participants.length,
      match_count: regenerated.match_count || 0,
      matches: regenerated.matches || [],
      seeds_preserved: true,
      error: regenerated.error,
    };
  }

  await notifyTournamentParticipants(tournamentId, {
    title: "Bracket reset",
    message: `${tournament.name} registration has reopened. The bracket will be generated again after registration closes.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournamentId,
    related_entity_type: "Tournament",
  });

  return {
    success: true,
    tournament: updated,
    deleted_match_count: matches.length,
    retained_participant_count: participants.length,
  };
}

async function ensureTournamentMatchSetup(req) {
  const matchId = req.body.tournament_match_id || req.body.match_id;
  if (!matchId) return { success: false, error: "Tournament match id is required" };
  const match = await getEntity("TournamentMatch", matchId);
  if (!match.team_a_id || !match.team_b_id) {
    return { success: false, error: "Both teams must be assigned before maps can be generated" };
  }

  const [participants, tournament] = await Promise.all([
    tournamentParticipants(match.tournament_id),
    getEntity("Tournament", match.tournament_id).catch(() => null),
  ]);
  const patch = isStreamerTournament(tournament)
    ? streamerMatchSetupPatch(match, tournament, participants)
    : tournamentMatchSetupPatch(match, participants, tournament);
  if (hasBothTeams(match) && (match.completed || match.status === "completed") && !match.winner_id) {
    Object.assign(patch, {
      status: "ready",
      completed: false,
      completed_date: null,
      empty_bracket_slot: false,
    });
  }
  if (
    tournamentStatusesStarted.includes(tournament?.status)
    && !match.start_deadline
    && !match.completed
    && match.status !== "completed"
  ) {
    Object.assign(patch, tournamentStartWindowPatch(tournamentStartWindowBase(match, tournament)));
  }
  const updated = await updateEntity("TournamentMatch", match.id, patch);
  return { success: true, match: updated };
}

async function startTournament(req) {
  assertStaff(req, "admin");
  const tournament = await getEntity("Tournament", req.body.tournament_id);
  const [matches, participants] = await Promise.all([
    listEntities("TournamentMatch", { tournament_id: tournament.id }, "round", 500),
    tournamentParticipants(tournament.id),
  ]);
  let bracket = matches;
  if (matches.length === 0) {
    const generated = await generateTournamentBracket({ ...req, body: { tournament_id: tournament.id, start_immediately: true } });
    if (!generated.success) return generated;
    bracket = generated.matches || [];
  }
  const startedDate = nowIso();
  bracket = await Promise.all(bracket.map(async (match) => {
    if (
      !hasBothTeams(match)
      || match.completed
      || match.status === "completed"
    ) {
      return match;
    }
    const setupPatch = isStreamerTournament(tournament)
      ? streamerMatchSetupPatch(match, tournament, participants)
      : tournamentMatchSetupPatch(match, participants, tournament);
    return updateEntity("TournamentMatch", match.id, {
      status: match.status === "pending" ? "ready" : match.status,
      assigned_date: match.assigned_date || startedDate,
      ...(!match.start_deadline ? tournamentStartWindowPatch(startedDate) : {}),
      ...setupPatch,
    });
  }));
  const updated = await updateEntity("Tournament", tournament.id, {
    status: "in_progress",
    registration_locked: true,
    started_by: req.user.id,
    started_by_name: nameFor(req.user),
    started_date: startedDate,
  });
  await notifyTournamentParticipants(tournament.id, {
    title: "Tournament started",
    message: `${tournament.name} has started. Round 1 is ready—open your match room and start within ${tournamentStartWindowMinutes} minutes.`,
    type: "tournament",
    action_url: "/tournaments",
    related_entity_id: tournament.id,
    related_entity_type: "Tournament",
  });
  return { success: true, tournament: updated, matches: bracket };
}

async function syncTournamentLifecycle(req) {
  if (!hasRole(req.user, "admin")) {
    return { success: true, synced: [] };
  }

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
      const generated = await generateTournamentBracket({ ...req, body: { tournament_id: tournament.id, start_immediately: true } });
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
  const loserIsEliminated = tournamentMatchLoserIsEliminated(updated);
  const elimination = loserIsEliminated
    ? await grantTournamentEliminationRewards({
      tournamentId: updated.tournament_id,
      loserId,
      match: updated,
      loserUserIds,
    })
    : {};
  const advancement = (updated.next_match_id || updated.next_match_round || updated.loser_match_id || updated.is_final || updated.bracket !== "winner")
    ? await advanceTournamentWinner(updated)
    : await advanceLegacyTournamentRound(updated.tournament_id, updated.round);
  return { success: true, match: updated, elimination, ...advancement };
}

async function completeTournamentMatch(req) {
  const match = await getEntity("TournamentMatch", req.body.tournament_match_id);
  if (!match || match.status === "completed" || match.completed) {
    return { success: false, error: "Match is already completed" };
  }
  const { teamAUserIds, teamBUserIds, isParticipant, reportingSide } = await tournamentMatchParticipantInfo(match, req.user);
  const isStaff = hasRole(req.user, "moderator");
  const canStaffOverride = isStaff && !isParticipant;
  if (!isStaff && !isParticipant) {
    return { success: false, error: "Only tournament match participants can submit results" };
  }
  if (["disputed", "score_conflict"].includes(match.status) && !canStaffOverride) {
    return { success: false, error: "This match is under dispute review" };
  }
  const teamAScore = Number(req.body.team_a_score || 0);
  const teamBScore = Number(req.body.team_b_score || 0);
  if (!match.team_a_id || !match.team_b_id) {
    return { success: false, error: "Both tournament slots must be assigned before completion" };
  }
  const scoreError = tournamentScoreError(match, teamAScore, teamBScore);
  if (scoreError) return { success: false, error: scoreError };

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

  if (matchType === "tournament" && match?.tournament_id) {
    const tournament = await getEntity("Tournament", match.tournament_id).catch(() => null);
    if (isStreamerTournament(tournament)) {
      return { success: false, error: "Streamer tournaments do not create dispute cases" };
    }
    if (!hasRole(req.user, "moderator")) {
      const supportWindowError = tournamentSupportWindowError(match);
      if (supportWindowError) return { success: false, error: supportWindowError };
    }
  }

  const involvedUserIds = await matchParticipantIds(matchType, match);
  const isTournamentParticipant = matchType === "tournament"
    ? (await tournamentMatchParticipantInfo(match, req.user)).isParticipant
    : false;
  if (!hasRole(req.user, "moderator") && !involvedUserIds.includes(req.user.id) && !isTournamentParticipant) {
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
  const currentBadges = Array.isArray(target.metadata?.badges) ? target.metadata.badges : [];
  const specialBadges = currentBadges.filter((badge) => specialUserBadgeTypes.has(badge?.type));
  const roleBadges = nextRole !== "user"
    ? [{ name: nextRole === "ceo" ? "CEO" : nextRole.replace("_", " "), type: nextRole }]
    : [];
  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      role: nextRole,
      admin_role: nextRole !== "user" ? nextRole : null,
      is_admin: nextRole !== "user",
      metadata: {
        ...(target.metadata || {}),
        badges: [...roleBadges, ...specialBadges],
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

function normalizedSpecialBadges(types = []) {
  const selected = [...new Set((types || []).filter((type) => specialUserBadgeTypes.has(type)))];
  return selected.map((type) => ({ type, name: specialUserBadgeLabels[type] }));
}

function booleanFromBody(body = {}, keys = []) {
  const key = keys.find((candidate) => Object.prototype.hasOwnProperty.call(body, candidate));
  if (!key) return false;
  const value = body[key];
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return Boolean(value);
}

async function updateUserBadges(req) {
  assertStaff(req, "admin");
  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "User not found" };
  if (!canModerateUser(req.user.role, target.role)) {
    return { success: false, error: "Role hierarchy prevents updating this account" };
  }

  const requestedTypes = Array.isArray(req.body.badge_types)
    ? req.body.badge_types
    : String(req.body.badge_type || "")
      .split(",")
      .map((type) => type.trim())
      .filter(Boolean);
  const currentBadges = Array.isArray(target.metadata?.badges) ? target.metadata.badges : [];
  const roleBadges = currentBadges.filter((badge) => roleBadgeTypes.has(badge?.type));
  const specialBadges = normalizedSpecialBadges(requestedTypes);
  const verified = specialBadges.some((badge) => badge.type === "verified_player");
  const streamer = specialBadges.some((badge) => badge.type === "streamer");
  const forceStream = booleanFromBody(req.body, ["force_stream_required", "stream_override_required"]);
  const monitorCamRequired = booleanFromBody(req.body, ["monitor_cam_required", "required_monitor_cam", "moni_cam_required"]);
  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      metadata: {
        ...(target.metadata || {}),
        badges: [...roleBadges, ...specialBadges],
        verified_player: verified,
        streamer_badge: streamer,
        force_stream_required: forceStream,
        monitor_cam_required: monitorCamRequired,
        stream_exempt_default: verified && !forceStream,
        badge_updated_by: req.user.id,
        badge_updated_by_name: nameFor(req.user),
        badge_updated_date: nowIso(),
      },
    },
  });

  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "user_badges_update",
    target_user_id: target.id,
    target_username: nameFor(target),
    description: `Updated badges for ${nameFor(target)}`,
    details: {
      badge_types: specialBadges.map((badge) => badge.type),
      force_stream_required: forceStream,
      monitor_cam_required: monitorCamRequired,
    },
    created_date: nowIso(),
  }).catch(() => null);

  await notifyUser(target.id, {
    title: "Profile badges updated",
    message: specialBadges.length > 0
      ? `Your profile badges were updated: ${specialBadges.map((badge) => badge.name).join(", ")}.`
      : "Your special profile badges were updated.",
    type: "system",
    action_url: `/profile/${target.username || target.id}`,
    related_entity_id: target.id,
    related_entity_type: "User",
  });

  return { success: true, user: publicUser(user) };
}

async function setUserTemporaryPassword(req) {
  assertStaff(req, "admin");
  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "User not found" };
  if (!canModerateUser(req.user.role, target.role)) {
    return { success: false, error: "Role hierarchy prevents updating this account" };
  }

  const temporaryPassword = String(req.body.temporary_password || "");
  if (temporaryPassword.length < 8) {
    return { success: false, error: "Temporary password must be at least 8 characters" };
  }

  const metadata = {
    ...(target.metadata || {}),
    force_password_change: true,
    temporary_password_set_by: req.user.id,
    temporary_password_set_by_name: nameFor(req.user),
    temporary_password_set_date: nowIso(),
  };
  delete metadata.password_reset_token_hash;
  delete metadata.password_reset_expires_at;

  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      password_hash: await hashPassword(temporaryPassword),
      metadata,
    },
  });

  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "temporary_password_set",
    target_user_id: target.id,
    target_username: nameFor(target),
    description: `Set a temporary password for ${nameFor(target)} and required a password change`,
    created_date: nowIso(),
  }).catch(() => null);

  return { success: true, user: publicUser(user) };
}

async function adminGrantPremium(req) {
  assertStaff(req, "admin");
  const target = await prisma.user.findUnique({ where: { id: req.body.user_id } });
  if (!target) return { success: false, error: "User not found" };
  if (!canModerateUser(req.user.role, target.role)) {
    return { success: false, error: "Role hierarchy prevents changing Premium for this account" };
  }

  const now = new Date();
  const currentExpiration = target.premium_expires ? new Date(target.premium_expires) : null;
  const validCurrentExpiration = currentExpiration && Number.isFinite(currentExpiration.getTime()) ? currentExpiration : null;
  const startsAt = validCurrentExpiration && validCurrentExpiration > now ? validCurrentExpiration : now;
  const endsAt = new Date(startsAt.getTime() + (adminPremiumGrantDays * 24 * 60 * 60 * 1000));

  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      is_premium: true,
      premium_expires: endsAt,
    },
  });

  await createEntity("PremiumMembership", {
    user_id: target.id,
    plan_type: "monthly",
    price_paid: 0,
    start_date: now.toISOString(),
    end_date: endsAt.toISOString(),
    is_active: true,
    auto_renew: false,
    source: "admin_grant",
    granted_by: req.user.id,
    granted_by_name: nameFor(req.user),
  }).catch(() => null);

  await createEntity("AdminAction", {
    admin_id: req.user.id,
    admin_name: nameFor(req.user),
    admin_role: req.user.role,
    action_type: "premium_granted",
    target_user_id: target.id,
    target_username: nameFor(target),
    description: `Granted ${adminPremiumGrantDays} days of Premium to ${nameFor(target)}`,
    details: {
      days: adminPremiumGrantDays,
      previous_expiration: validCurrentExpiration?.toISOString() || null,
      premium_expires: endsAt.toISOString(),
    },
    created_date: nowIso(),
  }).catch(() => null);

  await notifyUser(target.id, {
    title: "30 days of Premium added",
    message: `TopFragg staff granted you 30 days of Premium. Your Premium access is active until ${endsAt.toLocaleDateString("en-GB")}.`,
    type: "premium",
    action_url: `/profile/${target.username || target.id}`,
    related_entity_id: target.id,
    related_entity_type: "User",
    premium_expires: endsAt.toISOString(),
  });

  return { success: true, user: publicUser(user), premium_expires: endsAt.toISOString() };
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
  if (action === "ip_ban") {
    return { success: false, error: "IP bans are currently disabled" };
  }
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
    ban_expires: ["temporary_ban", "email_ban"].includes(action) ? expiresDate : (action === "remove_ban" ? null : (target.metadata || {}).ban_expires),
  };

  if (["ban", "temporary_ban", "email_ban"].includes(action)) {
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

  const shouldBan = ["ban", "temporary_ban", "email_ban"].includes(action);
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
  searchMessageRecipients,
  getDirectMessages,
  markDirectConversationRead,
  sendMatchRoomMessage,
  manageTeam,
  createWager,
  acceptWager,
  payWagerEntry,
  submitScore,
  completeWager,
  refundWager,
  createRankedMatch,
  acceptRankedMatch,
  ensureRankedMatchMap,
  completeRankedMatch,
  cancelRankedMatch,
  voteRankedCancellation,
  buyWithCredits,
  syncMarketplaceUnlocks,
  addFunds,
  depositToWallet: addFunds,
  adminAdjustWallet,
  adminAdjustRankedElo,
  adminUpdateRankedStats,
  adminResetRankedSeason,
  forgeMoneyToCredits,
  createStreamerTournament,
  saveStreamerSwitchEntries,
  rollStreamerSwitchTeams,
  saveStreamerSwitchTeams,
  updateStreamerTournamentMaps,
  generateStreamerSwitchBracket,
  advanceStreamerTournamentMatch,
  overturnStreamerTournamentMatch,
  moderateStreamerTournamentUser,
  registerTournament,
  leaveTournament,
  createTournament,
  updateTournament,
  deleteTournament,
  cancelTournament,
  closeTournamentRegistration,
  extendTournamentRegistration,
  withdrawFromWallet: async (req) => ({ success: true, withdrawal: await createEntity("WithdrawalRequest", { ...req.body, user_id: req.user.id, status: "pending", created_date: new Date().toISOString() }) }),
  processWithdrawal: async (req) => ({ success: true, withdrawal: await updateEntity("WithdrawalRequest", req.body.withdrawal_id, { status: req.body.status, processed_date: new Date().toISOString() }) }),
  generateTournamentBracket,
  resetTournamentBracket,
  ensureTournamentMatchSetup,
  startTournament,
  syncTournamentLifecycle,
  completeTournamentMatch,
  completeTournament: async (req) => ({ success: true, tournament: await completeTournament(req.body.tournament_id, req.body.winner_id, req.body.winner_name) }),
  createDispute,
  escalateDispute,
  moderateDispute,
  updateUserRole,
  updateUserBadges,
  setUserTemporaryPassword,
  adminGrantPremium,
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
    if (!publicCommerceEnabled && blockedPublicCommerceFunctions.has(req.params.name)) {
      return res.status(503).json({
        error: commerceUnavailableMessage,
        code: "PUBLIC_COMMERCE_DISABLED",
      });
    }
    res.json(await handler(req));
  } catch (error) {
    next(error);
  }
});

export default router;
