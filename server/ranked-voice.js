import jwt from "jsonwebtoken";
import WebSocket, { WebSocketServer } from "ws";
import { getEntity } from "./entity.js";
import { prisma } from "./prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const VOICE_PATH = "/api/ranked-voice";
const LIVE_STATUSES = new Set([
  "in_progress",
  "pending_confirmation",
  "awaiting_confirmation",
  "awaiting_team_alpha_report",
  "awaiting_team_bravo_report",
  "score_conflict",
  "disputed",
]);
const GLOBAL_STATUSES = new Set(["ready", "completed"]);
const clients = new Set();

const rosterIds = (match, side) => {
  const stored = match?.[`team_${side}_player_ids`];
  if (Array.isArray(stored) && stored.length > 0) return [...new Set(stored.filter(Boolean).map(String))];
  const fallback = side === "alpha" ? match?.host_id : match?.challenger_id;
  return fallback ? [String(fallback)] : [];
};

const userName = (user) => user?.display_name || user?.full_name || user?.username || "TopFragg player";

const safeSend = (socket, payload) => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

export const rankedVoiceMembershipFor = (match, userId) => {
  const normalizedUserId = String(userId);
  const alpha = rosterIds(match, "alpha");
  const bravo = rosterIds(match, "bravo");
  const side = alpha.includes(normalizedUserId) ? "alpha" : bravo.includes(normalizedUserId) ? "bravo" : null;
  if (!side) return null;

  const status = String(match.status || "open");
  if (status === "cancelled") return { side, stage: "disabled", channelId: null, channelName: "Voice closed" };
  if (GLOBAL_STATUSES.has(status)) {
    return { side, stage: "global", channelId: `${match.id}:global`, channelName: "Global Voice" };
  }
  if (LIVE_STATUSES.has(status)) {
    return {
      side,
      stage: "team",
      channelId: `${match.id}:team:${side}`,
      channelName: side === "alpha" ? "Team Alpha Voice" : "Team Bravo Voice",
    };
  }
  return { side, stage: "waiting", channelId: null, channelName: "Waiting for all players" };
};

const currentMembership = async (matchId, userId) => {
  const match = await getEntity("RankedMatch", matchId);
  return { match, membership: rankedVoiceMembershipFor(match, userId) };
};

const participantFor = (client) => ({
  user_id: client.user.id,
  username: userName(client.user),
  avatar_url: client.user.metadata?.avatar_url || "",
  side: client.membership?.side || null,
  muted: Boolean(client.muted),
  deafened: Boolean(client.deafened),
  speaking: Boolean(client.speaking && !client.muted),
});

const broadcastSnapshots = (matchId) => {
  const matchClients = [...clients].filter((client) => client.matchId === matchId && client.socket.readyState === WebSocket.OPEN);
  matchClients.forEach((client) => {
    const channelId = client.membership?.channelId;
    const peers = channelId
      ? matchClients.filter((candidate) => candidate.membership?.channelId === channelId)
      : [client];
    safeSend(client.socket, {
      type: "voice-state",
      stage: client.membership?.stage || "disabled",
      channel: client.membership?.channelName || "Voice unavailable",
      side: client.membership?.side || null,
      participants: peers.map(participantFor),
    });
  });
};

const revalidateClient = async (client) => {
  try {
    const { membership } = await currentMembership(client.matchId, client.user.id);
    if (!membership || membership.stage === "disabled") {
      safeSend(client.socket, { type: "voice-error", message: "You no longer have access to this ranked voice room." });
      client.socket.close(1008, "Ranked voice access ended");
      return;
    }
    const previousChannel = client.membership?.channelId;
    client.membership = membership;
    if (previousChannel !== membership.channelId) {
      safeSend(client.socket, {
        type: "channel-changed",
        stage: membership.stage,
        channel: membership.channelName,
        side: membership.side,
      });
      broadcastSnapshots(client.matchId);
    }
  } catch {
    client.socket.close(1011, "Could not verify ranked voice access");
  }
};

