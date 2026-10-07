import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send, Shield } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { createMatchChatFeed } from "@/lib/matchChatFeed";

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
const nameKey = (value) => String(value || "").trim().toLowerCase();
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

const playerIdentifiers = (player) => {
  if (typeof player === "string") return [player];
  return [player?.user_id, player?.id, player?.participant_user_id]
    .filter(Boolean)
    .map(String);
};

const playerNameKeys = (player) => [
  player?.user_name,
  player?.username,
  player?.handle,
  player?.display_name,
  player?.full_name,
  player?.name,
].map(nameKey).filter(Boolean);

const teamStyles = {
  cyan: {
    border: "border-cyan/20",
    background: "bg-cyan/[0.055]",
    name: "text-cyan",
    dot: "bg-cyan",
  },
  orange: {
    border: "border-orange/20",
    background: "bg-orange/[0.055]",
    name: "text-orange",
    dot: "bg-orange",
  },
};

export default function MatchChat(props) {
  return <MatchChatView key={`${props.matchType || "wager"}:${props.conversationId || ""}`} {...props} />;
}

function MatchChatView({
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
  messageLimit = 100,
}) {
  const [messages, setMessages] = useState([]);
  const { user: currentUser } = useAuth();
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const chatBodyRef = useRef(null);
  const inputRef = useRef(null);
  const followingChatRef = useRef(true);
  const feedRef = useRef(null);
  const refreshRef = useRef(null);
  const sendInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const tone = accents[accent] || accents.cyan;
  const teamAIds = useMemo(() => new Set(teamAPlayerIds.flatMap(playerIdentifiers)), [teamAPlayerIds]);
  const teamBIds = useMemo(() => new Set(teamBPlayerIds.flatMap(playerIdentifiers)), [teamBPlayerIds]);
  const teamANameKeys = useMemo(() => new Set(teamAPlayerIds.flatMap(playerNameKeys)), [teamAPlayerIds]);
  const teamBNameKeys = useMemo(() => new Set(teamBPlayerIds.flatMap(playerNameKeys)), [teamBPlayerIds]);
  const playersById = useMemo(() => new Map(
    [...teamAPlayerIds, ...teamBPlayerIds]
      .flatMap((player) => playerIdentifiers(player).map((id) => [id, player])),
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
    if (!loading && followingChatRef.current) scrollChatToBottom("auto");
  }, [messages, loading]);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;
    const feed = createMatchChatFeed({
      conversationId,
      limit: messageLimit,
      read: () => conversationId ? base44.entities.ChatMessage.filterFresh({ conversation_id: conversationId }, "-created_date", messageLimit) : Promise.resolve([]),
      onChange: (rows) => { if (mounted) setMessages(rows); },
      onError: () => { if (mounted) setLoadError(true); },
    });
    feedRef.current = feed;
    const refresh = async () => {
      const success = await feed.refresh();
      if (mounted) {
        if (success) setLoadError(false);
        setLoading(false);
      }
    };
    refreshRef.current = refresh;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    const intervalId = live ? window.setInterval(refreshWhenVisible, Math.max(1000, pollIntervalMs)) : null;
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      mounted = false;
      mountedRef.current = false;
      feed.dispose();
      if (feedRef.current === feed) feedRef.current = null;
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [conversationId, live, messageLimit, pollIntervalMs]);

  const handleSend = async (event) => {
    event.preventDefault();
    const content = messageText.trim();
    if (!content || !conversationId || !currentUser?.id || disabledReason || sendInFlightRef.current) return;

    sendInFlightRef.current = true;
    const feed = feedRef.current;
    const clientMessageId = crypto.randomUUID();
    const localId = `sending:${clientMessageId}`;
    const pendingAdded = feed?.beginSend({
      id: localId,
      client_message_id: clientMessageId,
      conversation_id: conversationId,
      sender_id: currentUser.id,
      sender_name: currentUser.display_name || currentUser.full_name || currentUser.username || "You",
      sender_role: currentUser.role,
      sender_admin_role: currentUser.admin_role,
      sender_avatar_url: currentUser.avatar_url || "",
      display_name_color: currentUser.display_name_color || "",
      content,
      created_date: new Date().toISOString(),
    });
    followingChatRef.current = true;
    setLoading(false);
    setMessageText("");
    setSending(true);
    scrollChatToBottom("auto");
    try {
      const response = await base44.functions.invoke("sendMatchRoomMessage", {
        match_type: matchType,
        match_id: conversationId,
        conversation_id: conversationId,
        content,
        client_message_id: clientMessageId,
      });
      if (!mountedRef.current || feedRef.current !== feed) return;
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Could not send chat message.");
      }
      const created = response.data.message;
      if (!created?.id) throw new Error("Could not confirm chat message. Please try again.");
      feed?.confirmSend(localId, created);
    } catch (error) {
      if (mountedRef.current && feedRef.current === feed && (feed?.failSend(localId) || !pendingAdded)) {
        setMessageText((draft) => draft || content);
        toast({ title: "Message failed", description: error.message || "Could not send chat message.", variant: "destructive" });
      }
    } finally {
      sendInFlightRef.current = false;
      if (mountedRef.current) {
        setSending(false);
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  };

  return (
    <div className={`match-chat-panel glass overflow-hidden rounded-xl border border-white/[0.09] bg-[#202328] flex flex-col ${heightClass} ${sticky ? "sticky top-6" : ""}`}>
      <div className={`${compact ? "px-3 py-2.5" : "px-4 py-3"} shrink-0 bg-[#25282d] border-b border-white/[0.07] flex items-center justify-between`}>
        <h3 className="font-bold text-sm flex items-center gap-2">
          <MessageSquare className={`w-4 h-4 ${tone.icon}`} /> {title}
        </h3>
        <span className="text-xs text-vapor">{messages.length > 0 ? `${messages.length} messages` : "No messages"}</span>
      </div>
      {loadError && <div role="status" className="flex shrink-0 items-center justify-between gap-2 border-b border-orange/20 px-3 py-2 text-[11px] text-orange"><span>{live ? "Chat connection interrupted. Retrying..." : "Could not load chat."}</span><button type="button" onClick={() => refreshRef.current?.()} className="shrink-0 font-bold underline">Retry</button></div>}
      <div ref={chatBodyRef} onScroll={(event) => { const body = event.currentTarget; followingChatRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 96; }} className={`min-h-0 flex-1 overflow-y-auto bg-[#191c21] ${compact ? "p-3" : "p-4"}`}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-vapor">Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <MessageSquare className="w-8 h-8 text-vapor/30 mb-3" />
            <p className="text-sm text-vapor">{loadError ? "Chat unavailable. Use Retry to load messages." : "No chat messages yet."}</p>
          </div>
        ) : messages.map((message, messageIndex) => {
          const staff = isStaffMessage(message);
          const senderId = String(message.sender_id || "");
          const senderName = displaySenderName(message);
          const senderNameKey = nameKey(senderName);
          const savedTeamSide = ["a", "b"].includes(String(message.team_side || ""))
            ? String(message.team_side)
            : null;
          const teamSide = !staff
            ? (savedTeamSide || (teamAIds.has(senderId)
              ? "a"
              : (teamBIds.has(senderId)
                ? "b"
                : (teamANameKeys.has(senderNameKey) ? "a" : (teamBNameKeys.has(senderNameKey) ? "b" : null)))))
            : null;
          const teamTone = teamSide === "a" ? teamStyles[teamAColor] : teamSide === "b" ? teamStyles[teamBColor] : null;
          const isOwnMessage = String(currentUser?.id || "") === senderId;
          const isTeamB = teamSide === "b";
          const senderPlayer = playersById.get(senderId) || (isOwnMessage ? currentUser : null);
          const senderNameEffect = message.display_name_color
            || message.sender_name_color
            || senderPlayer?.display_name_color
            || "";
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
              <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-red-400/35 bg-red-500/10 text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_2px_6px_rgba(0,0,0,0.2)]">
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
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${staff ? "bg-red-400" : teamTone?.dot || "bg-vapor/40"}`} />
                    {teamSide && <span className={`rounded border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] ${teamTone?.border} ${teamTone?.background} ${teamTone?.name}`}>Team {teamSide.toUpperCase()}</span>}
                    <span
                      data-name-effect={!staff && senderNameEffect ? senderNameEffect : undefined}
                      style={!staff && senderNameEffect ? { "--player-name-color": senderNameEffect } : undefined}
                      className={`player-name-wrap text-[13px] font-black ${!staff && senderNameEffect ? "player-name-color" : staff ? "text-red-200" : teamTone?.name || "text-white"}`}
                    >{senderName}</span>
                    <span className="text-[9px] font-medium text-vapor/65">• {formatDate(message.created_date)}</span>
                  </div>
                )}
                <div className={`w-fit max-w-full rounded-lg border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_2px_6px_rgba(0,0,0,0.18)] ${isTeamB ? "ml-auto rounded-br-sm" : "mr-auto rounded-bl-sm"} ${staff ? "border-red-400/25 bg-red-500/[0.06]" : teamTone ? `${teamTone.border} ${teamTone.background}` : "border-white/[0.07] bg-white/[0.045]"} ${isOwnMessage && !staff ? "ring-1 ring-white/[0.08]" : ""}`}>
                  <p className={`${compact ? "text-[13px]" : "text-[15px]"} whitespace-pre-wrap break-words text-left leading-relaxed text-foreground/90`}>{displayMessageContent(message, staff)}</p>
                  {message.sending && <p role="status" className="mt-1 text-[10px] text-vapor">Sending…</p>}
                </div>
              </div>
              {isTeamB && avatar}
            </div>
          );
        })}
      </div>
      {inputActions && (
        <div className={`${compact ? "px-2.5 pt-2.5" : "px-3 pt-3"} shrink-0 border-t border-white/[0.07] bg-[#25282d]`}>
          {inputActions}
        </div>
      )}
      <form onSubmit={handleSend} className={`${compact ? "p-2.5" : "p-3"} ${inputActions ? "pt-2" : "border-t border-white/[0.07]"} shrink-0 bg-[#25282d] flex items-center gap-2`}>
        <label htmlFor={`match-chat-${conversationId}`} className="sr-only">Write a chat message</label>
        <input
          id={`match-chat-${conversationId}`}
          ref={inputRef}
          value={messageText}
          onChange={(event) => setMessageText(event.target.value)}
          maxLength={500}
          placeholder={disabledReason || placeholder}
          disabled={!currentUser || Boolean(disabledReason)}
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
