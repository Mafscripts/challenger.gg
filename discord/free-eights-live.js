import WebSocket from "ws";
import { issueEightsDiscordToken } from "../server/eights-discord-events.js";

export function startFreeEightsLiveUpdates({ guildId, publicUrl, onUpdate, onReady = () => {}, onError = console.error, reconnectMs = 5000 }) {
  const url = new URL("/api/eights-live", publicUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  let socket, reconnect, heartbeat, stopped = false;
  const connect = () => {
    if (stopped) return;
    socket = new WebSocket(url, { headers: { Authorization: `Bearer ${issueEightsDiscordToken(guildId)}` }, handshakeTimeout: 10000, maxPayload: 4096 });
    let alive = true;
    socket.on("open", () => {
      heartbeat = setInterval(() => {
        if (!alive) { socket.terminate(); return; }
        alive = false; socket.ping();
      }, 15000);
      heartbeat.unref?.();
    });
    socket.on("pong", () => { alive = true; });
    socket.on("message", (raw) => {
      try {
        const event = JSON.parse(String(raw));
        if (event.type === "eights-discord-ready") onReady();
        else if (event.type === "eights-lobby-updated" && /^[a-z0-9_-]{1,128}$/i.test(event.wager_id)) onUpdate(event.wager_id);
      } catch (error) { onError("[Topfragg Free 8s Discord] Live update failed:", error.message); }
    });
    socket.on("error", (error) => onError("[Topfragg Free 8s Discord] Live connection unavailable; polling remains active:", error.message));
    socket.on("close", () => {
      clearInterval(heartbeat);
      if (!stopped) { reconnect = setTimeout(connect, reconnectMs); reconnect.unref?.(); }
    });
  };
  connect();
  return () => { stopped = true; clearTimeout(reconnect); clearInterval(heartbeat); socket?.terminate(); };
}

// Targeted updates bypass the full-lobby sweep. Duplicate updates coalesce
// per match; a held advisory lock retries without blocking other matches.
export function createFreeEightsVoiceUpdater(sync, { retryMs = 1000, onError = console.error } = {}) {
  const pending = new Map();
  let stopped = false;
  const request = (id) => {
    if (stopped) return;
    const state = pending.get(id) || { running: false, timer: null, requested: false };
    pending.set(id, state);
    state.requested = true;
    if (state.running || state.timer) return;
    state.running = true;
    void (async () => {
      try {
        do {
          state.requested = false;
          const result = await sync(id);
          if (result?.deferredMatchIds?.includes(id) && !stopped) {
            state.timer = setTimeout(() => { state.timer = null; request(id); }, retryMs);
            state.timer.unref?.();
            break;
          }
        } while (state.requested && !stopped);
      } catch (error) { onError("[Topfragg Free 8s Discord] Targeted sync failed:", error.message); }
      finally { state.running = false; if (!state.timer) pending.delete(id); }
    })();
  };
  return { request, stop: () => { stopped = true; for (const state of pending.values()) clearTimeout(state.timer); pending.clear(); } };
}
