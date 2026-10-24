-- Deliver the currently active announcement once to every existing account.
INSERT INTO "Notification" ("id", "created_date", "updated_date", "metadata")
SELECT 'site-update-' || md5(u."id" || ':' || a."revision"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
  jsonb_build_object('user_id', u."id", 'type', 'system', 'event', 'site_announcement',
    'title', a."title", 'message', a."message", 'is_read', false,
    'action_url', '/notifications', 'announcement_revision', a."revision")
FROM "User" u CROSS JOIN "SiteAnnouncement" a
WHERE a."id" = 'current' AND a."enabled" = true
ON CONFLICT ("id") DO NOTHING;
