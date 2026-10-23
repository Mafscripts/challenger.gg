import React, { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, Loader2, Ticket, Trash2, Bookmark, Search, RefreshCw, MessageCircle, ShieldAlert, Gavel, Trophy, Users, Gamepad2, UserCheck, Clock3, ArrowUpRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import AdminTicketDetail, { TicketStatus } from "./AdminTicketDetail";
import { shortTicketId, ticketDate, ticketIssue, ticketReporter, ticketTitle } from "@/lib/adminTickets";
import { deletedSupportCaseIds, removeDeletedSupportCases } from "@/lib/supportDeletion";
import { toast } from "@/components/ui/use-toast";
import "@/styles/admin-tickets.css";
const categoryIcons = { all: Inbox, live: MessageCircle, calls: ShieldAlert, disputes: Gavel, tickets: Ticket, money8s: Users, wagers: Gamepad2, tournament: Trophy };
const caseType = row => row.channel === "live" ? { key: "live", label: "Live chat", Icon: MessageCircle }
  : row.disputes.length || row.channel === "disputes" ? { key: "disputes", label: "Match dispute", Icon: Gavel }
  : row.channel === "calls" ? { key: "calls", label: "Admin requested", Icon: ShieldAlert }
  : { key: "tickets", label: "Support ticket", Icon: Ticket };
const SupportRecords = lazy(() => import("@/components/support/SupportRecords"));

export default function AdminTickets({ user, onRefresh, initialSelectedId = null, embedded = false, onRoomOpen }) {
  const [filter, setFilter] = useState("open");
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [category, setCategory] = useState("all");
  const [view, setView] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(timer); }, [searchInput]);
  const [drafts, setDrafts] = useState({});
  const [checked, setChecked] = useState([]);
  const [selectClosedAfterLoad, setSelectClosedAfterLoad] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const removedCases = useRef(new Set());
  const [deleteProgress, setDeleteProgress] = useState(null);
  const reader = useRef(null);
  const inbox = useRef(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const queryClient = useQueryClient();
  const role = effectiveRoleForUser(user);
  const query = useInfiniteQuery({
    queryKey: ["admin-console", user?.id, role, "ticketQueue", filter, category, view, search],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const response = await base44.functions.invoke("getAdminTickets", { cursor: pageParam, filter, category, view, search });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load tickets.");
      return { ...response.data, rows: response.data.rows.filter(row => !removedCases.current.has(row.id)) };
    },
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(user?.id),
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchInterval: embedded ? 5000 : 7000,
  });
  const summary = useQuery({
    queryKey: ["support-inbox-counts", user?.id],
    queryFn: async () => { const { data } = await base44.functions.invoke("getAdminTicketCounts", {}); if (!data?.success) throw new Error("Could not load counts."); return data; },
    enabled: Boolean(user?.id), refetchInterval: 10000,
  });
  const categories = [["all", "All requests"], ["live", "Live chats"], ["calls", "Admin calls"], ["disputes", "Disputes"], ["tickets", "Tickets"], ["money8s", "8s rooms"], ["wagers", "Wagers"], ["tournament", "Tournaments"]];
  const rows = [...new Map((query.data?.pages || []).flatMap((page) => page.rows).filter(row => !removedCases.current.has(row.id)).map((row) => [row.id, row])).values()];
  const direct = useQuery({
    queryKey: ["admin-console", user?.id, role, "ticketQueue", "selected", selectedId],
    enabled: Boolean(selectedId && !removedCases.current.has(selectedId) && !rows.some(row => row.id === selectedId)),
    queryFn: async () => {
      const colon = selectedId.indexOf(":");
      const { data } = await base44.functions.invoke("getAdminTickets", { record_id: selectedId.slice(colon + 1), kind: selectedId.slice(0, colon), filter: "all" });
      if (!data?.success) throw new Error(data?.error || "Could not open support case.");
      return data.rows.find(row => !removedCases.current.has(row.id)) || null;
    },
    refetchInterval: embedded ? 5000 : 7000,
  });
  useEffect(() => {
    const deletedElsewhere = event => {
      const deleted = deletedSupportCaseIds(event.detail || {});
      deleted.forEach(id => removedCases.current.add(id));
      queryClient.setQueriesData({ queryKey: ["admin-console", user?.id, role, "ticketQueue"] }, current => removeDeletedSupportCases(current, deleted));
      setSelectedId(current => deleted.has(current) ? null : current);
      setChecked(current => current.filter(id => !deleted.has(id)));
      void queryClient.invalidateQueries({ queryKey: ["support-inbox-counts", user?.id] });
    };
    window.addEventListener("topfragg:support-deleted", deletedElsewhere);
    return () => window.removeEventListener("topfragg:support-deleted", deletedElsewhere);
  }, [queryClient, user?.id, role]);
  const selected = rows.find(row => row.id === selectedId) || (selectedId ? removedCases.current.has(selectedId) ? null : direct.data : rows[0]);
  const markRead = async (row) => {
    if (!row?.unread || !row.incoming_token) return;
    try {
      const { data } = await base44.functions.invoke("markSupportCaseRead", { kind: row.kind, id: row.record_id, token: row.incoming_token });
      if (!data?.success) throw new Error(data?.error || "Could not mark conversation as read.");
      const acknowledge = item => item?.id === row.id && item.incoming_token === row.incoming_token ? { ...item, unread: false } : item;
      queryClient.setQueriesData({ queryKey: ["admin-console", user?.id, role, "ticketQueue"] }, current => current?.pages
        ? { ...current, pages: current.pages.map(page => ({ ...page, rows: page.rows.map(acknowledge) })) } : acknowledge(current));
    } catch (error) { setSaveError(error.message); }
  };
  const displayRows = selected && !rows.some(row => row.id === selected.id) ? [selected, ...rows] : rows;
  const canDelete = hasRolePower(role, "admin");
  const deletableRows = displayRows.filter(row => row.closed);
  useEffect(() => { if (reader.current) reader.current.scrollTop = 0; }, [selected?.id]);
  useEffect(() => { setChecked([]); }, [filter, category, view, search]);
  useEffect(() => {
    if (!selectedId || !inbox.current) return;
    const selectedButton = inbox.current.querySelector('[aria-current="true"]');
    if (!selectedButton) return;
    const bounds = selectedButton.getBoundingClientRect(), viewport = inbox.current.getBoundingClientRect();
    if (bounds.top < viewport.top || bounds.bottom > viewport.bottom) inbox.current.scrollTop += bounds.top - viewport.top - 50;
  }, [selectedId, displayRows.length]);
  useEffect(() => {
    if (!selectClosedAfterLoad || filter !== "closed" || !query.isSuccess || query.isFetching) return;
    setChecked(rows.filter(row => row.closed).map(row => row.id));
    setSelectClosedAfterLoad(false);
  }, [selectClosedAfterLoad, filter, query.isSuccess, query.isFetching, query.data]);
  const forgetDeletedCases = async data => {
    const deleted = deletedSupportCaseIds(data);
    deleted.forEach(id => removedCases.current.add(id));
    const key = ["admin-console", user?.id, role, "ticketQueue"];
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueriesData({ queryKey: key }, current => removeDeletedSupportCases(current, deleted));
    setChecked(current => current.filter(id => !deleted.has(id)));
    setSelectedId(current => deleted.has(current) ? null : current);
    window.dispatchEvent(new CustomEvent("topfragg:support-deleted", { detail: data }));
    return deleted;
  };
  const bulkRemove = async () => {
    if (busy) return;
    setBusy(true); setBulkError("");
    const targets = checked.map(id => displayRows.find(row => row.id === id) || {
      id, kind: id.slice(0, id.indexOf(":")), record_id: id.slice(id.indexOf(":") + 1), closed: true,
    });
    const failures = [], deleted = new Set();
    try {
      for (const [index, row] of targets.entries()) {
        setDeleteProgress({ current: index + 1, total: targets.length });
        if (deleted.has(row.id)) continue;
        try {
          if (!row.closed) throw new Error("Close the case before deleting it.");
          const { data } = await base44.functions.invoke("deleteAdminTicket", { id: row.record_id, kind: row.kind });
          if (!data?.success) throw new Error(data?.error || "Could not delete case.");
          const removed = await forgetDeletedCases(data);
          removed.forEach(id => deleted.add(id));
        } catch (error) { failures.push({ id: row.id, message: error.message || "Delete failed." }); }
      }
      setChecked(failures.map(item => item.id));
      if (failures.length) setBulkError(`${deleted.size} cases removed. ${failures.map(item => `${item.id.split(":")[1].slice(-8)}: ${item.message}`).join(" · ")}`);
      else { setBulkConfirm(false); toast({ title: `${deleted.size} cases permanently deleted` }); }
      try { await refreshTickets(); } catch { setSaveError("Cases were deleted, but the overview could not refresh. Refresh the inbox."); }
    } finally { setBusy(false); setDeleteProgress(null); }
  };
  const refreshTickets = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-console", user?.id, role, "ticketQueue"] });
    await queryClient.invalidateQueries({ queryKey: ["support-inbox-counts", user?.id] });
    window.dispatchEvent(new CustomEvent("topfragg:support-updated"));
    await onRefresh?.();
  };
  const remove = async () => {
    setBusy(true);
    setDeleteError("");
    try {
      const response = await base44.functions.invoke("deleteAdminTicket", { id: deleting.record_id, kind: deleting.kind });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not delete ticket.");
      await forgetDeletedCases(response.data);
      setDeleting(null);
      setSelectedId(null);
      toast({ title: "Case permanently deleted" });
      try { await refreshTickets(); } catch { setSaveError("Case deleted. Refresh the overview to update the counts."); }
    } catch (error) {
      setDeleteError(error.message || "Could not delete ticket.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="admin-tickets" data-detail-open={Boolean(selectedId)}>
    <header className="at-heading">
      <div><span className="at-eyebrow">PLAYER SUPPORT</span><h2><Ticket size={20} /> Support inbox</h2><p>One place for every player request.</p></div>
      <div className="at-header-tools"><Suspense fallback={null}><SupportRecords className="at-button" /></Suspense><button className="at-button" onClick={refreshTickets} disabled={query.isFetching} aria-label="Refresh inbox"><RefreshCw size={14} /></button></div>
    </header>
    <nav className="at-categories" aria-label="Support categories">{categories.map(([value, label]) => { const Icon = categoryIcons[value]; return <button key={value} aria-pressed={category === value} data-category={value} onClick={() => { setCategory(value); setSelectedId(null); }}><span className="at-category-label"><Icon size={15} />{label}{rows.some(row => !row.closed && row.unread && (value === "all" || row.channel === value || (value === "disputes" && row.disputes.length > 0) || row.mode === value || (value === "money8s" && ["8s", "eights"].includes(row.mode)) || (value === "wagers" && row.mode === "wager"))) && <i className="at-unread-dot" aria-label="Unread messages in loaded conversations" />}</span><b>{summary.data?.categories?.[value] ?? "—"}</b></button>; })}</nav>
    <div className="at-organize">
      <div className="at-filters" aria-label="Inbox view">{[["all", "Needs attention"], ["waiting", "Unassigned"], ["mine", "Assigned to me"], ["saved", "Saved"]].map(([value, label]) => <button key={value} aria-pressed={view === value} onClick={() => { setView(value); setFilter(value === "saved" ? "all" : "open"); setSelectedId(null); }}>{label}{value !== "all" && <span> {summary.data?.[value] ?? ""}</span>}</button>)}</div>
      <label className="at-search"><Search size={15} /><input aria-label="Search support cases" placeholder="Search name, reference or request…" value={searchInput} onChange={event => { setSearchInput(event.target.value); setSelectedId(null); }} /></label>
      <select aria-label="Case status" value={filter} onChange={event => { setFilter(event.target.value); setSelectedId(null); }}><option value="open">Open</option><option value="closed">Closed</option><option value="all">All statuses</option></select>
    </div>
    <p className="at-queue-hint">Admin calls first · Premium priority · Live chats · Other requests. Category counts show open cases. Conversations are saved automatically.</p>
    {saveError && <p role="alert" className="at-list-error">{saveError}</p>}
    {direct.isError && <p role="alert" className="at-list-error">{direct.error.message}</p>}
    <div className="at-workspace">
      <aside className="at-inbox" aria-label="Ticket list" ref={inbox}>
        <div className="at-list-heading"><strong>{view === "saved" ? "Saved conversations" : categories.find(([value]) => value === category)?.[1]}</strong><span>{rows.length} loaded</span></div>
        {query.isPending && <p role="status" className="at-list-feedback"><Loader2 size={15} className="animate-spin" /> Loading tickets...</p>}
        {!query.isPending && !query.isError && !rows.length && <div className="at-list-empty"><Inbox size={26} /><strong>{filter === "open" ? "No open tickets" : "No tickets here"}</strong><p>{filter === "open" ? "You're up to date. Previous requests are under Closed." : "Tickets will appear here when available."}</p></div>}
        {canDelete && <div className="at-bulk-tools">{filter !== "closed" ? <button className="at-button at-button-open" disabled={busy} onClick={() => { setSelectedId(null); setFilter("closed"); setSelectClosedAfterLoad(true); }}>Select closed cases</button> : <label><input type="checkbox" aria-label="Select all displayed closed cases" checked={deletableRows.length > 0 && deletableRows.every(row => checked.includes(row.id))} disabled={busy || query.isPending} onChange={event => setChecked(event.target.checked ? deletableRows.map(row => row.id) : [])} /> Select displayed cases</label>}<button className="at-button at-button-danger" disabled={!checked.length || busy} onClick={() => { setBulkError(""); setBulkConfirm(true); }}><Trash2 size={12} /> Delete selected{checked.length ? ` (${checked.length})` : ""}</button><small>{filter === "closed" ? `${checked.length} selected · ${deletableRows.length} displayed` : "Opens closed cases and selects the displayed results. Active requests must be closed first."}</small></div>}

        <div className="at-ticket-list">{displayRows.map((row) => { const { key, label, Icon } = caseType(row); const owner = row.ticket || row.disputes[0]; const lastMessage = row.ticket?.messages?.at(-1); return <div key={row.id} className="at-row-shell" data-checked={checked.includes(row.id) || undefined} data-closed={row.closed || undefined} data-selectable={canDelete && row.closed || undefined}>{canDelete && row.closed && <label className="at-row-select"><input type="checkbox" aria-label={`Select case ${shortTicketId(row.record_id)}`} disabled={busy} checked={checked.includes(row.id)} onChange={event => setChecked(current => event.target.checked ? [...new Set([...current, row.id])] : current.filter(id => id !== row.id))} /></label>}<button key={row.id} className="at-ticket-row" data-case-type={key} data-unread={!row.closed && row.unread || undefined}
          aria-current={selected?.id === row.id ? "true" : undefined} onClick={() => { setSelectedId(row.id); void markRead(row); }}>
          <div className="at-row-top"><span className="at-kind"><Icon size={13} /> {label}</span><TicketStatus row={row} /></div>
          <div className="at-player-heading"><span className="at-player-avatar">{ticketReporter(row).slice(0, 1).toUpperCase()}</span><span><strong>{ticketReporter(row)}</strong></span><ChevronRight size={16} /></div>
          {!row.closed && row.unread && <span className="at-unread-badge"><MessageCircle size={11} /> New player message</span>}
          <div className="at-request-context"><Gamepad2 size={13} /><span>{row.mode === "tournament" ? "Tournament · " : ["wager", "wagers"].includes(row.mode) ? "Wager · " : ""}{row.channel === "live" ? "Asking for live support" : ticketTitle(row)}</span></div>
          {!row.closed && <p className="at-request-reason">{row.channel === "calls" && !row.disputes.length ? "Needs an admin in the match room" : ticketIssue(row)}</p>}
          <div className="at-owner-line" data-assigned={Boolean(owner?.assigned_admin_id)}>{owner?.assigned_admin_id ? <UserCheck size={13} /> : <Clock3 size={13} />}<span>{owner?.assigned_admin_id ? row.closed ? "Handled by" : "Assigned to" : row.closed ? "Case closed" : "Waiting for staff"}{owner?.assigned_admin_id && <strong>{owner.assigned_admin_id === user.id ? "You" : owner.assigned_admin_name || "Staff member"}</strong>}</span></div>
          {!row.closed && lastMessage?.content && <div className="at-last-reply"><small>LAST MESSAGE{lastMessage.sender_name ? ` · ${lastMessage.sender_name}` : ""}</small><p>{lastMessage.content}</p></div>}
          <div className="at-row-bottom"><span className="at-case-reference">#{shortTicketId(row.record_id)}</span>{owner?.support_favorite && <Bookmark size={12} className="at-saved-icon" />}<time>{ticketDate(lastMessage?.created_date || row.ticket?.created_date || row.disputes[0]?.created_date)}</time><ArrowUpRight size={13} /></div>
        </button></div>; })}</div>
        {query.isError && <div role="alert" className="at-list-error"><p>{query.error?.message || "Could not load tickets."}</p><button className="at-button" disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
        {query.hasNextPage && <footer className="at-list-footer"><button className="at-button" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />} Load more</button><span>10 tickets at a time</span></footer>}
      </aside>
      <div className="at-reading-pane" ref={reader}>{selected ? <AdminTicketDetail key={selected.id} row={selected} user={user} onRefresh={refreshTickets} onRoomOpen={onRoomOpen} onBack={() => setSelectedId(null)}
        draft={drafts[selected.id] || {}} onDraftChange={(update) => setDrafts((current) => ({ ...current, [selected.id]: { ...current[selected.id], ...update } }))}
        deleteButton={<>{!selected.closed && selected.unread && <button className="at-button at-button-primary" onClick={() => markRead(selected)}>New message · Mark as read</button>}<button className="at-button at-button-save" disabled={busy} aria-pressed={Boolean((selected.ticket || selected.disputes[0])?.support_favorite)} onClick={async () => {
          setBusy(true); setSaveError("");
          try { const { data } = await base44.functions.invoke("saveSupportCase", { kind: selected.kind, id: selected.record_id, saved: !(selected.ticket || selected.disputes[0])?.support_favorite }); if (!data?.success) throw new Error(data?.error || "Could not save conversation."); await refreshTickets(); } catch (error) { setSaveError(error.message); } finally { setBusy(false); }
        }}><Bookmark size={14} />{(selected.ticket || selected.disputes[0])?.support_favorite ? "Unsave" : "Save conversation"}</button>{saveError && <span role="alert">{saveError}</span>}{selected.closed && hasRolePower(role, "admin") ? <button className="at-button at-delete" onClick={() => { setDeleteError(""); setDeleting(selected); }}><Trash2 size={14} /> Delete</button> : null}</>} />
        : <div className="at-no-selection"><Ticket size={30} /><h3>{filter === "open" && !query.isPending ? "No requests waiting" : "Your ticket workspace"}</h3><p>Select a ticket to see the request, conversation and staff actions.</p></div>}
      </div>
    </div>
    <Dialog open={bulkConfirm} onOpenChange={value => { if (!busy) setBulkConfirm(value); }}><DialogContent overlayClassName="support-delete-overlay" className="admin-action-dialog support-delete-dialog max-w-md border-white/10 bg-card"><DialogTitle>Delete {checked.length} closed cases?</DialogTitle><DialogDescription>Selected closed cases and their conversations will be permanently removed for staff and players. This cannot be undone. Match results and XP stay unchanged.</DialogDescription>{bulkError && <p role="alert" className="text-sm text-red-300">{bulkError}</p>}<div className="flex justify-end gap-2"><button className="at-button" disabled={busy} onClick={() => setBulkConfirm(false)}>Keep cases</button><button className="at-button at-button-danger" disabled={busy || !checked.length} onClick={bulkRemove}>{busy ? `Deleting ${deleteProgress?.current || 0} / ${deleteProgress?.total || checked.length}…` : "Delete permanently"}</button></div></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent overlayClassName="support-delete-overlay" className="admin-action-dialog support-delete-dialog max-w-md border-white/10 bg-card">
        <DialogTitle>Delete closed ticket?</DialogTitle>
        <DialogDescription>Ticket #{deleting?.record_id.slice(-8)} and its linked match cases, conversations and evidence references will be permanently removed. Match results and XP stay unchanged.</DialogDescription>
        {deleteError && <p role="alert" className="text-sm text-red-300">{deleteError}</p>}
        <div className="mt-3 flex justify-end gap-2"><button disabled={busy} onClick={() => setDeleting(null)}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-vapor">Keep ticket</button>
          <button disabled={busy} onClick={remove} className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2 text-xs font-bold text-red-300 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete permanently</button></div>
      </DialogContent>
    </Dialog>
  </section>;
}
