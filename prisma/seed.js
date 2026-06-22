import { PrismaClient } from "@prisma/client";
import { RANK_THRESHOLDS } from "../src/lib/ranks.js";

const prisma = new PrismaClient();

const roles = [
  { key: "ceo", label: "CEO", color: "cyan", power: 500 },
  { key: "super_admin", label: "Super Admin", color: "red", power: 400 },
  { key: "admin", label: "Admin", color: "pink", power: 300 },
  { key: "moderator", label: "Moderator", color: "yellow", power: 200 },
  { key: "user", label: "User", color: "default", power: 100 },
];

for (const role of roles) {
  await prisma.role.upsert({
    where: { key: role.key },
    update: role,
    create: role,
  });
}

for (const rank of RANK_THRESHOLDS) {
  const key = `${rank.tier}_${rank.division || "top"}`.toLowerCase();
  await prisma.rankTier.upsert({
    where: { key },
    update: {
      name: rank.name,
      tier: rank.tier,
      division: rank.division || null,
      min_elo: rank.min,
      max_elo: Number.isFinite(rank.max) ? rank.max : null,
      color: rank.color,
    },
    create: {
      key,
      name: rank.name,
      tier: rank.tier,
      division: rank.division || null,
      min_elo: rank.min,
      max_elo: Number.isFinite(rank.max) ? rank.max : null,
      color: rank.color,
    },
  });
}

await prisma.$disconnect();
