import { prisma } from "./prisma.js";

export const ANIMATED_NAME_FREE_TRIAL_KEY = "animated_name_effects";

// Keep the admin switch usable during deployments where the Prisma client was
// cached before the FreeTrialProgram model was added. The raw-query fallback
// also creates the small table when the migration has not run yet, so the
// feature fails closed instead of showing an opaque `upsert` error.
let freeTrialStorageReady = null;

const ensureFreeTrialStorage = async () => {
  if (!freeTrialStorageReady) {
    freeTrialStorageReady = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FreeTrialProgram" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "starts_date" TIMESTAMP(3),
        "ends_date" TIMESTAMP(3),
        "stopped_date" TIMESTAMP(3),
        "updated_by" TEXT,
        "updated_by_name" TEXT,
        "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      freeTrialStorageReady = null;
      throw error;
    });
  }
  await freeTrialStorageReady;
};

const readFreeTrialProgram = async () => {
  if (typeof prisma.freeTrialProgram?.findUnique === "function") {
    try {
      return await prisma.freeTrialProgram.findUnique({
        where: { key: ANIMATED_NAME_FREE_TRIAL_KEY },
      });
    } catch {
      // Fall through to raw SQL when the deployed client or database is stale.
    }
  }

  await ensureFreeTrialStorage();
  const rows = await prisma.$queryRaw`
    SELECT "key", "enabled", "starts_date", "ends_date", "stopped_date", "updated_by", "updated_by_name"
    FROM "FreeTrialProgram"
    WHERE "key" = ${ANIMATED_NAME_FREE_TRIAL_KEY}
    LIMIT 1
  `;
  return rows[0] || null;
};

export const upsertAnimatedNameFreeTrial = async ({
  enabled,
  startsAt = null,
  endsAt = null,
  stoppedAt = null,
  updatedBy = null,
  updatedByName = null,
}) => {
  if (typeof prisma.freeTrialProgram?.upsert === "function") {
    try {
      return await prisma.freeTrialProgram.upsert({
        where: { key: ANIMATED_NAME_FREE_TRIAL_KEY },
        create: {
          key: ANIMATED_NAME_FREE_TRIAL_KEY,
          enabled,
          starts_date: startsAt,
          ends_date: endsAt,
          stopped_date: stoppedAt,
          updated_by: updatedBy,
          updated_by_name: updatedByName,
        },
        update: {
          enabled,
          starts_date: startsAt,
          ends_date: endsAt,
          stopped_date: stoppedAt,
          updated_by: updatedBy,
          updated_by_name: updatedByName,
        },
      });
    } catch {
      // Fall through to raw SQL when the deployed client or database is stale.
    }
  }

  await ensureFreeTrialStorage();
  const rows = await prisma.$queryRaw`
    INSERT INTO "FreeTrialProgram" (
      "key", "enabled", "starts_date", "ends_date", "stopped_date",
      "updated_by", "updated_by_name", "created_date", "updated_date"
    ) VALUES (
      ${ANIMATED_NAME_FREE_TRIAL_KEY}, ${enabled}, ${startsAt}, ${endsAt}, ${stoppedAt},
      ${updatedBy}, ${updatedByName}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT ("key") DO UPDATE SET
      "enabled" = EXCLUDED."enabled",
      "starts_date" = EXCLUDED."starts_date",
      "ends_date" = EXCLUDED."ends_date",
      "stopped_date" = EXCLUDED."stopped_date",
      "updated_by" = EXCLUDED."updated_by",
      "updated_by_name" = EXCLUDED."updated_by_name",
      "updated_date" = CURRENT_TIMESTAMP
    RETURNING "key", "enabled", "starts_date", "ends_date", "stopped_date", "updated_by", "updated_by_name"
  `;
  return rows[0] || null;
};

export const freeTrialStatusFor = (program) => {
  const endsAt = program?.ends_date ? new Date(program.ends_date) : null;
  const active = Boolean(program?.enabled && endsAt && Number.isFinite(endsAt.getTime()) && endsAt > new Date());
  return {
    key: ANIMATED_NAME_FREE_TRIAL_KEY,
    enabled: Boolean(program?.enabled),
    active,
    starts_date: program?.starts_date ? new Date(program.starts_date).toISOString() : null,
    ends_date: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt.toISOString() : null,
    stopped_date: program?.stopped_date ? new Date(program.stopped_date).toISOString() : null,
    updated_by: program?.updated_by || null,
    updated_by_name: program?.updated_by_name || null,
  };
};

export const getAnimatedNameFreeTrial = async () => {
  const program = await readFreeTrialProgram();
  return freeTrialStatusFor(program);
};
