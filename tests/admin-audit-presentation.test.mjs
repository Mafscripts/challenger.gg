import assert from "node:assert/strict";
import test from "node:test";
import { auditCategory, auditEventPresentation, auditHumanValue, auditReadableLabel } from "../src/lib/adminAuditPresentation.js";

test("deleted support cases show human counts, not internal IDs or nested JSON", () => {
  const view = auditEventPresentation({ action_code: "delete_ticket", source: "admin" }, {
    summary: "Deleted support case cmvln3hqu000lei6vid7qme10", details: { ticket_ids: ["ticket1", "ticket1"], dispute_ids: ["dispute1"] },
  });
  assert.equal(view.title, "Support case deleted");
  assert.equal(view.category, "support"); assert.equal(view.tone, "danger");
  assert.equal(view.summary, "1 support ticket and 1 linked dispute were permanently deleted.");
  assert.equal(view.outcome, "Permanently deleted");
  assert.deepEqual(view.facts, [{ label: "Support tickets", value: "1" }, { label: "Linked disputes", value: "1" }]);
  assert.doesNotMatch(JSON.stringify(view), /ticket1|dispute1|cmvln3/);
});

test("future deletion snapshots use actual subject and current normalized player/match names", () => {
  const view = auditEventPresentation({ action_code: "delete_ticket", target_name: "dev", context: { player_name: "Current Dev" } }, {
    audit_context: { subject: "XP match dispute", player_name: "Old Dev", match_name: "Alpha vs Bravo" },
    target_username: "topfragg-dev", details: { ticket_ids: ["t1"] },
  }, { player_name: "Newest Dev", deleted_ticket_count: 2, deleted_dispute_count: 0 });
  assert.ok(view.facts.some(fact => fact.label === "Player" && fact.value === "Newest Dev"));
  assert.ok(view.facts.some(fact => fact.label === "Support request" && fact.value === "XP match dispute"));
  assert.ok(view.facts.some(fact => fact.label === "Match" && fact.value === "Alpha vs Bravo"));
  assert.match(view.summary, /2 support tickets/);
  assert.doesNotMatch(JSON.stringify(view), /Old Dev|Current Dev|topfragg-dev/);
});

test("legacy deletion with missing context does not invent players, reasons or counts", () => {
  const view = auditEventPresentation({ action_code: "delete_ticket", description: "Deleted support case cmvln3hqu000lei6vid7qme10" });
  assert.deepEqual(view.facts, []); assert.deepEqual(view.changes, []); assert.equal(view.reason, "");
  assert.equal(view.summary, "The support case was permanently deleted.");
});

test("season cleanup shows closure and provided reason", () => {
  const view = auditEventPresentation({ action_code: "support_season_cleanup" }, { summary: "Season 2 cleanup", details: { ticket_ids: ["t1", "t2"], dispute_ids: [] } });
  assert.equal(view.outcome, "Closed"); assert.equal(view.tone, "success");
  assert.equal(view.reason, "Season 2 cleanup"); assert.match(view.summary, /2 support tickets were closed/);
});

test("wallet adjustments show precise before and after including zero", () => {
  const view = auditEventPresentation({ action_code: "wallet_adjust", target_name: "dev" }, {
    target_username: "topfragg-dev", details: { type: "money", operation: "remove", amount: 25.5, balance_before: 25.5, balance_after: 0, reason: "Duplicate deposit corrected" },
  });
  assert.equal(view.summary, "Removed $25.50 from dev's wallet.");
  assert.deepEqual(view.changes, [{ label: "Wallet balance", before: "$25.50", after: "$0.00" }]);
  assert.equal(view.reason, "Duplicate deposit corrected");
  assert.ok(view.facts.some(fact => fact.label === "Removed" && fact.value === "$25.50"));
});

test("credit balances stay whole and distinct from money", () => {
  const view = auditEventPresentation({ action_code: "wallet_adjust" }, { details: { type: "credits", operation: "set", amount: 1500, balance_before: 0, balance_after: 1500 } });
  assert.deepEqual(view.changes, [{ label: "Credits", before: "0 credits", after: "1,500 credits" }]);
  assert.ok(view.facts.some(fact => fact.label === "Balance set to" && fact.value === "1,500 credits"));
});

test("roles show only recorded before and after", () => {
  const legacy = auditEventPresentation({ action_code: "role_change", target_name: "Livvy" }, { details: { role: "ceo" } });
  assert.deepEqual(legacy.changes, []); assert.ok(legacy.facts.some(fact => fact.label === "New role" && fact.value === "CEO"));
  const modern = auditEventPresentation({ action_code: "role_change" }, { details: { previous_role: "member", role: "admin" } });
  assert.deepEqual(modern.changes, [{ label: "Player role", before: "Member", after: "Admin" }]);
});

test("moderation events state actual action and expiry without asserting permanent bans", () => {
  const banned = auditEventPresentation({ action_code: "temporary_ban", target_name: "Sam", description: "Repeated abuse" }, { details: { expires_date: "2026-10-25T12:00:00Z" } });
  assert.equal(banned.outcome, "Temporarily banned"); assert.equal(banned.reason, "Repeated abuse");
  assert.ok(banned.facts.some(fact => fact.label === "Restriction ends"));
  const removed = auditEventPresentation({ action_code: "remove_ban" }); assert.equal(removed.tone, "success");
});

test("ranked changes include only known numerical stats and never nested metadata", () => {
  const elo = auditEventPresentation({ action_code: "ranked_elo_adjustment" }, { details: { before_elo: 1600, after_elo: 0, reason: "Season correction" } });
  assert.deepEqual(elo.changes, [{ label: "Ranked ELO", before: "1,600", after: "0" }]);
  const stats = auditEventPresentation({ action_code: "ranked_stats_adjustment" }, { details: { before: { wins: 4, losses: 3, password: "secret" }, after: { wins: 5, losses: 3, password: "another" } } });
  assert.deepEqual(stats.changes, [{ label: "Wins", before: "4", after: "5" }]);
  assert.doesNotMatch(JSON.stringify(stats), /password|secret|another/);
});

