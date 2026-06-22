import { Router } from "express";
import { prisma } from "../prisma.js";
import {
  createUserWithPassword,
  ensureUserRecords,
  publicUser,
  signUser,
  updateUserIdentity,
  verifyPassword,
} from "../auth.js";
import { requireAuth } from "../middleware/auth.js";
import { dataForEntity } from "../entity.js";

const router = Router();

router.post("/register", async (req, res, next) => {
  try {
    const user = await createUserWithPassword(req.body || {});
    const bootstrap = await ensureUserRecords(user);
    res.json({
      access_token: signUser(user),
      user: bootstrap.user,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user?.password_hash || !await verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const bootstrap = await ensureUserRecords(user);
    res.json({
      access_token: signUser(user),
      user: bootstrap.user,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json(req.user);
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.user.id } });
    const { username, display_name, ...rest } = req.body || {};
    let user = current;
    if (Object.keys(rest).length > 0) {
      user = await prisma.user.update({
        where: { id: req.user.id },
        data: dataForEntity("User", rest, current?.metadata),
      });
    }
    const identityPayload = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "username")) identityPayload.username = username;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "display_name")) identityPayload.display_name = display_name;
    if (Object.keys(identityPayload).length > 0) {
      user = await updateUserIdentity(req.user.id, identityPayload);
    }
    res.json(publicUser(user));
  } catch (error) {
    next(error);
  }
});

router.post("/bootstrap", requireAuth, async (req, res, next) => {
  try {
    const result = await ensureUserRecords(req.userRow, req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/verify-otp", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: String(req.body?.email || "").toLowerCase() } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ access_token: signUser(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/resend-otp", (_req, res) => {
  res.json({ success: true });
});

router.post("/reset-password", (_req, res) => {
  res.status(501).json({ error: "Password reset email delivery is not configured yet." });
});

export default router;
