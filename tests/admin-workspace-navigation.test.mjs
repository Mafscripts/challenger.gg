import test from "node:test";
import assert from "node:assert/strict";
import { adminAlertDestination, adminTargetUrl, isAdminWorkspaceQuery } from "../src/lib/adminWorkspace.js";

test("admin alerts open the appropriate competition room in staff view", () => {
  for (const [mode, path] of [["xp", "xp-match"], ["8s", "8s-match"], ["money8s", "8s-match"], ["ranked", "ranked-match"], ["wager", "wagers-match"], ["tournament", "tournament-match"], ["challenge", "challenge-a-team"]]) {
    assert.deepEqual(adminAlertDestination({ match_type: mode, related_entity_id: "match1" }), { url: `/${path}/match1?support_view=1`, label: "Open match room" });
  }
  assert.equal(adminAlertDestination({}, { match_id: "ticket-match", match_type: "xp" }).url, "/xp-match/ticket-match?support_view=1");
});

test("historic room URLs must match the case and use the staff viewing flag", () => {
  assert.equal(adminAlertDestination({ match_id: "m", action_url: "/8s-match/m?admin=1" }).url, "/8s-match/m?support_view=1");
  for (const url of ["https://example.test/xp-match/m", "//example.test/xp-match/m", "/xp-match/another", "javascript:alert(1)", "/admin"]) {
    assert.deepEqual(adminAlertDestination({ match_id: "m", action_url: url }), { url: "/admin?tab=matches&search=m", label: "Find linked match" });
  }
  assert.deepEqual(adminAlertDestination({}), { url: "/admin?tab=matches", label: "Open match center" });
});

test("audit shortcuts retain source, period and exact action", () => {
  const params = new URL(adminTargetUrl({ tab: "audit", source: "admin", period: "all", action: "ranked_elo_adjustment" }), "https://test.local").searchParams;
  assert.equal(params.get("source"), "admin"); assert.equal(params.get("period"), "all"); assert.equal(params.get("action"), "ranked_elo_adjustment");
});

test("refresh covers the self-loaded admin pages without touching public page queries", () => {
  for (const key of [["admin-console", "staff", "ceo", "withdrawalDirectory"], ["site-announcement", "staff"], ["admin-ban-appeals", "staff"], ["admin-competition-rewards", "staff"], ["ban-appeal-conversation", "staff"]]) assert.equal(isAdminWorkspaceQuery(key), true);
  for (const key of [["public-tournaments"], ["admin-console", "staff", "ceo", "tournamentLifecycle"]]) assert.equal(isAdminWorkspaceQuery(key), false);
});
