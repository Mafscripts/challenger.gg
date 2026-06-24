import { Router } from "express";
import { createEntity, deleteEntity, getEntity, listEntities, updateEntity } from "../entity.js";
import { requireAuth } from "../middleware/auth.js";
import { hasRole } from "../roles.js";

const adminManagedEntities = new Set([
  "Tournament",
  "MarketplaceItem",
  "WithdrawalRequest",
  "Ban",
  "AdminAction",
  "AdminAlert",
]);

const roleFields = new Set(["role", "admin_role", "is_admin"]);

const router = Router();

const parseFilter = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const participantIncludesUser = (participant, userId) => {
  if (!participant || !userId) return false;
  return (
    String(participant.user_id || "") === String(userId)
    || String(participant.captain_id || "") === String(userId)
    || (Array.isArray(participant.members) && participant.members.some((member) => String(member?.user_id || "") === String(userId)))
  );
};

const participantMatchesTournamentMatch = (participant, match) => {
  if (!participant || !match) return false;
  const participantIds = [
    participant.id,
    participant.team_id,
    participant.user_id,
    participant.captain_id,
  ].filter(Boolean).map(String);
  const matchIds = [
    match.team_a_participant_id,
    match.team_b_participant_id,
    match.team_a_id,
    match.team_b_id,
  ].filter(Boolean).map(String);
  return participantIds.some((id) => matchIds.includes(id));
};

const canViewTournamentMatch = async (_req, match) => Boolean(match?.tournament_id);

const canViewTournamentChat = async (req, conversationId) => {
  if (hasRole(req.user, "moderator")) return true;
  const match = await getEntity("TournamentMatch", conversationId).catch(() => null);
  if (!match?.tournament_id) return true;
  const participants = await listEntities("TournamentParticipant", { tournament_id: match.tournament_id }, "seed", 500).catch(() => []);
  return participants.some((participant) => (
    participantIncludesUser(participant, req.user.id)
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

const visibleTournamentParticipants = async (_req, rows) => rows;

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

router.get("/:entity", requireAuth, async (req, res, next) => {
  try {
    const filter = parseFilter(req.query.filter);
    const rows = await listEntities(
      req.params.entity,
      filter,
      req.query.order,
      req.query.limit
    );
    if (req.params.entity === "TournamentParticipant") {
      return res.json(await visibleTournamentParticipants(req, rows, filter));
    }
    if (req.params.entity === "TournamentMatch") {
      return res.json(await visibleTournamentMatches(req, rows, filter));
    }
    if (req.params.entity === "Wager") {
      return res.json(await visibleWagers(req, rows));
    }
    if (req.params.entity === "ChatMessage") {
      return res.json(await visibleChatMessages(req, rows));
    }
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    const row = await getEntity(req.params.entity, req.params.id);
    if (req.params.entity === "TournamentMatch" && !await canViewTournamentMatch(req, row)) {
      return res.status(403).json({ error: "Tournament match is not available" });
    }
    if (req.params.entity === "Wager" && !await canViewWager(req, row)) {
      return res.status(403).json({ error: "Only wager participants can view this match" });
    }
    if (req.params.entity === "ChatMessage" && row.match_type === "tournament" && !await canViewTournamentChat(req, row.conversation_id)) {
      return res.status(403).json({ error: "Only tournament match participants can view this chat" });
    }
    res.json(row);
  } catch (error) {
    next(error);
  }
});

router.post("/:entity", requireAuth, async (req, res, next) => {
  try {
    if (req.params.entity === "Tournament" && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin or higher is required to create tournaments" });
    }
    if (["AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "moderator")) {
      return res.status(403).json({ error: "Moderator access required" });
    }
    if (adminManagedEntities.has(req.params.entity) && !["AdminAction", "AdminAlert"].includes(req.params.entity) && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    res.json(await createEntity(req.params.entity, req.body || {}));
  } catch (error) {
    next(error);
  }
});

router.patch("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    if (adminManagedEntities.has(req.params.entity) && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    if (req.params.entity === "User") {
      const payload = req.body || {};
      const changingRole = Object.keys(payload).some((key) => roleFields.has(key));
      const changingModeration = ["is_banned", "ban_reason"].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
      if (changingRole) return res.status(403).json({ error: "Use role management actions" });
      if (changingModeration) return res.status(403).json({ error: "Use moderation actions" });
      if (req.params.id !== req.user.id && !hasRole(req.user, "moderator")) return res.status(403).json({ error: "Cannot update another user" });
    }
    res.json(await updateEntity(req.params.entity, req.params.id, req.body || {}));
  } catch (error) {
    next(error);
  }
});

router.delete("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    if (adminManagedEntities.has(req.params.entity) && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    res.json(await deleteEntity(req.params.entity, req.params.id));
  } catch (error) {
    next(error);
  }
});

export default router;
