import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Ban,
  Clock3,
  EllipsisVertical,
  Gavel,
  MessageCircle,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Users,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const quickTags = ["LFG", "Ranked", "Wager", "Tournament", "EU", "NA", "@Admin"];
const chatEmojis = ["😀", "😂", "😍", "😎", "🤔", "😅", "😭", "😡", "👍", "👎", "👏", "🙏", "💪", "🔥", "❤️", "💯", "🎮", "🏆", "🎯", "⚔️", "🛡️", "👑", "✅", "❌", "🚀", "GG", "GL", "HF"];
const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);

const roleLabel = (role) => ({
  ceo: "CEO",
  super_admin: "Super Admin",
  admin: "Admin",
  moderator: "Moderator",
}[role] || "Player");

const roleClass = (role) => ({
  ceo: "border-red-400/30 bg-red-400/10 text-red-300",
  super_admin: "border-red-400/25 bg-red-400/[0.08] text-red-300",
  admin: "border-pink-400/25 bg-pink-400/[0.08] text-pink-300",
  moderator: "border-yellow-400/25 bg-yellow-400/[0.08] text-yellow-300",
}[role] || "border-white/10 bg-white/[0.04] text-vapor");

const formatMessageTime = (value) => {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const formatBanExpiry = (value) => {
  if (!value) return "Permanent";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Permanent";
};

function Avatar({ player, size = "h-10 w-10" }) {
  const name = player?.name || player?.sender_name || "Player";
  const avatar = player?.avatar_url || player?.sender_avatar_url;
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan/20 bg-cyan/[0.07] font-black text-cyan ${size}`}>
      {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] ${roleClass(role)}`}>
      {roleLabel(role)}
    </span>
  );
}

