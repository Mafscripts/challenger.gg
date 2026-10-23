import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, FileCheck2, FileText, Gavel, Loader2, LockKeyhole, MessageSquare, Send, ShieldAlert, UserCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { isStaffSupportMessage } from "@/lib/liveSupport";
import { supportMatchMaps, supportModeLabel } from "@/lib/supportMatchDetails";
import { disputeReasonLabel } from "@/lib/matchDisputes";
import { closedTicket, isMatchTicket, shortTicketId, ticketDate, ticketDescription, ticketIssue, ticketReporter, ticketRoomPath, ticketState, ticketTitle } from "@/lib/adminTickets";

export function TicketStatus({ row }) {
  const status = ticketState(row);
  return <span className="at-status" data-tone={status.tone}><span />{status.label}</span>;
}
const linksFrom = (row) => [...new Set([
  ...(row.ticket?.submitted_proof || []), ...(row.ticket?.proof_urls || []), ...(row.ticket?.evidence_urls || []), ...(row.ticket?.additional_proof || []),
  ...row.disputes.flatMap((record) => [record.submitted_evidence, record.evidence_urls, record.screenshots, record.videos, record.additional_evidence_urls].flatMap((urls) => Array.isArray(urls) ? urls : [])),
])].filter((url) => { try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; } });

