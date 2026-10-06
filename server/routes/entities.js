import { Router } from "express";
import { createEntity, deleteEntity, getEntity, listEntities, updateEntity } from "../entity.js";
import { requireAuth } from "../middleware/auth.js";
import { hasRole } from "../roles.js";

const protectedMutationEntities = new Set([
  // These records contain match results, escrow, support state, or bracket
  // routing and must only be changed through their server-side actions.
  "Wager",
  "WagerParticipant",
  "RankedMatch",
  "RankedParticipant",
  "TournamentMatch",
  "TournamentParticipant",
  "Dispute",
  "Ticket",
  "WithdrawalRequest",
  "Wallet",
  "WalletTransaction",
  "CreditTransaction",
  "CreditPurchase",
  "Purchase",
  "UserInventory",
  "Inventory",
  "PremiumMembership",
]);

const adminManagedEntities = new Set([
  "Tournament",
  "MarketplaceItem",
  "WithdrawalRequest",
  "Wallet",
  "WalletTransaction",
  "CreditTransaction",
  "CreditPurchase",
  "Purchase",
  "UserInventory",
  "Inventory",
  "PremiumMembership",
  "Ban",
  "AdminAction",
  "AdminAlert",
]);

const roleFields = new Set(["role", "admin_role", "is_admin"]);
const economyUserFields = new Set([
  "credits",
  "wallet_balance",
  "lifetime_earnings",
  "total_wager_earnings",
  "biggest_wager_win",
  "is_premium",
  "premium_expires",
]);
const discordIdentityFields = new Set([
  "discord_user_id",
  "discord_username",
  "discord_display_name",
  "discord_avatar_url",
  "discord_connected_at",
]);
const sensitiveReadEntities = new Set([
  "WalletTransaction",
  "CreditTransaction",
  "CreditPurchase",
  "Purchase",
  "WithdrawalRequest",
  "PremiumMembership",
]);
const ownTransactionReadEntities = new Set(["WalletTransaction", "CreditTransaction", "CreditPurchase"]);

const cleanName = (value) => String(value || "").trim().toLowerCase();
const nameFor = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";

const identityValuesFor = (value) => [
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

const participantIdentityValues = (participant) => {
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
};

const router = Router();
const sensitiveIpFields = new Set([
  "ip",
  "ip_address",
  "ip_addresses",
  "registration_ip",
  "last_login_ip",
  "ip_history",
]);

const redactIpData = (value) => {
  if (Array.isArray(value)) return value.map(redactIpData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveIpFields.has(key))
      .map(([key, nestedValue]) => [key, redactIpData(nestedValue)]),
  );
};

const protectIpVisibility = (req, value) => hasRole(req.user, "admin") ? value : redactIpData(value);
const privateOtherUserFields = new Set([
  "email", "email_verified", "credits", "wallet_balance", "discord_user_id",
  "twitch_user_id", "ban_reason", "email_verification_code", "email_verification_code_hash",
  "email_verification_expires_at", "password_reset_token_hash", "password_reset_expires_at",
]);
const visibleUser = (req, row) => {
  if (!row || hasRole(req.user, "admin") || String(row.id) === String(req.user.id)) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => !privateOtherUserFields.has(key)));
};
const belongsToMessageUser = (row, userId) => (
  String(row?.sender_id || "") === String(userId)
  || String(row?.recipient_id || "") === String(userId)
);
const belongsToTradeUser = (row, userId) => (
  String(row?.sender_id || "") === String(userId)
  || String(row?.recipient_id || "") === String(userId)
);

