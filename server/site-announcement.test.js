import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import entityRoutes from "./routes/entities.js";
import functionRoutes from "./routes/functions.js";
import { siteAnnouncementHandlers, initialAnnouncement } from "./site-announcement.js";

const fixture = () => {
  let record = { id: "current", enabled: true, ...initialAnnouncement, revision: "initial" };
  const deliveries = new Map();
  const rules = new Map([["other-rules", { id: "other-rules", body: "Keep existing rules" }]]);
  const db = { siteAnnouncement: {
    findUnique: async () => structuredClone(record),
    upsert: async ({ update }) => { record = { ...record, ...update }; return record; },
  }, ruleSet: {
    findMany: async () => [...rules.values()],
    findUnique: async ({ where }) => rules.get(where.id) || null,
    upsert: async ({ where, update }) => { rules.set(where.id, { id: where.id, ...update }); },
  }, $executeRaw: async (_sql, revision, title, message, actionUrl) => {
    for (const id of ["online-player", "offline-player"]) deliveries.set(`${id}:${revision}`, { user_id: id, title, message, revision, action_url: actionUrl });
    return 2;
  } };
  db.$transaction = async action => {
    const beforeRecord = structuredClone(record), beforeRules = structuredClone(rules), beforeDeliveries = structuredClone(deliveries);
    try { return await action(db); } catch (error) { record = beforeRecord; rules.clear(); beforeRules.forEach((value, key) => rules.set(key, value)); deliveries.clear(); beforeDeliveries.forEach((value, key) => deliveries.set(key, value)); throw error; }
  };
  const handlers = siteAnnouncementHandlers(db);
  return { handlers, deliveries, rules, db, req: (role = "admin", body = {}) => ({ user: { id: "staff", role }, body }) };
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
  for (const entity of ["SiteAnnouncement", "siteAnnouncement", "RuleSet", "ruleSet"]) for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    assert.equal((await fetch(`${url}/entities/${entity}/current`, { method })).status, 403);
  }
});

test("publishing notifies every account once per publication; reads and switching off do not send again", async () => {
  const { handlers: h, deliveries, req } = fixture();
  const publication = { enabled: true, ...initialAnnouncement, publication_id: "8f221395-0667-437e-95c6-3ed399d68724" };
  await h.updateSiteAnnouncement(req("admin", publication));
  assert.deepEqual([...deliveries.values()].map(row => row.user_id), ["online-player", "offline-player"]);
  await h.updateSiteAnnouncement(req("admin", publication));
  await h.getSiteAnnouncement(req("user"));
  assert.equal(deliveries.size, 2);
  await h.updateSiteAnnouncement(req("admin", { ...publication, enabled: false }));
  assert.equal(deliveries.size, 2);
  await h.updateSiteAnnouncement(req("ceo", { ...publication, publication_id: "fed35b6d-4948-4696-99a0-52ed75bd312e", message: "Next update" }));
  assert.equal(deliveries.size, 4);
  await assert.rejects(h.updateSiteAnnouncement(req("admin", { ...publication, publication_id: "invalid" })), error => error.status === 400);
});

