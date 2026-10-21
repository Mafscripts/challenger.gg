import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import { matchPostedNotification } from "./match-posted-notification.js";
import { notifyMatchPostedResponse } from "../src/lib/notificationInbox.js";

test("posted match notifications link to matchfinder for unaccepted XP posts and rooms for other competitions", () => {
  for (const [entity, match_type, path, title] of [
    ["RankedMatch", "ranked", "/ranked-match/match", "Ranked match posted"],
    ["XPMatch", "xp", "/xp#matchfinder", "XP match posted"],
    ["Wager", "wagers", "/wagers-match/match", "Cash match posted"],
    ["Wager", "8s", "/8s-match/match", "Free 8s lobby posted"],
    ["Wager", "money8s", "/8s-match/match", "Money 8s lobby posted"],
  ]) {
    const notice = matchPostedNotification(entity, { id: "match", match_type, team_size: "4v4", game_mode_display: "Hardpoint" });
    assert.equal(notice.title, title);
    assert.equal(notice.action_url, path);
    assert.equal(notice.related_entity_type, entity);
    assert.equal(notice.event, "match_posted");
    assert.match(notice.message, /4v4 · Hardpoint/);
  }
});

test("real match posting creates one unread notification for the authenticated poster only, with no notification for rejected posts", async (t) => {
  const user = { id: "poster", username: "Poster", role: "user", email_verified: true, metadata: { activision_id: "Poster#123" } };
  const notices = [];
  let serial = 0;
  const override = (target, name, fn) => { const original = target[name]; target[name] = fn; t.after(() => { target[name] = original; }); };
  override(prisma.user, "findUnique", async ({ where }) => where.id === user.id ? structuredClone(user) : null);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.rankedMatch, "findMany", async () => []);
  for (const delegate of [prisma.rankedMatch, prisma.xPMatch]) {
    override(delegate, "create", async ({ data }) => ({ id: `match-${++serial}`, created_date: new Date(), ...data }));
  }
  override(prisma.notification, "create", async ({ data }) => {
    notices.push(data.metadata);
    return { id: `notice-${notices.length}`, created_date: new Date(), ...data };
  });
  const app = express(); app.use(express.json()); app.use("/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const post = async (name, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/functions/${name}`, {
      method: "POST", headers: { Authorization: `Bearer ${signUser(user)}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const name of ["createRankedMatch", "createXPMatch"]) {
    const count = notices.length;
    const result = await post(name, { game_mode: "hp", team_size: "1v1", user_id: "someone-else", host_id: "someone-else" });
    assert.equal(result.success, true);
    assert.equal(notices.length, count + 1);
    assert.equal(notices.at(-1).user_id, user.id);
    assert.equal(notices.at(-1).is_read, false);
    assert.equal(notices.at(-1).related_entity_id, result.ranked_match_id || result.xp_match_id);
    assert.equal((await post(name, { game_mode: "invalid", team_size: "1v1" })).success, false);
    assert.equal(notices.length, count + 1);
  }
});

test("successful posting and XP acceptance refresh the bell immediately; rejected and unrelated actions do not", (t) => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const events = [];
  window.addEventListener("topfragg:notifications-updated", (event) => events.push(event.detail));
  for (const name of ["createWager", "createRankedMatch", "createXPMatch", "acceptXPMatch"]) notifyMatchPostedResponse({ success: true }, name);
  assert.deepEqual(events, Array.from({ length: 4 }, () => ({ refresh: true })));
  notifyMatchPostedResponse({ success: false }, "createWager");
  notifyMatchPostedResponse({ success: true }, "getDirectMessages");
  notifyMatchPostedResponse({}, "createXPMatch");
  assert.equal(events.length, 4);
});