const parseFilter = (value) => {
  if (!value) return {};
  if (typeof value === "object") return Array.isArray(value) ? {} : value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const participantIncludesUser = (participant, userId) => {
  if (!participant || !userId) return false;
  const user = typeof userId === "object" ? userId : { id: userId };
  const currentUserId = String(user.id || "");
  if (
    String(participant.user_id || "") === currentUserId
    || String(participant.captain_id || "") === currentUserId
    || (Array.isArray(participant.members) && participant.members.some((member) => String(member?.user_id || "") === currentUserId))
  ) {
    return true;
  }

  const userKeys = new Set(identityValuesFor(user).map(cleanName).filter(Boolean));
  return participantIdentityValues(participant).some((value) => userKeys.has(cleanName(value)));
};

const participantMatchesTournamentMatch = (participant, match) => {
  if (!participant || !match) return false;
  const memberIds = Array.isArray(participant.members)
    ? participant.members.map((member) => member?.user_id).filter(Boolean)
    : [];
  const participantIds = [
    participant.id,
    participant.team_id,
    participant.user_id,
    participant.captain_id,
    ...memberIds,
  ].filter(Boolean).map(String);
  const matchIds = [
    match.team_a_participant_id,
    match.team_b_participant_id,
    match.team_a_id,
    match.team_b_id,
  ].filter(Boolean).map(String);
  if (participantIds.some((id) => matchIds.includes(id))) return true;

  const participantName = cleanName(participant.team_name || participant.user_name || participant.name);
  return Boolean(participantName && [
    cleanName(match.team_a_name),
    cleanName(match.team_b_name),
  ].includes(participantName));
};

const canViewTournamentMatch = async (_req, match) => Boolean(match?.tournament_id);

const canViewTournamentChat = async (req, conversationId) => {
  if (hasRole(req.user, "moderator")) return true;
  const match = await getEntity("TournamentMatch", conversationId).catch(() => null);
  if (!match?.tournament_id) return true;
  const participants = await listEntities("TournamentParticipant", { tournament_id: match.tournament_id }, "seed", 500).catch(() => []);
  return participants.some((participant) => (
    participantIncludesUser(participant, req.user)
    && participantMatchesTournamentMatch(participant, match)
  ));
};

const canViewWager = async (req, wager) => {
  if (hasRole(req.user, "moderator")) return true;
  if (!wager?.id) return false;
  if (String(wager.host_id || "") === String(req.user.id) || String(wager.challenger_id || "") === String(req.user.id)) return true;
  const participants = await listEntities("WagerParticipant", { wager_id: wager.id }, "-joined_date", 100).catch(() => []);
  return participants.some((participant) => String(participant.user_id || "") === String(req.user.id));
};

const refreshTournamentParticipantNames = async (participant) => {
  if (!participant?.id) return participant;
  const members = Array.isArray(participant.members) ? participant.members : [];
  const freshMembers = await Promise.all(members.map(async (member) => {
    if (!member?.user_id) return member;
    const user = await getEntity("User", member.user_id).catch(() => null);
    if (!user) return member;
    return {
      ...member,
      user_name: nameFor(user),
      username: user.username || member.username,
      handle: user.handle || member.handle,
      display_name: user.display_name || member.display_name,
    };
  }));

  const captain = participant.captain_id ? await getEntity("User", participant.captain_id).catch(() => null) : null;
  const patch = {};
  if (captain && participant.captain_name !== nameFor(captain)) {
    patch.captain_name = nameFor(captain);
  }
  if (JSON.stringify(freshMembers) !== JSON.stringify(members)) {
    patch.members = freshMembers;
  }

  if (Object.keys(patch).length === 0) return participant;
  return updateEntity("TournamentParticipant", participant.id, patch).catch(() => ({
    ...participant,
    ...patch,
  }));
};

const visibleTournamentParticipants = async (_req, rows) => Promise.all((rows || []).map(refreshTournamentParticipantNames));

const visibleTournamentMatches = async (_req, rows) => rows;

const visibleChatMessages = async (req, rows) => {
  const visible = await Promise.all(rows.map(async (message) => {
    if (message.match_type !== "tournament") return message;
    return await canViewTournamentChat(req, message.conversation_id) ? message : null;
  }));
  return visible.filter(Boolean);
};

const visibleWagers = async (req, rows) => {
  if (hasRole(req.user, "moderator")) return rows;
  const visible = await Promise.all(rows.map(async (wager) => {
    if (["open", "registration"].includes(wager.status || "open")) return wager;
    return await canViewWager(req, wager) ? wager : null;
  }));
  return visible.filter(Boolean);
};

const visibleTickets = (req, rows) => {
  if (hasRole(req.user, "moderator")) return rows;
  return rows.filter((ticket) => (
    String(ticket.user_id || "") === String(req.user.id)
    || (ticket.participant_user_ids || []).some((userId) => String(userId) === String(req.user.id))
  ));
};

router.get("/:entity", requireAuth, async (req, res, next) => {
  try {
    if (sensitiveReadEntities.has(req.params.entity) && !ownTransactionReadEntities.has(req.params.entity) && !hasRole(req.user, "admin")) {
      // User-scoped wallet/inventory data is exposed through the authenticated
      // bootstrap/API instead of the unrestricted entity listing endpoint.
      return res.status(403).json({ error: "Admin access required" });
    }
    if (["Ban", "AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "moderator")) {
      return res.status(403).json({ error: "Moderator access required" });
    }
    const filter = parseFilter(req.query.filter);
    if (ownTransactionReadEntities.has(req.params.entity) && !hasRole(req.user, "admin")) {
      filter.user_id = req.user.id;
    }
    if (req.params.entity === "Notification" && !hasRole(req.user, "admin")) {
      filter.user_id = req.user.id;
    }
    const rows = await listEntities(
      req.params.entity,
      filter,
      req.query.order,
      req.query.limit
    );
    if (["Wallet", "UserInventory", "Inventory", "Purchase"].includes(req.params.entity) && !hasRole(req.user, "admin")) {
      const userScopedRows = rows.filter((row) => String(row.user_id || "") === String(req.user.id));
      return res.json(protectIpVisibility(req, userScopedRows));
    }
    if (req.params.entity === "Message" && !hasRole(req.user, "admin")) {
      return res.json(protectIpVisibility(req, rows.filter((row) => belongsToMessageUser(row, req.user.id))));
    }
    if (req.params.entity === "TradeOffer" && !hasRole(req.user, "admin")) {
      return res.json(protectIpVisibility(req, rows.filter((row) => belongsToTradeUser(row, req.user.id))));
    }
    if (req.params.entity === "User") {
      return res.json(protectIpVisibility(req, rows.map((row) => visibleUser(req, row))));
    }
    if (req.params.entity === "TournamentParticipant") {
      return res.json(protectIpVisibility(req, await visibleTournamentParticipants(req, rows, filter)));
    }
    if (req.params.entity === "TournamentMatch") {
      return res.json(protectIpVisibility(req, await visibleTournamentMatches(req, rows, filter)));
    }
    if (req.params.entity === "Wager") {
      return res.json(protectIpVisibility(req, await visibleWagers(req, rows)));
    }
    if (req.params.entity === "ChatMessage") {
      return res.json(protectIpVisibility(req, await visibleChatMessages(req, rows)));
    }
    if (req.params.entity === "Ticket") {
      return res.json(protectIpVisibility(req, visibleTickets(req, rows)));
    }
    res.json(protectIpVisibility(req, rows));
  } catch (error) {
    next(error);
  }
});

router.get("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    if (sensitiveReadEntities.has(req.params.entity) && !ownTransactionReadEntities.has(req.params.entity) && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    if (["Ban", "AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "moderator")) {
      return res.status(403).json({ error: "Moderator access required" });
    }
    const row = await getEntity(req.params.entity, req.params.id);
    if (ownTransactionReadEntities.has(req.params.entity) && !hasRole(req.user, "admin") && String(row.user_id || "") !== String(req.user.id)) {
      return res.status(403).json({ error: "You cannot view this transaction" });
    }
    if (req.params.entity === "Notification" && !hasRole(req.user, "admin") && String(row.user_id || "") !== String(req.user.id)) {
      return res.status(403).json({ error: "You cannot view this notification" });
    }
    if (req.params.entity === "Message" && !hasRole(req.user, "admin") && !belongsToMessageUser(row, req.user.id)) {
      return res.status(403).json({ error: "You cannot view this message" });
    }
    if (req.params.entity === "TradeOffer" && !hasRole(req.user, "admin") && !belongsToTradeUser(row, req.user.id)) {
      return res.status(403).json({ error: "You cannot view this trade" });
    }
    if (["Wallet", "UserInventory", "Inventory", "Purchase"].includes(req.params.entity)
      && !hasRole(req.user, "admin")
      && String(row?.user_id || "") !== String(req.user.id)) {
      return res.status(403).json({ error: "You cannot view this record" });
    }
    if (req.params.entity === "Ticket" && visibleTickets(req, [row]).length === 0) {
      return res.status(403).json({ error: "You cannot view this ticket" });
    }
    if (req.params.entity === "TournamentMatch" && !await canViewTournamentMatch(req, row)) {
      return res.status(403).json({ error: "Tournament match is not available" });
    }
    if (req.params.entity === "Wager" && !await canViewWager(req, row)) {
      return res.status(403).json({ error: "Only wager participants can view this match" });
    }
    if (req.params.entity === "ChatMessage" && row.match_type === "tournament" && !await canViewTournamentChat(req, row.conversation_id)) {
      return res.status(403).json({ error: "Only tournament match participants can view this chat" });
    }
    res.json(protectIpVisibility(req, req.params.entity === "User" ? visibleUser(req, row) : row));
  } catch (error) {
    next(error);
  }
});