export default function AdminTicketDetail({ row, user, onRefresh, onBack, deleteButton, draft, onDraftChange, onRoomOpen }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("conversation");
  const chatViewport = useRef(null);
  const followChat = useRef(true);
  const { reply = "", note = "", reason = "" } = draft;
  const setReply = (reply) => onDraftChange({ reply });
  const setNote = (note) => onDraftChange({ note });
  const setReason = (reason) => onDraftChange({ reason });
  const roomDraft = draft.roomReply || "";
  const setRoomDraft = value => onDraftChange({ roomReply: value });
  const roomPending = React.useRef(null);
  const [decision, setDecision] = useState("close");
  const [caseId, setCaseId] = useState("");
  const [target, setTarget] = useState("");
  const [duration, setDuration] = useState("24h");
  const [confirmBan, setConfirmBan] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ticket = row.ticket;
  const openCases = row.disputes.filter((record) => !closedTicket(record));
  const activeCase = openCases.find((record) => record.id === caseId) || openCases[0];
  const owner = ticket || row.disputes[0];
  const handledByOther = !row.closed && owner?.assigned_admin_id && owner.assigned_admin_id !== user.id;
  const canTakeOver = hasRolePower(effectiveRoleForUser(user), "admin");
  const canReply = ticket && !closedTicket(ticket) && !handledByOther;
  const proof = linksFrom(row);
  const path = ticketRoomPath(row);
  const matchQuery = useQuery({
    queryKey: ["support-case-match", user.id, row.kind, row.record_id], enabled: tab === "match",
    queryFn: async () => { const { data } = await base44.functions.invoke("getSupportCaseMatch", { kind: row.kind, id: row.record_id }); if (!data?.success) throw new Error(data?.error || "Could not load match details."); return data; },
    refetchInterval: tab === "match" ? 10000 : false,
  });
  const match = matchQuery.data?.match || ticket?.match_details || row.disputes[0]?.wager_details || {};
  const mapRows = supportMatchMaps(match);
  const roster = matchQuery.data?.roster || activeCase?.match_roster || ticket?.match_roster || row.disputes[0]?.match_roster || [];
  const chatQuery = useQuery({
    queryKey: ["support-case-chat", user.id, row.kind, row.record_id],
    enabled: tab === "chat",
    queryFn: async () => {
      const { data } = await base44.functions.invoke("getSupportCaseChat", { kind: row.kind, id: row.record_id });
      if (!data?.success) throw new Error(data?.error || "Could not load match chat.");
      return data;
    },
    refetchInterval: tab === "chat" ? 5000 : false,
    refetchOnWindowFocus: true,
  });
  const savedChat = [...(ticket?.chat_logs || []), ...row.disputes.flatMap(record => record.chat_logs || [])];
  const chat = [...new Map([...savedChat, ...(chatQuery.data?.messages || [])].filter(message => !message.internal).map(message => [message.id || `${message.created_date}:${message.sender_id}:${message.content || message.message}`, message])).values()]
    .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  const history = row.disputes[0]?.match_history || ticket?.match_history || [];
  const report = matchQuery.data?.source === "current" ? match : ticket?.result_report || match;
  const scoreA = report.confirmed_score_alpha ?? report.team_a_score ?? report.reported_score_alpha ?? report.host_reported_score_alpha ?? report.score?.alpha;
  const scoreB = report.confirmed_score_bravo ?? report.team_b_score ?? report.reported_score_bravo ?? report.host_reported_score_bravo ?? report.score?.bravo;
  const teamA = match.alpha_team?.name || match.team_a_name || match.host_name || ticket?.team_a_name || "Team Alpha";
  const teamB = match.bravo_team?.name || match.team_b_name || match.challenger_name || ticket?.team_b_name || "Team Bravo";
  const messages = (ticket?.messages || []).filter((message) => !message.internal);
  const originalInMessages = messages.some(message => !isStaffSupportMessage(message) && message.content?.trim() === ticketDescription(row).trim());
  useEffect(() => {
    if (tab === "conversation" && followChat.current && chatViewport.current) chatViewport.current.scrollTop = chatViewport.current.scrollHeight;
  }, [tab, messages.length]);
  const notes = [...(ticket?.internal_notes || []), ...(ticket?.support_record_notes || []).map(note => ({ ...note, sender_name: note.author_name }))];
  const submissions = row.disputes.flatMap((record) => record.submissions?.length ? record.submissions : [record])
    .filter((submission) => submission.description && submission.description !== ticketDescription(row));
  const invoke = async (name, payload, label) => {
    if (busy) return false;
    setBusy(name); setError(""); setNotice("");
    try {
      const response = await base44.functions.invoke(name, payload);
      if (!response.data?.success) throw new Error(response.data?.error || "Could not update ticket.");
      setNotice(label);
      toast({ title: label });
      try { await onRefresh(); } catch { setError("Action completed. Refresh the inbox to update its status."); }
      return true;
    } catch (failure) { setError(failure.message || "Could not update ticket."); return false; }
    finally { setBusy(""); }
  };
  const claim = async (takeOver = false) => ticket
    ? invoke("joinTicket", { ticket_id: ticket.id, take_over: takeOver }, "Assigned to you.")
    : invoke("claimSupportDispute", { dispute_id: row.disputes[0].id, take_over: takeOver }, "Assigned to you.");
  const openRoom = async () => {
    if (busy || !path) return;
    if (handledByOther) { onRoomOpen?.(); navigate(`${path}${path.includes("?") ? "&" : "?"}support_view=1`); return; }
    if (!row.closed && (!ticket || !closedTicket(ticket)) && owner?.assigned_admin_id !== user.id && !await claim()) return;
    onRoomOpen?.();
    navigate(row.closed ? path : `${path}${path.includes("?") ? "&" : "?"}admin=1`);
  };
  const send = async (internal) => {
    const content = (internal ? note : reply).trim();
    if (!content) return;
    if (!internal) followChat.current = true;
    if (await invoke("replyTicket", { ticket_id: ticket.id, message: content, internal }, internal ? "Staff note saved." : "Reply sent to the players.")) {
      if (internal) setNote(""); else setReply("");
    }
  };
  const sendRoomReply = async () => {
    if (busy || !roomDraft.trim()) return;
    if (!roomPending.current || roomPending.current.content !== roomDraft.trim()) roomPending.current = { content: roomDraft.trim(), client_message_id: crypto.randomUUID() };
    if (await invoke("sendSupportCaseMatchMessage", { kind: row.kind, id: row.record_id, ...roomPending.current }, "Message sent to the match room.")) {
      setRoomDraft(""); roomPending.current = null; await chatQuery.refetch();
    }
  };
  const decide = async () => {
    if (!reason.trim()) { setError("Explain your decision before closing the ticket."); return; }
    let saved = false;
    if (activeCase) {
      saved = await invoke("moderateDispute", { dispute_id: activeCase.id, action: decision === "close" ? "resolve_dispute" : decision, notes: reason.trim() }, "Decision saved.");
    } else if (ticket) {
      saved = await invoke("resolveTicket", { ticket_id: ticket.id, ...(decision !== "close" ? { action: decision } : {}), resolution: reason.trim() }, "Ticket closed.");
    }
    if (saved) { setDecision("close"); setReason(""); setConfirmBan(false); setTarget(""); }
  };
  const tabs = [
    ["conversation", "Conversation", MessageSquare], ["evidence", `Evidence${proof.length ? ` (${proof.length})` : ""}`, FileText],
    ...(isMatchTicket(row) ? [["chat", "Match chat", MessageSquare], ["match", "Match details", ExternalLink]] : []),
    ...(ticket ? [["notes", "Staff notes", LockKeyhole]] : []), ["decision", row.closed ? "Resolution" : "Decision", Gavel],
  ];
  return <article className="at-detail">
    <header className="at-detail-heading">
      <div className="at-detail-topline"><button className="at-back" onClick={onBack}><ArrowLeft size={15} /> Tickets</button>
        <span className="at-reference">TICKET #{shortTicketId(row.record_id)}</span><TicketStatus row={row} /></div>
      <h3>{ticketTitle(row)}</h3>
      <p className="at-detail-meta">Opened by <strong>{ticketReporter(row)}</strong><span>&middot;</span>{ticketDate(ticket?.created_date || row.disputes[0]?.created_date)}</p>
      <div className="at-detail-tools">
        {!row.closed && owner?.assigned_admin_id !== user.id && !handledByOther && <button className="at-button at-button-primary" disabled={!!busy} onClick={() => claim()}><UserCheck size={14} />Take case</button>}
        {owner?.assigned_admin_name && <span className="at-assigned"><UserCheck size={14} />{owner.assigned_admin_id === user.id ? "You are helping" : `Being helped by ${owner.assigned_admin_name}`}</span>}
        {handledByOther && canTakeOver && <button className="at-button" disabled={!!busy} onClick={() => claim(true)}>Take over from {owner.assigned_admin_name || "staff"}</button>}
        {path && <button disabled={!!busy} onClick={openRoom} className="at-button at-button-open"><ExternalLink size={14} /> {handledByOther ? "View match room" : "Open match room"}</button>}
        {isMatchTicket(row) && !path && <span className="at-help">No match room is linked to this case.</span>}
        {ticket?.request_type === "live_support" && canReply && <button className="at-button at-button-close" disabled={!!busy} onClick={() => invoke("resolveTicket", { ticket_id: ticket.id, resolution: "Live support conversation completed." }, "Conversation ended.")}><Check size={14} /> End conversation</button>}
        {row.closed && ticket && <button className="at-button at-button-open" disabled={!!busy} onClick={() => invoke("reopenTicket", { ticket_id: ticket.id }, "Ticket reopened.")}>Reopen ticket</button>}
        {deleteButton}
      </div>
    </header>
    <nav className="at-tabs" aria-label="Ticket sections">{tabs.map(([value, label, Icon]) => <button key={value} aria-current={tab === value ? "page" : undefined}
      onClick={() => { setTab(value); setError(""); setNotice(""); }}><Icon size={14} />{label}</button>)}</nav>
    <div className="at-detail-body">
      {tab === "conversation" && <>
        <div className="at-section-heading"><h4>Conversation</h4><span>{ticketIssue(row)}</span></div>
        <div className="at-conversation-box">
        <div className="at-thread" ref={chatViewport} role="log" aria-label="Support conversation" tabIndex={0} onScroll={event => { const box = event.currentTarget; followChat.current = box.scrollHeight - box.scrollTop - box.clientHeight < 64; }}>
          {!originalInMessages && <div className="at-message at-original"><div className="at-message-heading"><strong>{ticketReporter(row)}</strong><span>Original request</span></div><p>{ticketDescription(row)}</p></div>}
          {(ticket?.reported_against_name || row.disputes[0]?.reported_against_name) && <p className="at-help">Reported player: <strong>{ticket?.reported_against_name || row.disputes[0]?.reported_against_name}</strong></p>}
          {submissions.map((submission, index) => <div className="at-message" key={`submission:${index}`}>
            <div className="at-message-heading"><strong>{submission.reported_by_name || "Player"}</strong><span>{disputeReasonLabel(submission.reason)}</span></div><p>{submission.description}</p>{submission.reported_against_name && <small>Reported player: {submission.reported_against_name}</small>}</div>)}
          {messages.map((message, index) => <div key={message.id || index} className="at-message" data-staff={isStaffSupportMessage(message) || undefined}><div className="at-message-heading"><strong className={isStaffSupportMessage(message) ? "support-staff-name" : undefined}>{message.sender_name || "Player"}{isStaffSupportMessage(message) ? " · Support" : ""}</strong><time>{ticketDate(message.created_date)}</time></div><p>{message.content}</p></div>)}
        </div>
        {canReply ? <div className="at-composer"><label htmlFor="at-reply">Reply to the players</label>
          <textarea id="at-reply" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply…" rows={2} disabled={!!busy} />
          <div><span>This reply is visible to the ticket participants.</span><button className="at-button at-button-primary" disabled={!!busy || !reply.trim()} onClick={() => send(false)}><Send size={14} /> Send reply</button></div>
        </div> : <p className="at-help">{ticket ? handledByOther ? `${owner.assigned_admin_name || "Another staff member"} is already helping. Replies are reserved for the assigned staff member.` : "This conversation is closed. Reopen the ticket to reply." : "This older match ticket has no player conversation. Review the match and record your decision."}</p>}
        </div>
        {!row.closed && <button className="at-next" onClick={() => setTab(proof.length ? "evidence" : "decision")}>Next: {proof.length ? "review evidence" : "record a decision"} <ExternalLink size={13} /></button>}
      </>}
      {tab === "evidence" && <>
        <div className="at-section-heading"><h4>Evidence from players</h4><span>{proof.length} {proof.length === 1 ? "attachment" : "attachments"}</span></div>
        {proof.length ? <div className="at-proof-list">{proof.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer"><FileText size={18} /><span><strong>Evidence {index + 1}</strong><small>{url}</small></span><ExternalLink size={14} /></a>)}</div>
          : <div className="at-empty-section"><FileText size={24} /><h4>No evidence attached</h4><p>Ask the player for a clip, screenshot or link in the conversation.</p></div>}
        {row.disputes.map((record) => <div key={record.id} className="at-evidence-review">{record.proof_reviewed_date ? <p className="at-help"><FileCheck2 size={14} /> Reviewed by {record.proof_reviewed_by_name || "Staff"} on {ticketDate(record.proof_reviewed_date)}</p>
          : !closedTicket(record) && <button className="at-button" disabled={!!busy || !proof.length} onClick={() => invoke("moderateDispute", { dispute_id: record.id, action: "review_proof", notes: "Evidence reviewed by staff." }, "Evidence marked as reviewed.")}><FileCheck2 size={14} /> Mark evidence reviewed</button>}</div>)}
      </>}
      {tab === "chat" && <><div className="at-section-heading"><h4>Match chat logs</h4><span>{chat.length} messages · Latest 100 room messages</span></div><p className="at-help">Player messages from the linked match room. New messages refresh automatically.</p>{chatQuery.isPending && <p role="status" className="at-help">Loading match chat…</p>}{chatQuery.isError && <div role="alert" className="at-list-error"><p>{chatQuery.error.message}</p><button className="at-button" onClick={() => chatQuery.refetch()} disabled={chatQuery.isFetching}>Retry</button></div>}<div className="at-thread">{chat.map((message, index) => <article key={message.id || index} className="at-message"><div className="at-message-heading"><strong className={message.sender_staff || ["admin", "ceo", "super_admin", "moderator", "developer"].includes(message.sender_role) ? "support-staff-name" : undefined}>{message.sender_name || "Player"}</strong><time>{ticketDate(message.created_date)}</time></div><p>{message.content || message.message}</p></article>)}</div>{!chat.length && !chatQuery.isPending && !chatQuery.isError && <div className="at-empty-section"><MessageSquare size={24} /><h4>No match messages yet</h4><p>No messages have been saved for this match room.</p></div>}<div className="at-composer"><label htmlFor="at-room-reply">Reply directly to the match room</label><textarea id="at-room-reply" value={roomDraft} maxLength={500} rows={3} disabled={!!busy} onChange={event => setRoomDraft(event.target.value)} placeholder="Message all players in the match…" /><div><span>Visible to match players. Sending does not join or take over this case.</span><button className="at-button at-button-primary" disabled={!!busy || !roomDraft.trim()} onClick={sendRoomReply}><Send size={14} /> Send to match chat</button></div></div></>}
      {tab === "match" && <>
        <div className="at-section-heading"><h4>Match information</h4><span>{matchQuery.isFetching ? "Refreshing…" : matchQuery.data?.source === "current" ? "Current match data" : "Saved match snapshot"}</span></div>
        {matchQuery.isError && <div className="at-list-error" role="alert"><p>{matchQuery.error.message}</p><button className="at-button" onClick={() => matchQuery.refetch()}>Retry</button></div>}
        <div className="at-match-summary"><strong>{teamA}</strong><span>{scoreA !== undefined && scoreB !== undefined ? `${scoreA} : ${scoreB}` : "vs"}</span><strong>{teamB}</strong></div>
        <dl className="at-facts">{[
          ["Status", match.status?.replaceAll("_", " ")], ["Game", match.game_name || match.game_id], ["Game mode", supportModeLabel(match.game_mode_display || match.game_mode)], ["Format", match.team_size],
          ["Series", match.best_of ? `Best of ${match.best_of}` : null], ["Match reference", ticket?.match_id || row.disputes[0]?.match_id || row.disputes[0]?.wager_id],
          ["Tournament", ticket?.tournament_name], ["Reported winner", report.winner_name],
          ["Entry", ticket?.wager_amount !== undefined ? `$${Number(ticket.wager_amount).toFixed(2)}` : null],
          ["Map veto", match.map_veto ? Object.keys(match.map_veto.bans || {}).length < 2 ? "Waiting for captain bans" : "Both teams have vetoed" : null],
        ].filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <section className="at-subsection"><h4>Maps &amp; series order</h4>{mapRows.length ? <div className="at-map-cards">{mapRows.map((map, index) => <div key={`${index}:${map.name}`} className="at-map-card" data-vetoed={map.vetoed || undefined}><span className="at-map-number">{map.vetoed ? "Vetoed" : `Map ${mapRows.slice(0, index + 1).filter(row => !row.vetoed).length}`}{map.selected && !map.vetoed ? " · Selected" : ""}</span><strong>{map.name}</strong><span>{map.mode}</span>{map.vetoBy && <small>Removed by {map.vetoBy}</small>}{map.scoreA !== undefined && map.scoreB !== undefined && <b>{map.scoreA} : {map.scoreB}</b>}</div>)}</div> : <p className="at-help">Maps have not been selected yet. They will appear here once the series is set.</p>}</section>
        {!!roster.length && <section className="at-subsection"><h4>Players &amp; Activision IDs</h4><div className="at-roster">{roster.map((player) => <div key={player.user_id}><span><strong>{player.user_name || "Player"}</strong><small>{player.activision_id || "Activision ID not set"}</small></span><small>{["host", "alpha", "team_a"].includes(player.team) ? teamA : teamB}</small></div>)}</div></section>}
        <button className="at-button" onClick={() => setTab("chat")}><MessageSquare size={14} /> View match chat logs</button>
        {!!history.length && <details className="at-disclosure"><summary>Match history</summary><div className="at-log">{history.map((entry, index) => <p key={entry.id || index}>{entry.summary || entry.result || entry.status || "Match record"}</p>)}</div></details>}
      </>}
      {tab === "notes" && <>
        <div className="at-section-heading"><h4>Internal staff notes</h4><span><LockKeyhole size={12} /> Only visible to staff</span></div>
        {notes.length ? <div className="at-thread">{notes.map((entry, index) => <div className="at-message" key={entry.id || index}><div className="at-message-heading"><strong>{entry.sender_name || "Staff"}</strong><time>{ticketDate(entry.created_date)}</time></div><p>{entry.content}</p></div>)}</div> : <p className="at-help">Use this space to leave context for other staff members.</p>}
        {canReply && <div className="at-composer"><label htmlFor="at-note">Add a private note</label><textarea id="at-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="What should other staff know?" />
          <div><span>Players cannot see staff notes.</span><button className="at-button at-button-save" disabled={!!busy || !note.trim()} onClick={() => send(true)}><LockKeyhole size={14} /> Save note</button></div></div>}
      </>}
      {tab === "decision" && handledByOther && <p className="at-help">{owner.assigned_admin_name || "Another staff member"} is already handling this case. Takeover is required before recording a decision.</p>}
      {tab === "decision" && !handledByOther && <>
        <div className="at-section-heading"><h4>{row.closed ? "How this ticket was resolved" : "Record a decision"}</h4></div>
        {row.closed || !openCases.length && closedTicket(ticket) ? <div className="at-resolution"><Check size={20} /><div><strong>Closed by {ticket?.resolved_by_name || row.disputes[0]?.resolved_by_name || "Staff"}</strong><p>{ticket?.resolution || row.disputes[0]?.resolution || "This ticket has been closed."}</p><small>{ticketDate(ticket?.resolved_date || row.disputes[0]?.resolved_date)}</small></div></div> : <div className="at-decision-form">
          <p className="at-help">Review the conversation and evidence first. Explain the outcome so players and other staff understand the decision.</p>
          {openCases.length > 1 && <label>Match report<select value={activeCase?.id || ""} onChange={(event) => { setCaseId(event.target.value); setDecision("close"); setTarget(""); setConfirmBan(false); }}>{openCases.map((record) => <option key={record.id} value={record.id}>{disputeReasonLabel(record.reason)} - {record.reported_by_name || shortTicketId(record.id)}</option>)}</select></label>}
          <label>Outcome<select value={decision} onChange={(event) => setDecision(event.target.value)}>
            <option value="close">{activeCase ? "Resolve report / resume match" : "Close ticket"}</option>
            {(activeCase || ticket?.match_id && !row.disputes.length) && <><option value="approve_team_a">Award win to {teamA}</option><option value="approve_team_b">Award win to {teamB}</option><option value="force_replay">Order a replay</option></>}
            {(ticket?.match_type || row.disputes[0]?.match_type) === "xp" && <option value="cancel_match">Cancel match · no XP awarded</option>}
            {activeCase && <option value="reject_dispute">Reject the report</option>}
          </select></label>
          <label>Decision reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Explain what you reviewed and why this is the outcome..." /></label>
          <p className="at-help">{decision === "cancel_match" ? "The XP match will be cancelled without awarding a win or XP. The linked report and ticket will be resolved." : ["approve_team_a", "approve_team_b"].includes(decision) ? "Awarding a win updates the match result and the rewards for this mode." : decision === "force_replay" ? "The match will be reopened for a replay." : activeCase && decision === "close" ? "The report will be resolved and an interrupted match can continue." : "The resolution will be saved on this ticket."}</p>
          <button className={`at-button ${decision === "cancel_match" ? "at-button-danger" : "at-button-primary"}`} disabled={!!busy || !reason.trim()} onClick={decide}><Check size={14} /> {decision === "cancel_match" ? "Cancel XP match" : "Save decision"}</button>
          {activeCase && !!roster.length && <details className="at-disclosure at-moderation"><summary><ShieldAlert size={14} /> Player moderation</summary><p className="at-help">A player ban is separate from the match decision. Review the evidence before applying it.</p>
            <label>Player<select value={target} onChange={(event) => { setTarget(event.target.value); setConfirmBan(false); }}><option value="">Choose a player</option>{roster.map((player) => <option key={player.user_id} value={player.user_id}>{player.user_name}</option>)}</select></label>
            <label>Ban duration<select value={duration} onChange={(event) => { setDuration(event.target.value); setConfirmBan(false); }}>{[["24h", "24 hours"], ["3d", "3 days"], ["7d", "7 days"], ["14d", "14 days"], ["30d", "30 days"], ["permanent", "Permanent"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="at-checkbox"><input type="checkbox" checked={confirmBan} onChange={(event) => setConfirmBan(event.target.checked)} /> I reviewed the evidence and confirm this ban.</label>
            <button className="at-button at-button-danger" disabled={!!busy || !target || !confirmBan || !reason.trim()} onClick={() => invoke("moderateDispute", { dispute_id: activeCase.id, action: "ban_player", user_id: target, duration, notes: reason.trim() }, "Player ban recorded. Record the match decision separately.")}><ShieldAlert size={14} /> Apply player ban</button>
          </details>}
        </div>}
        {row.disputes.filter(closedTicket).map((record) => <details className="at-disclosure" key={record.id}><summary>Previous decision: {disputeReasonLabel(record.reason)}</summary><p>{record.resolution || record.decision}</p><small>{record.resolved_by_name} {ticketDate(record.resolved_date)}</small></details>)}
        {row.disputes.some((record) => record.review_actions?.length) && <details className="at-disclosure"><summary>Staff review history</summary><div className="at-log">{row.disputes.flatMap((record) => record.review_actions || []).map((entry, index) => <p key={entry.id || index}><strong>{entry.admin_name || "Staff"}:</strong> {String(entry.action || "Review").replaceAll("_", " ")} - {entry.notes}</p>)}</div></details>}
      </>}
      {busy && <p role="status" className="at-feedback"><Loader2 size={14} className="animate-spin" /> Saving...</p>}
      {error && <p role="alert" className="at-feedback" data-tone="error">{error}</p>}
      {notice && <p role="status" className="at-feedback" data-tone="success">{notice}</p>}
    </div>
  </article>;
}
