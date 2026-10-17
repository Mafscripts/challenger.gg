import React, { lazy, Suspense, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Ticket, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const DisputeReviewCard = lazy(() => import("@/components/admin/DisputeReviewCard"));

export default function AdminTickets({ user, renderTicket, onRefresh }) {
  const [filter, setFilter] = useState("all");
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
      await onRefresh();
    } catch (error) {
      setDeleteError(error.message || "Could not delete ticket.");
    } finally {
      setBusy(false);
    }
  };
  return <section>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
      <div><h2 className="flex items-center gap-2 text-lg font-bold"><Ticket className="h-5 w-5 text-cyan" /> Tickets</h2>
        <p className="mt-1 text-xs text-vapor">Support and match issues in one queue.</p></div>
      <div className="flex gap-1 rounded-lg border border-white/5 bg-background/30 p-1" aria-label="Filter tickets">
        {[["all", "All"], ["open", "Open"], ["closed", "Closed"]].map(([value, label]) => <button key={value}
          aria-pressed={filter === value} onClick={() => setFilter(value)}
          className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${filter === value ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground"}`}>{label}</button>)}
      </div>
    </header>
    {query.isPending && <p role="status" className="flex items-center gap-2 p-5 text-sm text-vapor"><Loader2 className="h-4 w-4 animate-spin" /> Loading tickets...</p>}
    {!query.isPending && !query.isError && rows.length === 0 && <p className="p-8 text-center text-sm text-vapor">No {filter === "all" ? "" : `${filter} `}tickets.</p>}
    <div className="divide-y divide-white/5">{rows.map((row) => <div key={row.id}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/20 px-5 py-3">
        <span className="text-xs font-bold text-vapor">#{row.record_id.slice(-8)} <span className="mx-2 text-white/20">/</span>
          {row.disputes.length || row.ticket?.match_id ? "Match ticket" : "Support ticket"}</span>
        {row.closed && hasRolePower(role, "admin") && <button onClick={() => { setDeleteError(""); setDeleting(row); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-400/10">
          <Trash2 className="h-3.5 w-3.5" /> Delete ticket</button>}
      </div>
      {row.ticket && renderTicket(row.ticket, row.disputes)}
      {!!row.disputes.length && <div className={row.ticket ? "px-5 pb-5" : ""}>
        <Suspense fallback={<p className="p-4 text-xs text-vapor">Loading match review...</p>}>
          {row.disputes.map((dispute) => <DisputeReviewCard key={dispute.id} dispute={dispute}
            ticket={row.ticket} hideConversation={Boolean(row.ticket)} onRefresh={onRefresh} />)}
        </Suspense>
      </div>}
    </div>)}</div>
    {query.isError && <div role="alert" className="space-y-3 p-5 text-sm text-red-300">
      <p>{query.error?.message || "Could not load tickets."}</p>
      <button className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-vapor" disabled={query.isFetching}
        onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button>
    </div>}
    {!!rows.length && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 px-5 py-4">
      <p className="text-xs text-vapor">{rows.length} tickets loaded</p>
      {query.hasNextPage && <button disabled={query.isFetching} onClick={() => query.fetchNextPage()}
        className="inline-flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-2.5 text-xs font-bold text-cyan hover:bg-cyan/20 disabled:opacity-50">
        {query.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />} Load more
      </button>}
    </footer>}
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent className="max-w-md border-white/10 bg-card">
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
