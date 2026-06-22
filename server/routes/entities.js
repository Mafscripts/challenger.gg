import { Router } from "express";
import { createEntity, deleteEntity, getEntity, listEntities, updateEntity } from "../entity.js";
import { requireAuth } from "../middleware/auth.js";
import { hasRole } from "../roles.js";

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
    res.json(await createEntity(req.params.entity, req.body || {}));
  } catch (error) {
    next(error);
  }
});

router.patch("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await updateEntity(req.params.entity, req.params.id, req.body || {}));
  } catch (error) {
    next(error);
  }
});

router.delete("/:entity/:id", requireAuth, async (req, res, next) => {
  try {
    res.json(await deleteEntity(req.params.entity, req.params.id));
  } catch (error) {
    next(error);
  }
});

export default router;
