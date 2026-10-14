import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  LockKeyhole,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Send,
  Trophy,
  User,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import UserBadges from "@/components/ui/UserBadges";
import PageLoader from "@/components/ui/PageLoader";
import EmojiPicker from "@/components/chat/EmojiPicker";
import "@/styles/messages.css";

const initials = (name) => String(name || "Player").trim().slice(0, 1).toUpperCase();
const messageTime = (value) => value
  ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  : "";
const messageDate = (value) => value
  ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric" })
  : "";
const messageDay = value => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};
const messageDayLabel = value => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "Conversation";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (messageDay(value) === messageDay(today)) return "Today";
  if (messageDay(value) === messageDay(yesterday)) return "Yesterday";
  return date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "long", year: "numeric" });
};
const sameMessageGroup = (previous, current) => Boolean(previous && current
  && previous.sender_id === current.sender_id && messageDay(previous.created_date) === messageDay(current.created_date)
  && new Date(current.created_date) - new Date(previous.created_date) <= 5 * 60 * 1000);
function PlayerAvatar({ player, size = "md" }) {
  const [failedAvatar, setFailedAvatar] = useState("");
  const dimensions = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-7 w-7" : "h-10 w-10";
  return (
    <div className={`${dimensions} shrink-0 overflow-hidden rounded-xl border border-cyan/20 bg-gradient-to-br from-cyan/20 to-orange/10 flex items-center justify-center font-black text-cyan`}>
      {player?.avatar_url && player.avatar_url !== failedAvatar ? (
        <img src={player.avatar_url} alt="" onError={() => setFailedAvatar(player.avatar_url)} className="h-full w-full object-cover" />
      ) : initials(player?.name)}
    </div>
  );
}

function PlayerName({ player, className = "" }) {
  const effect = player?.display_name_color || "";
  return (
    <span
      data-name-effect={effect || undefined}
      style={effect ? { "--player-name-color": effect } : undefined}
      className={`${className} ${effect ? "player-name-color" : ""}`.trim()}
    >
      {player?.name || "Player"}
    </span>
  );
}

