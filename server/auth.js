import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { prisma } from "./prisma.js";
import { createEntity, firstEntity, serializeRow, updateEntity } from "./entity.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const DISPLAY_NAME_MAX_LENGTH = 60;

export const cleanUsername = (value, fallback = "user") => {
  const cleaned = String(value || fallback)
    .split("@")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  const fallbackCleaned = String(fallback || "user").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "user";
  const username = cleaned || fallbackCleaned;
  return username.length >= 3 ? username : `${username}___`.slice(0, 3);
};

export const normalizeUsername = (value) => String(value || "").trim().toLowerCase();

export const validateUsername = (value) => {
  const username = normalizeUsername(value);
  if (!username) {
    const error = new Error("Username is required");
    error.status = 400;
    throw error;
  }
  if (!USERNAME_PATTERN.test(username)) {
    const error = new Error("Username must be 3-20 characters and use only letters, numbers, or underscore");
    error.status = 400;
    throw error;
  }
  return username;
};

export const validateDisplayName = (value) => {
  const displayName = String(value || "").trim().replace(/\s+/g, " ").slice(0, DISPLAY_NAME_MAX_LENGTH);
  if (!displayName) {
    const error = new Error("Display name is required");
    error.status = 400;
    throw error;
  }
  return displayName;
};

export const displayNameFor = (user, fallbackEmail) => (
  user?.display_name ||
  user?.full_name ||
  user?.username ||
  cleanUsername(user?.email || fallbackEmail, "user")
);

export const publicUser = (user) => serializeRow(user);

export const signUser = (user) => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const ensureUsernameAvailable = async (username, userId) => {
  const existingUsername = await prisma.user.findFirst({ where: { username } });
  if (existingUsername && existingUsername.id !== userId) {
    const error = new Error("Username is already taken");
    error.status = 409;
    throw error;
  }

  const existingHandle = await prisma.user.findFirst({ where: { handle: username } });
  if (existingHandle && existingHandle.id !== userId) {
    const error = new Error("Username is already taken");
    error.status = 409;
    throw error;
  }
};

export const ensureUniqueValue = async (field, base, userId) => {
  let candidate = cleanUsername(base).toLowerCase();
  const existing = await prisma.user.findFirst({ where: { [field]: candidate } });
  if (!existing || existing.id === userId) return candidate;

  for (let index = 1; index < 50; index += 1) {
    const suffix = `_${index}`;
    const next = `${candidate.slice(0, 20 - suffix.length)}${suffix}`;
    const row = await prisma.user.findFirst({ where: { [field]: next } });
    if (!row || row.id === userId) return next;
  }

  return `${candidate.slice(0, 13)}_${Date.now().toString(36).slice(-6)}`;
};

export const syncUserIdentityRecords = async (user) => {
  const identity = {
    username: user.username,
    handle: user.handle || user.username,
    display_name: user.display_name,
  };

  const profile = await firstEntity("PlayerProfile", { user_id: user.id }).catch(() => null);
  const rankedStats = await firstEntity("RankedStats", { user_id: user.id }).catch(() => null);
  const xpStats = await firstEntity("XPStats", { user_id: user.id }).catch(() => null);

  const [updatedProfile] = await Promise.all([
    profile ? updateEntity("PlayerProfile", profile.id, identity).catch(() => profile) : Promise.resolve(null),
    rankedStats ? updateEntity("RankedStats", rankedStats.id, identity).catch(() => rankedStats) : Promise.resolve(null),
    xpStats ? updateEntity("XPStats", xpStats.id, identity).catch(() => xpStats) : Promise.resolve(null),
  ]);

  return { profile: updatedProfile || profile };
};