test("a rules publication updates only Topfragg Variant and links both notices to its rules", async () => {
  const { handlers: h, deliveries, rules, req } = fixture();
  const payload = { enabled: true, kind: "topfragg_variant_rules", title: "Rules updated", message: "Read our updated rules.", rules_text: "Rule one\nRule two" };
  await h.updateSiteAnnouncement(req("admin", payload));
  assert.equal(rules.get("topfragg-variant").body, payload.rules_text);
  assert.equal(rules.get("other-rules").body, "Keep existing rules");
  assert.equal((await h.getSiteAnnouncement(req("user"))).announcement.action_url, "/rules#topfragg-variant");
  assert.equal((await h.getSiteAnnouncement(req("admin"))).announcement.rules_text, payload.rules_text);
  assert.ok([...deliveries.values()].every(row => row.action_url === "/rules#topfragg-variant"));
  await h.updateSiteAnnouncement(req("admin", { ...payload, enabled: false, rules_text: "" }));
  assert.equal(rules.get("topfragg-variant").body, payload.rules_text);
  await h.updateSiteAnnouncement(req("admin", { enabled: true, ...initialAnnouncement }));
  assert.equal(rules.get("topfragg-variant").body, payload.rules_text);
  for (const invalid of [{ ...payload, kind: "tournament_rules" }, { ...payload, rules_text: "" }, { ...payload, rules_text: "x".repeat(20001) }]) await assert.rejects(h.updateSiteAnnouncement(req("admin", invalid)), error => error.status === 400);
});
test("notification failure rolls back the rules and popup together", async () => {
  const { handlers: h, rules, req, db } = fixture();
  db.$executeRaw = async () => { throw new Error("delivery failed"); };
  await assert.rejects(h.updateSiteAnnouncement(req("admin", { enabled: true, kind: "topfragg_variant_rules", ...initialAnnouncement, rules_text: "New rules" })), /delivery failed/);
  assert.equal(rules.has("topfragg-variant"), false);
  assert.equal((await h.getSiteAnnouncement(req("admin"))).announcement.revision, "initial");
});
test("published Variant rules are searchable and leave other rulebook topics untouched", async () => {
  const { ruleSections, withTopfraggVariantRules, searchRulebook } = await import("../src/lib/rulebook.js");
  const sections = withTopfraggVariantRules("Hardpoint rule\n\nSearch & Destroy rule");
  assert.deepEqual(sections.find(section => section.id === "topfragg-variant").rules, ["Hardpoint rule", "Search & Destroy rule"]);
  assert.deepEqual(sections.filter(section => section.id !== "topfragg-variant"), ruleSections.filter(section => section.id !== "topfragg-variant"));
  assert.ok(searchRulebook("Hardpoint rule", sections).some(section => section.id === "topfragg-variant"));
});

test("guests can read the published Variant rule set without staff metadata", async t => {
  const { default: publicRoutes } = await import("./routes/public.js");
  const { prisma } = await import("./prisma.js");
  const original = prisma.ruleSet.findUnique;
  prisma.ruleSet.findUnique = async ({ where }) => {
    assert.equal(where.id, "topfragg-variant");
    return { body: "Official rule", revision: "rules-v1", updated_date: new Date("2026-10-23T12:00:00Z"), updated_by: "private-staff-id" };
  };
  t.after(() => { prisma.ruleSet.findUnique = original; });
  const app = express(); app.use("/public", publicRoutes);
  const server = app.listen(0, "127.0.0.1"); t.after(() => server.close());
  await new Promise(resolve => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/public/topfragg-variant-rules`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.rules.body, "Official rule");
  assert.equal(Object.hasOwn(data.rules, "updated_by"), false);
});

test("CDL, Search & Destroy, Hardpoint and existing topics can each be published independently", async () => {
  const { ruleUpdateOptions } = await import("../src/lib/ruleUpdates.js");
  const { withPublishedRuleSets, ruleSections } = await import("../src/lib/rulebook.js");
  const { handlers: h, rules, deliveries, req } = fixture();
  for (const id of ["cdl-rules", "search-destroy-rules", "hardpoint-rules", "general-match-rules", "tournaments"]) {
    const option = ruleUpdateOptions.find(entry => entry.id === id);
    assert.ok(option);
    const body = `${id} rule one\n${id} rule two`;
    const publication = await h.updateSiteAnnouncement(req("admin", { enabled: true, kind: option.kind, title: `${option.label} updated`, message: "Read the latest rules", rules_text: body }));
    assert.equal(publication.announcement.action_url, `/rules#${id}`);
    assert.equal(rules.get(id).body, body);
    assert.equal([...deliveries.values()].at(-1).action_url, `/rules#${id}`);
    assert.equal((await h.getSiteAnnouncement(req("admin"))).announcement.rules_by_kind[option.kind], body);
  }
  assert.equal(rules.get("cdl-rules").body, "cdl-rules rule one\ncdl-rules rule two");
  const sections = withPublishedRuleSets([...rules.values()]);
  assert.deepEqual(sections.find(section => section.id === "hardpoint-rules").rules, ["hardpoint-rules rule one", "hardpoint-rules rule two"]);
  assert.deepEqual(sections.find(section => section.id === "evidence"), ruleSections.find(section => section.id === "evidence"));
});