export default function Messages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState(null);
  const [directMessages, setDirectMessages] = useState([]);
  const [players, setPlayers] = useState({});
  const [invitations, setInvitations] = useState([]);
  const [activeInvitation, setActiveInvitation] = useState(null);
  const [activePlayerId, setActivePlayerId] = useState(searchParams.get("conversation") || "");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [emojiPickerCloseSignal, setEmojiPickerCloseSignal] = useState(0);
  const [sending, setSending] = useState(false);
  const [composerOpen, setComposerOpen] = useState(Boolean(searchParams.get("compose")));
  const [playerQuery, setPlayerQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [conversationQuery, setConversationQuery] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(Boolean(searchParams.get("conversation")));
  const [desktopView, setDesktopView] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [atLatest, setAtLatest] = useState(true);
  const requestedPlayerId = searchParams.get("compose") || searchParams.get("conversation") || "";
  const chatEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const displayedChatRef = useRef(null);
  const composerRef = useRef(null);
  const followingChatRef = useRef(true);
  const activePlayerIdRef = useRef(activePlayerId);
  const directMessagesLoadingRef = useRef(false);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktopView(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const loadInvitations = async (userId) => {
    const rows = await base44.entities.Message.filterFresh({ recipient_id: userId }, "-created_date", 100).catch(() => []);
    setInvitations((rows || []).filter(message => message.message_type === "tournament_invitation"));
  };

  const loadDirectMessages = async ({ initial = false, viewerId = "" } = {}) => {
    if (directMessagesLoadingRef.current) return;
    directMessagesLoadingRef.current = true;
    try {
      const response = await base44.functions.invoke("getDirectMessages");
      const data = response.data || {};
      const nextPlayers = Object.fromEntries((data.users || []).map(player => [player.id, player]));
      setDirectMessages(data.messages || []);
      setPlayers(current => ({ ...current, ...nextPlayers }));

      if (!activePlayerIdRef.current && data.messages?.length) {
        const latest = data.messages[data.messages.length - 1];
        const ownId = viewerId || currentUser?.id;
        const otherId = latest.sender_id === ownId ? latest.recipient_id : latest.sender_id;
        setActivePlayerId(otherId);
      }
    } catch (error) {
      if (initial) toast({ title: "Messages unavailable", description: error.message, variant: "destructive" });
    } finally {
      directMessagesLoadingRef.current = false;
    }
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const user = await base44.auth.me();
        if (!active) return;
        setCurrentUser(user);
        await Promise.all([loadDirectMessages({ initial: true, viewerId: user.id }), loadInvitations(user.id)]);
      } catch (error) {
        if (active) toast({ title: "Messages unavailable", description: error.message, variant: "destructive" });
      } finally {
        if (active) setLoading(false);
      }
    };
    initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!currentUser?.id || !requestedPlayerId || (
      activePlayerIdRef.current === requestedPlayerId && players[requestedPlayerId]
    )) return undefined;
    let active = true;
    base44.functions.invoke("searchMessageRecipients", { recipient_id: requestedPlayerId })
      .then((response) => {
        const player = response.data?.users?.[0];
        if (!active || !player) return;
        setPlayers(current => ({ ...current, [player.id]: player }));
        setActivePlayerId(player.id);
        setActiveInvitation(null);
        setMobileChatOpen(true);
        setComposerOpen(false);
        if (searchParams.has("compose")) setSearchParams({ conversation: player.id }, { replace: true });
      })
      .catch(() => null);
    return () => { active = false; };
  }, [currentUser?.id, players, requestedPlayerId]);

  useEffect(() => {
    if (!currentUser?.id) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") loadDirectMessages();
    }, 1500);
    return () => window.clearInterval(interval);
  }, [currentUser?.id]);

  useEffect(() => {
    const query = playerQuery.trim();
    if (!composerOpen || query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await base44.functions.invoke("searchMessageRecipients", { query });
        if (active) setSearchResults(response.data?.users || []);
      } catch {
        if (active) setSearchResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [composerOpen, playerQuery]);

  const conversations = useMemo(() => {
    if (!currentUser?.id) return [];
    const grouped = new Map();
    directMessages.forEach(message => {
      const otherId = message.sender_id === currentUser.id ? message.recipient_id : message.sender_id;
      if (!otherId) return;
      const previous = grouped.get(otherId) || { playerId: otherId, lastMessage: message, unread: 0 };
      previous.lastMessage = message;
      if (message.recipient_id === currentUser.id && !message.is_read) previous.unread += 1;
      grouped.set(otherId, previous);
    });
    return [...grouped.values()].sort((a, b) => (
      (new Date(b.lastMessage.created_date || 0).getTime() || 0)
      - (new Date(a.lastMessage.created_date || 0).getTime() || 0)
    ));
  }, [currentUser?.id, directMessages]);

  const visibleConversations = conversations.filter(conversation => {
    const player = players[conversation.playerId];
    const fallbackName = conversation.lastMessage.sender_id === currentUser?.id ? conversation.lastMessage.recipient_name : conversation.lastMessage.sender_name;
    return [player?.name, player?.handle, player?.username, fallbackName]
      .filter(Boolean).some(value => String(value).toLowerCase().includes(conversationQuery.trim().toLowerCase()));
  });
  const unreadCount = conversations.reduce((total, conversation) => total + conversation.unread, 0);
  const activeMessages = useMemo(() => directMessages.filter(message => (
    currentUser?.id && activePlayerId
    && [message.sender_id, message.recipient_id].includes(currentUser.id)
    && [message.sender_id, message.recipient_id].includes(activePlayerId)
  )).sort((a, b) => (Date.parse(a.created_date) || 0) - (Date.parse(b.created_date) || 0)), [activePlayerId, currentUser?.id, directMessages]);
  const activePlayer = players[activePlayerId] || null;
  const latestMessage = activeMessages[activeMessages.length - 1];

  useEffect(() => {
    if (activeInvitation || !activePlayerId || !currentUser?.id || (!desktopView && !mobileChatOpen)) return;
    const unreadIds = activeMessages
      .filter(message => message.recipient_id === currentUser.id && !message.is_read)
      .map(message => message.id);
    if (!unreadIds.length) return;

    setDirectMessages(current => current.map(message => (
      unreadIds.includes(message.id) ? { ...message, is_read: true } : message
    )));
    base44.functions.invoke("markDirectConversationRead", { other_user_id: activePlayerId })
      .then(() => {
        window.dispatchEvent(new CustomEvent("topfragg:messages-updated"));
        window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
      })
      .catch(() => null);
  }, [activeInvitation, activePlayerId, activeMessages.length, currentUser?.id, desktopView, mobileChatOpen]);

  useLayoutEffect(() => {
    const chat = chatScrollRef.current;
    if (!chat || (!desktopView && !mobileChatOpen)) {
      displayedChatRef.current = null;
      return;
    }

    const openingConversation = displayedChatRef.current?.element !== chat
      || displayedChatRef.current?.playerId !== activePlayerId;
    // Position a newly opened conversation before paint; animate only later messages.
    if (openingConversation) {
      chat.scrollTop = chat.scrollHeight;
      followingChatRef.current = true;
      setAtLatest(true);
    } else if (followingChatRef.current || (latestMessage?.sender_id === currentUser?.id && latestMessage?.id !== displayedChatRef.current?.lastMessageId)) {
      chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
    }
    displayedChatRef.current = { element: chat, playerId: activePlayerId, lastMessageId: latestMessage?.id };
  }, [loading, activeInvitation?.id, activePlayer?.id, activePlayerId, currentUser?.id, latestMessage?.id, latestMessage?.sender_id, desktopView, mobileChatOpen]);

  useLayoutEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.style.height = "auto";
    composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 120)}px`;
    if (followingChatRef.current && chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [draft, activeInvitation?.id, activePlayerId, activePlayer?.id, desktopView, mobileChatOpen]);

  const selectPlayer = (player) => {
    setPlayers(current => ({ ...current, [player.id]: player }));
    setActivePlayerId(player.id);
    setActiveInvitation(null);
    setMobileChatOpen(true);
    setComposerOpen(false);
    setPlayerQuery("");
    setSearchParams({ conversation: player.id }, { replace: true });
  };

  const selectInvitation = async (invitation) => {
    setActiveInvitation(invitation);
    setActivePlayerId("");
    setMobileChatOpen(true);
    setSearchParams({}, { replace: true });
    if (!invitation.is_read) {
      setInvitations(current => current.map(item => (
        item.id === invitation.id ? { ...item, is_read: true } : item
      )));
      setActiveInvitation({ ...invitation, is_read: true });
      await base44.entities.Message.update(invitation.id, { is_read: true }).catch(() => null);
      window.dispatchEvent(new CustomEvent("topfragg:messages-updated"));
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const content = draft.trim();
    if (!activePlayerId || !content || sending) return;
    setSending(true);
    try {
      const response = await base44.functions.invoke("sendMessage", {
        recipient_id: activePlayerId,
        content,
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not send message");
      setDirectMessages(current => [...current, response.data.message]);
      setDraft("");
      setEmojiPickerCloseSignal(signal => signal + 1);
      window.dispatchEvent(new CustomEvent("topfragg:messages-updated"));
    } catch (error) {
      toast({ title: "Message not sent", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji) => {
    const textarea = composerRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? draft.length;
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    if (nextDraft.length > 1000) return;
    const nextCursor = start + emoji.length;
    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  if (loading) {
    return <PageLoader label="Loading messages" />;
  }

  return (
    <div className="messages-page min-h-screen py-6">
      <div className="mx-auto max-w-[1450px] px-4 lg:px-6">
        <header className="messages-page-heading">
          <span className="messages-page-mark" aria-hidden="true"><MessageSquare size={24} /></span>
          <div><p>Your private inbox</p><h1>Messages</h1></div>
          <div className="messages-page-actions">
            {unreadCount > 0 && <span className="messages-unread-summary">{unreadCount} unread</span>}
            <button type="button" onClick={() => setComposerOpen(true)} className="messages-new-button"><Plus size={15} />New message</button>
          </div>
        </header>

        <div className="messages-workspace" data-thread-open={mobileChatOpen}>
          <aside className="messages-sidebar">
            <div className="messages-sidebar-heading"><h2>Inbox<span>{conversations.length}</span></h2><button type="button" aria-label="Start a new conversation" onClick={() => setComposerOpen(true)}><Plus size={16} /></button></div>
            <label className="messages-conversation-search"><Search size={14} aria-hidden="true" /><input value={conversationQuery} onChange={event => setConversationQuery(event.target.value)} placeholder="Search conversations…" aria-label="Search your conversations" /></label>
            <div className="messages-sidebar-scroll">
              {invitations.length > 0 && <div className="messages-invitations">
                <p className="messages-list-label">Tournament invitations<span>{invitations.length}</span></p>
                {invitations.slice(0, 3).map(invite => <button key={invite.id} type="button" onClick={() => selectInvitation(invite)} className="messages-invitation-link" data-selected={activeInvitation?.id === invite.id}>
                  <span className="messages-invitation-icon"><Trophy size={16} /></span><span className="messages-invitation-copy"><strong>{invite.subject || "Tournament invitation"}</strong><small>View invitation</small></span>{!invite.is_read && <span className="messages-invitation-dot" />}<ArrowRight size={13} />
                </button>)}
              </div>}
              <p className="messages-list-label">Conversations</p>
              {conversations.length === 0 ? <div className="messages-sidebar-empty"><Mail size={28} /><strong>Your inbox starts here.</strong><button type="button" onClick={() => setComposerOpen(true)}>Message a player</button></div>
                : visibleConversations.length === 0 ? <div className="messages-sidebar-empty"><Search size={24} /><strong>No matching conversations.</strong><button type="button" onClick={() => setConversationQuery("")}>Clear search</button></div>
                  : visibleConversations.map(conversation => {
                    const player = players[conversation.playerId] || { id: conversation.playerId, name: conversation.lastMessage.sender_id === currentUser.id ? conversation.lastMessage.recipient_name : conversation.lastMessage.sender_name };
                    return <button key={conversation.playerId} type="button" onClick={() => selectPlayer(player)} className="messages-conversation-link" data-selected={activePlayerId === conversation.playerId && !activeInvitation}>
                      <PlayerAvatar player={player} /><span className="messages-conversation-copy"><span className="messages-conversation-name"><PlayerName player={player} /><UserBadges user={player} size="xs" iconOnly showForceStream={false} tooltipPlacement="bottom" /><time dateTime={conversation.lastMessage.created_date}>{messageDate(conversation.lastMessage.created_date)}</time></span><span className="messages-conversation-preview"><span>{conversation.lastMessage.sender_id === currentUser.id ? "You: " : ""}{conversation.lastMessage.content}</span>{conversation.unread > 0 && <span className="messages-unread-pill">{conversation.unread}</span>}</span></span>
                    </button>;
                  })}
            </div>
          </aside>

          <section className="messages-thread">
            {activeInvitation ? <>
              <header className="messages-thread-heading"><button type="button" onClick={() => setMobileChatOpen(false)} className="messages-back" aria-label="Back to conversations"><ArrowLeft size={18} /></button><span className="messages-invitation-avatar"><Trophy size={21} /></span><div className="messages-thread-identity"><strong>Topfragg Tournaments</strong><p>Tournament invitation</p></div><time className="messages-thread-date" dateTime={activeInvitation.created_date}>{messageDate(activeInvitation.created_date)}</time></header>
              <div className="messages-invitation-body"><article><p className="messages-invitation-eyebrow">You're invited to compete</p><h2>{activeInvitation.subject || "Tournament invitation"}</h2><p className="messages-invitation-content">{activeInvitation.content || "You have received an invitation to join this tournament."}</p><div><Link to={activeInvitation.action_url || "/tournaments"} className="messages-new-button">View tournament<ArrowRight size={14} /></Link><small>Received {new Date(activeInvitation.created_date).toLocaleString()}</small></div></article></div>
            </> : activePlayer ? <>
              <header className="messages-thread-heading">
                <button type="button" onClick={() => setMobileChatOpen(false)} className="messages-back" aria-label="Back to conversations"><ArrowLeft size={18} /></button>
                <PlayerAvatar player={activePlayer} />
                <div className="messages-thread-identity"><div><PlayerName player={activePlayer} /><UserBadges user={activePlayer} size="xs" iconOnly showForceStream={false} tooltipPlacement="bottom" /></div><p>@{activePlayer.handle || activePlayer.username || "player"}</p></div>
                <Link to={`/profile/${activePlayer.username || activePlayer.id}`} className="messages-profile-link"><User size={13} /><span>View profile</span><ArrowRight size={12} /></Link>
              </header>
              <div className="messages-chat-region">
                <div key={activePlayerId} ref={chatScrollRef} className="messages-chat-scroll scroll-auto" onScroll={event => { const chat = event.currentTarget; const following = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 96; followingChatRef.current = following; setAtLatest(following); }}>
                  {activeMessages.length === 0 ? <div className="messages-chat-empty"><PlayerAvatar player={activePlayer} size="lg" /><h2>Say hello to <PlayerName player={activePlayer} />.</h2><p>Send the first message to start your conversation.</p></div> : <div className="messages-feed">
                    {activeMessages.map((message, index) => {
                      const own = message.sender_id === currentUser.id;
                      const grouped = sameMessageGroup(activeMessages[index - 1], message);
                      const endGroup = !sameMessageGroup(message, activeMessages[index + 1]);
                      const newDay = index === 0 || messageDay(message.created_date) !== messageDay(activeMessages[index - 1].created_date);
                      return <React.Fragment key={message.id}>
                        {newDay && <div className="messages-day-divider"><span>{messageDayLabel(message.created_date)}</span></div>}
                        <div className="messages-message-row" data-own={own} data-grouped={grouped}>
                          {!own && <span className="messages-message-avatar">{!grouped && <PlayerAvatar player={activePlayer} size="sm" />}</span>}
                          <div className="messages-message-stack">
                            {!grouped && <span className="messages-message-sender">{own ? "You" : activePlayer.name}</span>}
                            <div className="messages-bubble" title={message.created_date ? new Date(message.created_date).toLocaleString() : undefined}><p>{message.content}</p></div>
                            {endGroup && <time className="messages-message-time" dateTime={message.created_date}>{messageTime(message.created_date)}</time>}
                          </div>
                        </div>
                      </React.Fragment>;
                    })}
                    <div ref={chatEndRef} />
                  </div>}
                </div>
                {!atLatest && <button type="button" className="messages-jump-latest" onClick={() => { const chat = chatScrollRef.current; if (chat) chat.scrollTop = chat.scrollHeight; followingChatRef.current = true; setAtLatest(true); }}>Latest messages<ChevronDown size={14} /></button>}
              </div>
              <form onSubmit={sendMessage} className="messages-composer">
                <div className="messages-composer-field">
                  <textarea ref={composerRef} value={draft} onChange={event => setDraft(event.target.value.slice(0, 1000))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(event); } }} rows={1} placeholder={`Message ${activePlayer.name}…`} aria-label={`Message ${activePlayer.name}`} />
                  <EmojiPicker onSelect={insertEmoji} closeSignal={emojiPickerCloseSignal} />
                  <button type="submit" disabled={!draft.trim() || sending} aria-label={sending ? "Sending message" : "Send message"}><Send size={18} /></button>
                </div>
                <div className="messages-composer-meta"><span><LockKeyhole size={10} />Private conversation</span><span className="messages-keyboard-hint">Enter to send · Shift + Enter for a new line</span><span>{sending ? "Sending…" : `${draft.length}/1000`}</span></div>
              </form>
            </> : <div className="messages-inbox-empty"><span><MessageSquare size={32} /></span><h2>Your private inbox</h2><p>Select a conversation or find a player to send your first message.</p><button type="button" onClick={() => setComposerOpen(true)} className="messages-new-button"><Plus size={15} />New message</button></div>}
          </section>
        </div>
      </div>
      {composerOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/75 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setComposerOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <p className="text-lg font-black">New message</p>
                <p className="text-xs text-vapor">Search for a TopFragg player</p>
              </div>
              <button onClick={() => setComposerOpen(false)} className="rounded-lg p-2 text-vapor hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5">
              <div className="messages-recipient-search">
                <Search size={18} aria-hidden="true" />
                <input
                  autoFocus
                  value={playerQuery}
                  onChange={event => setPlayerQuery(event.target.value)}
                  placeholder="Search username or display name..."
                  aria-label="Search players by username or display name"
                />
              </div>
              <div className="mt-3 min-h-36 max-h-80 overflow-y-auto">
                {searching ? (
                  <p className="py-10 text-center text-sm text-vapor">Searching...</p>
                ) : playerQuery.trim().length < 2 ? (
                  <div className="py-10 text-center"><User className="mx-auto mb-2 h-7 w-7 text-vapor/30" /><p className="text-sm text-vapor">Type at least 2 characters</p></div>
                ) : searchResults.length === 0 ? (
                  <p className="py-10 text-center text-sm text-vapor">No players found</p>
                ) : searchResults.map(player => (
                  <button key={player.id} onClick={() => selectPlayer(player)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/[0.05]">
                    <PlayerAvatar player={player} />
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><PlayerName player={player} className="truncate text-sm font-black" /><UserBadges user={player} size="xs" iconOnly showForceStream={false} tooltipPlacement="bottom" /></span><span className="block truncate text-xs text-vapor">@{player.handle || player.username || "player"}</span></span>
                    <ArrowRight className="h-4 w-4 text-vapor" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
