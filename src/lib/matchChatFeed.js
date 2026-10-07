// A feed belongs to one room. Coalesce refreshes and retain server-confirmed
// sends until a snapshot acknowledges them. Failed reads preserve history.
export function createMatchChatFeed({ conversationId, read, onChange, onError, limit = 100 }) {
  let disposed = false;
  let inFlight = null;
  let signature = "";
  let messages = [];
  const pending = new Map();
  const optimistic = new Map();
  const belongs = (row) => row?.id && (!row.conversation_id || String(row.conversation_id) === String(conversationId));
  const acknowledges = (server, local) => !server.sending && server.client_message_id === local.client_message_id
    && String(server.sender_id) === String(local.sender_id) && belongs(server);
  const publish = (rows) => {
    const byId = new Map(rows.filter(belongs).map((row) => [String(row.id), row]));
    for (const [id, row] of pending) if (!byId.has(id)) byId.set(id, row);
    for (const [id, row] of optimistic) {
      if ([...byId.values()].some((server) => acknowledges(server, row))) {
        optimistic.delete(id);
        byId.delete(id);
      } else byId.set(id, row);
    }
    const next = [...byId.values()].sort((a, b) => {
      const date = (Date.parse(a.created_date) || 0) - (Date.parse(b.created_date) || 0);
      return date || String(a.id).localeCompare(String(b.id));
    }).slice(-limit);
    const nextSignature = JSON.stringify(next);
    messages = next;
    if (nextSignature !== signature) {
      signature = nextSignature;
      onChange(next);
    }
  };
  return {
    refresh() {
      if (disposed) return Promise.resolve(false);
      if (inFlight) return inFlight;
      const request = Promise.resolve().then(read).then((rows) => {
        if (disposed) return false;
        const snapshot = (rows || []).filter(belongs);
        for (const row of snapshot) pending.delete(String(row.id));
        publish(snapshot);
        return true;
      }).catch((error) => {
        if (!disposed) onError(error);
        return false;
      }).finally(() => {
        if (inFlight === request) inFlight = null;
      });
      inFlight = request;
      return request;
    },
    addConfirmed(message) {
      if (disposed || !belongs(message)) return false;
      pending.set(String(message.id), message);
      if (pending.size > limit) pending.delete(pending.keys().next().value);
      publish([...messages.filter((row) => String(row.id) !== String(message.id)), message]);
      return true;
    },
    beginSend(message) {
      if (disposed || !belongs(message) || !message.client_message_id) return false;
      const local = { ...message, sending: true };
      optimistic.set(String(local.id), local);
      publish([...messages, local]);
      return true;
    },
    confirmSend(localId, message) {
      if (disposed || !belongs(message)) return false;
      optimistic.delete(String(localId));
      pending.set(String(message.id), message);
      publish([...messages.filter((row) => String(row.id) !== String(localId)), message]);
      return true;
    },
    failSend(localId) {
      if (disposed) return false;
      // A poll can confirm the write before its HTTP response arrives or fails.
      // In that case do not restore the draft and encourage a duplicate send.
      if (!optimistic.has(String(localId))) return false;
      optimistic.delete(String(localId));
      publish(messages.filter((row) => String(row.id) !== String(localId)));
      return true;
    },
    dispose() { disposed = true; pending.clear(); optimistic.clear(); },
  };
}