const forwardSignal = async (client, message) => {
  const targetId = String(message.target || "");
  if (!targetId || targetId === String(client.user.id)) return;
  const target = [...clients].find((candidate) => (
    candidate.matchId === client.matchId
    && String(candidate.user.id) === targetId
    && candidate.socket.readyState === WebSocket.OPEN
  ));
  if (!target) return;

  // Re-read the match for every SDP/ICE relay. The browser never chooses a
  // channel: both users must still resolve to the same server-owned channel.
  const [senderAccess, targetAccess] = await Promise.all([
    currentMembership(client.matchId, client.user.id),
    currentMembership(target.matchId, target.user.id),
  ]);
  const senderChannel = senderAccess.membership?.channelId;
  const targetChannel = targetAccess.membership?.channelId;
  if (!senderChannel || senderChannel !== targetChannel) {
    safeSend(client.socket, { type: "signal-rejected", target: targetId });
    return;
  }
  client.membership = senderAccess.membership;
  target.membership = targetAccess.membership;
  safeSend(target.socket, {
    type: message.type,
    from: client.user.id,
    description: message.description,
    candidate: message.candidate,
  });
};

const handleConnection = async (socket, request, token) => {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { audience: "ranked-voice", issuer: "topfragg" });
  } catch {
    socket.close(1008, "Invalid voice session");
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user || user.is_banned || user.email_verified !== true) {
      socket.close(1008, "Voice authentication failed");
      return;
    }
    const { membership } = await currentMembership(String(payload.match_id), user.id);
    if (!membership || membership.stage === "disabled") {
      socket.close(1008, "Ranked voice access denied");
      return;
    }

    for (const existing of clients) {
      if (existing.matchId === String(payload.match_id) && existing.user.id === user.id) {
        existing.socket.close(1000, "Voice moved to a newer session");
      }
    }

    const client = {
      socket,
      request,
      user,
      matchId: String(payload.match_id),
      membership,
      muted: false,
      deafened: false,
      speaking: false,
      alive: true,
    };
    clients.add(client);
    broadcastSnapshots(client.matchId);

    socket.on("pong", () => { client.alive = true; });
    socket.on("message", async (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (["offer", "answer", "ice-candidate"].includes(message.type)) {
        await forwardSignal(client, message).catch(() => null);
        return;
      }
      if (message.type === "presence") {
        client.muted = Boolean(message.muted);
        client.deafened = Boolean(message.deafened);
        client.speaking = Boolean(message.speaking) && !client.muted;
        broadcastSnapshots(client.matchId);
      }
    });
    socket.on("close", () => {
      clients.delete(client);
      broadcastSnapshots(client.matchId);
    });
    socket.on("error", () => null);
  } catch {
    socket.close(1011, "Ranked voice unavailable");
  }
};

export const issueRankedVoiceToken = async (userId, matchId) => {
  const { membership } = await currentMembership(matchId, userId);
  if (!membership) {
    const error = new Error("Only ranked match players can join voice");
    error.status = 403;
    throw error;
  }
  return {
    token: jwt.sign(
      { sub: String(userId), match_id: String(matchId), scope: "ranked-voice" },
      JWT_SECRET,
      { expiresIn: "5m", audience: "ranked-voice", issuer: "topfragg" },
    ),
    path: VOICE_PATH,
    stage: membership.stage,
    channel: membership.channelName,
  };
};

export const attachRankedVoiceServer = (server) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== VOICE_PATH) return;
    const token = url.searchParams.get("token");
    if (!token) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit("connection", webSocket, request, token);
    });
  });

  wss.on("connection", handleConnection);

  const membershipTimer = setInterval(() => {
    [...clients].forEach((client) => revalidateClient(client));
  }, 1500);
  const heartbeatTimer = setInterval(() => {
    [...clients].forEach((client) => {
      if (!client.alive) {
        client.socket.terminate();
        return;
      }
      client.alive = false;
      client.socket.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(membershipTimer);
    clearInterval(heartbeatTimer);
  });
  return wss;
};
