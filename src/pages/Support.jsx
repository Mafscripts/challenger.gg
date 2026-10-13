import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CheckCheck, ChevronRight, Clock3, Crown, FileText, Inbox, Loader2, MessageSquare, Paperclip, Plus, RefreshCw, Search, Send, ShieldCheck, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { disputeEvidenceUrls, disputeReasonLabel } from "@/lib/matchDisputes";
import "@/styles/support.css";

const visibleProof = (ticket) => [...new Set([...(ticket.submitted_proof || []), ...(ticket.proof_urls || [])])].filter((url) => {
  try { return disputeEvidenceUrls([url]).length > 0; } catch { return false; }
});

const categories = [
  { value: "support", label: "General Support" },
  { value: "account", label: "Account" },
  { value: "payment", label: "Payment" },
  { value: "ranked", label: "Ranked" },
  { value: "tournament", label: "Tournament" },
  { value: "marketplace", label: "Marketplace" },
  { value: "bug", label: "Bug Report" },
  { value: "other", label: "Other" },
];

const isClosed = ticket => ["resolved", "closed"].includes(ticket.status);
const ticketStatus = ticket => {
  if (isClosed(ticket)) return { label: ticket.status === "resolved" ? "Resolved" : "Closed", tone: "closed" };
  if (ticket.status === "waiting_for_user") return { label: "Your reply needed", tone: "reply" };
  if (ticket.status === "escalated") return { label: "Escalated", tone: "escalated" };
  if (["admin_joined", "in_progress"].includes(ticket.status)) return { label: "Staff reviewing", tone: "review" };
  return { label: "Waiting for staff", tone: "waiting" };
};
const categoryLabel = value => categories.find(category => category.value === value)?.label || String(value || "support").replaceAll("_", " ");
const dateLabel = (value, compact = false) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return "";
  return new Date(value).toLocaleString(undefined, compact
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const shortId = ticket => String(ticket.id || "").slice(-8).toUpperCase();
const ticketTitle = ticket => {
  const subject = ticket.subject || "Support request";
  const matchId = ticket.match_id;
  return matchId && subject.endsWith(` ${matchId}`) ? subject.slice(0, -matchId.length).trim() : subject;
};
function StatusBadge({ ticket }) {
  const status = ticketStatus(ticket);
  return <span className="support-status" data-tone={status.tone}><span />{status.label}</span>;
}

export default function Support({ ticketCenter = false }) {
  const [user, setUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(!ticketCenter);
  const [mobileDetail, setMobileDetail] = useState(!ticketCenter);
  const [form, setForm] = useState({
    subject: "",
    category: "support",
    description: "",
  });

  const loadSupportData = useCallback(async () => {
    setRefreshing(true);
    setLoadError("");
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      if (!currentUser) { setTickets([]); return; }
      const ticketRows = await base44.entities.Ticket.filter({}, "-created_date", 500);
      setTickets(ticketRows.filter(ticket => ticket.user_id === currentUser.id || (ticket.participant_user_ids || []).includes(currentUser.id)));
    } catch {
      setLoadError("Your tickets could not be loaded. Please refresh and try again.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSupportData(); }, [loadSupportData]);

  const ticketMessages = (ticket) => {
    const rows = [
      ...(ticket.messages || []),
    ];
    const seen = new Set();
    return rows
      .filter((message) => {
        const key = message.id || `${message.created_date}:${message.sender_id}:${message.content}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return !message.internal;
      })
      .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  };

  const handleReply = async (ticket) => {
    const message = (replyDrafts[ticket.id] || "").trim();
    if (!message) {
      toast({ title: "Reply required", description: "Add a message before sending.", variant: "destructive" });
      return;
    }

    setBusyId(`reply:${ticket.id}`);
    try {
      const response = await base44.functions.invoke("replyTicket", {
        ticket_id: ticket.id,
        message,
      });
      if (response.data?.success) {
        setReplyDrafts((current) => ({ ...current, [ticket.id]: "" }));
        toast({ title: "Reply sent" });
        await loadSupportData();
      } else {
        toast({ title: "Reply failed", description: response.data?.error || "Could not send reply.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Reply failed", description: error.message || "Could not send reply.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleEscalate = async (ticket) => {
    const proofText = typeof window !== "undefined" ? window.prompt("Extra proof URLs (comma or line separated):", "") : "";
    if (proofText === null) return;
    const proofUrls = proofText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);

    setBusyId(`escalate:${ticket.id}`);
    try {
      const response = await base44.functions.invoke("escalateTicket", {
        ticket_id: ticket.id,
        reason: "Premium escalation requested from support page",
        proof_urls: proofUrls,
      });
      if (response.data?.success) {
        toast({ title: "Ticket escalated" });
        await loadSupportData();
      } else {
        toast({ title: "Escalation failed", description: response.data?.error || "Could not escalate ticket.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Escalation failed", description: error.message || "Could not escalate ticket.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const subject = form.subject.trim();
    const description = form.description.trim();
    if (!subject || !description) {
      toast({ title: "Missing details", description: "Please add a subject and description.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await base44.functions.invoke("createTicket", {
        subject,
        description,
        category: form.category,
        priority: "medium",
      });

      if (response.data?.success) {
        toast({ title: "Support ticket opened", description: "Staff will review your request." });
        setForm({ subject: "", category: "support", description: "" });
        setSelectedId(response.data.ticket?.id || null);
        setFilter("all");
        setQuery("");
        setComposing(false);
        setMobileDetail(true);
        await loadSupportData();
      } else {
        toast({ title: "Ticket failed", description: response.data?.error || "Could not open ticket.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Ticket failed", description: error.message || "Could not open ticket.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const counts = {
    all: tickets.length,
    active: tickets.filter(ticket => !isClosed(ticket)).length,
    reply: tickets.filter(ticket => ticket.status === "waiting_for_user").length,
    closed: tickets.filter(isClosed).length,
  };
  const filteredTickets = tickets.filter(ticket => {
    const matchesFilter = filter === "all" || (filter === "active" && !isClosed(ticket)) || (filter === "reply" && ticket.status === "waiting_for_user") || (filter === "closed" && isClosed(ticket));
    const searchText = [ticket.subject, ticket.description, ticket.id, ticket.category, ticket.assigned_admin_name].join(" ").toLowerCase();
    return matchesFilter && searchText.includes(query.trim().toLowerCase());
  });
  const selectedTicket = filteredTickets.find(ticket => ticket.id === selectedId) || filteredTickets[0];
  const messages = selectedTicket ? ticketMessages(selectedTicket) : [];
  const evidence = selectedTicket ? visibleProof(selectedTicket) : [];
  const openComposer = () => { setComposing(true); setMobileDetail(true); };
  const selectFilter = nextFilter => { setFilter(nextFilter); setComposing(false); setMobileDetail(false); };

  return (
    <div className="support-page">
      <div className="support-container">
        <header className="support-heading">
          <div><span className="support-eyebrow"><ShieldCheck size={14} aria-hidden="true" />Player support</span><h1>{ticketCenter ? "My Tickets" : "Support Center"}</h1><p>Track your requests, share evidence and talk to the Topfragg team.</p></div>
          <button type="button" className="support-primary" onClick={openComposer} disabled={loading || !user}><Plus size={18} />New ticket</button>
        </header>
        <nav className="support-summary" aria-label="Filter your tickets">
          {[{ id: "active", label: "Active tickets", icon: Inbox }, { id: "reply", label: "Your reply needed", icon: MessageSquare }, { id: "closed", label: "Closed & resolved", icon: CheckCheck }].map(item => {
            const Icon = item.icon;
            return <button type="button" key={item.id} onClick={() => selectFilter(item.id)} aria-current={filter === item.id ? "true" : undefined} data-kind={item.id}><Icon size={20} aria-hidden="true" /><span>{item.label}</span><strong>{loading ? "—" : counts[item.id]}</strong></button>;
          })}
        </nav>
        {loadError && <div className="support-error" role="alert">{loadError}<button type="button" onClick={loadSupportData} disabled={refreshing}>Try again</button></div>}
        <div className="support-workspace" data-detail-open={mobileDetail}>
          <aside id="my-tickets" className="support-inbox">
            <div className="support-inbox-heading"><h2>Your tickets<span>{loading ? "—" : counts.all}</span></h2><button type="button" className="support-icon-button" onClick={loadSupportData} disabled={refreshing} aria-label="Refresh tickets" title="Refresh tickets"><RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /></button></div>
            <label className="support-search"><Search size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tickets…" aria-label="Search your tickets" /></label>
            <div className="support-filter-tabs" role="group" aria-label="Ticket status"><button type="button" onClick={() => selectFilter("all")} aria-pressed={filter === "all"}>All tickets</button><button type="button" onClick={() => selectFilter("active")} aria-pressed={filter === "active"}>Active</button><button type="button" onClick={() => selectFilter("closed")} aria-pressed={filter === "closed"}>Closed</button></div>
            <div className="support-ticket-list">
              {loading ? <div className="support-list-empty" role="status"><Loader2 size={24} className="animate-spin" /><p>Loading your tickets…</p></div> : filteredTickets.length === 0 ? <div className="support-list-empty"><Inbox size={28} /><strong>{tickets.length ? "No matching tickets" : "No tickets yet"}</strong><p>{tickets.length ? "Try another search or status." : "Your support requests and match tickets will appear here."}</p>{tickets.length ? <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : <button type="button" onClick={openComposer} disabled={!user}>Create your first ticket</button>}</div> : filteredTickets.map(ticket => {
                const lastMessage = ticketMessages(ticket).at(-1);
                const updatedAt = lastMessage?.created_date || ticket.updated_date || ticket.created_date;
                return <button type="button" key={ticket.id} className="support-ticket-row" data-selected={!composing && selectedTicket?.id === ticket.id} onClick={() => { setSelectedId(ticket.id); setComposing(false); setMobileDetail(true); }}>
                  <span className="support-ticket-row-meta"><span>#{shortId(ticket)}</span><time dateTime={updatedAt} title={dateLabel(updatedAt)}>{dateLabel(updatedAt, true)}</time></span>
                  <strong title={ticket.subject}>{ticketTitle(ticket)}</strong>
                  <span className="support-ticket-preview">{lastMessage?.content || ticket.description || "Open ticket to see the details."}</span>
                  <span className="support-ticket-row-footer"><StatusBadge ticket={ticket} /><ChevronRight size={15} aria-hidden="true" /></span>
                </button>;
              })}
            </div>
          </aside>
          <section className="support-detail" aria-label={composing ? "Create a support ticket" : "Ticket details"}>
            <button type="button" className="support-back" onClick={() => setMobileDetail(false)}><ArrowLeft size={17} />Back to tickets</button>
            {composing ? <form className="support-new-ticket" onSubmit={handleSubmit}>
              <header className="support-detail-heading"><div><span className="support-eyebrow">Start a conversation</span><h2>How can we help?</h2><p>Describe the issue so staff can review your request.</p></div><button type="button" className="support-icon-button" aria-label="Close new ticket" disabled={submitting} onClick={() => { setComposing(false); setMobileDetail(false); }}><X size={19} /></button></header>
              <div className="support-new-fields">
                <label><span>Subject</span><input required maxLength={120} value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} placeholder="A short summary of the issue" /></label>
                <label><span>Category</span><select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}>{categories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
                <label><span>Description</span><textarea required maxLength={3000} rows={7} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="What happened? Include relevant match IDs, usernames and evidence links." /><small>{form.description.length}/3000 characters</small></label>
                <div className="support-form-help"><Paperclip size={18} aria-hidden="true" /><div><strong>Help us understand the issue</strong><p>Include the match or transaction reference, explain what happened and add links to screenshots or clips if available.</p></div></div>
              </div>
              <footer className="support-new-footer"><span><ShieldCheck size={15} />Sent to Topfragg staff</span><button type="submit" className="support-primary" disabled={submitting || !user}>{submitting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{submitting ? "Submitting…" : "Submit ticket"}</button></footer>
            </form> : selectedTicket ? <>
              <header className="support-detail-heading"><div><span className="support-eyebrow">Ticket #{shortId(selectedTicket)}</span><h2 title={selectedTicket.subject}>{ticketTitle(selectedTicket)}</h2><div className="support-detail-meta"><StatusBadge ticket={selectedTicket} /><span>{categoryLabel(selectedTicket.category)}</span></div></div></header>
              <div className="support-case-info"><span><ShieldCheck size={16} />{selectedTicket.assigned_admin_name ? <>Assigned to <strong>{selectedTicket.assigned_admin_name}</strong></> : "Awaiting staff assignment"}</span><time dateTime={selectedTicket.created_date}><Clock3 size={15} />Opened {dateLabel(selectedTicket.created_date)}</time></div>
              <div className="support-ticket-body">
                {selectedTicket.description && <section className="support-request"><h3><FileText size={16} />Original request</h3><p>{selectedTicket.description}</p></section>}
                {(selectedTicket.dispute_reason || evidence.length > 0 || (selectedTicket.action_url && !["/admin", "/support", "/my-tickets"].includes(selectedTicket.action_url))) && <section className="support-evidence">
                  {selectedTicket.dispute_reason && <p><strong>{disputeReasonLabel(selectedTicket.dispute_reason)}</strong>{selectedTicket.reported_against_name ? ` · ${selectedTicket.reported_against_name}` : ""}</p>}
                  {!!evidence.length && <div className="support-evidence-links">{evidence.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><Paperclip size={15} /><span>Evidence {index + 1}<small>{new URL(url).hostname}</small></span><ArrowUpRight size={15} /></a>)}</div>}
                  {selectedTicket.action_url && !["/admin", "/support", "/my-tickets"].includes(selectedTicket.action_url) && <Link className="support-match-link" to={selectedTicket.action_url}>Open match room{selectedTicket.match_id && <span>#{String(selectedTicket.match_id).slice(-8).toUpperCase()}</span>}<ArrowUpRight size={15} /></Link>}
                </section>}
                {isClosed(selectedTicket) && selectedTicket.resolution && <section className="support-resolution"><h3><CheckCheck size={18} />Staff decision{selectedTicket.resolved_by_name ? ` · ${selectedTicket.resolved_by_name}` : ""}</h3><p>{selectedTicket.resolution}</p></section>}
                <section className="support-conversation"><div className="support-conversation-heading"><h3><MessageSquare size={17} />Conversation</h3><span>{messages.length} {messages.length === 1 ? "reply" : "replies"}</span></div>
                  {messages.length === 0 ? <p className="support-no-replies">No replies yet. Staff responses will appear here.</p> : <div className="support-conversation-messages">{messages.map(message => {
                    const own = message.sender_id === user?.id;
                    const staff = ["moderator", "admin", "super_admin", "ceo"].includes(message.sender_role);
                    return <article key={message.id || `${message.created_date}:${message.sender_id}:${message.content}`} className="support-message" data-own={own}>
                      <span className="support-message-avatar">{staff ? <ShieldCheck size={17} /> : (message.sender_name || "P").slice(0, 1).toUpperCase()}</span>
                      <div><div className="support-message-meta"><strong>{message.sender_name || "Player"}</strong>{staff && <span>Staff</span>}<time dateTime={message.created_date}>{dateLabel(message.created_date)}</time></div><p>{message.content}</p></div>
                    </article>;
                  })}</div>}
                </section>
              </div>
              {!isClosed(selectedTicket) ? <footer className="support-reply-area">
                <form onSubmit={event => { event.preventDefault(); handleReply(selectedTicket); }}><label htmlFor="support-ticket-reply">Reply to this ticket</label><textarea id="support-ticket-reply" rows={3} value={replyDrafts[selectedTicket.id] || ""} onChange={event => setReplyDrafts(current => ({ ...current, [selectedTicket.id]: event.target.value }))} placeholder="Add a message or share more evidence…" /><div className="support-reply-actions"><span>Visible to ticket participants and staff</span><button type="submit" className="support-primary" disabled={Boolean(busyId) || !(replyDrafts[selectedTicket.id] || "").trim()}>{busyId === `reply:${selectedTicket.id}` ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{busyId === `reply:${selectedTicket.id}` ? "Sending…" : "Send reply"}</button></div></form>
                {user?.is_premium && !selectedTicket.premium_escalated && <button type="button" className="support-escalate" onClick={() => handleEscalate(selectedTicket)} disabled={Boolean(busyId)}><Crown size={15} />{busyId === `escalate:${selectedTicket.id}` ? "Escalating…" : "Escalate with Premium"}<ChevronRight size={14} /></button>}
              </footer> : <footer className="support-closed-note"><CheckCheck size={17} /><span>This ticket is {selectedTicket.status}. Need help with another issue?</span><button type="button" onClick={openComposer}>New ticket<Plus size={14} /></button></footer>}
            </> : <div className="support-detail-empty"><span><MessageSquare size={32} /></span><h2>{loading ? "Loading your requests" : "Your support conversations"}</h2><p>Select a ticket to see its details and reply to staff, or create a request for a new issue.</p><button type="button" className="support-primary" onClick={openComposer} disabled={loading || !user}><Plus size={17} />Create a ticket</button></div>}
          </section>
        </div>
      </div>
    </div>
  );
}
