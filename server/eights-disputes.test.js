import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import routes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import { disputeEvidenceUrls, validateMatchDispute } from "../src/lib/matchDisputes.js";

test("dispute validation requires an issue, explanation and player for player reports", () => {
  const base = { reason: "cheating", description: "Suspicious tracking in round 3", reported_against: "player2", evidence_urls: "https://example.com/clip\nhttps://example.com/clip" };
  assert.deepEqual(validateMatchDispute(base).evidence_urls, ["https://example.com/clip"]);
  assert.throws(() => validateMatchDispute({ ...base, reported_against: "" }), /Choose the player/);
  assert.throws(() => validateMatchDispute({ ...base, description: "short" }), /Explain/);
  assert.throws(() => validateMatchDispute({ ...base, reason: "invented" }), /category/);
  assert.equal(validateMatchDispute({ ...base, reason: "wrong_rules", reported_against: "" }).reported_against, "");
  for (const value of ["javascript:alert(1)", "file:///C:/secret", "https://user:password@example.com", "not-a-link"]) assert.throws(() => disputeEvidenceUrls(value));
  assert.throws(() => disputeEvidenceUrls(Array(11).fill("https://example.com")), /up to 10/);
});

async function fixture(t, type = "8s") {
  const table = { user: [], wager: [], wagerParticipant: [], dispute: [], ticket: [], adminAlert: [], notification: [], message: [], chatMessage: [], matchHistory: [], ban: [], adminAction: [] };
  const stamp = new Date();
  table.user = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, username: `player${index}`, display_name: `Player ${index}`, role: "user", email_verified: true, metadata: { activision_id: `Player${index}#1234567`, screenshot_rank: "diamond", secret: "private" } }));
  table.user.push({ id: "admin", role: "admin", display_name: "Staff", email_verified: true, metadata: {} }, { id: "outsider", role: "user", email_verified: true, metadata: {} });
  table.wager = [{ id: "match", created_date: stamp, metadata: { status: "in_progress", match_type: type, host_id: "p0", host_name: "Player 0", challenger_id: "p4", challenger_name: "Player 4", team_size: "4v4", game_mode: "hp", best_of: 3, series_maps: [{ name: "Raid" }], confirmed_score_alpha: 1 } }];
  table.wagerParticipant = table.user.slice(0, 8).map((user, index) => ({ id: `part${index}`, created_date: stamp, metadata: { wager_id: "match", user_id: user.id, user_name: "stale name", team: index < 4 ? "host" : "challenger", is_captain: index === 0 || index === 4 } }));
  table.chatMessage = [{ id: "chat1", created_date: stamp, metadata: { conversation_id: "match", sender_name: "Player 4", content: "Ready" } }];
  table.matchHistory = [{ id: "history1", created_date: stamp, metadata: { match_id: "match", summary: "Round 1" } }];
  let sequence = 0;
  const fits = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part) => fits(row, part));
    if (key === "OR") return value.some((part) => fits(row, part));
    if (key === "metadata") return row.metadata?.[value.path[0]] === value.equals;
    if (value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
  for (const [name, rows] of Object.entries(table)) {
    for (const [method, action] of Object.entries({
      findMany: async ({ where, take } = {}) => structuredClone(rows.filter((row) => fits(row, where)).slice(0, take)),
      findUnique: async ({ where }) => structuredClone(rows.find((row) => row.id === where.id) || null),
      create: async ({ data }) => { const row = { id: `generated${++sequence}`, created_date: stamp, ...structuredClone(data) }; rows.push(row); return structuredClone(row); },
      update: async ({ where, data }) => { const row = rows.find((row) => row.id === where.id); if (!row) throw new Error(`${name} missing`); Object.assign(row, structuredClone(data)); return structuredClone(row); },
    })) {
      const original = prisma[name][method]; prisma[name][method] = action;
      t.after(() => { prisma[name][method] = original; });
    }
  }
  const app = express(); app.use(express.json()); app.use("/api/functions", routes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (action, body, userId = "p0") => {
    const user = table.user.find((user) => user.id === userId);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/functions/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signUser(user)}` }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const payload = { match_type: type, match_id: "match", reason: "cheating", description: "Please review the clip from round 3", reported_against: "p5", reported_against_name: "Forged name", evidence_urls: ["https://example.com/clip"] };
  return { table, request, payload };
}

for (const type of ["8s", "money8s"]) test(`${type}: report, admin conversation, proof review, ban and resolution stay linked`, async (t) => {
  const { table, request, payload } = await fixture(t, type);
  const created = (await request("createDispute", payload)).data;
  assert.equal(created.success, true);
  assert.ok(created.ticket.id);
  assert.equal(created.dispute.ticket_id, created.ticket.id);
  assert.equal(created.dispute.reason, "cheating");
  assert.equal(created.dispute.reported_against_name, "Player 5");
  assert.equal(created.dispute.action_url, "/8s-match/match");
  assert.equal(created.dispute.match_roster.length, 8);
  assert.equal(created.dispute.match_roster[5].activision_id, "Player5#1234567");
  assert.ok(!JSON.stringify(created.dispute.match_roster).includes("private"));
  assert.equal(created.dispute.chat_logs[0].content, "Ready");
  assert.equal(created.dispute.match_history[0].summary, "Round 1");
  assert.equal(created.ticket.dispute_reason, "cheating");
  assert.equal(created.ticket.match_roster.length, 8);
  assert.equal(created.ticket.match_id, "match");
  assert.equal(table.wager[0].metadata.status, "disputed");
  const response = (await request("replyTicket", { ticket_id: created.ticket.id, message: "Please add the full clip." }, "admin")).data;
  assert.equal(response.success, true);
  assert.equal(response.ticket.messages[0].content, "Please add the full clip.");
  assert.equal((await request("replyTicket", { ticket_id: created.ticket.id, message: "Here is the full clip." }, "p5")).data.success, true);
  assert.equal((await request("replyTicket", { ticket_id: created.ticket.id, message: "Not involved" }, "outsider")).data.success, false);
  assert.equal((await request("moderateDispute", { dispute_id: created.dispute.id, action: "review_proof", notes: "Reviewed round 3" }, "admin")).data.success, true);
  assert.equal(table.dispute[0].metadata.status, "under_review");
  assert.equal(table.dispute[0].metadata.proof_reviewed_by, "admin");
  assert.equal((await request("moderateDispute", { dispute_id: created.dispute.id, action: "ban_player", user_id: "p5", duration: "7d", notes: "Prohibited software confirmed" }, "admin")).data.success, true);
  assert.equal(table.user.find((user) => user.id === "p5").is_banned, true);
  assert.equal(table.ban.length, 1);
  assert.equal(table.ban[0].metadata.ban_type, "temporary");
  assert.equal(table.wager[0].metadata.status, "disputed", "ban does not choose a winner automatically");
  const resolved = (await request("moderateDispute", { dispute_id: created.dispute.id, action: "resolve_dispute", notes: "Account action completed; match may resume" }, "admin")).data;
  assert.equal(resolved.success, true);
  assert.equal(table.dispute[0].metadata.status, "resolved");
  assert.equal(table.ticket[0].metadata.status, "resolved");
  assert.equal(table.wager[0].metadata.status, "in_progress");
  assert.equal((await request("moderateDispute", { dispute_id: created.dispute.id, action: "review_proof" }, "admin")).data.success, false);
});

test("additional reports preserve categories, explanations and proof without creating another case", async (t) => {
  const { table, request, payload } = await fixture(t);
  const first = (await request("createDispute", payload)).data;
  const secondPayload = { ...payload, reason: "wrong_activision", reported_against: "p6", description: "Player 6 is using a different Activision account", evidence_urls: ["https://example.com/screenshot"] };
  const second = (await request("createDispute", secondPayload, "p1")).data;
  assert.equal(second.success, true);
  assert.equal(first.dispute.id, second.dispute.id);
  assert.equal(table.dispute.length, 1);
  assert.equal(table.ticket.length, 1);
  assert.equal(table.dispute[0].metadata.submissions.length, 2);
  assert.equal(table.dispute[0].metadata.submissions[1].reason, "wrong_activision");
  assert.equal(table.ticket[0].metadata.submitted_proof.length, 2);
  assert.match(table.ticket[0].metadata.messages[0].content, /different Activision account/);
  await request("createDispute", secondPayload, "p1");
  assert.equal(table.dispute[0].metadata.submissions.length, 2);
  assert.equal(table.ticket[0].metadata.messages.length, 1);
});

test("forged reporters, wrong players, unsafe proof, closed matches and non-staff moderation are rejected", async (t) => {
  const { table, request, payload } = await fixture(t);
  assert.equal((await request("createDispute", payload, "outsider")).data.success, false);
  for (const change of [{ reported_against: "outsider" }, { reported_against: "p0" }, { evidence_urls: ["javascript:alert(1)"] }, { reason: "invented" }, { description: "" }, { match_type: "money8s" }]) {
    assert.equal((await request("createDispute", { ...payload, ...change })).data.success, false);
  }
  assert.equal(table.dispute.length, 0);
  const created = (await request("createDispute", payload)).data;
  assert.equal((await request("moderateDispute", { dispute_id: created.dispute.id, action: "ban_player", user_id: "p5", notes: "testing" })).status, 403);
  assert.equal((await request("moderateDispute", { dispute_id: created.dispute.id, action: "ban_player", user_id: "outsider", notes: "testing" }, "admin")).data.success, false);
  assert.equal(table.ban.length, 0);
  table.wager[0].metadata.status = "cancelled";
  assert.equal((await request("createDispute", payload)).data.success, false);
});

test("resolving a linked ticket also resolves the dispute and restores the pre-dispute lobby state", async (t) => {
  const { table, request, payload } = await fixture(t);
  table.wager[0].metadata.status = "open";
  const created = (await request("createDispute", { ...payload, reason: "wrong_rules", reported_against: "" })).data;
  const result = (await request("resolveTicket", { ticket_id: created.ticket.id, resolution: "Settings corrected before match start" }, "admin")).data;
  assert.equal(result.success, true);
  assert.equal(table.dispute[0].metadata.status, "resolved");
  assert.equal(table.ticket[0].metadata.status, "resolved");
  assert.equal(table.wager[0].metadata.status, "open");
});

test("failed match-result actions leave the case open for staff", async (t) => {
  const { table, request, payload } = await fixture(t);
  const created = (await request("createDispute", payload)).data;
  table.wager[0].metadata.challenger_id = "";
  const result = (await request("moderateDispute", { dispute_id: created.dispute.id, action: "approve_team_b", notes: "Review complete" }, "admin")).data;
  assert.equal(result.success, false);
  assert.equal(table.dispute[0].metadata.status, "pending");
  assert.equal(table.ticket[0].metadata.status, "waiting_for_admin");
});

test("simultaneous submissions share one dispute and conversation", async (t) => {
  const { table, request, payload } = await fixture(t);
  const responses = await Promise.all([request("createDispute", payload), request("createDispute", { ...payload, reason: "smurfing", description: "Alternate account with a misleading rank" }, "p1")]);
  assert.ok(responses.every((response) => response.data.success));
  assert.equal(table.dispute.length, 1);
  assert.equal(table.ticket.length, 1);
  assert.equal(table.dispute[0].metadata.submissions.length, 2);
});
