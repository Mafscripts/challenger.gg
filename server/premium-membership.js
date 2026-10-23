import { MEMBER_TIERS, activePremium, membershipProgress } from "../src/lib/premiumMembership.js";
import { serializeRow } from "./entity.js";

export async function getPremiumMembershipStatus(db, user, now = Date.now()) {
  const rows = await db.premiumMembership.findMany({ where: { metadata: { path: ["user_id"], equals: user.id } }, select: { metadata: true } });
  const progress = membershipProgress(rows.map(serializeRow), now);
  let awarded = false;
  if (progress.earned.length) await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const account = await tx.user.findUnique({ where: { id: user.id } });
    if (!account) throw Object.assign(new Error("Account not found."), { status: 404 });
    const existing = Array.isArray(account.metadata?.badges) ? account.metadata.badges : [];
    const missing = MEMBER_TIERS.filter(tier => progress.earned.includes(tier.id) && !existing.some(badge => badge.type === tier.id));
    if (!missing.length) return;
    await tx.user.update({ where: { id: user.id }, data: { metadata: { ...account.metadata, badges: [...existing, ...missing.map(tier => ({
      type: tier.id, name: `${tier.label} member`, earned_at: new Date(now).toISOString(), source: "premium_membership",
    }))] } } });
    awarded = true;
  });
  return { success: true, active: activePremium(user, now), expires: user.premium_expires || null, progress, awarded,
    purchases_available: false };
}
