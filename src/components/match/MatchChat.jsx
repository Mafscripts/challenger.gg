import React, { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const chatAccent = {
  icon: "text-blue-400",
  border: "border-blue-400/20",
  text: "text-blue-300",
};

const accents = {
  cyan: chatAccent,
  green: chatAccent,
  orange: chatAccent,
  purple: chatAccent,
};

const formatDate = (value) => value ? new Date(value).toLocaleString() : "";
const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);
const stripStaffPrefix = (value) => String(value || "").replace(/^(admin|moderator)\s+/i, "");
const displaySenderName = (message) => {
  const name = stripStaffPrefix(message.sender_name || "Unknown sender");
  return name || "Unknown sender";
};
const isStaffMessage = (message) => {
  const roles = [message.sender_role, message.sender_admin_role, message.admin_role]
    .map((role) => String(role || "").toLowerCase());
  const senderName = String(message.sender_name || "");
  const content = String(message.content || "");
  return Boolean(
    message.staff_badge
    || roles.some((role) => staffRoles.has(role))
    || /^(admin|moderator)\s+/i.test(senderName)
    || (message.system && content.includes("entered the room as admin"))
    || (message.system && /^Admin\s+.+has joined the match room/i.test(content))
  );
};
const displayMessageContent = (message, staff) => (
  staff ? stripStaffPrefix(message.content) : message.content
);

function StaffBadge() {
  return (
    <span
      title="Official Topfragg staff"
      className="inline-flex shrink-0 items-center rounded border border-blue-400/25 bg-blue-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-blue-300"
    >
      Staff
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
  live = true,
  pollIntervalMs = 1000,
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

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadMessages(false);
    };

    initialize();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
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
          const staff = isStaffMessage(message);
          return (
            <div key={message.id} className={`rounded-lg border ${compact ? "p-2.5" : "p-3"} ${
              staff
                ? "border-blue-400/20 bg-blue-400/[0.045]"
                : "border-white/5 bg-secondary/40"
            }`}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={`truncate text-xs font-black ${staff ? "text-blue-300" : tone.text}`}>
                    {displaySenderName(message)}
                  </span>
                  {staff && <StaffBadge />}
                </div>
                <span className="shrink-0 text-[10px] text-vapor">{formatDate(message.created_date)}</span>
              </div>
              <p className={`${compact ? "text-xs" : "text-sm"} whitespace-pre-wrap text-foreground/80`}>{displayMessageContent(message, staff)}</p>
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
