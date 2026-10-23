import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Headphones, X, Send, Volume2, VolumeX, ArrowLeft, CheckCheck, MessageCircle } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isDevSupportMessage, isLiveSupportStaff, liveSupportClosed, liveSupportUnread } from "@/lib/liveSupport";
import "./live-support.css";
const SupportRecords = lazy(() => import("./SupportRecords"));

const call = async (name, body) => {
  const { data } = await base44.functions.invoke(name, body);
  if (data?.success === false) throw new Error(data.error || "Please try again.");
  return data;
};
const savedSound = () => { try { return localStorage.getItem("topfragg:support-sound") !== "off"; } catch { return true; } };

export default function LiveSupport() {
  const { user } = useAuth(), staff = isLiveSupportStaff(user);
  const location = useLocation(), navigate = useNavigate();
  const [open, setOpen] = useState(false), [threads, setThreads] = useState([]);
  const [selected, setSelected] = useState(null), [ticket, setTicket] = useState(null), [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [sound, setSound] = useState(savedSound);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("topfragg:open-support", show);
    return () => window.removeEventListener("topfragg:open-support", show);
  }, []);
  const audio = useRef(null), seen = useRef(new Map()), mounted = useRef(true), active = useRef(null), pending = useRef(null), end = useRef(null), reading = useRef(false), initialized = useRef(false), snapshot = useRef(null);
  active.current = selected;
  const chime = useCallback(() => {
    if (!sound || !audio.current || audio.current.state !== "running") return;
    const context = audio.current;
    [660, 990].forEach((frequency, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + index * .12;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.075, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + .2);
    });
  }, [sound]);

  useEffect(() => {
    mounted.current = true;
    const unlock = () => {
      if (!audio.current) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) audio.current = new Audio(); }
      audio.current?.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
    return () => { mounted.current = false; window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); audio.current?.close().catch(() => {}); audio.current = null; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search), id = params.get("support");
    if (!id || !user) return;
    setSelected(id); setOpen(true); params.delete("support");
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
  }, [location, navigate, user]);

  const refresh = useCallback(async () => {
    if (!user || (document.hidden && !staff) || reading.current) return;
    reading.current = true;
    const id = open && !document.hidden ? active.current : null;
    try {
      const data = await call("getLiveSupportState", { ticket_id: id, ...(snapshot.current?.id === id ? { known_sequence: snapshot.current.sequence } : {}) });
      if (!mounted.current) return;
      setThreads(data.threads);
      let alert = false;
      for (const thread of data.threads) {
        const sequence = Number(thread[staff ? "support_customer_sequence" : "support_staff_sequence"] || 0);
        if (liveSupportUnread(thread, staff) && sequence > (seen.current.get(thread.id) || 0)) alert = true;
        seen.current.set(thread.id, sequence);
      }
      if (alert) chime();
      if (id && active.current === id) {
        setTicket(data.ticket);
        if (data.messages !== null) setMessages(data.messages);
        snapshot.current = { id, sequence: Number(data.ticket.support_sequence || 0) };
        if (liveSupportUnread(data.ticket, staff)) {
          await call("markLiveSupportRead", { ticket_id: id, sequence: data.ticket.support_sequence });
        }
      } else if (!staff && !active.current && !initialized.current && data.threads.length) setSelected(data.threads[0].id);
      initialized.current = true;
    } catch (err) {
      if (mounted.current && id && active.current === id && err.status === 404) {
        active.current = null; snapshot.current = null; initialized.current = true;
        setSelected(null); setTicket(null); setMessages([]); setDraft(""); pending.current = null; setError("");
        setThreads(current => current.filter(thread => thread.id !== id));
      } else if (mounted.current && open) setError(err.message || "Could not load support. Please retry.");
    }
    finally { reading.current = false; if (mounted.current) setLoading(false); }
  }, [user, open, staff, chime]);

  useEffect(() => {
    setLoading(open && Boolean(user));
    let stopped = false, timer;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, document.hidden ? 30000 : open ? 4000 : staff ? 15000 : 30000); };
    poll();
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("topfragg:support-updated", visible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("topfragg:support-updated", visible); };
  }, [refresh, open, staff, user, selected]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, open]);

  const choose = id => { setSelected(id); setTicket(null); setMessages([]); setDraft(""); pending.current = null; snapshot.current = null; setError(""); };
  const send = async event => {
    event.preventDefault(); if (busy || !draft.trim()) return;
    setBusy(true); setError("");
    const message = draft.trim();
    if (!pending.current || pending.current.message !== message || pending.current.ticket_id !== selected) pending.current = { message, ticket_id: selected, request_id: crypto.randomUUID(), context_path: location.pathname };
    try {
      const data = await call("sendLiveSupportMessage", pending.current);
      if (!mounted.current) return;
      setSelected(data.ticket.id); setTicket(data.ticket);
      setMessages(current => current.some(row => row.id === data.message.id) ? current : [...current, data.message]);
      setDraft(""); pending.current = null;
    } catch (err) { setError(err.message || "Message could not be sent. Your message is saved here; retry sending."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const closeConversation = async () => {
    setBusy(true); setError("");
    try { const data = await call("closeLiveSupportConversation", { ticket_id: selected, sequence: ticket?.support_sequence }); setTicket(data.ticket); await refresh(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const unread = threads.filter(thread => liveSupportUnread(thread, staff)).length;
  const closed = liveSupportClosed(ticket);
  return <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
    <Dialog.Trigger asChild><button className="support-launcher" aria-label={`${staff ? "Support inbox" : "Live support"}${unread ? `, ${unread} unread conversations` : ""}`}><Headphones size={23} /><span className="support-launcher-label">{staff ? "Support inbox" : "Support"}</span>{unread > 0 && <b className="support-badge">{unread}</b>}</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Content className="support-panel" onInteractOutside={event => event.preventDefault()}>
      <header className="support-header"><span className="support-mark"><Headphones size={23} /></span><div><Dialog.Title>{staff ? "Support desk" : "Topfragg support"}</Dialog.Title><Dialog.Description className={staff ? undefined : "sr-only"}>{staff ? "Help players. Keep them in the game." : "Support conversation"}</Dialog.Description></div><button className="support-icon" aria-label={sound ? "Mute support sounds" : "Enable support sounds"} title={sound ? "Mute support sounds" : "Enable support sounds"} onClick={() => { setSound(!sound); try { localStorage.setItem("topfragg:support-sound", sound ? "off" : "on"); } catch { /* Storage is optional. */ } }}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><Dialog.Close className="support-icon" aria-label="Close support"><X size={19} /></Dialog.Close></header>
      {!user ? <div className="support-welcome"><MessageCircle size={34} /><h3>How can we help?</h3><p>Sign in to chat with our team and keep your conversation saved.</p><Link className="support-primary" to="/login" onClick={() => setOpen(false)}>Sign in to chat</Link></div> : <>
        {staff && <div className="support-toolbar">{selected ? <button onClick={() => choose(null)}><ArrowLeft size={15} /> Inbox</button> : <span>{threads.length} open conversations</span>}<Link to="/admin?tab=tickets" onClick={() => setOpen(false)}>Ticket center ↗</Link></div>}
        {staff && <div className="support-toolbar"><Suspense fallback={null}><SupportRecords /></Suspense><span>Saved conversations</span></div>}
        {error && <div className="support-error" role="alert">{error} <button onClick={() => { setError(""); refresh(); }}>Retry</button></div>}
        {staff && !selected ? <div className="support-inbox">{loading && !threads.length ? <p>Loading conversations…</p> : !threads.length ? <div className="support-welcome"><CheckCheck size={32} /><h3>All caught up</h3><p>New player requests will appear here.</p></div> : threads.map(thread => <button key={thread.id} className="support-thread" onClick={() => choose(thread.id)}><span className="support-avatar">{(thread.username || "P").slice(0, 1).toUpperCase()}</span><span><strong>{thread.username || "Player"}</strong><small>{thread.support_last_message || "New support request"}</small><em>{thread.support_premium && <span className="support-premium-priority">Premium priority · </span>}{thread.assigned_admin_name ? `Helping: ${thread.assigned_admin_name}` : "Unassigned · Reply to pick up"}</em></span>{liveSupportUnread(thread, true) && <i className="support-dot" />}</button>)}</div> : <>
          {staff && ticket && <div className="support-conversation-label">{ticket.username} <span>{ticket.assigned_admin_name ? `Helping: ${ticket.assigned_admin_name}` : "Reply to pick up this chat"}</span></div>}
          <div className="support-messages" role="log" aria-label="Support conversation" aria-live="polite" aria-relevant="additions text">
            {!messages.length && <div className="support-welcome"><MessageCircle size={32} /><h3>{loading ? "Loading your chat…" : "What's on your mind?"}</h3><p>Matches, your account, or something else? Leave a message. Replies appear here; you can continue browsing.</p><small>Never share passwords or payment details.</small></div>}
            {messages.map(message => <article key={message.id} className={`support-message ${message.sender_id === user.id ? "support-message-own" : ""}`}><div><strong className={isDevSupportMessage(message) ? "support-dev-name" : undefined}>{message.sender_staff ? `${message.sender_name} · Support` : message.sender_name}</strong><time>{message.created_date ? new Date(message.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time></div><p>{message.content}</p></article>)}<div ref={end} />
          </div>
          {closed ? <div className="support-ended"><CheckCheck size={17} /> Conversation closed.{!staff && <button onClick={() => { choose(null); setThreads([]); }}>Start a new chat</button>}</div> : <form className="support-composer" onSubmit={send}><label className="sr-only" htmlFor="support-message">Your message</label><textarea id="support-message" placeholder="Write your message…" value={draft} maxLength={2000} rows={2} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(event); } }} /><button className="support-send" disabled={busy || !draft.trim() || (staff && !ticket)} aria-label="Send message"><Send size={19} /></button><div className="support-composer-meta"><span>{busy ? "Sending…" : "Replies are saved to your account"}</span>{ticket && <button type="button" disabled={busy} onClick={closeConversation}>End chat</button>}</div></form>}
        </>}
      </>}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
