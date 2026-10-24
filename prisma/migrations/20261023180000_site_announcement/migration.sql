CREATE TABLE "SiteAnnouncement" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "updated_by" TEXT,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteAnnouncement_pkey" PRIMARY KEY ("id")
);
INSERT INTO "SiteAnnouncement" ("id", "enabled", "title", "message", "revision", "updated_date")
VALUES ('current', true, 'Website updates in progress', 'We''re working on the website and rolling out updates. If a page doesn''t load, please press F5 to refresh. We apologise for the inconvenience.', 'website-updates-2026-10-23', CURRENT_TIMESTAMP);
