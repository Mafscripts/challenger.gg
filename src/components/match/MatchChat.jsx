import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import TopfraggLogo from "@/components/brand/TopfraggLogo";

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
const adminRoles = new Set(["ceo", "super_admin", "admin"]);
const displaySenderName = (message) => {
  const name = message.sender_name || "Unknown sender";
  const content = String(message.content || "");
  if (message.system && content.includes("entered the room as admin") && !name.startsWith("Admin ")) {
    return `Admin ${name}`;
  }
  return name;
};
const staffKindForMessage = (message) => {
  const roles = [message.sender_role, message.sender_admin_role, message.admin_role]
    .map((role) => String(role || "").toLowerCase());
  const senderName = String(message.sender_name || "");
  const content = String(message.content || "");
  if (roles.includes("moderator") || senderName.startsWith("Moderator ")) return "moderator";
  if (
    roles.some((role) => adminRoles.has(role))
    || senderName.startsWith("Admin ")
    || (message.system && content.includes("entered the room as admin"))
    || (message.system && content.includes("has joined the match room"))
  ) return "admin";
  return "";
};

function StaffBadge({ kind }) {
  if (!kind) return null;
  const isModerator = kind === "moderator";
  return (
    <span
      title={isModerator ? "Official TopFragg Moderator" : "Official TopFragg Staff"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
        isModerator
          ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300"
          : "border-red-400/30 bg-red-500/10 text-red-300"
      }`}
    >
      <TopfraggLogo showWordmark={false} markClassName="h-3.5 w-3.5" />
      {isModerator ? "TopFragg Mod" : "TopFragg Staff"}
    </span>
  );
}

export default function MatchChat({
  conversationId,
  matchType = "wager",
  accent = "cyan",
  title = "Match Chat",
  placeholder = "Type a message...",
  disabledReason = "",
  live = false,
  pollIntervalMs = 2000,
  heightClass = "h-[600px]",
  sticky = true,
  compact = false,
}) {
  const [messages, setMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const chatBodyRef = useRef(null);
  const inputRef = useRef(null);
  const previousMessageCountRef = useRef(0);
  const tone = accents[accent] || accents.cyan;

  const scrollChatToBottom = (behavior = "smooth") => {
    window.requestAnimationFrame(() => {
      if (!chatBodyRef.current) return;
      chatBodyRef.current.scrollTo({
        top: chatBodyRef.current.scrollHeight,
        behavior,
      });
    });
  };

  useEffect(() => {
    previousMessageCountRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (loading) return;
    const behavior = previousMessageCountRef.current === 0 ? "auto" : "smooth";
    previousMessageCountRef.current = messages.length;
    scrollChatToBottom(behavior);
  }, [messages.length, loading]);

  useEffect(() => {
    let mounted = true;
    let intervalId = null;

    async function loadMessages(showLoading = false) {
      if (!conversationId) {
        setMessages([]);
        setLoading(false);
        return;
      }

      if (showLoading) setLoading(true);
      const rows = await base44.entities.ChatMessage
        .filterFresh({ conversation_id: conversationId }, "-created_date", 100)
        .catch(() => []);

      if (mounted) {
        setMessages((rows || []).slice().reverse());
        setLoading(false);
      }
    }

    async function initialize() {
      const user = await base44.auth.me().catch(() => null);
      if (mounted) setCurrentUser(user);
      await loadMessages(true);
      if (mounted && live) {
        intervalId = window.setInterval(() => loadMessages(false), pollIntervalMs);
      }
    }

    initialize();
    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [conversationId, live, pollIntervalMs]);

  const handleSend = async (event) => {
    event.preventDefault();
    const content = messageText.trim();
    if (!content || !conversationId || !currentUser?.id) return;

    setSending(true);
    try {
      const response = await base44.functions.invoke("sendMatchRoomMessage", {
        match_type: matchType,
        match_id: conversationId,
        conversation_id: conversationId,
        content,
      });
      if (!response.data?.success) {
        toast({ title: "Message failed", description: response.data?.error || "Could not send chat message.", variant: "destructive" });
        return;
      }
      const created = response.data.message;
      setMessages((current) => [...current, created]);
      setMessageText("");
    } catch (error) {
      toast({ title: "Message failed", description: error.message || "Could not send chat message.", variant: "destructive" });
    } finally {
      setSending(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className={`glass rounded-xl border ${tone.border} overflow-hidden flex flex-col ${heightClass} ${sticky ? "sticky top-6" : ""}`}>
      <div className={`${compact ? "px-3 py-2.5" : "px-4 py-3"} bg-secondary/50 border-b border-white/5 flex items-center justify-between`}>
        <h3 className="font-bold text-sm flex items-center gap-2">
          <MessageSquare className={`w-4 h-4 ${tone.icon}`} /> {title}
        </h3>
        <span className="text-xs text-vapor">{messages.length > 0 ? `${messages.length} messages` : "No messages"}</span>
      </div>
      <div ref={chatBodyRef} className={`flex-1 overflow-y-auto ${compact ? "p-3 space-y-2" : "p-4 space-y-3"}`}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-vapor">Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <MessageSquare className="w-8 h-8 text-vapor/30 mb-3" />
            <p className="text-sm text-vapor">No chat messages yet.</p>
          </div>
        ) : messages.map((message) => {
          const staffKind = staffKindForMessage(message);
          const isModerator = staffKind === "moderator";
          const isAdmin = staffKind === "admin";
          return (
            <div key={message.id} className={`rounded-lg border ${compact ? "p-2.5" : "p-3"} ${
              isAdmin
                ? "border-red-400/20 bg-red-500/[0.055]"
                : isModerator
                  ? "border-yellow-400/20 bg-yellow-400/[0.045]"
                  : "border-white/5 bg-secondary/40"
            }`}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={`truncate text-xs font-black ${
                    isAdmin
                      ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.32)]"
                      : isModerator
                        ? "text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.24)]"
                        : tone.text
                  }`}>
                    {displaySenderName(message)}
                  </span>
                  <StaffBadge kind={staffKind} />
                </div>
                <span className="shrink-0 text-[10px] text-vapor">{formatDate(message.created_date)}</span>
              </div>
              <p className={`${compact ? "text-xs" : "text-sm"} whitespace-pre-wrap ${isAdmin ? "text-red-50/85" : isModerator ? "text-yellow-50/85" : "text-foreground/80"}`}>{message.content}</p>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSend} className={`${compact ? "p-2.5" : "p-3"} border-t border-white/5 bg-secondary/30 flex items-center gap-2`}>
        <input
          ref={inputRef}
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          maxLength={500}
          placeholder={disabledReason || placeholder}
          disabled={!currentUser || sending || Boolean(disabledReason)}
          className="flex-1 px-3 py-2 bg-background/60 border border-white/5 rounded-lg text-sm focus:outline-none focus:border-cyan/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!messageText.trim() || !currentUser || sending || Boolean(disabledReason)}
          className={`p-2 rounded-lg bg-secondary border ${tone.border} ${tone.text} hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