test("match cancellation and corrections have understandable statuses", () => {
  const cancelled = auditEventPresentation({ action_code: "challenge_cancel", context: { match_name: "Alpha vs Bravo" } }, { reason: "Both teams agreed" });
  assert.equal(cancelled.category, "competition"); assert.equal(cancelled.outcome, "Cancelled"); assert.equal(cancelled.reason, "Both teams agreed");
  const result = auditEventPresentation({ action_code: "challenge_result" }, { score: [3, 1], details: { winner_name: "Alpha" } });
  assert.ok(result.facts.some(fact => fact.label === "Winner" && fact.value === "Alpha"));
  assert.ok(result.facts.some(fact => fact.label === "Final score" && fact.value === "3 – 1"));
  const objectScore = auditEventPresentation({ action_code: "challenge_result" }, { score: { alpha: 3, bravo: 1 } });
  assert.ok(objectScore.facts.some(fact => fact.label === "Final score" && fact.value === "3 – 1"));
  const bracket = auditEventPresentation({ action_code: "tournament_match_reset", target_name: "Alpha vs Bravo" });
  assert.ok(!bracket.facts.some(fact => fact.label === "Player"));
});

test("notices and rule updates use known publish fields", () => {
  const rules = auditEventPresentation({ action_code: "variant_rules_update" }, { details: { enabled: true, kind: "cdl_search_rules", title: "Search rules updated", rules_text: "Huge body" } });
  assert.equal(rules.category, "platform"); assert.equal(rules.outcome, "Published");
  assert.ok(rules.facts.some(fact => fact.label === "Rule set" && fact.value === "CDL search rules"));
  assert.doesNotMatch(JSON.stringify(rules), /Huge body/);
});

test("credentials, redacted strings and arbitrary raw objects never appear in normal presentation", () => {
  const view = auditEventPresentation({ action_code: "wallet_adjust", target_name: "[redacted]" }, {
    password: "secret", token: "sensitive", target_username: "[redacted]", reason: "api_key=abc123",
    details: { balance_before: "[redacted]", balance_after: { nested: "raw" }, amount: "[redacted]", arbitrary: { token: "raw" } },
  });
  assert.deepEqual(view.facts, []); assert.deepEqual(view.changes, []); assert.equal(view.reason, "");
  assert.doesNotMatch(JSON.stringify(view), /redacted|sensitive|secret|abc123|nested|arbitrary/);
});

test("unknown events retain useful descriptions but do not invent outcomes", () => {
  const event = auditEventPresentation({ source: "system", action_code: "worker_reconnected", description: "Background worker connected again." }, { mystery: { nested: 42 } });
  assert.equal(event.category, "system"); assert.equal(event.summary, "Background worker connected again."); assert.equal(event.outcome, ""); assert.deepEqual(event.facts, []);
  const legacy = auditEventPresentation({ source: "admin", action_code: "custom_action", description: "Updated cmvln3hqu000lei6vid7qme10" });
  assert.equal(legacy.summary, "A staff action was recorded.");
});

test("classification prioritizes support and actual fields remain safe and readable", () => {
  assert.equal(auditCategory({ action_code: "match_dispute_closed" }), "support");
  assert.equal(auditCategory({ action_code: "screenshot_rank_review" }), "players");
  assert.equal(auditCategory({ action_code: "update_free_eights_games" }), "platform");
  assert.equal(auditCategory({ action_code: "reward_template_saved" }), "economy");
  assert.equal(auditCategory({ action_code: "custom", category: "players" }), "players");
  assert.equal(auditReadableLabel("ranked_elo_adjustment"), "Ranked ELO adjustment");
  assert.equal(auditHumanValue(false), "No"); assert.equal(auditHumanValue(0), "0");
  assert.equal(auditHumanValue({ internal: true }), ""); assert.equal(auditHumanValue("[redacted]"), "");
});

test("explicit short references are replaced with useful labels in everyday text", () => {
  const view = auditEventPresentation({ source: "admin", action_code: "match_result_override", target_kind: "Match", actor_id: "staff_01",
    actor_name: "dev", target_id: "match_active_01", record_id: "evt_1", description: "staff_01 corrected match_active_01 in evt_1.",
    context: { match_id: "match_active_01", match_name: "Alpha vs Bravo" },
  }, { details: { reason: "Correct match_active_01 after staff_01 reviewed it", winner_name: "match_active_01" } });
  assert.equal(view.summary, "dev corrected Alpha vs Bravo in the event.");
  assert.equal(view.reason, "Correct Alpha vs Bravo after dev reviewed it");
  assert.doesNotMatch(JSON.stringify(view), /match_active_01|staff_01|evt_1/);
  assert.ok(view.facts.some(fact => fact.label === "Winner" && fact.value === "Alpha vs Bravo"));
});

test("short reference stripping preserves actual names and unrelated word fragments", () => {
  const view = auditEventPresentation({ action_code: "unknown_action", actor_id: "dev", actor_name: "dev", target_id: "u1",
    target_name: "Livvy", description: "dev updated u1; regular squad u123 stays unchanged." });
  assert.equal(view.summary, "dev updated Livvy; regular squad u123 stays unchanged.");
  const fallback = auditEventPresentation({ action_code: "custom_action", target_id: "match_active_01", target_name: "match_active_01", description: "Updated match_active_01." });
  assert.doesNotMatch(JSON.stringify(fallback), /match_active_01/);
});
