import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSupportWorkspace, readSupportWorkspace, supportWorkspaceFromUrl, supportWorkspaceKey, supportWorkspaceSearch, writeSupportWorkspace } from "../src/lib/supportWorkspace.js";
import { supportCaseTimeline, supportReporterId } from "../src/lib/supportCaseTimeline.js";

test("support drafts, selection and scroll survive a reload without crossing staff identities or roles", () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const key = supportWorkspaceKey("first", "admin");
  writeSupportWorkspace(key, { selectedId: "ticket:example", view: "new", filter: "open", category: "live", search: "dev", drafts: { "ticket:example": { reply: "Unsent reply", roomReply: "Room draft", tab: "timeline", decision: "force_replay" } }, scroll: { inbox: 818, reader: 425 } }, storage);
  const state = readSupportWorkspace(key, storage);
  assert.equal(state.selectedId, "ticket:example"); assert.equal(state.drafts["ticket:example"].reply, "Unsent reply");
  assert.equal(state.drafts["ticket:example"].tab, "timeline"); assert.deepEqual(state.scroll, { inbox: 818, reader: 425 });
  for (const other of [supportWorkspaceKey("second", "admin"), supportWorkspaceKey("first", "moderator")]) assert.deepEqual(readSupportWorkspace(other, storage).drafts, {});
  assert.doesNotThrow(() => writeSupportWorkspace(key, state, { setItem: () => { throw new Error("Storage blocked"); } }));
  assert.equal(readSupportWorkspace(key, { getItem: () => "not json" }).selectedId, null);
});

test("dashboard case links override saved filters and remain shareable without serializing drafts", () => {
  const saved = normalizeSupportWorkspace({ filter: "closed", category: "live", view: "saved", search: "old", selectedId: "ticket:old", drafts: { "ticket:old": { reply: "Private draft" } } });
  const target = supportWorkspaceFromUrl("?tab=tickets&case=dispute%3Areport&view=mine&category=tournament&status=open", saved);
  assert.equal(target.selectedId, "dispute:report"); assert.equal(target.category, "tournament"); assert.equal(target.filter, "open"); assert.equal(target.view, "mine"); assert.equal(target.search, "");
  assert.equal(target.drafts["ticket:old"].reply, "Private draft");
  const url = supportWorkspaceSearch("?tab=tickets&other=kept", target);
  assert.equal(new URLSearchParams(url).get("case"), "dispute:report"); assert.ok(url.includes("other=kept")); assert.ok(!url.includes("Private"));
  assert.equal(supportWorkspaceFromUrl("?tab=tickets", saved), saved);
  assert.equal(supportWorkspaceFromUrl("?support_case=legacy&kind=dispute", saved).selectedId, "dispute:legacy");
  assert.equal(normalizeSupportWorkspace({ selectedId: "bad", view: "garbage", scroll: { inbox: -10 } }).selectedId, null);
});

test("case activity combines dated requests, assignment, messages and decisions without inventing a financial audit", () => {
  const row = { id: "ticket:case", ticket: { id: "case", user_id: "player", username: "dev", description: "Need help", created_date: "2026-10-01T10:00:00Z",
    support_assignment_history: [{ staff_name: "Admin", created_date: "2026-10-01T10:02:00Z" }],
    messages: [{ id: "reply", sender_name: "Admin", sender_staff: true, content: "Checking", created_date: "2026-10-01T10:03:00Z" }, { content: "No date" }],
  }, disputes: [{ id: "report", review_actions: [{ action: "force_replay", admin_name: "Admin", notes: "Incorrect map", created_date: "2026-10-01T10:04:00Z" }] }] };
  const events = supportCaseTimeline(row);
  assert.deepEqual(events.map(event => event.title), ["Support requested", "Case assigned", "Staff replied", "Replay ordered"]);
  assert.equal(events.at(-1).text, "Incorrect map"); assert.equal(supportReporterId(row), "player");
  assert.ok(!JSON.stringify(events).includes("payout"));
  assert.equal(supportReporterId({ disputes: [{ reported_by: "legacy-player" }] }), "legacy-player");
});
