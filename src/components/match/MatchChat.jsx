import React, { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { base44 } from "@/api/base44Client";

const accents = {
  cyan: {
    icon: "text-cyan",
    border: "border-cyan/20",
    text: "text-cyan",
  },
  green: {
    icon: "text-green",
    border: "border-green/20",
    text: "text-green",
  },
  orange: {
    icon: "text-orange",
    border: "border-orange/20",
    text: "text-orange",
  },
  purple: {
    icon: "text-purple",
    border: "border-purple/20",
    text: "text-purple",
  },
};

const formatDate = (value) => value ? new Date(value).toLocaleString() : "";

export default function MatchChat({ conversationId, accent = "cyan" }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const tone = accents[accent] || accents.cyan;

  useEffect(() => {
    let mounted = true;

    async function loadMessages() {
      if (!conversationId) {
        setMessages([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const rows = await base44.entities.ChatMessage
        .filter({ conversation_id: conversationId }, "-created_date", 100)
        .catch(() => []);

      if (mounted) {
        setMessages((rows || []).slice().reverse());
        setLoading(false);
      }
    }

    loadMessages();
    return () => {
      mounted = false;
    };
  }, [conversationId]);

  return (
    <div className={`glass rounded-xl border ${tone.border} overflow-hidden flex flex-col h-[600px] sticky top-6`}>
      <div className="px-4 py-3 bg-secondary/50 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <MessageSquare className={`w-4 h-4 ${tone.icon}`} /> Match Chat
        </h3>
        <span className="text-xs text-vapor">{messages.length > 0 ? `${messages.length} messages` : "No messages"}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-vapor">Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <MessageSquare className="w-8 h-8 text-vapor/30 mb-3" />
            <p className="text-sm text-vapor">No chat messages yet.</p>
          </div>
        ) : messages.map((message) => (
          <div key={message.id} className="rounded-lg bg-secondary/40 border border-white/5 p-3">
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className={`text-xs font-semibold ${tone.text}`}>{message.sender_name || "Unknown sender"}</span>
              <span className="text-[10px] text-vapor">{formatDate(message.created_date)}</span>
            </div>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
