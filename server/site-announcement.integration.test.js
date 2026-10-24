import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prisma } from "./prisma.js";
import { broadcastSiteAnnouncement, initialAnnouncement } from "./site-announcement.js";

test("announcement broadcast and deployment backfill deliver once to online and offline users", { skip: process.env.ANNOUNCEMENT_DB_TEST !== "1" }, async () => {
  const rollback = new Error("temporary-fixtures-only");
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "User" ("id" TEXT PRIMARY KEY) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "Notification" ("id" TEXT PRIMARY KEY, "created_date" TIMESTAMP, "updated_date" TIMESTAMP, "metadata" JSONB) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "SiteAnnouncement" ("id" TEXT, "enabled" BOOLEAN, "title" TEXT, "message" TEXT, "revision" TEXT) ON COMMIT DROP');
      await tx.$executeRaw`INSERT INTO "User" ("id") VALUES ('online-player'), ('offline-player')`;
      const announcement = { ...initialAnnouncement, revision: "test-publication" };
      assert.equal(await broadcastSiteAnnouncement(tx, announcement), 2);
      assert.equal(await broadcastSiteAnnouncement(tx, announcement), 0);
      const rows = await tx.$queryRaw`SELECT "metadata" FROM "Notification" ORDER BY "metadata"->>'user_id'`;
      assert.deepEqual(rows.map(row => row.metadata.user_id), ["offline-player", "online-player"]);
      assert.equal(rows[0].metadata.message, initialAnnouncement.message);
      assert.equal(rows[0].metadata.is_read, false);
      assert.equal(rows[0].metadata.type, "system");
      await tx.$executeRaw`INSERT INTO "SiteAnnouncement" VALUES ('current', true, ${initialAnnouncement.title}, ${initialAnnouncement.message}, 'test-publication')`;
      const migration = await readFile(new URL("../prisma/migrations/20261023190000_announcement_notifications/migration.sql", import.meta.url), "utf8");
      assert.equal(await tx.$executeRawUnsafe(migration), 0);
      await tx.$executeRaw`UPDATE "SiteAnnouncement" SET "revision" = 'second-publication'`;
      assert.equal(await tx.$executeRawUnsafe(migration), 2);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await prisma.$disconnect(); }
});
