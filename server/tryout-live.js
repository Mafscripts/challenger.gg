import { EventEmitter } from "node:events";
import jwt from "jsonwebtoken";
import WebSocket, { WebSocketServer } from "ws";
import { prisma } from "./prisma.js";
import { publicUser } from "./auth.js";
import { canAccessTryouts, canManageTryouts } from "../src/lib/tryouts.js";

const secret = process.env.JWT_SECRET || "dev-secret-change-me";
const path = "/api/tryout-live";
const updates = new EventEmitter();

export const issueTryoutLiveToken = (userId, roomId = null) => ({
  token: jwt.sign({ sub: userId, room_id: roomId, scope: "tryout-live" }, secret,
    { expiresIn: "30m", audience: "tryout-live", issuer: "topfragg" }),
  path,
});

// Publish only after the transaction commits. Clients fetch through the
// protected API, so the notification never carries private roster/chat data.
export const publishTryoutUpdate = (roomId) => updates.emit("updated", roomId);

export function attachTryoutLiveServer(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const clients = new Set();
  const send = (socket, payload) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  const publish = (roomId) => {
    for (const client of clients) {
      if (!client.roomId || client.roomId === roomId) {
        send(client.socket, { type: "tryout-updated", room_id: roomId });
      }
    }
  };
  updates.on("updated", publish);

  const upgrade = (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== path) return;
    let payload;
    try {
      payload = jwt.verify(url.searchParams.get("token"), secret, { audience: "tryout-live", issuer: "topfragg" });
      if (payload.scope !== "tryout-live" || !payload.sub || (payload.room_id !== null && typeof payload.room_id !== "string")) throw new Error("Unauthorized");
    } catch {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit("connection", webSocket, payload));
  };
  server.on("upgrade", upgrade);

  wss.on("connection", async (socket, payload) => {
    let expiry;
    const client = { socket, roomId: payload.room_id, alive: true };
    const cleanup = () => { clients.delete(client); clearTimeout(expiry); };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
    socket.on("pong", () => { client.alive = true; });
    try {
      const user = publicUser(await prisma.user.findUnique({ where: { id: payload.sub } }));
      if (!user || !canAccessTryouts(user) || user.is_banned || user.email_verified !== true) throw new Error("Unauthorized");
      if (client.roomId) {
        const room = await prisma.tryoutRoom.findUnique({ where: { id: client.roomId } });
        if (!room || (!canManageTryouts(user) && !room.metadata.players.some((player) => player.user_id === user.id))) throw new Error("Unauthorized");
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      clients.add(client);
      expiry = setTimeout(() => socket.close(1000, "Renew live subscription"), Math.max(0, payload.exp * 1000 - Date.now()));
      expiry.unref();
      send(socket, { type: "tryout-ready", room_id: client.roomId });
    } catch {
      socket.close(1008, "Unauthorized");
    }
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) { client.socket.terminate(); continue; }
      client.alive = false;
      client.socket.ping();
    }
  }, 30000);
  heartbeat.unref();
  wss.on("close", () => {
    clearInterval(heartbeat);
    updates.off("updated", publish);
    server.off("upgrade", upgrade);
  });
  return wss;
}
