import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { createEntity } from "./entity.js";

const PROGRAM_KEY = "default";
const defaultProgram = {
  enabled: true,
  max_rewards: 250,
  reward_credits: 5,
};

const cleanCode = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9_-]/g, "")
  .slice(0, 40);

const referralCodeBase = (user) => {
  const name = String(user?.username || user?.handle || user?.display_name || "PLAYER")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16) || "PLAYER";
  return `TOP-${name}`;
};

export const ensureReferralProgram = async () => prisma.referralProgram.upsert({
  where: { key: PROGRAM_KEY },
  update: {},
  create: { key: PROGRAM_KEY, ...defaultProgram },
});

export const ensureReferralCode = async (user) => {
  const existing = await prisma.referralCode.findUnique({ where: { user_id: user.id } });
  if (existing) return existing;

  const base = referralCodeBase(user);
  for (let index = 0; index < 20; index += 1) {
    const suffix = index === 0 ? "" : `-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const code = `${base}${suffix}`.slice(0, 40);
    try {
      return await prisma.referralCode.create({ data: { user_id: user.id, code } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      const owner = await prisma.referralCode.findUnique({ where: { user_id: user.id } });
      if (owner) return owner;
    }
  }
  throw new Error("Could not create referral code");
};

export const normalizeReferralCode = cleanCode;

export const applyReferralReward = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { rewarded: false, user: null };

  const pendingCode = cleanCode(user.metadata?.pending_referral_code);
  if (!pendingCode || user.metadata?.referral_processed_at) return { rewarded: false, user };

  const clearPendingReferral = (metadata = user.metadata || {}) => {
    const next = { ...(metadata || {}) };
    delete next.pending_referral_code;
    next.referral_processed_at = new Date().toISOString();
    return next;
  };

  let outcome = { rewarded: false, user };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUnique({ where: { id: userId } });
        if (!current || current.metadata?.referral_processed_at) return { rewarded: false, user: current };

        const nextMetadata = clearPendingReferral(current.metadata);
        const code = await tx.referralCode.findUnique({ where: { code: pendingCode } });
        const program = await tx.referralProgram.upsert({
          where: { key: PROGRAM_KEY },
          update: {},
          create: { key: PROGRAM_KEY, ...defaultProgram },
        });
        const existingReward = await tx.referralReward.findUnique({ where: { referred_user_id: current.id } });
        const isEligible = Boolean(code && code.user_id !== current.id && program.enabled && !existingReward);
        const rewardCount = isEligible ? await tx.referralReward.count() : 0;

        if (!isEligible || rewardCount >= program.max_rewards) {
          const updated = await tx.user.update({ where: { id: current.id }, data: { metadata: nextMetadata } });
          return { rewarded: false, user: updated };
        }

        const reward = await tx.referralReward.create({
          data: {
            referred_user_id: current.id,
            referrer_user_id: code.user_id,
            referral_code_id: code.id,
            credits: program.reward_credits,
          },
        });
        const updated = await tx.user.update({
          where: { id: current.id },
          data: { credits: { increment: program.reward_credits }, metadata: nextMetadata },
        });
        return { rewarded: true, user: updated, reward, program };
      }, { isolationLevel: "Serializable" });
      break;
    } catch (error) {
      if (attempt === 2 || !["P2034", "P2002"].includes(error?.code)) throw error;
    }
  }

  if (outcome.rewarded) {
    await createEntity("Notification", {
      user_id: outcome.user.id,
      type: "reward",
      title: "Referral reward unlocked",
      message: `Welcome to Topfragg — ${outcome.reward.credits.toLocaleString()} credits were added to your account for joining with an invite link.`,
      is_read: false,
      action_url: "/settings#referrals",
      related_entity_id: outcome.reward.id,
      related_entity_type: "ReferralReward",
      created_date: new Date().toISOString(),
    }).catch(() => null);
  }
  return outcome;
};
