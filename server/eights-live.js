import jwt from "jsonwebtoken";
import WebSocket, { WebSocketServer } from "ws";
import { getEntity, listEntities } from "./entity.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const EIGHTS_LIVE_PATH = "/api/eights-live";
const clients = new Set();

const send = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
};

const mayWatchLobby = async (wagerId, userId, allowStaff = false) => {
  const wager = await getEntity("Wager", wagerId).catch(() => null);
  if (!wager || !["8s", "money8s"].includes(wager.match_type)) return false;
  if (allowStaff) return true;
  const participants = await listEntities("WagerParticipant", { wager_id: wager.id }, "-joined_date", 20).catch(() => []);
  return participants.some((participant) => String(participant.user_id) === String(userId));
};

export const issueEightsLiveToken = async (userId, wagerId, allowStaff = false) => {
  if (!await mayWatchLobby(wagerId, userId, allowStaff)) {
    const error = new Error("Only lobby players can receive live updates");
    error.status = 403;
    throw error;
  }
  return {
    token: jwt.sign(
      { sub: String(userId), wager_id: String(wagerId), scope: "eights-live", staff: Boolean(allowStaff) },
      JWT_SECRET,
      { expiresIn: "30m", audience: "eights-live", issuer: "topfragg" },
    ),
    path: EIGHTS_LIVE_PATH,
  };
};

export const publishEightsLobbyUpdate = (wagerId, reason = "updated") => {
  const id = String(wagerId || "");
  if (!id) return;
  clients.forEach((client) => {
    if (client.wagerId === id) send(client.socket, { type: "eights-lobby-updated", wager_id: id, reason });
  });
};

export const attachEightsLiveServer = (server) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on("upgrade", (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== EIGHTS_LIVE_PATH) return;
    const token = url.searchParams.get("token");
    if (!token) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit("connection", webSocket, token);
    });
  });

  wss.on("connection", async (socket, token) => {
    try {
      const payload = jwt.verify(token, JWT_SECRET, { audience: "eights-live", issuer: "topfragg" });
      if (payload.scope !== "eights-live" || !await mayWatchLobby(payload.wager_id, payload.sub, payload.staff === true)) throw new Error("Unauthorized");
      const client = { socket, wagerId: String(payload.wager_id) };
      clients.add(client);
      send(socket, { type: "eights-lobby-ready", wager_id: client.wagerId });
      socket.on("close", () => clients.delete(client));
      socket.on("error", () => clients.delete(client));
    } catch {
      socket.close(1008, "Unauthorized");
    }
  });

  return wss;
};
