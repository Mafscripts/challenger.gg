import { randomUUID } from "node:crypto";
import { hasRole } from "./roles.js";

export const initialAnnouncement = {
  title: "Website updates in progress",
  message: "We're working on the website and rolling out updates. If a page doesn't load, please press F5 to refresh. We apologise for the inconvenience.",
};
export async function broadcastSiteAnnouncement(tx, announcement) {
  return tx.$executeRaw`
    INSERT INTO "Notification" ("id", "created_date", "updated_date", "metadata")
    SELECT 'site-update-' || md5(u."id" || ':' || ${announcement.revision}), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
      jsonb_build_object('user_id', u."id", 'type', 'system', 'event', 'site_announcement',
        'title', ${announcement.title}::text, 'message', ${announcement.message}::text,
        'is_read', false, 'action_url', ${announcement.kind === "topfragg_variant_rules" ? "/rules#topfragg-variant" : "/notifications"}::text, 'announcement_revision', ${announcement.revision}::text)
    FROM "User" u
    ON CONFLICT ("id") DO NOTHING
  `;
}
export function siteAnnouncementHandlers(db) {
  return {
    async getSiteAnnouncement(req) {
      const record = await db.siteAnnouncement.findUnique({ where: { id: "current" } });
      const announcement = record ? { enabled: record.enabled, title: record.title, message: record.message, revision: record.revision, kind: record.kind || "website", action_url: record.kind === "topfragg_variant_rules" ? "/rules#topfragg-variant" : null } : { enabled: false, ...initialAnnouncement, revision: "" };
      if (hasRole(req.user, "admin")) {
        const rules = await db.ruleSet.findUnique({ where: { id: "topfragg-variant" } });
        announcement.rules_text = rules?.body || "";
      }
      return { success: true, announcement: announcement.enabled || hasRole(req.user, "admin") ? announcement : { enabled: false } };
    },
    async updateSiteAnnouncement(req) {
      if (!hasRole(req.user, "admin")) { const error = new Error("Admin access required"); error.status = 403; throw error; }
      const { enabled } = req.body;
      const kind = req.body.kind || "website";
      const rulesText = typeof req.body.rules_text === "string" ? req.body.rules_text.trim() : "";
      if (!["website", "topfragg_variant_rules"].includes(kind) || (enabled && kind === "topfragg_variant_rules" && (!rulesText || rulesText.length > 20000))) {
        const error = new Error("For Topfragg Variant updates, enter the complete rule set (1–20,000 characters). Only Topfragg Variant rules can be edited here."); error.status = 400; throw error;
      }
      const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
      const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
      if (typeof enabled !== "boolean" || !title || title.length > 100 || !message || message.length > 1000) {
        const error = new Error("Enter a title (1–100 characters), a message (1–1000 characters) and an on/off setting."); error.status = 400; throw error;
      }
      const publicationId = req.body.publication_id;
      if (publicationId !== undefined && (typeof publicationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicationId))) {
        const error = new Error("Invalid publication reference"); error.status = 400; throw error;
      }
      const data = { enabled, title, message, kind, revision: publicationId || randomUUID(), updated_by: req.user.id };
      await db.$transaction(async tx => {
        await tx.siteAnnouncement.upsert({ where: { id: "current" }, create: { id: "current", ...data }, update: data });
        if (enabled && kind === "topfragg_variant_rules") {
          const ruleData = { body: rulesText, revision: data.revision, updated_by: req.user.id };
          await tx.ruleSet.upsert({ where: { id: "topfragg-variant" }, create: { id: "topfragg-variant", ...ruleData }, update: ruleData });
        }
        if (enabled) await broadcastSiteAnnouncement(tx, data);
      }, { timeout: 20000 });
      return { success: true, announcement: { enabled, title, message, revision: data.revision, kind, ...(kind === "topfragg_variant_rules" ? { rules_text: rulesText, action_url: "/rules#topfragg-variant" } : {}) } };
    },
  };
}
