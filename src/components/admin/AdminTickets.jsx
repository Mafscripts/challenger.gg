import React, { lazy, Suspense, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, Loader2, Ticket, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import AdminTicketDetail, { TicketStatus } from "./AdminTicketDetail";
import { shortTicketId, ticketDate, ticketIssue, ticketReporter, ticketTitle } from "@/lib/adminTickets";
import "@/styles/admin-tickets.css";
const SupportRecords = lazy(() => import("@/components/support/SupportRecords"));

export default function AdminTickets({ user, onRefresh }) {
  const [filter, setFilter] = useState("open");
  const [selectedId, setSelectedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const queryClient = useQueryClient();
  const role = effectiveRoleForUser(user);
  const query = useInfiniteQuery({
    queryKey: ["admin-console", user?.id, role, "ticketQueue", filter],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const response = await base44.functions.invoke("getAdminTickets", { cursor: pageParam, filter });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load tickets.");
      return response.data;
    },
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(user?.id),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  const rows = [...new Map((query.data?.pages || []).flatMap((page) => page.rows).map((row) => [row.id, row])).values()];
  const selected = rows.find((row) => row.id === selectedId) || rows[0];
  const remove = async () => {
    setBusy(true);
    setDeleteError("");
    try {
      const response = await base44.functions.invoke("deleteAdminTicket", { id: deleting.record_id, kind: deleting.kind });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not delete ticket.");
      const ticketIds = new Set(response.data.deleted_ticket_ids || []);
      const disputeIds = new Set(response.data.deleted_dispute_ids || []);
      queryClient.setQueriesData({ queryKey: ["admin-console", user.id, role, "ticketQueue"] }, (current) => current && ({
        ...current, pages: current.pages.map((page) => ({ ...page,
          rows: page.rows.filter((row) => row.kind === "ticket" ? !ticketIds.has(row.record_id) : !disputeIds.has(row.record_id)),
        })),
      }));
      setDeleting(null);
      setSelectedId(null);
      await onRefresh();
    } catch (error) {
      setDeleteError(error.message || "Could not delete ticket.");
    } finally {
      setBusy(false);
    }
  };
  return <section className="admin-tickets" data-detail-open={Boolean(selectedId)}>
    <header className="at-heading">
      <div><span className="at-eyebrow">PLAYER SUPPORT</span><h2><Ticket size={20} /> Tickets</h2><p>Review a request, reply to the players and record the outcome.</p></div>
      <div className="at-filters" aria-label="Filter tickets">
        <Suspense fallback={null}><SupportRecords className="at-button" /></Suspense>
        {[["open", "Open"], ["all", "All tickets"], ["closed", "Closed"]].map(([value, label]) => <button key={value}
          aria-pressed={filter === value} onClick={() => { setFilter(value); setSelectedId(null); }}>{label}</button>)}
      </div>
    </header>
    <div className="at-workspace">
      <aside className="at-inbox" aria-label="Ticket list">
        <div className="at-list-heading"><strong>{filter === "open" ? "Needs attention" : filter === "closed" ? "Closed tickets" : "All tickets"}</strong><span>{rows.length} loaded</span></div>
        {query.isPending && <p role="status" className="at-list-feedback"><Loader2 size={15} className="animate-spin" /> Loading tickets...</p>}
        {!query.isPending && !query.isError && !rows.length && <div className="at-list-empty"><Inbox size={26} /><strong>{filter === "open" ? "No open tickets" : "No tickets here"}</strong><p>{filter === "open" ? "You're up to date. Previous requests are under Closed." : "Tickets will appear here when available."}</p></div>}
        <div className="at-ticket-list">{rows.map((row) => <button key={row.id} className="at-ticket-row"
          aria-current={selected?.id === row.id ? "true" : undefined} onClick={() => setSelectedId(row.id)}>
          <div className="at-row-top"><span>#{shortTicketId(row.record_id)}</span><TicketStatus row={row} /></div>
          <strong className="at-row-title">{ticketTitle(row)}</strong><p>{ticketIssue(row)}</p>
          <div className="at-row-bottom"><span className="at-row-avatar">{ticketReporter(row).slice(0, 1).toUpperCase()}</span><strong>{ticketReporter(row)}</strong><time>{ticketDate(row.ticket?.created_date || row.disputes[0]?.created_date)}</time><ChevronRight size={14} /></div>
        </button>)}</div>
        {query.isError && <div role="alert" className="at-list-error"><p>{query.error?.message || "Could not load tickets."}</p><button className="at-button" disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
        {query.hasNextPage && <footer className="at-list-footer"><button className="at-button" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />} Load more</button><span>10 tickets at a time</span></footer>}
      </aside>
      <div className="at-reading-pane">{selected ? <AdminTicketDetail key={selected.id} row={selected} user={user} onRefresh={onRefresh} onBack={() => setSelectedId(null)}
        draft={drafts[selected.id] || {}} onDraftChange={(update) => setDrafts((current) => ({ ...current, [selected.id]: { ...current[selected.id], ...update } }))}
        deleteButton={selected.closed && hasRolePower(role, "admin") ? <button className="at-button at-delete" onClick={() => { setDeleteError(""); setDeleting(selected); }}><Trash2 size={14} /> Delete</button> : null} />
        : <div className="at-no-selection"><Ticket size={30} /><h3>{filter === "open" && !query.isPending ? "No requests waiting" : "Your ticket workspace"}</h3><p>Select a ticket to see the request, conversation and staff actions.</p></div>}
      </div>
    </div>
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent className="admin-action-dialog max-w-md border-white/10 bg-card">
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
