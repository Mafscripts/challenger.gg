// Keep confirmed sends and read acknowledgements across older polling snapshots.
export function createDirectMessageInbox({ userId, read, onMessages, onUsers, onError }) {
  let disposed = false, inFlight = null, messages = [], signature = "";
  const pending = new Map(), readIds = new Set();
  const belongs = (row) => row?.id && row.message_type === "direct_message"
    && [row.sender_id, row.recipient_id].includes(userId);
  const publish = (rows) => {
    const byId = new Map(rows.filter(belongs).map((row) => [row.id, readIds.has(row.id) ? { ...row, is_read: true } : row]));
    for (const [id, row] of pending) if (!byId.has(id)) byId.set(id, row);
    messages = [...byId.values()].sort((a, b) => (Date.parse(a.created_date) || 0) - (Date.parse(b.created_date) || 0) || String(a.id).localeCompare(String(b.id)));
    const nextSignature = JSON.stringify(messages);
    if (signature !== nextSignature) { signature = nextSignature; onMessages(messages); }
  };
  return {
    refresh({ initial = false } = {}) {
      if (disposed) return Promise.resolve(false);
      if (inFlight) return inFlight;
      const request = Promise.resolve().then(read).then((data) => {
        if (disposed) return false;
        if (!data?.success || !Array.isArray(data.messages)) throw new Error(data?.error || "Could not load messages");
        for (const row of data.messages) pending.delete(row.id);
        publish(data.messages);
        onUsers(data.users || [], initial ? messages : null);
        return true;
      }).catch((error) => { if (!disposed) onError(error, initial); return false; })
        .finally(() => { if (inFlight === request) inFlight = null; });
      inFlight = request;
      return request;
    },
    addConfirmed(message) {
      if (disposed || !belongs(message)) return false;
      pending.set(message.id, message);
      // A polling response and send response can acknowledge the same write.
      publish([...messages, message]);
      return true;
    },
    markRead(ids) {
      if (disposed) return;
      const incoming = new Set(messages.filter((row) => row.recipient_id === userId).map((row) => row.id));
      for (const id of ids) if (incoming.has(id)) readIds.add(id);
      publish(messages);
    },
    dispose() { disposed = true; pending.clear(); readIds.clear(); },
  };
}

export function clearSentDraft(drafts, recipientId, submittedDraft) {
  return drafts[recipientId] === submittedDraft ? { ...drafts, [recipientId]: "" } : drafts;
}
