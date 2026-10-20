import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { prisma } from "./prisma.js";
import { createEntity, firstEntity, serializeRow, updateEntity } from "./entity.js";
import { hasRole } from "./roles.js";
import { displayNameHint, displayNamePattern, normalizeAccountName, usernameHint, usernamePattern } from "../src/lib/accountNames.js";
import { ensureAccountNamesAvailable, lockAccountNames } from "./account-names.js";
import { playerAvatarFor } from "./lib/playerAvatars.js";
import { staffAvatarFor } from "../src/lib/staffAvatars.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";
const roleBadgeTypes = new Set(["ceo", "super_admin", "admin", "moderator"]);

export const safeUserMetadata = (metadata = {}) => {
  const clean = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...metadata } : {};
  if (typeof clean.avatar_url === "string" && clean.avatar_url.startsWith("data:image/")) {
    delete clean.avatar_url;
  }
  return clean;
};

export const cleanUsername = (value, fallback = "user") => {
  const cleaned = String(value || fallback)
    .split("@")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  const fallbackCleaned = String(fallback || "user").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || "user";
  const username = cleaned || fallbackCleaned;
  return username.length >= 3 ? username : `${username}___`.slice(0, 3);
};

export const normalizeUsername = (value) => normalizeAccountName(value).toLowerCase();

export const validateUsername = (value) => {
  const username = normalizeUsername(value);
  if (!username) {
    const error = new Error("Username is required");
    error.status = 400;
    throw error;
  }
  if (!usernamePattern.test(username)) {
    const error = new Error(usernameHint);
    error.status = 400;
    throw error;
  }
  return username;
};

export const validateDisplayName = (value) => {
  const displayName = normalizeAccountName(value);
  if (!displayName) {
    const error = new Error("Display name is required");
    error.status = 400;
    throw error;
  }
  if (!displayNamePattern.test(displayName)) throw Object.assign(new Error(displayNameHint), { status: 400 });
  return displayName;
};

export const displayNameFor = (user, fallbackEmail) => (
  user?.display_name ||
  user?.full_name ||
  user?.username ||
  cleanUsername(user?.email || fallbackEmail, "user")
);

export const publicUser = (user) => {
  const serialized = serializeRow(user);
  if (!serialized) return null;
  const sensitiveFields = [
    "email_verification_code",
    "email_verification_code_hash",
    "email_verification_expires_at",
    "email_verification_attempts",
    "email_verification_sent_at",
    "email_verification_resend_count",
    "email_verification_resend_window_started_at",
    "password_reset_token_hash",
    "password_reset_expires_at",
    "registration_ip",
    "last_login_ip",
    "last_seen_ip",
    "ip_history",
  ];
  sensitiveFields.forEach((field) => delete serialized[field]);
  const staffAvatar = staffAvatarFor(serialized);
  serialized.staff_avatar_url = staffAvatar || null;
  if (staffAvatar) serialized.avatar_url = staffAvatar;
  return serialized;
};

export const signUser = (user) => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

export const verifyToken = (token) => {
  const payload = jwt.verify(token, JWT_SECRET);
  // Restricted appeal credentials must never authenticate normal API or socket access.
  if (payload.scope || payload.aud) throw new Error("Restricted credential");
  return payload;
};

