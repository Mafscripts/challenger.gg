ALTER TABLE "SiteAnnouncement" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'website';
CREATE TABLE "RuleSet" (
  "id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "updated_by" TEXT,
  "updated_date" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);