router.post("/:entity", requireAuth, async (req, res, next) => {
  try {
    if (["Message", "Notification", "TradeOffer"].includes(req.params.entity)) {
      return res.status(403).json({ error: "Use a protected action for this record" });
    }
    if (req.params.entity === "ChatMessage") {
      return res.status(403).json({ error: "Use the protected chat message action" });
    }
    if (req.params.entity === "Tournament" && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin or higher is required to create tournaments" });
    }
    if (req.params.entity === "User" && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Accounts can only be created through registration" });
    }
    if (protectedMutationEntities.has(req.params.entity)) {
      return res.status(403).json({ error: "Use the protected action for this record" });
    }
    if (["AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "moderator")) {
      return res.status(403).json({ error: "Moderator access required" });
    }
    if (adminManagedEntities.has(req.params.entity) && !["AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    res.json(protectIpVisibility(req, await createEntity(req.params.entity, req.body || {})));
  } catch (error) {
    next(error);
  }
});

router.patch("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.params.entity === "TradeOffer") {
      return res.status(403).json({ error: "Trading actions are unavailable" });
    }
    if (["Message", "Notification"].includes(req.params.entity) && !hasRole(req.user, "admin")) {
      const row = await getEntity(req.params.entity, req.params.id);
      const ownerId = req.params.entity === "Message" ? row.recipient_id : row.user_id;
      const payload = req.body || {};
      if (String(ownerId || "") !== String(req.user.id)
        || Object.keys(payload).length !== 1
        || payload.is_read !== true) {
        return res.status(403).json({ error: "Only the recipient can mark this record as read" });
      }
    }
    if (req.params.entity === "ChatMessage") {
      return res.status(403).json({ error: "Chat messages cannot be edited directly" });
    }
    if (protectedMutationEntities.has(req.params.entity)) {
      return res.status(403).json({ error: "Use the protected action for this record" });
    }
    if (["AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "moderator")) {
      return res.status(403).json({ error: "Moderator access required" });
    }
    if (adminManagedEntities.has(req.params.entity) && !["AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    if (req.params.entity === "User") {
      const payload = req.body || {};
      const changingRole = Object.keys(payload).some((key) => roleFields.has(key));
      const changingModeration = ["is_banned", "ban_reason"].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
      const changingEconomy = Object.keys(payload).some((key) => economyUserFields.has(key));
      const changingDiscordIdentity = Object.keys(payload).some((key) => discordIdentityFields.has(key));
      if (changingRole) return res.status(403).json({ error: "Use role management actions" });
      if (changingModeration) return res.status(403).json({ error: "Use moderation actions" });
      if (changingEconomy && !hasRole(req.user, "admin")) {
        return res.status(403).json({ error: "Only admins can change account balances or premium access" });
      }
      if (changingDiscordIdentity) {
        return res.status(403).json({ error: "Use the Discord connection settings to change a Discord identity" });
      }
      if (req.params.id !== req.user.id && !hasRole(req.user, "moderator")) return res.status(403).json({ error: "Cannot update another user" });
    }
    res.json(protectIpVisibility(req, await updateEntity(req.params.entity, req.params.id, req.body || {})));
  } catch (error) {
    next(error);
  }
});

router.delete("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    if (["Message", "TradeOffer"].includes(req.params.entity)) {
      return res.status(403).json({ error: "This record cannot be deleted directly" });
    }
    if (req.params.entity === "Notification" && !hasRole(req.user, "admin")) {
      const row = await getEntity("Notification", req.params.id);
      if (String(row.user_id || "") !== String(req.user.id)) {
        return res.status(403).json({ error: "You cannot delete this notification" });
      }
    }
    if (req.params.entity === "ChatMessage") {
      return res.status(403).json({ error: "Use a protected moderation action" });
    }
    if (protectedMutationEntities.has(req.params.entity)) {
      return res.status(403).json({ error: "Protected records cannot be deleted directly" });
    }
    if (adminManagedEntities.has(req.params.entity) && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    res.json(await deleteEntity(req.params.entity, req.params.id));
  } catch (error) {
    next(error);
  }
});

export default router;
