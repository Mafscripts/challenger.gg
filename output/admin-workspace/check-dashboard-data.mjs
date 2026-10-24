import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getAdminDashboard } from "../../server/admin-dashboard.js";

const db = new PrismaClient();
try {
  await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    try {
      const result = await getAdminDashboard(tx, { id: "staff-readonly-review", role: "ceo" });
      console.log("Dashboard read-only data check:", result.success);
    } catch (error) {
      console.log("Dashboard read-only data check failed:", error.code, error.meta?.message || error.message.split("\n").at(-1));
      process.exitCode = 1;
    }
  }, { timeout: 15000 });
} finally { await db.$disconnect(); }
