import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
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

const initials = (name) => String(name || "Player").trim().slice(0, 1).toUpperCase();
const messageTime = (value) => value
  ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  : "";
const messageDate = (value) => value
  ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric" })
  : "";

function PlayerAvatar({ player, size = "md" }) {
  const dimensions = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <div className={`${dimensions} shrink-0 overflow-hidden rounded-xl border border-cyan/20 bg-gradient-to-br from-cyan/20 to-orange/10 flex items-center justify-center font-black text-cyan`}>
      {player?.avatar_url ? (
        <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : initials(player?.name)}
    </div>
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
  const [sending, setSending] = useState(false);
  const [composerOpen, setComposerOpen] = useState(Boolean(searchParams.get("compose")));
  const [playerQuery, setPlayerQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const chatEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const activePlayerIdRef = useRef(activePlayerId);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);

  const loadInvitations = async (userId) => {
    const rows = await base44.entities.Message.filterFresh({ recipient_id: userId }, "-created_date", 100).catch(() => []);
    setInvitations((rows || []).filter(message => message.message_type === "tournament_invitation"));
  };

  const loadDirectMessages = async ({ initial = false, viewerId = "" } = {}) => {
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

        const requestedPlayerId = searchParams.get("compose") || searchParams.get("conversation");
        if (requestedPlayerId) {
          const response = await base44.functions.invoke("searchMessageRecipients", { recipient_id: requestedPlayerId });
          const player = response.data?.users?.[0];
          if (player && active) {
            setPlayers(current => ({ ...current, [player.id]: player }));
            setActivePlayerId(player.id);
            setComposerOpen(false);
            setSearchParams({ conversation: player.id }, { replace: true });
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    initialize();
    return () => { active = false; };
  }, []);

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
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await base44.functions.invoke("searchMessageRecipients", { query });
        setSearchResults(response.data?.users || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
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
      new Date(b.lastMessage.created_date || 0) - new Date(a.lastMessage.created_date || 0)
    ));
  }, [currentUser?.id, directMessages]);

  const activeMessages = useMemo(() => directMessages.filter(message => (
    currentUser?.id && activePlayerId
    && [message.sender_id, message.recipient_id].includes(currentUser.id)
    && [message.sender_id, message.recipient_id].includes(activePlayerId)
  )), [activePlayerId, currentUser?.id, directMessages]);
  const activePlayer = players[activePlayerId] || null;

  useEffect(() => {
    if (!activePlayerId || !currentUser?.id) return;
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
  }, [activePlayerId, activeMessages.length, currentUser?.id]);

  useEffect(() => {
    const chat = chatScrollRef.current;
    if (!chat) return;
    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
  }, [activeMessages.length, activePlayerId]);

  const selectPlayer = (player) => {
    setPlayers(current => ({ ...current, [player.id]: player }));
    setActivePlayerId(player.id);
    setActiveInvitation(null);
    setComposerOpen(false);
    setPlayerQuery("");
    setSearchParams({ conversation: player.id }, { replace: true });
  };

  const selectInvitation = async (invitation) => {
    setActiveInvitation(invitation);
    setActivePlayerId("");
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
      window.dispatchEvent(new CustomEvent("topfragg:messages-updated"));
    } catch (error) {
      toast({ title: "Message not sent", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-cyan/20 border-t-cyan" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-[1450px] px-4 lg:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-cyan">Private communications</p>
            <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight">
              <MessageSquare className="h-8 w-8 text-cyan" /> Messages
            </h1>
            <p className="mt-1 text-sm text-vapor">Chat privately with other TopFragg players.</p>
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan px-5 text-xs font-black uppercase tracking-wider text-background transition-transform hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" /> New message
          </button>
        </div>

        <div className="grid min-h-[680px] overflow-hidden rounded-2xl border border-white/10 bg-card lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border-b border-white/10 bg-background/25 lg:border-b-0 lg:border-r">
            <div className="border-b border-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-vapor">Conversations</p>
            </div>

            {invitations.length > 0 && (
              <div className="border-b border-white/10 p-3">
                <p className="mb-2 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-orange">Tournament invites</p>
                {invitations.slice(0, 3).map(invite => (
                  <button
                    key={invite.id}
                    type="button"
                    onClick={() => selectInvitation(invite)}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${activeInvitation?.id === invite.id ? "border-orange/35 bg-orange/15" : "border-orange/15 bg-orange/5 hover:bg-orange/10"}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange/10 text-orange"><Trophy className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">{invite.subject || "Tournament invitation"}</span>
                      <span className="block truncate text-[10px] text-vapor">Read full invitation</span>
                    </span>
                    {!invite.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-orange" />}
                    <ArrowRight className="h-3.5 w-3.5 text-vapor" />
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-[580px] overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Mail className="mx-auto mb-3 h-9 w-9 text-vapor/30" />
                  <p className="text-sm font-bold">No conversations yet</p>
                  <button onClick={() => setComposerOpen(true)} className="mt-2 text-xs font-bold text-cyan hover:underline">Message a player</button>
                </div>
              ) : conversations.map(conversation => {
                const player = players[conversation.playerId];
                const selected = activePlayerId === conversation.playerId;
                return (
                  <button
                    key={conversation.playerId}
                    type="button"
                    onClick={() => selectPlayer(player || { id: conversation.playerId, name: conversation.lastMessage.sender_name })}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? "border-cyan/30 bg-cyan/10" : "border-transparent hover:bg-white/[0.04]"}`}
                  >
                    <PlayerAvatar player={player || { name: conversation.lastMessage.sender_name }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-black">{player?.name || conversation.lastMessage.sender_name}</span>
                        <span className="text-[9px] text-vapor">{messageDate(conversation.lastMessage.created_date)}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-vapor">{conversation.lastMessage.sender_id === currentUser.id ? "You: " : ""}{conversation.lastMessage.content}</span>
                        {conversation.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan px-1.5 text-[9px] font-black text-background">{conversation.unread}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-[620px] min-w-0 flex-col">
            {activeInvitation ? (
              <div className="flex min-h-[620px] flex-1 flex-col">
                <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange/25 bg-orange/10 text-orange">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange">Tournament invitation</p>
                    <p className="mt-1 truncate text-base font-black">TopFragg Tournaments</p>
                  </div>
                  <span className="text-[10px] text-vapor">{messageDate(activeInvitation.created_date)}</span>
                </div>

                <div className="flex flex-1 items-start justify-center overflow-y-auto bg-background/15 p-5 sm:p-10">
                  <article className="w-full max-w-3xl overflow-hidden rounded-2xl border border-orange/20 bg-card shadow-[0_24px_70px_rgba(0,0,0,.25)]">
                    <div className="border-b border-white/10 bg-gradient-to-r from-orange/10 via-transparent to-cyan/5 p-6 sm:p-8">
                      <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-orange">You are invited to compete</p>
                      <h2 className="break-words text-2xl font-black leading-tight sm:text-3xl">
                        {activeInvitation.subject || "Tournament invitation"}
                      </h2>
                    </div>
                    <div className="p-6 sm:p-8">
                      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/75">
                        {activeInvitation.content || "You have received an invitation to join this tournament."}
                      </p>
                      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
                        <Link
                          to={activeInvitation.action_url || "/tournaments"}
                          className="inline-flex h-11 items-center gap-2 rounded-xl bg-orange px-5 text-xs font-black uppercase tracking-wider text-background transition-transform hover:-translate-y-0.5"
                        >
                          View tournament <ArrowRight className="h-4 w-4" />
                        </Link>
                        <span className="text-xs text-vapor">Received {new Date(activeInvitation.created_date).toLocaleString()}</span>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            ) : activePlayer ? (
              <>
                <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
                  <PlayerAvatar player={activePlayer} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-black">{activePlayer.name}</p>
                    <p className="truncate text-xs text-vapor">@{activePlayer.handle || activePlayer.username || "player"}</p>
                  </div>
                  <Link to={`/profile/${activePlayer.username || activePlayer.id}`} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-vapor hover:border-cyan/25 hover:text-cyan">
                    View profile
                  </Link>
                </div>

                <div ref={chatScrollRef} className="flex-1 overflow-y-auto bg-background/15 px-4 py-6 sm:px-7">
                  {activeMessages.length === 0 && (
                    <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                      <PlayerAvatar player={activePlayer} size="lg" />
                      <h2 className="mt-4 text-xl font-black">Start a conversation</h2>
                      <p className="mt-1 max-w-sm text-sm text-vapor">Send {activePlayer.name} a private message.</p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {activeMessages.map(message => {
                      const own = message.sender_id === currentUser.id;
                      return (
                        <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${own ? "rounded-br-md bg-cyan text-background" : "rounded-bl-md border border-white/10 bg-secondary"}`}>
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                            <p className={`mt-1 text-right text-[9px] ${own ? "text-background/60" : "text-vapor"}`}>{messageTime(message.created_date)}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>
                </div>

                <form onSubmit={sendMessage} className="border-t border-white/10 p-4">
                  <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-background/45 p-2 focus-within:border-cyan/30">
                    <textarea
                      value={draft}
                      onChange={event => setDraft(event.target.value.slice(0, 1000))}
                      onKeyDown={event => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage(event);
                        }
                      }}
                      rows={1}
                      placeholder={`Message ${activePlayer.name}...`}
                      className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-vapor/60"
                    />
                    <button disabled={!draft.trim() || sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan text-background disabled:opacity-40">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-right text-[9px] text-vapor">{draft.length}/1000</p>
                </form>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan/20 bg-cyan/10"><MessageSquare className="h-9 w-9 text-cyan" /></span>
                <h2 className="mt-5 text-2xl font-black">Your private inbox</h2>
                <p className="mt-2 max-w-md text-sm text-vapor">Select a conversation or find a player to send your first message.</p>
                <button onClick={() => setComposerOpen(true)} className="mt-5 rounded-xl bg-cyan px-5 py-3 text-xs font-black uppercase tracking-wider text-background">New message</button>
              </div>
            )}
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
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/50 px-4 focus-within:border-cyan/30">
                <Search className="h-4 w-4 text-vapor" />
                <input
                  autoFocus
                  value={playerQuery}
                  onChange={event => setPlayerQuery(event.target.value)}
                  placeholder="Search username or display name..."
                  className="h-12 flex-1 bg-transparent text-sm outline-none"
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
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{player.name}</span><span className="block truncate text-xs text-vapor">@{player.handle || player.username || "player"}</span></span>
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
