import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, Shield } from "lucide-react";
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

const formatDate = (value) => value ? new Date(value).toLocaleTimeString([], {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
}).toUpperCase() : "";
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

const playerIdentifier = (player) => String(player?.user_id || player?.id || player || "");

const teamStyles = {
  cyan: {
    border: "border-cyan/20",
    background: "bg-cyan/[0.055]",
    name: "text-cyan",
    dot: "bg-cyan shadow-[0_0_10px_hsl(var(--cyan))]",
  },
  orange: {
    border: "border-orange/20",
    background: "bg-orange/[0.055]",
    name: "text-orange",
    dot: "bg-orange shadow-[0_0_10px_hsl(var(--orange))]",
  },
};

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
  inputActions = null,
  teamAPlayerIds = [],
  teamBPlayerIds = [],
  teamAColor = "cyan",
  teamBColor = "orange",
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
  const teamAIds = useMemo(() => new Set(teamAPlayerIds.map(playerIdentifier).filter(Boolean)), [teamAPlayerIds]);
  const teamBIds = useMemo(() => new Set(teamBPlayerIds.map(playerIdentifier).filter(Boolean)), [teamBPlayerIds]);
  const playersById = useMemo(() => new Map(
    [...teamAPlayerIds, ...teamBPlayerIds]
      .map((player) => [playerIdentifier(player), player])
      .filter(([id]) => id),
  ), [teamAPlayerIds, teamBPlayerIds]);

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
    <div className={`glass overflow-hidden rounded-xl border border-white/10 flex flex-col ${heightClass} ${sticky ? "sticky top-6" : ""}`}>
      <div className={`${compact ? "px-3 py-2.5" : "px-4 py-3"} shrink-0 bg-secondary/50 border-b border-white/5 flex items-center justify-between`}>
        <h3 className="font-bold text-sm flex items-center gap-2">
          <MessageSquare className={`w-4 h-4 ${tone.icon}`} /> {title}
        </h3>
        <span className="text-xs text-vapor">{messages.length > 0 ? `${messages.length} messages` : "No messages"}</span>
      </div>
      <div ref={chatBodyRef} className={`min-h-0 flex-1 overflow-y-auto ${compact ? "p-3" : "p-4"}`}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-vapor">Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <MessageSquare className="w-8 h-8 text-vapor/30 mb-3" />
            <p className="text-sm text-vapor">No chat messages yet.</p>
          </div>
        ) : messages.map((message, messageIndex) => {
          const staff = isStaffMessage(message);
          const senderId = String(message.sender_id || "");
          const teamSide = !staff && teamAIds.has(senderId) ? "a" : (!staff && teamBIds.has(senderId) ? "b" : null);
          const teamTone = teamSide === "a" ? teamStyles[teamAColor] : teamSide === "b" ? teamStyles[teamBColor] : null;
          const isOwnMessage = String(currentUser?.id || "") === senderId;
          const isTeamB = teamSide === "b";
          const senderName = displaySenderName(message);
          const senderPlayer = playersById.get(senderId);
          const senderAvatar = message.sender_avatar_url || senderPlayer?.avatar_url || (isOwnMessage ? currentUser?.avatar_url : "") || "";
          const previousMessage = messages[messageIndex - 1];
          const groupedWithPrevious = Boolean(
            previousMessage
            && String(previousMessage.sender_id || "") === senderId
            && isStaffMessage(previousMessage) === staff
            && new Date(message.created_date).getTime() - new Date(previousMessage.created_date).getTime() < 5 * 60 * 1000
          );
          const avatar = groupedWithPrevious ? (
            <span className="w-9 shrink-0" aria-hidden="true" />
          ) : staff ? (
            <span className="flex w-9 shrink-0 flex-col items-center justify-center gap-1 text-center">
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-red-400/35 bg-red-500/10 text-red-300 shadow-[0_0_12px_rgba(248,113,113,0.12)]">
                <Shield className="h-[17px] w-[17px] fill-red-500/15" />
              </span>
              <span className="block w-full text-center text-[7px] font-black uppercase leading-none tracking-[0.08em] text-red-300">Admin</span>
            </span>
          ) : (
            <span className="flex w-9 shrink-0 justify-center">
              <span className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border bg-black/30 text-[10px] font-black ${teamTone?.border || "border-white/10 text-white"}`}>
                {senderAvatar ? <img src={senderAvatar} alt="" className="h-full w-full object-cover" /> : senderName.charAt(0).toUpperCase()}
              </span>
            </span>
          );
          return (
            <div
              key={message.id}
              className={`flex w-full items-end gap-2 ${isTeamB ? "justify-end" : "justify-start"} ${messageIndex === 0 ? "mt-0" : groupedWithPrevious ? "mt-1.5" : "mt-4"}`}
            >
              {!isTeamB && avatar}
              <div className="min-w-0 max-w-[84%]">
                {!groupedWithPrevious && (
                  <div className={`mb-1 flex min-w-0 flex-wrap items-center gap-1.5 ${isTeamB ? "justify-end" : "justify-start"}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${staff ? "bg-red-400 shadow-[0_0_10px_rgb(248,113,113)]" : teamTone?.dot || "bg-vapor/40"}`} />
                    <span className={`truncate text-[13px] font-black ${staff ? "text-red-200" : teamTone?.name || "text-white"}`}>{senderName}</span>
                    <span className="text-[9px] font-medium text-vapor/65">• {formatDate(message.created_date)}</span>
                  </div>
                )}
                <div className={`w-fit max-w-full rounded-lg border border-white/[0.07] bg-white/[0.045] px-3 py-2 shadow-sm ${isTeamB ? "ml-auto rounded-br-sm" : "mr-auto rounded-bl-sm"} ${isOwnMessage ? "border-white/[0.11] bg-white/[0.06]" : ""}`}>
                  <p className={`${compact ? "text-[13px]" : "text-[15px]"} whitespace-pre-wrap break-words text-left leading-relaxed text-foreground/90`}>{displayMessageContent(message, staff)}</p>
                </div>
              </div>
              {isTeamB && avatar}
            </div>
          );
        })}
      </div>
      {inputActions && (
        <div className={`${compact ? "px-2.5 pt-2.5" : "px-3 pt-3"} shrink-0 border-t border-white/5 bg-secondary/30`}>
          {inputActions}
        </div>
      )}
      <form onSubmit={handleSend} className={`${compact ? "p-2.5" : "p-3"} ${inputActions ? "pt-2" : "border-t border-white/5"} shrink-0 bg-secondary/30 flex items-center gap-2`}>
        <label htmlFor={`match-chat-${conversationId}`} className="sr-only">Write a chat message</label>
        <input
          id={`match-chat-${conversationId}`}
          ref={inputRef}
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          maxLength={500}
          placeholder={disabledReason || placeholder}
          disabled={!currentUser || sending || Boolean(disabledReason)}
          className="min-w-0 flex-1 rounded-lg border border-cyan/20 bg-background/80 px-3 py-2.5 text-sm text-white placeholder:text-vapor/65 shadow-inner focus:outline-none focus:border-cyan/60 focus:ring-2 focus:ring-cyan/10 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!messageText.trim() || !currentUser || sending || Boolean(disabledReason)}
          className={`shrink-0 rounded-lg border bg-cyan/10 p-2.5 ${tone.border} ${tone.text} transition-all hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-40`}
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