export default function FindPlayersChat() {
  const [currentUser, setCurrentUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [activeBans, setActiveBans] = useState([]);
  const [currentBan, setCurrentBan] = useState(null);
  const [canModerate, setCanModerate] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [moderationTarget, setModerationTarget] = useState(null);
  const [moderationReason, setModerationReason] = useState("Community chat rules violation");
  const [moderationAction, setModerationAction] = useState("timeout");
  const [moderationDuration, setModerationDuration] = useState("1h");
  const [moderating, setModerating] = useState(false);
  const chatBodyRef = useRef(null);
  const messageInputRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const messagesSignatureRef = useRef("");
  const participantsSignatureRef = useRef("");
  const bansSignatureRef = useRef("");
  const currentBanSignatureRef = useRef("");

  const applyRoom = (room) => {
    const nextMessages = room?.messages || [];
    const nextParticipants = room?.participants || [];
    const nextActiveBans = room?.active_bans || [];
    const nextCurrentBan = room?.ban || null;
    const newestId = nextMessages[nextMessages.length - 1]?.id || null;
    const isInitialMessageLoad = lastMessageIdRef.current === null;
    const hasNewMessage = newestId && newestId !== lastMessageIdRef.current;
    const chatBody = chatBodyRef.current;
    const wasNearBottom = !chatBody || chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 120;
    const messagesSignature = nextMessages.map((message) => `${message.id}:${message.content}:${message.created_date}`).join("|");
    const participantsSignature = nextParticipants.map((player) => `${player.id}:${player.name}:${player.role}:${player.avatar_url || ""}`).join("|");
    const bansSignature = nextActiveBans.map((ban) => `${ban.id}:${ban.expires_date || ""}:${ban.reason}:${ban.moderation_action}`).join("|");
    const currentBanSignature = nextCurrentBan ? `${nextCurrentBan.id}:${nextCurrentBan.expires_date || ""}:${nextCurrentBan.reason}` : "";
    lastMessageIdRef.current = newestId;
    if (messagesSignature !== messagesSignatureRef.current) {
      messagesSignatureRef.current = messagesSignature;
      setMessages(nextMessages);
    }
    if (participantsSignature !== participantsSignatureRef.current) {
      participantsSignatureRef.current = participantsSignature;
      setParticipants(nextParticipants);
    }
    if (bansSignature !== bansSignatureRef.current) {
      bansSignatureRef.current = bansSignature;
      setActiveBans(nextActiveBans);
    }
    if (currentBanSignature !== currentBanSignatureRef.current) {
      currentBanSignatureRef.current = currentBanSignature;
      setCurrentBan(nextCurrentBan);
    }
    setCanModerate(Boolean(room?.can_moderate));
    if (hasNewMessage && (isInitialMessageLoad || wasNearBottom)) {
      window.requestAnimationFrame(() => {
        chatBodyRef.current?.scrollTo({
          top: chatBodyRef.current.scrollHeight,
          behavior: isInitialMessageLoad ? "auto" : "smooth",
        });
      });
    }
  };

  const loadRoom = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await base44.functions.invoke("getFindPlayersChat");
      applyRoom(response.data);
    } catch (error) {
      if (!silent) {
        toast({ title: "Chat unavailable", description: error.message || "Could not load the chat room.", variant: "destructive" });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let intervalId;
    const initialize = async () => {
      const user = await base44.auth.me().catch(() => null);
      if (!mounted) return;
      setCurrentUser(user);
      await loadRoom();
      if (!mounted) return;
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible") loadRoom({ silent: true });
      }, 2500);
    };
    initialize();
    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  const participantCountLabel = useMemo(() => {
    const count = participants.length;
    return `${count} recent ${count === 1 ? "player" : "players"}`;
  }, [participants.length]);

  const addQuickTag = (tag) => {
    const prefix = tag.startsWith("@") ? `${tag} ` : `[${tag}] `;
    setMessageText((current) => current.startsWith(prefix) ? current : `${prefix}${current}`.slice(0, 400));
    window.requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const insertEmoji = (emoji) => {
    const input = messageInputRef.current;
    const start = input?.selectionStart ?? messageText.length;
    const end = input?.selectionEnd ?? start;
    const nextValue = `${messageText.slice(0, start)}${emoji}${messageText.slice(end)}`.slice(0, 400);
    const nextCursor = Math.min(start + emoji.length, nextValue.length);
    setMessageText(nextValue);
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      messageInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const openModeration = (player) => {
    const playerId = player.id || player.sender_id;
    if (String(playerId) === String(currentUser?.id)) {
      toast({ title: "This is your account", description: "You cannot timeout or ban yourself." });
      return;
    }
    setModerationTarget({
      id: playerId,
      name: player.name || player.sender_name || "Player",
      role: player.role || player.sender_role || "user",
    });
    setModerationReason("Community chat rules violation");
    setModerationAction("timeout");
    setModerationDuration("1h");
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const content = messageText.trim();
    if (!content || sending || currentBan) return;
    setSending(true);
    try {
      const response = await base44.functions.invoke("sendFindPlayersMessage", { content });
      if (!response.data?.success) {
        if (response.data?.ban) setCurrentBan(response.data.ban);
        toast({ title: "Message not sent", description: response.data?.error || "Could not send your message.", variant: "destructive" });
        return;
      }
      if (response.data?.admin_pinged) {
        toast({ title: "Staff notified", description: "Your @Admin ping was sent to the moderation team." });
      }
      setMessageText("");
      setShowEmojiPicker(false);
      await loadRoom({ silent: true });
    } catch (error) {
      toast({ title: "Message not sent", description: error.message || "Could not send your message.", variant: "destructive" });
    } finally {
      setSending(false);
      window.requestAnimationFrame(() => messageInputRef.current?.focus());
    }
  };

  const banPlayer = async () => {
    if (!moderationTarget || moderating) return;
    setModerating(true);
    try {
      const response = await base44.functions.invoke("moderateFindPlayersChatUser", {
        action: moderationAction,
        user_id: moderationTarget.id,
        duration: moderationAction === "timeout" ? moderationDuration : "permanent",
        reason: moderationReason,
        remove_messages: true,
      });
      if (!response.data?.success) {
        toast({ title: "Moderation failed", description: response.data?.error || "Could not ban this player.", variant: "destructive" });
        return;
      }
      toast({
        title: moderationAction === "timeout" ? "Player timed out" : "Player banned",
        description: moderationAction === "timeout"
          ? `${moderationTarget.name} cannot chat for the selected period.`
          : `${moderationTarget.name} is permanently banned from this chat.`,
      });
      setModerationTarget(null);
      await loadRoom({ silent: true });
    } catch (error) {
      toast({ title: "Moderation failed", description: error.message || "Could not ban this player.", variant: "destructive" });
    } finally {
      setModerating(false);
    }
  };

  const unbanPlayer = async (ban) => {
    if (moderating) return;
    setModerating(true);
    try {
      const response = await base44.functions.invoke("moderateFindPlayersChatUser", {
        action: "unban",
        user_id: ban.user_id,
      });
      if (!response.data?.success) {
        toast({ title: "Moderation failed", description: response.data?.error || "Could not remove this ban.", variant: "destructive" });
        return;
      }
      toast({ title: "Chat ban removed", description: `${ban.target_username} can use the room again.` });
      await loadRoom({ silent: true });
    } catch (error) {
      toast({ title: "Moderation failed", description: error.message || "Could not remove this ban.", variant: "destructive" });
    } finally {
      setModerating(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan">
              <Users className="h-4 w-4" /> Community matchmaking
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Find Players Chat</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-vapor">Find teammates, substitutes, opponents, and practice partners in one moderated community room.</p>
          </div>
          <Link to="/rules" className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-vapor transition-colors hover:border-cyan/25 hover:text-cyan lg:self-auto">
            <ShieldCheck className="h-4 w-4" /> View chat rules
          </Link>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-xl border border-cyan/20 bg-cyan/[0.055] px-4 py-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan" />
          <div>
            <p className="text-sm font-black text-cyan">Moderated community room</p>
            <p className="mt-0.5 text-xs leading-relaxed text-vapor">Messages are checked for abusive language in English, Dutch, French, German, and Spanish. Spam, harassment, hate speech, and personal information are not allowed.</p>
          </div>
        </div>

        {currentBan && (
          <div className="mb-5 rounded-xl border border-red-400/25 bg-red-400/[0.07] px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-black text-red-300"><Ban className="h-4 w-4" /> You are banned from this chat</p>
            <p className="mt-1 text-xs text-vapor">{currentBan.reason} · {formatBanExpiry(currentBan.expires_date)}</p>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex h-[720px] min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111821] shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)] lg:h-[760px]">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] bg-white/[0.025] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/10 text-cyan"><MessageCircle className="h-5 w-5" /></span>
                <div><h2 className="font-black">Community room</h2><p className="text-[10px] font-bold uppercase tracking-wider text-vapor">{participantCountLabel}</p></div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green/20 bg-green/[0.07] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-green"><span className="h-1.5 w-1.5 rounded-full bg-green" /> Live</span>
            </div>

            <div ref={chatBodyRef} className="min-h-0 flex-1 overflow-y-scroll px-4 py-2 sm:px-5" style={{ scrollbarGutter: "stable" }}>
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-vapor">Loading community chat...</div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <Search className="mb-4 h-10 w-10 text-vapor/25" />
                  <h3 className="font-black">Start looking for players</h3>
                  <p className="mt-1 max-w-sm text-sm text-vapor">Share your region, mode, team size, and when you want to play.</p>
                </div>
              ) : messages.map((message) => {
                const senderRole = message.sender_role || "user";
                const isStaff = staffRoles.has(senderRole);
                const isOwnMessage = String(message.sender_id) === String(currentUser?.id);
                return (
                  <article key={message.id} className="group flex gap-3 border-b border-white/[0.055] py-4 last:border-b-0">
                    <Avatar player={message} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {message.sender_username ? (
                          <Link to={`/profile/${encodeURIComponent(message.sender_username)}`} className="truncate text-sm font-black text-white transition-colors hover:text-cyan">{message.sender_name}</Link>
                        ) : <span className="truncate text-sm font-black text-white">{message.sender_name}</span>}
                        {(isStaff || senderRole !== "user") && <RoleBadge role={senderRole} />}
                        {canModerate && (
                          <button
                            type="button"
                            onClick={() => openModeration(message)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-vapor transition-colors hover:border-red-400/25 hover:bg-red-400/[0.08] hover:text-red-300"
                            title={`Moderate ${message.sender_name}`}
                            aria-label={`Moderate ${message.sender_name}`}
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </button>
                        )}
                        {canModerate && isOwnMessage && <span className="rounded-md border border-cyan/15 bg-cyan/[0.05] px-2 py-1 text-[9px] font-black uppercase tracking-wide text-cyan">You</span>}
                        <span className="ml-auto shrink-0 text-[10px] text-vapor/65">{formatMessageTime(message.created_date)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">{message.content}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="border-t border-white/[0.07] bg-black/15 p-3 sm:p-4">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {quickTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => addQuickTag(tag)} disabled={Boolean(currentBan)} className="rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-vapor transition-colors hover:border-cyan/25 hover:text-cyan disabled:cursor-not-allowed disabled:opacity-40">{tag}</button>
                ))}
              </div>
              <form onSubmit={sendMessage} className="flex items-end gap-2">
                <div className="relative min-w-0 flex-1">
                  {showEmojiPicker && !currentBan && (
                    <div className="absolute bottom-[84px] left-0 z-20 w-[280px] rounded-xl border border-white/[0.12] bg-[#19222e] p-2.5 shadow-2xl" role="dialog" aria-label="Choose an emoji">
                      <div className="mb-2 flex items-center justify-between px-1"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Emojis</span><button type="button" onClick={() => setShowEmojiPicker(false)} className="rounded p-1 text-vapor hover:bg-white/5 hover:text-white" aria-label="Close emoji picker"><X className="h-3.5 w-3.5" /></button></div>
                      <div className="grid grid-cols-7 gap-1">
                        {chatEmojis.map((emoji) => <button key={emoji} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertEmoji(emoji)} className="flex h-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-white/10" aria-label={`Insert ${emoji}`}>{emoji}</button>)}
                      </div>
                    </div>
                  )}
                  <div className="relative">
                    <textarea
                      ref={messageInputRef}
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value.slice(0, 400))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      rows={2}
                      maxLength={400}
                      disabled={sending || Boolean(currentBan)}
                      placeholder={currentBan ? "You cannot send messages while banned" : "Type here..."}
                      className="min-h-[58px] w-full resize-none rounded-xl border border-white/[0.09] bg-background/60 py-3 pl-12 pr-3.5 text-sm outline-none transition-colors placeholder:text-vapor/45 focus:border-cyan/35 disabled:cursor-not-allowed disabled:opacity-55"
                    />
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setShowEmojiPicker((open) => !open)} disabled={Boolean(currentBan)} className="absolute left-2.5 top-2 flex h-7 w-7 items-center justify-center rounded-md text-vapor transition-colors hover:bg-white/[0.07] hover:text-cyan disabled:opacity-40" title="Add emoji" aria-label="Add emoji" aria-expanded={showEmojiPicker}><Smile className="h-4 w-4" /></button>
                  </div>
                  <p className="mt-1 text-right text-[9px] font-bold text-vapor/45">{messageText.length}/400</p>
                </div>
                <button type="submit" disabled={!messageText.trim() || sending || Boolean(currentBan)} className="flex h-[66px] w-[58px] shrink-0 items-center justify-center self-start rounded-xl border border-cyan/25 bg-cyan/10 text-cyan transition-colors hover:bg-cyan/15 disabled:cursor-not-allowed disabled:opacity-40" title="Send message"><Send className="h-5 w-5" /></button>
              </form>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="flex max-h-[380px] min-h-0 flex-col self-start overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111821]">
              <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-4"><h2 className="flex items-center gap-2 text-sm font-black"><Users className="h-4 w-4 text-cyan" /> Recent players</h2><span className="text-[10px] font-bold text-vapor">{participants.length}</span></div>
              <div
                className="min-h-0 flex-1 space-y-1 overflow-y-scroll px-2 pb-3 pr-3"
                style={{ scrollbarGutter: "stable", overscrollBehavior: "contain" }}
                aria-label="Recent players list"
              >
                {participants.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-xs text-vapor">No recent players yet.</p> : participants.map((player) => {
                  const isCurrentPlayer = String(player.id) === String(currentUser?.id);
                  return (
                    <div key={player.id} className="flex items-center gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]">
                      <Link to={player.username ? `/profile/${encodeURIComponent(player.username)}` : "/profile"} className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar player={player} size="h-9 w-9" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black hover:text-cyan">{player.name}</span><span className="block truncate text-[9px] font-bold uppercase tracking-wider text-vapor">{roleLabel(player.role)}</span></span>
                      </Link>
                      {isCurrentPlayer && <span className="shrink-0 rounded-md border border-cyan/15 bg-cyan/[0.05] px-2 py-1 text-[9px] font-black uppercase text-cyan">You</span>}
                      {canModerate ? (
                        <button type="button" onClick={() => openModeration(player)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-vapor hover:border-red-400/25 hover:bg-red-400/[0.08] hover:text-red-300" aria-label={`Moderate ${player.name}`} title={`Moderate ${player.name}`}><EllipsisVertical className="h-4 w-4" /></button>
                      ) : !isCurrentPlayer ? (
                        <span className="h-2 w-2 rounded-full bg-green/80" title="Recently active" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.09] bg-[#111821] p-4">
              <h2 className="flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-4 w-4 text-cyan" /> Room rules</h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-vapor">
                <li>• Post your mode, region, team size, and availability.</li>
                <li>• No insults, hate speech, harassment, or spam.</li>
                <li>• Never share passwords, payment data, or private information.</li>
                <li>• Follow staff instructions and the full platform rules.</li>
              </ul>
              <Link to="/rules" className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-cyan hover:underline">Read all rules <span aria-hidden="true">→</span></Link>
            </section>

            {canModerate && (
              <section className="rounded-2xl border border-red-400/15 bg-red-400/[0.035] p-4">
                <h2 className="flex items-center gap-2 text-sm font-black text-red-300"><Gavel className="h-4 w-4" /> Moderator tools</h2>
                <p className="mt-2 text-[10px] leading-relaxed text-vapor">Use the <strong className="text-red-300">three dots</strong> beside another player's name. You cannot timeout or ban your own account.</p>
                <h3 className="mt-4 border-t border-white/[0.07] pt-3 text-[10px] font-black uppercase tracking-wider text-vapor">Active timeouts &amp; bans</h3>
                <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
                  {activeBans.length === 0 ? <p className="text-xs text-vapor">No active chat bans.</p> : activeBans.map((ban) => (
                    <div key={ban.id} className="rounded-xl border border-white/[0.07] bg-black/15 p-3">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-black">{ban.target_username}</p><p className="mt-0.5 line-clamp-2 text-[10px] text-vapor">{ban.reason}</p></div><button type="button" disabled={moderating} onClick={() => unbanPlayer(ban)} className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-vapor hover:border-green/25 hover:text-green disabled:opacity-50">Unban</button></div>
                      <p className="mt-2 flex items-center gap-1 text-[9px] text-vapor/60"><Clock3 className="h-3 w-3" /> {ban.moderation_action === "timeout" ? `Timeout until ${formatBanExpiry(ban.expires_date)}` : "Permanent chat ban"}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>

      {moderationTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="chat-ban-title">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#151d28] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-red-300">Chat moderation</p><h2 id="chat-ban-title" className="mt-1 text-xl font-black">Moderate {moderationTarget.name}</h2><p className="mt-1 text-xs text-vapor">This action only applies to the Find Players chat.</p></div><button type="button" onClick={() => setModerationTarget(null)} className="rounded-lg p-2 text-vapor hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button></div>
            <div className="mt-5 space-y-4">
              <div><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-vapor">Action</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setModerationAction("timeout")} className={`rounded-xl border px-3 py-2.5 text-sm font-black transition-colors ${moderationAction === "timeout" ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-300" : "border-white/10 text-vapor hover:text-white"}`}>Timeout</button><button type="button" onClick={() => setModerationAction("ban")} className={`rounded-xl border px-3 py-2.5 text-sm font-black transition-colors ${moderationAction === "ban" ? "border-red-400/30 bg-red-400/10 text-red-300" : "border-white/10 text-vapor hover:text-white"}`}>Permanent ban</button></div></div>
              {moderationAction === "timeout" && <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-vapor">Duration</span><select value={moderationDuration} onChange={(event) => setModerationDuration(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-background px-3 text-sm outline-none focus:border-red-400/35"><option value="10m">10 minutes</option><option value="1h">1 hour</option><option value="24h">24 hours</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label>}
              <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-vapor">Reason</span><input value={moderationReason} onChange={(event) => setModerationReason(event.target.value.slice(0, 160))} maxLength={160} className="h-11 w-full rounded-xl border border-white/10 bg-background px-3 text-sm outline-none focus:border-red-400/35" /></label>
              <div className="rounded-xl border border-red-400/15 bg-red-400/[0.055] px-3 py-2.5 text-xs text-vapor">Their existing messages in this room will also be removed.</div>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModerationTarget(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-bold text-vapor hover:text-white">Cancel</button><button type="button" disabled={moderating || !moderationReason.trim()} onClick={banPlayer} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black disabled:opacity-50 ${moderationAction === "timeout" ? "border-yellow-400/25 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/15" : "border-red-400/25 bg-red-400/10 text-red-300 hover:bg-red-400/15"}`}><Ban className="h-4 w-4" /> {moderationAction === "timeout" ? "Apply timeout" : "Ban permanently"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
