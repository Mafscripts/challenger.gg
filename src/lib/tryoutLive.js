export function subscribeTryoutUpdates({ roomId, requestToken, urlForToken, onUpdate, WebSocketImpl = WebSocket }) {
  let closed = false;
  let socket;
  let retry;
  const reconnect = (delay) => {
    if (!closed) retry = setTimeout(connect, delay);
  };
  const connect = async () => {
    try {
      const { data } = await requestToken();
      if (closed) return;
      socket = new WebSocketImpl(urlForToken(data.path, data.token));
      socket.onmessage = (event) => {
        if (closed) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "tryout-ready" || (message.type === "tryout-updated" && (!roomId || message.room_id === roomId))) onUpdate();
        } catch {
          // Polling covers malformed or missed notifications.
        }
      };
      socket.onclose = () => reconnect(2000);
      socket.onerror = () => socket.close();
    } catch {
      reconnect(5000);
    }
  };
  void connect();
  return () => {
    closed = true;
    clearTimeout(retry);
    if (socket && socket.readyState < WebSocketImpl.CLOSING) socket.close(1000, "Leaving Try outs");
  };
}

export function tryoutLiveUrl(path, token) {
  const configured = String(import.meta.env.VITE_API_URL || "/api");
  const base = /^https?:\/\//i.test(configured)
    ? new URL(configured)
    : ["localhost", "127.0.0.1"].includes(window.location.hostname)
      ? new URL("http://localhost:4000")
      : new URL(window.location.origin);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = path;
  base.search = new URLSearchParams({ token }).toString();
  return base.toString();
}
