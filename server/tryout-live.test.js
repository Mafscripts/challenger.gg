import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import { prisma } from "./prisma.js";
import { tryoutHandlers } from "./tryouts.js";
import { attachTryoutLiveServer, issueTryoutLiveToken } from "./tryout-live.js";
import { subscribeTryoutUpdates } from "../src/lib/tryoutLive.js";

const replaceMethod = (t, object, method, replacement) => {
  const original = object[method];
  object[method] = replacement;
  t.after(() => { object[method] = original; });
};

test("joining/leaving updates other viewers immediately, only after commit and within the subscribed room", async (t) => {
  const admin = { id: "admin", role: "admin", email_verified: true };
  const player = { id: "player", badges: [{ type: "challengers" }], activision_id: "player#123", email_verified: true };
  const rows = new Map(["a", "b"].map((id) => [id, {
    id, created_date: new Date(), updated_date: new Date(),
    metadata: { name: id, status: "lobby", players: [], messages: [], maps: [], version: 1 },
  }]));
  replaceMethod(t, prisma.user, "findUnique", async () => admin);
  replaceMethod(t, prisma.tryoutRoom, "findUnique", async ({ where }) => rows.get(where.id));
  let failCommit = false;
  replaceMethod(t, prisma, "$transaction", async (callback) => {
    let staged;
    const result = await callback({
      $executeRaw: async () => {},
      tryoutRoom: {
        findUnique: async ({ where }) => rows.get(where.id),
        findFirst: async () => null,
        update: async ({ where, data }) => (staged = { ...rows.get(where.id), metadata: data.metadata }),
      },
    });
    if (failCommit) throw new Error("Commit failed");
    rows.set(staged.id, staged);
    return result;
  });
  const server = http.createServer();
  const wss = attachTryoutLiveServer(server);
  t.after(() => { for (const socket of wss.clients) socket.terminate(); wss.close(); server.close(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `ws://127.0.0.1:${server.address().port}`;
  const watch = async (roomId) => {
    const { token, path } = issueTryoutLiveToken(admin.id, roomId);
    const socket = new WebSocket(`${origin}${path}?token=${token}`);
    const ready = JSON.parse(String((await once(socket, "message"))[0]));
    assert.equal(ready.type, "tryout-ready");
    return socket;
  };
  const [a, b, overview] = await Promise.all([watch("a"), watch("b"), watch(null)]);
  const otherUpdates = [];
  b.on("message", (raw) => otherUpdates.push(String(raw)));
  for (const action of ["join", "chat", "leave"]) {
    const notified = once(a, "message");
    const summaryNotified = once(overview, "message");
    await tryoutHandlers.updateTryoutRoom({ user: player, body: { room_id: "a", action, message: "Hello team" } });
    assert.deepEqual(JSON.parse(String((await notified)[0])), { type: "tryout-updated", room_id: "a" });
    await summaryNotified;
    assert.equal(rows.get("a").metadata.players.length, action === "leave" ? 0 : 1);
  }
  assert.deepEqual(otherUpdates, []);
  let failedUpdates = 0;
  a.on("message", () => failedUpdates++);
  failCommit = true;
  await assert.rejects(tryoutHandlers.updateTryoutRoom({ user: player, body: { room_id: "a", action: "join" } }), /Commit failed/);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(failedUpdates, 0);
  assert.equal(rows.get("a").metadata.players.length, 0);

  // A signed token cannot bypass current membership or badge checks.
  prisma.user.findUnique = async () => player;
  const rejected = new WebSocket(`${origin}/api/tryout-live?token=${issueTryoutLiveToken(player.id, "b").token}`);
  assert.equal((await once(rejected, "close"))[0], 1008);
  await assert.rejects(tryoutHandlers.getTryoutLiveUpdatesToken({ user: player, body: { room_id: "b" } }), { status: 403 });
  await assert.rejects(tryoutHandlers.getTryoutLiveUpdatesToken({ user: { id: "outsider" }, body: {} }), { status: 403 });
});

test("browser subscription refreshes on ready and joins, reconnects, and stops on navigation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets = [];
  class Socket {
    static CLOSING = 2;
    readyState = 1;
    constructor() { sockets.push(this); }
    close() { this.readyState = 3; this.onclose?.(); }
    message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
  }
  let updates = 0, tokenRequests = 0;
  const stop = subscribeTryoutUpdates({
    roomId: "a", WebSocketImpl: Socket,
    requestToken: async () => { tokenRequests++; return { data: { path: "/api/tryout-live", token: "test" } }; },
    urlForToken: () => "ws://localhost/api/tryout-live",
    onUpdate: () => updates++,
  });
  t.after(stop);
  await Promise.resolve();
  sockets[0].message({ type: "tryout-ready" });
  sockets[0].message({ type: "tryout-updated", room_id: "a" });
  sockets[0].message({ type: "tryout-updated", room_id: "b" });
  sockets[0].onmessage({ data: "invalid JSON" });
  assert.equal(updates, 2);
  sockets[0].close();
  t.mock.timers.tick(2000);
  await Promise.resolve();
  assert.equal(tokenRequests, 2);
  sockets[1].message({ type: "tryout-ready" });
  assert.equal(updates, 3);
  stop();
  sockets[1].message({ type: "tryout-updated", room_id: "a" });
  t.mock.timers.tick(10000);
  assert.equal(updates, 3);
  assert.equal(tokenRequests, 2);
});

test("navigation during token fetch does not open a stale subscription", async () => {
  let resolve, opened = false;
  const token = new Promise((done) => { resolve = done; });
  const stop = subscribeTryoutUpdates({
    requestToken: () => token, urlForToken: () => "unused", onUpdate: () => {},
    WebSocketImpl: class { constructor() { opened = true; } },
  });
  stop();
  resolve({ data: { token: "late" } });
  await Promise.resolve();
  assert.equal(opened, false);
});
