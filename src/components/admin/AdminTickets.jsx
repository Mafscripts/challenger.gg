import React, { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Inbox, Loader2, Ticket, Trash2, Bookmark, Search, RefreshCw, MessageCircle, ShieldAlert, Gavel, Trophy, Users, Gamepad2, UserCheck, Clock3, ArrowUpRight, CheckCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import AdminTicketDetail, { TicketStatus } from "./AdminTicketDetail";
import { shortTicketId, ticketDate, ticketIssue, ticketReporter, ticketTitle } from "@/lib/adminTickets";
import { deletedSupportCaseIds, removeDeletedSupportCases, supportCleanupFailureSummary } from "@/lib/supportDeletion";
import { canManageSupportCleanup } from "@/lib/liveSupport";
import { toast } from "@/components/ui/use-toast";
import { notifyAdminChanged } from "@/lib/adminWorkspace";
import { readSupportWorkspace, supportWorkspaceFromUrl, supportWorkspaceKey, supportWorkspaceSearch, validSupportCaseId, writeSupportWorkspace } from "@/lib/supportWorkspace";
import "@/styles/admin-tickets.css";
import "@/styles/support-workspace.css";
const categoryIcons = { all: Inbox, live: MessageCircle, calls: ShieldAlert, disputes: Gavel, tickets: Ticket, money8s: Users, wagers: Gamepad2, tournament: Trophy };
const caseType = row => row.channel === "live" ? { key: "live", label: "Live chat", Icon: MessageCircle }
  : row.disputes.length || row.channel === "disputes" ? { key: "disputes", label: "Match dispute", Icon: Gavel }
  : row.channel === "calls" ? { key: "calls", label: "Admin requested", Icon: ShieldAlert }
  : { key: "tickets", label: "Support ticket", Icon: Ticket };
const SupportRecords = lazy(() => import("@/components/support/SupportRecords"));

export default function AdminTickets({ user, onRefresh, initialSelectedId = null, embedded = false, onRoomOpen }) {
  const scope = supportWorkspaceKey(user?.id, effectiveRoleForUser(user));
  return <SupportTicketWorkspace key={scope} {...{ user, onRefresh, initialSelectedId, embedded, onRoomOpen, scope }} />;
}

function SupportTicketWorkspace({ user, onRefresh, initialSelectedId, embedded, onRoomOpen, scope }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [initial] = useState(() => {
    const saved = readSupportWorkspace(scope);
    const state = embedded ? saved : supportWorkspaceFromUrl(location.search, saved);
    return validSupportCaseId(initialSelectedId) ? { ...state, selectedId: initialSelectedId } : state;
  });
  const [filter, setFilter] = useState(initial.filter);
  const [selectedId, setSelectedId] = useState(initial.selectedId);
  const [category, setCategory] = useState(initial.category);
  const [view, setView] = useState(initial.view);
  const [searchInput, setSearchInput] = useState(initial.search);
  const [search, setSearch] = useState(initial.search);
  const [saveError, setSaveError] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(timer); }, [searchInput]);
  const [drafts, setDrafts] = useState(initial.drafts);
  const [checked, setChecked] = useState([]);
  const [bulkAction, setBulkAction] = useState("delete");
  const [cleanupReason, setCleanupReason] = useState("New season support cleanup");
  const [selectingAll, setSelectingAll] = useState(false);
  const selectionRows = useRef(new Map());
  const selectionRun = useRef(0);
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
  const scroll = useRef(initial.scroll);
  const pendingInboxScroll = useRef(initial.scroll.inbox);
  const restoreScroll = useRef(true);
  const restoringSelection = useRef(true);
  const revealSelection = useRef(false);
  const stateSnapshot = useRef(null);
  stateSnapshot.current = { filter, selectedId, category, view, search: searchInput, drafts, scroll: scroll.current };
  const lastUrl = useRef(location.search);
  useEffect(() => {
    if (embedded || lastUrl.current === location.search) return;
    lastUrl.current = location.search;
    const next = supportWorkspaceFromUrl(location.search, stateSnapshot.current);
    setFilter(next.filter); setCategory(next.category); setView(next.view); setSearchInput(next.search); setSearch(next.search); setSelectedId(next.selectedId);
  }, [location.search, embedded]);
  useEffect(() => {
    const timer = setTimeout(() => writeSupportWorkspace(scope, stateSnapshot.current), 180);
    return () => clearTimeout(timer);
  }, [scope, filter, selectedId, category, view, searchInput, drafts]);
  useEffect(() => {
    if (embedded) return;
    // URL changes stay in the current history entry, so opening a case does not
    // turn the browser Back button into a long list of inbox filter changes.
    const nextSearch = supportWorkspaceSearch(location.search, { filter, selectedId, category, view, search });
    if (`?${nextSearch}` !== location.search) {
      lastUrl.current = `?${nextSearch}`;
      navigate({ pathname: location.pathname, search: nextSearch, hash: location.hash }, { replace: true });
    }
  }, [filter, selectedId, category, view, search, embedded, navigate, location.pathname, location.hash]);
  useEffect(() => {
    const save = () => writeSupportWorkspace(scope, { ...stateSnapshot.current, scroll: {
      inbox: inbox.current?.scrollTop ?? scroll.current.inbox, reader: reader.current?.scrollTop ?? scroll.current.reader,
    } });
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, [scope]);
  const openCategory = value => {
    setCategory(value); setFilter("open"); setView("all");
    setSearchInput(""); setSearch(""); setSelectedId(null); setChecked([]);
     setSaveError("");
    if (inbox.current) inbox.current.scrollTop = 0;
  };
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
    queryKey: ["support-inbox-counts", user?.id, category],
    queryFn: async () => { const { data } = await base44.functions.invoke("getAdminTicketCounts", { category }); if (!data?.success) throw new Error("Could not load counts."); return data; },
    enabled: Boolean(user?.id), staleTime: 5000, refetchInterval: 10000,
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
      if ([...deleted].every(id => removedCases.current.has(id))) return;
      deleted.forEach(id => removedCases.current.add(id));
      queryClient.setQueriesData({ queryKey: ["admin-console", user?.id, role, "ticketQueue"] }, current => removeDeletedSupportCases(current, deleted));
      setSelectedId(current => deleted.has(current) ? null : current);
      setChecked(current => current.filter(id => !deleted.has(id)));
      setDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => !deleted.has(id))));
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
      void queryClient.invalidateQueries({ queryKey: ["support-inbox-counts", user?.id] });
    } catch (error) { setSaveError(error.message); }
  };
  const displayRows = selected && !rows.some(row => row.id === selected.id) ? [selected, ...rows] : rows;
  const canDelete = canManageSupportCleanup(user);
  const canBulkClose = canDelete || hasRolePower(role, "admin");
  useEffect(() => {
    if (!reader.current || !selected) return;
    reader.current.scrollTop = restoringSelection.current ? scroll.current.reader : 0;
    restoringSelection.current = false;
  }, [selected?.id]);
  useEffect(() => {
    setChecked([]); selectionRun.current++;
    if (restoreScroll.current) return;
    if (inbox.current) inbox.current.scrollTop = 0;
  }, [filter, category, view, search]);
  useEffect(() => {
    if (!restoreScroll.current || query.isPending || !inbox.current) return;
    inbox.current.scrollTop = pendingInboxScroll.current;
    // Rehydrate only enough previously loaded pages to recover the saved place.
    // The first page remains usable while the remaining pages arrive.
    if (pendingInboxScroll.current > inbox.current.scrollHeight - inbox.current.clientHeight + 2
      && query.hasNextPage && (query.data?.pages.length || 0) < 20) {
      if (!query.isFetching) void query.fetchNextPage();
      return;
    }
    restoreScroll.current = false;
  }, [query.isPending, query.hasNextPage, query.isFetching, query.data?.pages.length, rows.length]);
  useEffect(() => {
    if (!selectedId || !inbox.current || restoreScroll.current || !revealSelection.current) return;
    revealSelection.current = false;
    const selectedButton = inbox.current.querySelector('[aria-current="true"]');
    if (!selectedButton) return;
    const bounds = selectedButton.getBoundingClientRect(), viewport = inbox.current.getBoundingClientRect();
    if (bounds.top < viewport.top || bounds.bottom > viewport.bottom) inbox.current.scrollTop += bounds.top - viewport.top - 50;
  }, [selectedId, displayRows.length]);
  const forgetDeletedCases = async data => {
    const deleted = deletedSupportCaseIds(data);
    deleted.forEach(id => removedCases.current.add(id));
    const key = ["admin-console", user?.id, role, "ticketQueue"];
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueriesData({ queryKey: key }, current => removeDeletedSupportCases(current, deleted));
    setChecked(current => current.filter(id => !deleted.has(id)));
    setSelectedId(current => deleted.has(current) ? null : current);
    setDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => !deleted.has(id))));
    window.dispatchEvent(new CustomEvent("topfragg:support-deleted", { detail: data }));
    return deleted;
  };
  const selectAllMatching = async () => {
    const run = ++selectionRun.current;
    setSelectingAll(true); setSaveError("");
    const found = new Map(), cursors = new Set(); let cursor = null;
    try {
      do {
        const { data } = await base44.functions.invoke("getAdminTickets", { category, filter, view, search, cursor, selection_only: true });
        if (run !== selectionRun.current) return;
        if (!data?.success) throw new Error(data?.error || "Could not select cases.");
        data.rows.forEach(row => found.set(row.id, row));
        cursor = data.next_cursor;
        if (cursor && cursors.has(cursor)) throw new Error("Selection could not advance to the next page. Refresh the inbox and retry.");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      selectionRows.current = found; setChecked([...found.keys()]);
    } catch (error) { setSaveError(error.message); }
    finally { setSelectingAll(false); }
  };
  const confirmDeleteSelection = () => {
    setBulkAction("delete");
    setBulkError(""); setBulkConfirm(true);
  };
  const bulkRemove = async () => {
    if (busy || selectingAll) return;
    setBusy(true); setBulkError("");
    const targets = checked.map(id => selectionRows.current.get(id) || displayRows.find(row => row.id === id)).filter(Boolean);
    const failures = [], processed = new Set(), deleted = new Set();
    try {
      for (const [index, row] of targets.entries()) {
        setDeleteProgress({ current: index + 1, total: targets.length });
        if (processed.has(row.id)) continue;
        try {
          if (bulkAction === "close") {
            const { data } = await base44.functions.invoke("closeSupportCaseForCleanup", { id: row.record_id, kind: row.kind, reason: cleanupReason.trim() });
            if (!data?.success) throw new Error(data?.error || "Could not close case.");
            const closedIds = [...(data.closed_ticket_ids || []).map(id => `ticket:${id}`), ...(data.closed_dispute_ids || []).map(id => `dispute:${id}`)];
            closedIds.forEach(id => processed.add(id)); processed.add(row.id);
          }
          if (bulkAction === "delete") {
            const { data } = await base44.functions.invoke("deleteAdminTicket", { id: row.record_id, kind: row.kind });
            if (!data?.success) throw new Error(data?.error || "Could not delete case.");
            const removed = await forgetDeletedCases(data);
            removed.forEach(id => { deleted.add(id); processed.add(id); });
          }
        } catch (error) { failures.push({ id: row.id, message: error.message || "Action failed." }); }
      }
      setChecked(failures.map(item => item.id));
      if (failures.length) setBulkError(supportCleanupFailureSummary(processed.size, failures));
      else { setBulkConfirm(false); toast({ title: deleted.size ? `${deleted.size} cases permanently deleted` : `${processed.size} cases closed` }); }
      try { await refreshTickets(); } catch { setSaveError("Cleanup completed, but the overview could not refresh. Refresh the inbox."); }
    } finally { setBusy(false); setDeleteProgress(null); }
  };
  const refreshTickets = async () => {
    if (!onRefresh) notifyAdminChanged({ skipSupport: true });
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
    <nav className="at-categories" aria-label="Support categories">{categories.map(([value, label]) => { const Icon = categoryIcons[value]; const unreadCount = Number(summary.data?.unread_categories?.[value] || 0); return <button key={value} aria-pressed={category === value} data-category={value} onClick={() => openCategory(value)}><span className="at-category-label"><span className="at-category-title"><Icon size={15} />{label}</span>{unreadCount > 0 && <span className="at-category-unread" aria-label={`${unreadCount} cases with unread player activity`}>{unreadCount} new</span>}</span><b>{summary.data?.categories?.[value] ?? "—"}</b></button>; })}</nav>
    <div className="at-organize">
      <div className="at-filters" aria-label="Inbox view">{[["all", "All cases"], ["new", "New activity"], ["waiting", "Unassigned"], ["mine", "Assigned to me"], ["awaiting", "Awaiting player"], ["saved", "Saved"]].map(([value, label]) => <button key={value} data-view={value} aria-pressed={view === value} onClick={() => { setView(value); setFilter(value === "saved" ? "all" : "open"); setSelectedId(null);  }}>{label}{value !== "all" && <span> {summary.data?.[value] ?? ""}</span>}</button>)}</div>
      <label className="at-search"><Search size={15} /><input aria-label="Search support cases" placeholder="Search name, reference or request…" value={searchInput} onChange={event => { setSearchInput(event.target.value); setSelectedId(null); }} /></label>
      <select aria-label="Case status" value={filter} onChange={event => { setFilter(event.target.value); setSelectedId(null);  }}><option value="open">Open</option><option value="closed">Closed</option><option value="all">All statuses</option></select>
    </div>
    <p className="at-queue-hint">Admin calls first · Premium priority · Unread player activity first within each priority. Counts cover all open cases. Drafts and your place in the inbox are kept for this staff session.</p>
    {saveError && <p role="alert" className="at-list-error">{saveError}</p>}
    {direct.isError && <p role="alert" className="at-list-error">{direct.error.message}</p>}
    <div className="at-workspace">
      <aside className="at-inbox" aria-label="Ticket list" ref={inbox} onScroll={event => { scroll.current.inbox = event.currentTarget.scrollTop; }}>
        <div className="at-list-heading"><strong>{view === "saved" ? "Saved conversations" : categories.find(([value]) => value === category)?.[1]}</strong><span>{filter === "open" ? "Open" : filter === "closed" ? "Closed" : "All statuses"}{view === "mine" ? " · Assigned to me" : view === "waiting" ? " · Unassigned" : view === "saved" ? " · Saved" : view === "new" ? " · New activity" : view === "awaiting" ? " · Awaiting player" : ""} · {rows.length} loaded</span></div>
        {query.isPending && <p role="status" className="at-list-feedback"><Loader2 size={15} className="animate-spin" /> Loading tickets...</p>}
        {!query.isPending && !query.isError && !rows.length && <div className="at-list-empty"><Inbox size={26} /><strong>No {filter === "closed" ? "closed" : filter === "open" ? "open" : "matching"} requests here</strong><p>{search || view !== "all" ? "Your search or assignment filter is limiting this list." : filter === "open" ? "There are no open requests in this category. Previous conversations are under Closed." : "There are no requests for this category and status."}</p><div className="at-empty-actions"><button className="at-button at-button-primary" onClick={() => openCategory(category)}>Show open requests</button>{filter !== "closed" && <button className="at-button" onClick={() => { setView("all"); setSearchInput(""); setSearch(""); setSelectedId(null);  setFilter("closed"); }}>View closed cases</button>}</div></div>}

        {canBulkClose && <div className="at-bulk-tools"><label><input type="checkbox" aria-label="Select displayed cases" checked={displayRows.length > 0 && displayRows.every(row => checked.includes(row.id))} disabled={busy || selectingAll || query.isPending} onChange={event => { displayRows.forEach(row => selectionRows.current.set(row.id, row)); setChecked(event.target.checked ? displayRows.map(row => row.id) : []); }} /> Select displayed</label><button className="at-button" disabled={busy || selectingAll} onClick={selectAllMatching}>{selectingAll ? "Selecting…" : "Select all matching"}</button><div className="at-bulk-action-row"><button className="at-button at-button-close" disabled={!checked.length || busy || selectingAll} onClick={() => { setBulkAction("close"); setBulkError(""); setBulkConfirm(true); }}><CheckCheck size={12} /> Close selected</button>{canDelete && <button className="at-button at-button-danger" disabled={!checked.length || busy || selectingAll} onClick={confirmDeleteSelection}><Trash2 size={12} /> Delete selected</button>}</div><small>{checked.length} selected · All matching includes every page of the current category and filters. Admins can close · CEO / Developer can delete.</small></div>}

        <div className="at-ticket-list">{displayRows.map((row) => { const { key, label, Icon } = caseType(row); const owner = row.ticket || row.disputes[0]; const lastMessage = row.ticket?.messages?.at(-1); return <div key={row.id} className="at-row-shell" data-checked={checked.includes(row.id) || undefined} data-closed={row.closed || undefined} data-selectable={canBulkClose || undefined}>{canBulkClose && <label className="at-row-select"><input type="checkbox" aria-label={`Select case ${shortTicketId(row.record_id)}`} disabled={busy} checked={checked.includes(row.id)} onChange={event => { selectionRows.current.set(row.id, row); setChecked(current => event.target.checked ? [...new Set([...current, row.id])] : current.filter(id => id !== row.id)); }} /></label>}<button key={row.id} className="at-ticket-row" data-case-type={key} data-unread={!row.closed && row.unread || undefined}
          aria-current={selected?.id === row.id ? "true" : undefined} onClick={() => { revealSelection.current = true; setSelectedId(row.id); void markRead(row); }}>
          <div className="at-row-top"><span className="at-kind"><Icon size={13} /> {label}</span><TicketStatus row={row} /></div>
          <div className="at-player-heading"><span className="at-player-avatar">{ticketReporter(row).slice(0, 1).toUpperCase()}</span><span><strong>{ticketReporter(row)}</strong></span><ChevronRight size={16} /></div>
          {!row.closed && row.unread && <span className="at-unread-badge"><MessageCircle size={11} /> New player message</span>}
          <div className="at-request-context"><Gamepad2 size={13} /><span>{row.mode === "tournament" ? "Tournament · " : ["wager", "wagers"].includes(row.mode) ? "Wager · " : ""}{row.channel === "live" ? "Asking for live support" : ticketTitle(row)}</span></div>
          {!row.closed && <p className="at-request-reason">{row.channel === "calls" && !row.disputes.length ? "Needs an admin in the match room" : ticketIssue(row)}</p>}
          <div className="at-owner-line" data-assigned={Boolean(owner?.assigned_admin_id)}>{owner?.assigned_admin_id ? <UserCheck size={13} /> : <Clock3 size={13} />}<span>{owner?.assigned_admin_id ? row.closed ? "Handled by" : "Assigned to" : row.closed ? "Case closed" : "Waiting for staff"}{owner?.assigned_admin_id && <strong>{owner.assigned_admin_id === user.id ? "You" : owner.assigned_admin_name || "Staff member"}</strong>}</span></div>
          {!row.closed && lastMessage?.content && <div className="at-last-reply"><small>LAST MESSAGE{lastMessage.sender_name ? ` · ${lastMessage.sender_name}` : ""}</small><p>{lastMessage.content}</p></div>}
          <div className="at-row-bottom"><span className="at-case-reference">#{shortTicketId(row.record_id)}</span>{owner?.support_favorite && <Bookmark size={12} className="at-saved-icon" />}<time title="Latest player activity">{ticketDate(row.activity_at || lastMessage?.created_date || row.ticket?.created_date || row.disputes[0]?.created_date)}</time><ArrowUpRight size={13} /></div>
        </button></div>; })}</div>
        {query.isError && <div role="alert" className="at-list-error"><p>{query.error?.message || "Could not load tickets."}</p><button className="at-button" disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
        {query.hasNextPage && <footer className="at-list-footer"><button className="at-button" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />} Load more</button><span>10 tickets at a time</span></footer>}
      </aside>
      <div className="at-reading-pane" ref={reader} onScroll={event => { scroll.current.reader = event.currentTarget.scrollTop; }}>{selected ? <AdminTicketDetail key={selected.id} row={selected} user={user} onRefresh={refreshTickets} onRoomOpen={onRoomOpen} onBack={() => setSelectedId(null)}
        draft={drafts[selected.id] || {}} onDraftChange={(update) => setDrafts((current) => ({ ...current, [selected.id]: { ...current[selected.id], ...update } }))}
        deleteButton={<>{!selected.closed && selected.unread && <button className="at-button at-button-primary" onClick={() => markRead(selected)}>New message · Mark as read</button>}<button className="at-button at-button-save" disabled={busy} aria-pressed={Boolean((selected.ticket || selected.disputes[0])?.support_favorite)} onClick={async () => {
          setBusy(true); setSaveError("");
          try { const { data } = await base44.functions.invoke("saveSupportCase", { kind: selected.kind, id: selected.record_id, saved: !(selected.ticket || selected.disputes[0])?.support_favorite }); if (!data?.success) throw new Error(data?.error || "Could not save conversation."); await refreshTickets(); } catch (error) { setSaveError(error.message); } finally { setBusy(false); }
        }}><Bookmark size={14} />{(selected.ticket || selected.disputes[0])?.support_favorite ? "Unsave" : "Save conversation"}</button>{saveError && <span role="alert">{saveError}</span>}{canDelete ? <button className="at-button at-delete" onClick={() => { setDeleteError(""); setDeleting(selected); }}><Trash2 size={14} /> Delete</button> : null}</>} />
        : <div className="at-no-selection"><Ticket size={30} /><h3>{filter === "open" && !query.isPending ? "No requests waiting" : "Your ticket workspace"}</h3><p>Select a ticket to see the request, conversation and staff actions.</p></div>}
      </div>
    </div>
    <Dialog open={bulkConfirm} onOpenChange={value => { if (!busy) setBulkConfirm(value); }}><DialogContent overlayClassName="support-delete-overlay" className="admin-action-dialog support-delete-dialog max-w-md border-white/10 bg-card"><DialogTitle>{bulkAction === "close" ? "Close" : "Delete"} {checked.length} selected cases?</DialogTitle><DialogDescription>{bulkAction === "close" ? "Closes the selected support cases and linked disputes for season cleanup. Conversations remain saved." : "Permanently deletes the selected open and closed cases, linked disputes and conversations for staff and players. No closing step is needed. This cannot be undone."} Match results, XP, credits and payouts stay unchanged.</DialogDescription>{bulkAction === "close" && <label className="support-cleanup-reason">Cleanup reason<textarea value={cleanupReason} disabled={busy} maxLength={1000} onChange={event => setCleanupReason(event.target.value)} /></label>}{bulkError && <p role="alert" className="text-sm text-red-300">{bulkError}</p>}<div className="flex justify-end gap-2"><button className="at-button" disabled={busy} onClick={() => setBulkConfirm(false)}>Cancel</button><button className={`at-button ${bulkAction === "delete" ? "at-button-danger" : "at-button-close"}`} disabled={busy || !checked.length || (bulkAction === "close" && !cleanupReason.trim())} onClick={bulkRemove}>{busy ? `Processing ${deleteProgress?.current || 0} / ${deleteProgress?.total || checked.length}…` : bulkAction === "close" ? "Close cases" : "Delete permanently"}</button></div></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent overlayClassName="support-delete-overlay" className="admin-action-dialog support-delete-dialog max-w-md border-white/10 bg-card">
        <DialogTitle>Delete support case?</DialogTitle>
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
