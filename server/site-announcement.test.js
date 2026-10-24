import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import entityRoutes from "./routes/entities.js";
import functionRoutes from "./routes/functions.js";
import { siteAnnouncementHandlers, initialAnnouncement } from "./site-announcement.js";

const fixture = () => {
  let record = { id: "current", enabled: true, ...initialAnnouncement, revision: "initial" };
  const handlers = siteAnnouncementHandlers({ siteAnnouncement: {
    findUnique: async () => structuredClone(record),
    upsert: async ({ update }) => { record = { ...record, ...update }; return record; },
  } });
  return { handlers, req: (role = "admin", body = {}) => ({ user: { id: "staff", role }, body }) };
};
test("users receive the active notice, while only admins may publish or switch it off", async () => {
  const { handlers: h, req } = fixture();
  assert.equal((await h.getSiteAnnouncement(req("user"))).announcement.enabled, true);
  for (const role of ["user", "moderator"]) await assert.rejects(h.updateSiteAnnouncement(req(role, { enabled: false, ...initialAnnouncement })), error => error.status === 403);
  const off = await h.updateSiteAnnouncement(req("admin", { enabled: false, ...initialAnnouncement }));
  assert.equal(off.announcement.enabled, false);
  assert.deepEqual((await h.getSiteAnnouncement(req("user"))).announcement, { enabled: false });
  assert.equal((await h.getSiteAnnouncement(req("ceo"))).announcement.title, initialAnnouncement.title);
  const republished = await h.updateSiteAnnouncement(req("ceo", { enabled: true, title: "Back online", message: "Update complete." }));
  assert.notEqual(republished.announcement.revision, "initial");
  assert.notEqual(republished.announcement.revision, off.announcement.revision);
  assert.equal((await h.getSiteAnnouncement(req("user"))).announcement.message, "Update complete.");
  assert.equal(Object.hasOwn(republished.announcement, "updated_by"), false);
});
test("invalid announcements cannot overwrite the active notice", async () => {
  const { handlers: h, req } = fixture();
  for (const body of [{ enabled: "false", ...initialAnnouncement }, { enabled: true, title: "", message: "Hello" }, { enabled: true, title: "a".repeat(101), message: "Hello" }, { enabled: true, title: "Update", message: "a".repeat(1001) }]) {
    await assert.rejects(h.updateSiteAnnouncement(req("admin", body)), error => error.status === 400);
  }
  assert.equal((await h.getSiteAnnouncement(req("user"))).announcement.revision, "initial");
});
test("anonymous notice access and generic record writes are blocked", async t => {
  const app = express(); app.use(express.json()); app.use("/entities", entityRoutes); app.use("/functions", functionRoutes);
  const server = app.listen(0, "127.0.0.1"); t.after(() => server.close());
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/functions/getSiteAnnouncement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
  for (const entity of ["SiteAnnouncement", "siteAnnouncement"]) for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    assert.equal((await fetch(`${url}/entities/${entity}/current`, { method })).status, 403);
  }
});