export const ensureUserRecords = async (user, payload = {}) => {
  let username = user.username;
  if (payload.username) {
    username = validateUsername(payload.username);
    await ensureUsernameAvailable(username, user.id);
  } else if (!username) {
    username = await ensureUniqueValue("username", user.email || user.id, user.id);
  }

  const handle = payload.handle
    ? await ensureUniqueValue("handle", payload.handle, user.id)
    : (user.handle || await ensureUniqueValue("handle", username, user.id));
  const display_name = payload.display_name
    ? validateDisplayName(payload.display_name)
    : displayNameFor(user, user.email);
  const region = payload.region || user.region || "na";

  const usersCount = await prisma.user.count();
  const ceoExists = await prisma.user.findFirst({ where: { role: "ceo" } });
  const shouldBeCeo = user.role === "ceo" || !ceoExists || usersCount <= 1;
  const role = shouldBeCeo ? "ceo" : (user.role || "user");
  const adminRole = shouldBeCeo ? "ceo" : user.admin_role;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      username,
      handle,
      display_name,
      region,
      role,
      admin_role: adminRole,
      is_admin: role !== "user",
      email_verified: true,
      metadata: {
        ...(user.metadata || {}),
        badges: role !== "user" ? [{ name: role === "ceo" ? "CEO" : role.replace("_", " "), type: role }] : [],
      },
    },
  });

  const wallet = await firstEntity("Wallet", { user_id: updated.id }) || await createEntity("Wallet", {
    user_id: updated.id,
    available_balance: updated.wallet_balance || 0,
    pending_balance: 0,
    escrow_balance: 0,
    withdrawable_balance: updated.wallet_balance || 0,
    total_deposits: 0,
    total_withdrawals: 0,
    total_earnings: 0,
    total_wagered: 0,
  });

  const profile = await firstEntity("PlayerProfile", { user_id: updated.id }) || await createEntity("PlayerProfile", {
    user_id: updated.id,
    display_name,
    handle,
    username,
    region,
    account_created_date: updated.account_created_date.toISOString(),
  });

  if (!await firstEntity("RankedStats", { user_id: updated.id })) {
    await createEntity("RankedStats", {
      user_id: updated.id,
      username,
      display_name,
      region,
      season: "Season 1",
      elo: 0,
      wins: 0,
      losses: 0,
      matches_played: 0,
      win_streak: 0,
      peak_elo: 0,
    });
  }

  if (!await firstEntity("XPStats", { user_id: updated.id })) {
    await createEntity("XPStats", {
      user_id: updated.id,
      username,
      display_name,
      region,
      season: "Season 1",
      level: updated.xp_level || 1,
      total_xp: 0,
      current_xp: 0,
      xp_to_next_level: 1000,
      prestige: 0,
      weekly_xp: 0,
      win_streak: 0,
    });
  }

  const identityRecords = await syncUserIdentityRecords(updated);
  return { user: publicUser(updated), wallet, profile: identityRecords.profile || profile };
};

export const updateUserIdentity = async (userId, payload = {}) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(payload, "username")) {
    const username = validateUsername(payload.username);
    await ensureUsernameAvailable(username, userId);
    data.username = username;
    data.handle = username;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "display_name")) {
    data.display_name = validateDisplayName(payload.display_name);
  }

  if (Object.keys(data).length === 0) {
    return prisma.user.findUnique({ where: { id: userId } });
  }

  const user = await prisma.user.update({ where: { id: userId }, data });
  await syncUserIdentityRecords(user);
  return user;
};

export const createUserWithPassword = async ({ email, password, username: rawUsername, display_name, displayName }) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const username = validateUsername(rawUsername);
  const cleanDisplayName = validateDisplayName(display_name || displayName);

  if (!normalizedEmail || !password) {
    const error = new Error("Email and password are required");
    error.status = 400;
    throw error;
  }

  await ensureUsernameAvailable(username);

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    const error = new Error("Email already registered");
    error.status = 409;
    throw error;
  }

  const userCount = await prisma.user.count();
  const role = userCount === 0 ? "ceo" : "user";
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      password_hash: await hashPassword(password),
      username,
      handle: username,
      display_name: cleanDisplayName,
      role,
      admin_role: role === "ceo" ? "ceo" : null,
      is_admin: role === "ceo",
      email_verified: true,
    },
  });

  await ensureUserRecords(user, { username, handle: username, display_name: cleanDisplayName });
  return prisma.user.findUnique({ where: { id: user.id } });
};
