import React, { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Bookmark, CheckCheck, Download, FolderArchive, Loader2, Search, Star, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { isDevSupportMessage, liveSupportClosed } from "@/lib/liveSupport";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { useAuth } from "@/lib/AuthContext";
import "./support-records.css";

const invoke = async (name, body) => {
  const { data } = await base44.functions.invoke(name, body);
  if (!data?.success) throw new Error(data?.error || "Could not load support records.");
  return data;
};
const date = value => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const status = ticket => ticket.support_archived ? "Archived" : liveSupportClosed(ticket) ? "Closed" : "Open";

function downloadRecord(ticket, messages) {
  const text = ["TOPFRAGG — SUPPORT RECORD (STAFF COPY)", `Reference: ${ticket.id}`, `Player: ${ticket.username} (${ticket.user_id})`,
    `Created: ${date(ticket.created_date)}`, `Status: ${status(ticket)}`, `Staff: ${ticket.assigned_admin_name || "Unassigned"}`,
    `Closed: ${date(ticket.resolved_date)}${ticket.resolved_by ? ` by ${ticket.resolved_by}` : ""}`,
    `Archived: ${date(ticket.support_archived_at)}${ticket.support_archived_by ? ` by ${ticket.support_archived_by}` : ""}`,
    "", "CONVERSATION", ...messages.map(message => `[${date(message.created_date)}] ${message.sender_name}${message.sender_staff ? " (Support)" : ""}\n${message.content}\n`),
    "", "INTERNAL NOTES — STAFF ONLY", ...(ticket.notes || []).map(note => `[${date(note.created_date)}] ${note.author_name}\n${note.content}\n`),
    "", "RECORD HISTORY", ...(ticket.history || []).map(event => `[${date(event.created_date)}] ${event.actor_name}: ${event.description}`),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `topfragg-support-${ticket.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SupportRecords({ className = "support-records-trigger" }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button className={className}><FolderArchive size={15} /> Support records</button></DialogTrigger>
    {open && <RecordsContent onClose={() => setOpen(false)} />}
  </Dialog>;
}

function RecordsContent({ onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canDelete = hasRolePower(effectiveRoleForUser(user), "admin");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState("all"), [search, setSearch] = useState(""), [page, setPage] = useState(0);
  const [result, setResult] = useState({ rows: [], next_page: null }), [selected, setSelected] = useState(null);
  const [record, setRecord] = useState(null), [messages, setMessages] = useState([]), [note, setNote] = useState("");
  const [loading, setLoading] = useState(false), [detailLoading, setDetailLoading] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const pendingNote = useRef(null);
  useEffect(() => { setConfirmDelete(false); }, [selected]);
  const endConversation = async () => {
    if (busy || !record || liveSupportClosed(record)) return;
    setBusy(true); setError("");
    try {
      const data = await invoke("closeLiveSupportConversation", { ticket_id: record.id, sequence: record.support_sequence });
      setRecord(current => ({ ...current, ...data.ticket }));
      setRevision(current => current + 1);
      window.dispatchEvent(new CustomEvent("topfragg:support-updated"));
    } catch (err) { setError(err.message || "Could not end this conversation. Please retry."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy || !record || !canDelete || !liveSupportClosed(record)) return;
    setBusy(true); setError("");
    try {
      await invoke("deleteAdminTicket", { id: record.id, kind: "ticket" });
      setSelected(null); setRecord(null); setMessages([]); setNote(""); pendingNote.current = null;
      setConfirmDelete(false); setPage(0); setRevision(current => current + 1);
    } catch (err) { setError(err.message || "Could not delete this conversation."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    const timer = setTimeout(async () => {
      try { const data = await invoke("getLiveSupportRecords", { view: filter, search, page }); if (alive) setResult(data); }
      catch (err) { if (alive) setError(err.message); }
      finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [filter, search, page, revision]);
  useEffect(() => {
    if (!selected) { setRecord(null); setMessages([]); return; }
    let alive = true; setDetailLoading(true); setError("");
    invoke("getLiveSupportRecords", { ticket_id: selected }).then(data => { if (alive) { setRecord(data.ticket); setMessages(data.messages); } })
      .catch(err => { if (alive) setError(err.message); }).finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selected, revision]);

  const manage = async (action, value) => {
    if (busy || !record) return;
    setBusy(true); setError("");
    let body = { ticket_id: record.id, action, value };
    if (action === "note") {
      if (!pendingNote.current || pendingNote.current.note !== note.trim() || pendingNote.current.ticket_id !== record.id) pendingNote.current = { ticket_id: record.id, action, note: note.trim(), request_id: crypto.randomUUID() };
      body = pendingNote.current;
    }
    try {
      const data = await invoke("manageLiveSupportRecord", body);
      setRecord(data.ticket);
      if (action === "note") { setNote(""); pendingNote.current = null; }
      setRevision(current => current + 1);
    } catch (err) { setError(err.message || "Could not save. Please retry."); }
    finally { setBusy(false); }
  };
  return <DialogContent className="support-records-dialog">
    <header className="sr-heading"><span>PLAYER SUPPORT · ADMINISTRATION</span><DialogTitle><FolderArchive size={23} /> Support records</DialogTitle><DialogDescription>Every conversation is saved. Organize important cases and keep a private record of your follow-up.</DialogDescription></header>
    <div className="sr-tools"><label className="sr-search"><Search size={17} /><span className="sr-only">Search by player, reference or last message</span><input value={search} maxLength={120} placeholder="Search player, reference or last message…" onChange={event => { setSearch(event.target.value); setPage(0); }} /></label><button disabled={busy || loading} onClick={() => setRevision(current => current + 1)}>Refresh</button></div>
    <nav className="sr-filters" aria-label="Filter support records">{[["all", "All conversations"], ["open", "Open"], ["closed", "Closed"], ["favorites", "Favorites"], ["archived", "Archived"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} disabled={busy} onClick={() => { setFilter(value); setPage(0); }}>{label}</button>)}</nav>
    {error && <div className="sr-error" role="alert">{error}</div>}
    <div className="sr-workspace">
      <aside className="sr-list" aria-label="Saved conversations" aria-busy={loading}>
        {loading && <div className="sr-feedback" role="status"><Loader2 size={16} className="animate-spin" /> Loading records…</div>}
        {!loading && result.rows.length === 0 && <div className="sr-empty"><FolderArchive size={28} /><strong>No conversations found</strong><p>Try a different search or filter.</p></div>}
        {!loading && result.rows.map(ticket => <button className="sr-row" key={ticket.id} aria-current={selected === ticket.id ? "true" : undefined} disabled={busy} onClick={() => { setSelected(ticket.id); setRecord(null); setNote(""); pendingNote.current = null; }}>
          <span className="sr-row-top"><span>#{ticket.id.slice(-8)}</span><span>{ticket.support_favorite && <Star size={12} fill="currentColor" />} {status(ticket)}</span></span>
          <strong>{ticket.username || "Player"}</strong><p>{ticket.support_last_message || "Support conversation"}</p><time>{date(ticket.created_date)}</time>
        </button>)}
        <footer className="sr-pagination"><button disabled={page === 0 || loading || busy} onClick={() => setPage(current => current - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={result.next_page === null || loading || busy} onClick={() => setPage(result.next_page)}>Next</button></footer>
      </aside>
      <section className="sr-detail" aria-label="Conversation record" aria-busy={detailLoading}>
        {detailLoading ? <div className="sr-empty" role="status"><Loader2 className="animate-spin" /> Loading conversation…</div> : !record ? <div className="sr-empty"><Bookmark size={32} /><strong>Your support archive</strong><p>Select a conversation to see its messages, notes and history.</p></div> : <>
          <header className="sr-record-header"><div><span>#{record.id}</span><h3>{record.username || "Player"}</h3><p>{status(record)} · {date(record.created_date)} · {record.assigned_admin_name || "Unassigned"}</p></div><button disabled={busy} onClick={() => { onClose(); navigate(`/?support=${encodeURIComponent(record.id)}`); }}>Open chat ↗</button></header>
          <div className="sr-actions">
            {!liveSupportClosed(record) && <button className="sr-end-button" disabled={busy} onClick={endConversation}><CheckCheck size={16} /> End conversation</button>}
            <button aria-pressed={record.support_favorite} disabled={busy} onClick={() => manage("favorite", !record.support_favorite)}><Star size={15} fill={record.support_favorite ? "currentColor" : "none"} />{record.support_favorite ? "Saved to favorites" : "Save favorite"}</button>
            <button disabled={busy || (!record.support_archived && !liveSupportClosed(record))} title={!liveSupportClosed(record) ? "End the chat before archiving" : undefined} onClick={() => manage("archive", !record.support_archived)}>{record.support_archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{record.support_archived ? "Restore" : "Archive"}</button>
            <button onClick={() => downloadRecord(record, messages)}><Download size={15} /> Export .txt</button>
            {canDelete && <button className="sr-delete-button" disabled={busy || !liveSupportClosed(record)} title={!liveSupportClosed(record) ? "End the chat before deleting" : undefined} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete</button>}</div>
          {confirmDelete && <div className="sr-delete-confirm" role="alert"><strong>Permanently delete this conversation?</strong><p>All messages and notes will be removed for staff and the player, including saved and archived copies. This cannot be undone.</p><div><button disabled={busy} onClick={() => setConfirmDelete(false)}>Keep conversation</button><button disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete for everyone"}</button></div></div>}
          {!liveSupportClosed(record) && <p className="sr-hint">Finished helping? Use End conversation here to enable Archive and Delete.</p>}
          {record.support_archived && <p className="sr-hint">Archived by {record.support_archived_by || "staff"} · {date(record.support_archived_at)}. All messages remain saved.</p>}
          <h4>Conversation <span>{messages.length} messages</span></h4>
          <div className="sr-transcript">{messages.map(message => <article key={message.id} data-staff={message.sender_staff}><div><strong className={isDevSupportMessage(message) ? "support-dev-name" : undefined}>{message.sender_name}{message.sender_staff ? " · Support" : ""}</strong><time>{date(message.created_date)}</time></div><p>{message.content}</p></article>)}{!messages.length && <p className="sr-hint">No messages recorded.</p>}</div>
          <h4>Internal notes <span>Staff only</span></h4>
          <div className="sr-notes">{(record.notes || []).map(item => <article key={item.id}><div><strong>{item.author_name}</strong><time>{date(item.created_date)}</time></div><p>{item.content}</p></article>)}</div>
          <form className="sr-note-form" onSubmit={event => { event.preventDefault(); manage("note"); }}><label htmlFor="support-record-note">Add a private follow-up note</label><textarea id="support-record-note" rows={3} maxLength={4000} disabled={busy} value={note} onChange={event => setNote(event.target.value)} placeholder="Outcome, next steps or details for the team…" /><button disabled={busy || !note.trim()} type="submit">{busy ? "Saving…" : "Save internal note"}</button></form>
          <details className="sr-history"><summary>Record history ({record.history?.length || 0})</summary>{(record.history || []).map(event => <p key={event.id}><strong>{event.actor_name}</strong> · {event.description}<time>{date(event.created_date)}</time></p>)}{!record.history?.length && <p>No administrative changes yet.</p>}</details>
        </>}
      </section>
    </div>
  </DialogContent>;
}