export const signBanAppealUser = (user) => jwt.sign({ sub: user.id, scope: "ban_appeal" }, JWT_SECRET, {
  expiresIn: "7d", audience: "topfragg-ban-appeals",
});
export const verifyBanAppealToken = (token) => {
  const payload = jwt.verify(token, JWT_SECRET, { audience: "topfragg-ban-appeals" });
  if (payload.scope !== "ban_appeal") throw new Error("Invalid appeal credential");
  return payload;
};

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const ensureUsernameAvailable = async (username, userId) => {
  await ensureAccountNamesAvailable(prisma, [username], userId);
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

  const profile = await firstEntity("PlayerProfile", { user_id: user.id }, "-created_date").catch(() => null);
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
  const updated = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current) throw Object.assign(new Error("User not found"), { status: 404 });
    // Bootstrap may fill missing identity fields, but is not a second rename API.
    for (const field of ["username", "handle", "display_name"]) {
      if (current[field] && Object.hasOwn(payload, field) && normalizeUsername(payload[field]) !== normalizeUsername(current[field])) {
        throw Object.assign(new Error("Change your username or display name in Account Settings."), { status: 400 });
      }
    }
    let username = current.username || (payload.username ? validateUsername(payload.username) : await ensureUniqueValue("username", current.email || current.id, current.id));
    // Automatically generated legacy handles also respect the shared namespace.
    if (!current.username && !payload.username) {
      const base = username;
      for (let suffix = 0; ; suffix += 1) {
        username = suffix ? `${base.slice(0, 20 - String(suffix).length - 1)}_${suffix}` : base;
        await lockAccountNames(tx, [username]);
        try { await ensureAccountNamesAvailable(tx, [username], current.id); break; }
        catch (error) { if (error.code !== "ACCOUNT_NAME_TAKEN" || suffix >= 100) throw error; }
      }
    }
    const handle = current.handle || username;
    const display_name = current.display_name || (payload.display_name ? validateDisplayName(payload.display_name) : username);
    const newNames = [!current.username && username, !current.handle && handle, !current.display_name && display_name].filter(Boolean);
    await lockAccountNames(tx, newNames);
    await ensureAccountNamesAvailable(tx, newNames, current.id);
    // Completing a profile never grants or changes staff permissions.
    const role = current.role || "user";
    const metadata = safeUserMetadata(current.metadata);
    const preservedBadges = (Array.isArray(metadata.badges) ? metadata.badges : []).filter(badge => !roleBadgeTypes.has(badge?.type));
    const badgeRole = role === "ceo" ? "admin" : role;
    const roleBadges = role !== "user" ? [{ name: badgeRole.replaceAll("_", " "), type: badgeRole }] : [];
    return tx.user.update({ where: { id: current.id }, data: {
      username, handle, display_name, region: payload.region || current.region || "na", role,
      admin_role: current.admin_role,
      is_admin: role !== "user", email_verified: current.email_verified === true,
      metadata: { ...metadata, badges: [...roleBadges, ...preservedBadges] },
    } });
  });
  const { username, handle, display_name, region } = updated;

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

  const profile = await firstEntity("PlayerProfile", { user_id: updated.id }, "-created_date") || await createEntity("PlayerProfile", {
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
  const currentProfile = identityRecords.profile || profile;
  return { user: { ...publicUser(updated), avatar_url: playerAvatarFor(updated, currentProfile) }, wallet, profile: currentProfile };
};

const isActivePremium = (user) => (
  user?.is_premium === true
  && (!user?.premium_expires || new Date(user.premium_expires).getTime() > Date.now())
);

const isSameUtcMonth = (left, right = new Date()) => {
  const date = left ? new Date(left) : null;
  if (!date || Number.isNaN(date.getTime())) return false;
  return date.getUTCFullYear() === right.getUTCFullYear()
    && date.getUTCMonth() === right.getUTCMonth();
};

export const updateUserIdentity = async (userId, payload = {}, actor = null) => {
  let charged = false;
  const user = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) throw Object.assign(new Error("User not found"), { status: 404 });
    const data = {}, names = [];
    if (Object.hasOwn(payload, "username")) {
      const username = validateUsername(payload.username);
      if (normalizeUsername(current.username) !== username) {
        data.username = username; data.handle = username; names.push(username);
        const privileged = actor && hasRole(actor, "moderator");
        const metadata = safeUserMetadata(current.metadata);
        if (!privileged) {
          if (isActivePremium(current)) {
            if (isSameUtcMonth(metadata.username_change_last_at)) throw Object.assign(new Error("Premium members can change their username once per month. Your next free change is available next month."), { status: 429 });
          } else {
            if (Number(current.credits || 0) < 5) throw Object.assign(new Error("Changing your username costs 5 credits. You need at least 5 credits."), { status: 400 });
            data.credits = { decrement: 5 }; charged = true;
          }
          data.metadata = { ...metadata, username_change_last_at: new Date().toISOString() };
        }
      }
    }
    if (Object.hasOwn(payload, "display_name")) {
      // Existing legacy names are not silently renamed by an unrelated save.
      if (normalizeAccountName(payload.display_name) !== current.display_name) {
        data.display_name = validateDisplayName(payload.display_name); names.push(data.display_name);
      }
    }
    if (!Object.keys(data).length) return current;
    await lockAccountNames(tx, names);
    await ensureAccountNamesAvailable(tx, names, userId);
    return tx.user.update({ where: { id: userId }, data });
  });
  if (charged) await createEntity("CreditTransaction", {
    user_id: userId, amount: -5, type: "username_change", description: "Username change",
    created_date: new Date().toISOString(), balance_after: user.credits,
  }).catch(() => null);
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
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    const error = new Error("Enter a valid email address");
    error.status = 400;
    throw error;
  }
  const passwordBytes = Buffer.byteLength(password, "utf8");
  if (passwordBytes < 8 || passwordBytes > 72) {
    const error = new Error("Password must be between 8 and 72 characters");
    error.status = 400;
    throw error;
  }

  await ensureAccountNamesAvailable(prisma, [username, cleanDisplayName]);
  const password_hash = await hashPassword(password);
  try {
    return await prisma.$transaction(async tx => {
      await lockAccountNames(tx, [username, cleanDisplayName]);
      await ensureAccountNamesAvailable(tx, [username, cleanDisplayName]);
      if (await tx.user.findUnique({ where: { email: normalizedEmail } })) throw Object.assign(new Error("Email already registered"), { status: 409 });
      return tx.user.create({ data: {
        email: normalizedEmail, password_hash, username, handle: username, display_name: cleanDisplayName,
        role: "user", admin_role: null, is_admin: false, email_verified: false,
      } });
    });
  } catch (error) {
    if (error.code === "P2002") throw Object.assign(new Error(String(error.meta?.target || "").includes("email") ? "Email already registered" : "This name is already taken. Choose a different name."), { status: 409 });
    throw error;
  }
};
