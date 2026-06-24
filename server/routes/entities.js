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

router.get("/:entity", requireAuth, async (req, res, next) => {
  try {
    const rows = await listEntities(
      req.params.entity,
      parseFilter(req.query.filter),
      req.query.order,
      req.query.limit
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await getEntity(req.params.entity, req.params.id));
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
