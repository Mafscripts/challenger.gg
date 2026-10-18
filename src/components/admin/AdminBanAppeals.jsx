import React, { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, MessageSquare, RefreshCw, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { effectiveRoleForUser } from "@/lib/roles";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import BanAppealConversation, { appealDate, appealStatus } from "@/components/support/BanAppealConversation";

export default function AdminBanAppeals() {
  const { user } = useAuth();
  return effectiveRoleForUser(user) === "ceo" ? <AppealInbox userId={user.id} /> : <p className="p-5 text-sm text-vapor">Only CEOs can access ban appeals.</p>;
}
function AppealInbox({ userId }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const query = useInfiniteQuery({ queryKey: ["admin-ban-appeals", userId, term, status], initialPageParam: undefined,
    queryFn: ({ pageParam }) => base44.banAppeals.list({ search: term, status, before: pageParam }),
    getNextPageParam: (page) => page.next_cursor || undefined, refetchInterval: 30000, retry: false });
  const rows = [...new Map((query.data?.pages || []).flatMap((page) => page.appeals).map((row) => [row.id, row])).values()];
  const refresh = () => client.invalidateQueries({ queryKey: ["admin-ban-appeals", userId] });
  const changeStatus = async () => {
    setBusy(true); setError("");
    const next = selected.status === "closed" ? "awaiting_ceo" : "closed";
    try {
      await base44.banAppeals.status(selected.id, next);
      setSelected((current) => ({ ...current, status: next }));
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ["ban-appeal-conversation", `${userId}:${selected.id}`] })]);
    } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  };
  return <section className="overflow-hidden rounded-2xl border border-white/10 bg-card">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 p-5 sm:p-6"><div><p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-green"><LockKeyhole className="h-3.5 w-3.5" />CEO access only</p><h2 className="text-xl font-black">Ban appeals</h2><p className="mt-2 text-xs text-vapor">Review private player messages and reply as the CEO team.</p></div><button type="button" onClick={refresh} disabled={query.isFetching} className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-vapor disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</button></header>
    <div className="flex flex-wrap gap-3 border-b border-white/10 p-4"><label className="relative min-w-[200px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-vapor" /><input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} aria-label="Search ban appeals" placeholder="Search player or email…" className="h-10 w-full rounded-lg border border-white/10 bg-background/60 pl-10 pr-3 text-sm outline-none focus:border-cyan/40" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Appeal status" className="h-10 rounded-lg border border-white/10 bg-background px-3 text-xs font-bold"><option value="all">All conversations</option><option value="awaiting_ceo">Waiting for CEO</option><option value="awaiting_user">CEO replied</option><option value="closed">Closed</option></select></div>
    {query.error && <p role="alert" className="p-5 text-sm text-red-300">{query.error.message}</p>}
    {query.isPending ? <p role="status" className="p-6 text-sm text-vapor">Loading appeals…</p> : rows.length === 0 && !query.error ? <div className="p-10 text-center"><MessageSquare className="mx-auto mb-3 h-8 w-8 text-vapor/40" /><p className="text-sm font-bold">No appeals found</p><p className="mt-2 text-xs text-vapor">Messages sent from the ban screen will appear here.</p></div> : null}
    <div className="divide-y divide-white/10">{rows.map((row) => <button type="button" key={row.id} onClick={() => { setSelected(row); setError(""); }} className="flex w-full flex-wrap items-center justify-between gap-4 px-5 py-5 text-left transition-colors hover:bg-white/[0.025] sm:px-6"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><strong className="text-sm">{row.user.display_name || row.user.username}</strong><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${row.status === "awaiting_ceo" ? "border-orange/25 bg-orange/10 text-orange" : row.status === "closed" ? "border-white/10 text-vapor" : "border-green/20 bg-green/5 text-green"}`}>{appealStatus(row.status)}</span></div><p className="mt-1 text-xs text-vapor">{row.user.email}</p><p className="mt-2 line-clamp-2 break-words text-xs text-vapor">Ban reason: {row.ban_reason}</p></div><div className="text-right"><time className="block text-[11px] text-vapor" dateTime={row.updated_date}>{appealDate(row.updated_date)}</time><span className="mt-2 block text-xs font-black text-cyan">Open conversation →</span></div></button>)}</div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4"><p className="text-xs text-vapor">{rows.length} loaded · 25 per page</p>{query.hasNextPage && <button type="button" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} className="rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2 text-xs font-bold text-cyan disabled:opacity-40">{query.isFetchingNextPage ? "Loading…" : "Load next 25"}</button>}</footer>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[92dvh] max-w-[860px] overflow-y-auto p-5 sm:p-6">
      <DialogTitle className="pr-8">{selected?.user.display_name || selected?.user.username} · Ban appeal</DialogTitle><DialogDescription>Private CEO conversation. Closing this conversation does not remove the ban.</DialogDescription>
      {selected && <><div className="rounded-xl border border-white/10 bg-background/40 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-vapor">Ban reason</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selected.ban_reason}</p><button type="button" onClick={changeStatus} disabled={busy} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-cyan disabled:opacity-40">{busy ? "Saving…" : selected.status === "closed" ? "Reopen conversation" : "Close conversation"}</button>{error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}</div>
        <BanAppealConversation key={selected.id} appealId={selected.id} ceo scope={`${userId}:${selected.id}`} onUpdated={() => { setSelected((current) => current ? { ...current, status: "awaiting_user" } : current); refresh(); }} /></>}
    </DialogContent></Dialog>
  </section>;
}
