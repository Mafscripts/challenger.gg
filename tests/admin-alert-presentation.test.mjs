import assert from "node:assert/strict";
import test from "node:test";
import { alertPresentation } from "../src/lib/adminAlertPresentation.js";

const legacyId = "cmqpyciml001heiyj125phpva";

test("legacy proof alerts explain the work and preserve players without database references", () => {
  const view = alertPresentation({ subject: `Wager match admin request ${legacyId}`, message: `Proof is ready for staff review.\n\nMatch: ${legacyId}\nPlayers: Baenini vs Livvy`, priority: "high", status: "open", related_entity_id: legacyId, username: "Livvy" });
  assert.equal(view.title, "Evidence ready to review");
  assert.equal(view.kind, "evidence");
  assert.equal(view.summary, "Proof is ready for staff review.");
  assert.equal(view.matchTitle, "Baenini vs Livvy");
  assert.equal(view.reporterName, "Livvy");
  assert.equal(view.statusLabel, "Needs review");
  assert.equal(view.tone, "warning");
  assert.doesNotMatch(JSON.stringify(view), /cmqpyciml|Match:|N\/A/);
});

test("normalized current names and actual match title override legacy identities", () => {
  const view = alertPresentation({ category: "calls", status: "needs_review", title: "Wager admin request", message: "Staff assistance requested", reporter: { id: "person1", name: "dev" }, username: "topfragg-dev", assigned_staff: { name: "ouji" }, reviewed_by: { name: "Livvy" }, match: { id: legacyId, title: "Red Wolves vs Sea Lions" }, players: [{ name: "Current Alpha" }, { name: "Current Bravo" }], teams: [{ name: "Red Wolves" }, { name: "Sea Lions" }] });
  assert.equal(view.reporterName, "dev");
  assert.equal(view.assignedName, "ouji");
  assert.equal(view.reviewedName, "Livvy");
  assert.equal(view.matchTitle, "Red Wolves vs Sea Lions");
  assert.equal(view.playersLabel, "Current Alpha vs Current Bravo");
  assert.equal(view.teamsLabel, "Red Wolves vs Sea Lions");
  assert.doesNotMatch(JSON.stringify(view), /topfragg-dev/);
});

test("reviewed alerts stay green even when original priority was critical", () => {
  for (const status of ["reviewed", "acknowledged", "resolved", "closed"]) {
    const view = alertPresentation({ category: "calls", status, priority: "critical", case: { status: "in_progress" } });
    assert.equal(view.status, "reviewed");
    assert.equal(view.statusLabel, "Reviewed");
    assert.equal(view.tone, "success");
    assert.doesNotMatch(JSON.stringify(view), /case closed|case resolved/i);
  }
});

test("only urgent open alerts use the red treatment", () => {
  const urgent = alertPresentation({ status: "needs_review", priority: "critical" });
  const ordinary = alertPresentation({ status: "open", priority: "high" });
  assert.equal(urgent.tone, "danger"); assert.equal(urgent.priorityLabel, "Urgent");
  assert.equal(ordinary.tone, "warning"); assert.equal(ordinary.priorityLabel, "High priority");
});

test("ranked legacy status lines and IDs never crowd the actual reason", () => {
  const view = alertPresentation({ subject: `Ranked match support ${legacyId}`, message: `Opponent has disconnected.\nMatch: ${legacyId}\nStatus: live\nParticipants: Sam vs Jo`, match_id: legacyId });
  assert.equal(view.title, "Admin requested");
  assert.equal(view.summary, "Opponent has disconnected.");
  assert.equal(view.matchTitle, "Sam vs Jo");
  assert.doesNotMatch(view.summary, /Status:|Match:/);
});

test("legacy player context is preferred over a generic backend match fallback", () => {
  const view = alertPresentation({ category: "evidence", title: "Evidence ready for review", message: "Proof is ready for staff review.\nPlayers: Baenini vs Livvy", match: { id: legacyId, title: "Wager", available: false } });
  assert.equal(view.matchTitle, "Baenini vs Livvy");
  assert.equal(view.summary, "Proof is ready for staff review.");
});

test("tournament room boilerplate becomes a readable request with the actual teams", () => {
  const view = alertPresentation({ subject: `Tournament match admin request ${legacyId}`, message: `Admin requested for tournament match ${legacyId} in Autumn Cup.\nTeam Aces vs Team Kings`, match_id: legacyId, requested_by_name: "Sage" });
  assert.equal(view.title, "Admin requested");
  assert.equal(view.summary, "Sage requested staff assistance.");
  assert.equal(view.matchTitle, "Team Aces vs Team Kings");
});

test("dispute alerts do not become generic admin calls", () => {
  const view = alertPresentation({ category: "disputes", title: `Wager match admin request ${legacyId}`, message: "The reported scores do not match.", match_id: legacyId });
  assert.equal(view.kindLabel, "Dispute");
  assert.equal(view.title, "Match dispute");
  assert.equal(view.summary, "The reported scores do not match.");
});

test("custom platform notices retain their useful title and message", () => {
  const view = alertPresentation({ category: "platform", title: "Payout provider unavailable", message: "Check pending withdrawals before processing more payouts.", priority: "low" });
  assert.equal(view.kind, "platform");
  assert.equal(view.title, "Payout provider unavailable");
  assert.equal(view.summary, "Check pending withdrawals before processing more payouts.");
  assert.equal(view.priorityLabel, "Low priority");
});

test("unknown context stays absent and never invents players or a match mode", () => {
  const view = alertPresentation({ title: `Admin request ${legacyId}`, message: `Match: ${legacyId}\nPlayers: Host unavailable vs Opponent pending`, related_entity_id: legacyId, username: "N/A" });
  assert.equal(view.reporterName, "");
  assert.equal(view.matchTitle, "");
  assert.equal(view.playersLabel, "");
  assert.equal(view.summary, "A player requested staff assistance.");
  assert.doesNotMatch(JSON.stringify(view), /Wager|Free 8s|Ranked|Host unavailable|Opponent pending|N\/A/);
});

test("known short references, CUIDs and UUIDs are removed without altering human names", () => {
  const view = alertPresentation({ id: "alert.special+1", match_id: "game[123]", title: "Platform alert", message: `Check game[123] for Captain 123. Event alert.special+1. Reference 25b3912b-8e8a-4b52-9bf8-6e0939ae5a87.` });
  assert.match(view.summary, /Captain 123/);
  assert.doesNotMatch(view.summary, /game\[123\]|alert\.special\+1|25b3912b/);
});

test("names use display names before account and social handles", () => {
  const view = alertPresentation({ reporter: { display_name: "dev", name: "Old Name", username: "topfragg-dev" }, assigned_staff: { full_name: "Livvy", username: "old-handle" }, players: [{ display_name: "dev", username: "topfragg-dev" }, { name: "Livvy" }, { name: "Livvy" }] });
  assert.equal(view.reporterName, "dev");
  assert.equal(view.assignedName, "Livvy");
  assert.equal(view.playersLabel, "dev vs Livvy");
});

test("partial legacy records and malformed optional data remain readable", () => {
  for (const input of [null, undefined, {}, { title: {}, message: {}, reporter: [], players: "bad", match: null, case: false }, { subject: "N/A", message: "undefined" }]) {
    const view = alertPresentation(input);
    assert.equal(view.title, "Platform alert");
    assert.equal(view.summary, "Review this platform alert.");
    assert.equal(view.statusLabel, "Needs review");
    assert.equal(view.matchTitle, "");
  }
});
