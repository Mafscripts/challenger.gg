import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Boxes, Check, ChevronDown, CircleX, Clock3, ExternalLink, Loader2, RefreshCw, Search, ShieldCheck, UserRound, Wallet, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { adminTargetUrl, notifyAdminChanged, openAdminPlayer } from "@/lib/adminWorkspace";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import "@/styles/admin-economy.css";

const money = value => value !== null && value !== "" && Number.isFinite(Number(value)) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value)) : "Amount unavailable";
const nameFor = row => row.player?.display_name || row.player?.full_name || row.player?.username || "Former player";
const dateFor = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "—";
const label = value => String(value || "Unknown").replace(/_/g, " ");
const actionDefinitions = { approved: ["Approve request", Check, "success"], completed: ["Record as paid", Check, "success"], rejected: ["Reject request", CircleX, "danger"], cancelled: ["Cancel request", X, "danger"] };
const actionsFor = status => ({ pending: ["approved", "rejected"], approved: ["completed", "cancelled"], processing: ["completed", "rejected"] }[status] || []);
const categories = ["cosmetic", "badge", "frame", "calling_card", "trophy", "knife", "ranked_reward", "weapon_skin", "gloves", "agent", "sticker", "patch", "music_kit", "reward_item"];

function WithdrawalAction({ request, action, onClose, onSaved }) {
  const [notes, setNotes] = useState(""), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const inFlight = useRef(false), [title, Icon, tone] = actionDefinitions[action];
  const reasonRequired = ["rejected", "cancelled"].includes(action);
  const submit = async event => {
    event.preventDefault();
    if (inFlight.current || (reasonRequired && !notes.trim())) return;
    inFlight.current = true; setSaving(true); setError("");
    try {
      const { data } = await base44.functions.invoke("processWithdrawal", { withdrawal_id: request.id, expected_status: request.status, status: action, notes: notes.trim() });
      if (!data?.success) throw new Error(data?.error || "The withdrawal could not be updated.");
      toast({ title: "Withdrawal updated", description: `${nameFor(request)} · ${money(request.amount)} · ${label(action)}` });
      onSaved(); onClose();
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); inFlight.current = false; }
  };
  return <Dialog open onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent className="admin-action-dialog ae-action-dialog" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onInteractOutside={event => { if (saving) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{nameFor(request)} · {money(request.amount)} · {label(request.payment_method)}</DialogDescription></DialogHeader>
      <p className="ae-note">{action === "completed" ? "Only record this request as paid after checking that the payment was sent successfully." : action === "approved" ? "Approve this request for payment after reviewing the player's wallet and payment records." : "The reason will be kept with the withdrawal and in the staff audit log."} This action records the request status; it does not send a payment or change the wallet balance.</p>
      <form onSubmit={submit}><label>Staff note {reasonRequired ? "(required)" : "(optional)"}<textarea autoFocus value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} rows={3} required={reasonRequired} disabled={saving} placeholder="Add the payment reference or explain this decision..." /></label>
        {error && <p className="ae-error" role="alert">{error}</p>}
        <div className="ae-dialog-actions"><button type="button" disabled={saving} onClick={onClose}>Back</button><button type="submit" data-tone={tone} disabled={saving || (reasonRequired && !notes.trim())}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}{saving ? "Saving..." : title}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function AdminEconomyRecords({ user, type = "withdrawals", onRefresh }) {
  const location = useLocation(), navigate = useNavigate(), role = effectiveRoleForUser(user), allowed = hasRolePower(role, "admin");
  const inventory = type === "inventory", title = inventory ? "Inventory" : "Withdrawals", Icon = inventory ? Boxes : ArrowDownToLine;
  const params = new URLSearchParams(location.search), initialSearch = params.get("search") || "", requestedFilter = params.get(inventory ? "category" : "status") || "all";
  const filter = ["all", ...(inventory ? categories : ["pending", "processing", "approved", "completed", "rejected", "cancelled"])].includes(requestedFilter) ? requestedFilter : "all";
  const [search, setSearch] = useState(initialSearch), [debounced, setDebounced] = useState(initialSearch.trim()), [editing, setEditing] = useState(null);
  useEffect(() => { setSearch(new URLSearchParams(location.search).get("search") || ""); }, [location.search]);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const query = useInfiniteQuery({ queryKey: ["admin-console", user.id, role, inventory ? "inventoryDirectory" : "withdrawalDirectory", debounced, filter],
    initialPageParam: null, enabled: allowed, staleTime: 30000, refetchOnWindowFocus: false,
    queryFn: async ({ pageParam }) => {
      const { data } = await base44.functions.invoke(inventory ? "getAdminInventory" : "getAdminWithdrawals", { search: debounced, [inventory ? "category" : "status"]: filter, cursor: pageParam });
      if (!data?.success) throw new Error(data?.error || `Could not load ${title.toLowerCase()}.`);
      return data;
    }, getNextPageParam: page => page.next_cursor || undefined,
  });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap(page => page.rows).map(row => [row.id, row])).values()], [query.data]);
  const first = query.data?.pages[0], searching = debounced !== search.trim();
  const changeFilter = value => navigate(adminTargetUrl({ tab: type, search, [inventory ? "category" : "status"]: value }));
  const refresh = () => { if (onRefresh) void onRefresh(); else notifyAdminChanged(); };
  if (!allowed) return <p className="p-6 text-sm text-vapor">Admin access is required to view {title.toLowerCase()}.</p>;
  return <section className="admin-economy">
    <header className="ae-heading"><div><span>ECONOMY &amp; REWARDS</span><h2><Icon size={21} />{title}</h2><p>{inventory ? "Owned items, their source and the player who received them." : "Review payment requests and keep their processing status up to date."}</p></div><div className="ae-actions"><Link to={adminTargetUrl({ tab: inventory ? "marketplace" : "wallets" })}><Wallet size={14} />{inventory ? "Manage item catalog" : "Player wallets"}<ExternalLink size={12} /></Link><button type="button" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} />Refresh</button></div></header>
    {!inventory && <div className="ae-status-summary">{[["pending", "Needs review", Clock3], ["approved", "Approved", ShieldCheck], ["processing", "Processing", RefreshCw], ["completed", "Paid", Check]].map(([status, text, StatusIcon]) => <button type="button" key={status} aria-pressed={filter === status} onClick={() => changeFilter(status)}><StatusIcon size={15} /><span>{text}</span><strong>{first?.counts?.[status] ?? "—"}</strong></button>)}</div>}
    <div className="ae-toolbar"><label className="ae-search"><Search size={16} /><input aria-label={`Search ${title.toLowerCase()}`} placeholder={inventory ? "Search player, item or reference..." : "Search player, method or request..."} value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}</label><label className="ae-filter">{inventory ? "Category" : "Status"}<select aria-label={inventory ? "Inventory category" : "Withdrawal status"} value={filter} onChange={event => changeFilter(event.target.value)}><option value="all">{inventory ? "All categories" : "All requests"}</option>{(inventory ? categories : ["pending", "approved", "processing", "completed", "rejected", "cancelled"]).map(value => <option value={value} key={value}>{label(value)}</option>)}</select></label></div>
    <p className="ae-list-note">{first ? `${first.total.toLocaleString()} ${inventory ? "owned items" : "requests"}` : "Loading records..."} · Newest first{!inventory && " · Status changes are recorded in the audit log"}</p>
    {query.isPending || searching ? <div className="ae-feedback" role="status"><Loader2 size={17} className="animate-spin" />Loading {title.toLowerCase()}...</div> : null}
    {query.isError && <div className="ae-feedback ae-error" role="alert"><p>{query.error.message}</p><button type="button" disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
    <div className="ae-records">{rows.map(row => <article className="ae-record" key={row.id}><div className="ae-record-main"><div><button type="button" className="ae-player" disabled={!row.user_id} onClick={() => openAdminPlayer(row.user_id)}><UserRound size={15} />{nameFor(row)}</button><span className="ae-reference">#{row.id}</span></div><strong className={inventory ? "ae-item" : "ae-amount"}>{inventory ? row.item_name || "Unnamed item" : money(row.amount)}</strong><span className="ae-state" data-state={inventory ? "inventory" : row.status}>{inventory ? label(row.item_category) : row.status === "completed" ? "Paid" : label(row.status)}</span></div>
      <dl className="ae-record-details">{(inventory ? [["Rarity", label(row.item_rarity)], ["Received through", label(row.purchase_method)], ["Acquired", dateFor(row.acquired_date || row.created_date)], ["Item reference", row.item_id || "Standalone reward"]] : [["Method", label(row.payment_method)], ["Requested", dateFor(row.requested_date || row.created_date)], ["Last handled by", row.processed_by_name || "Unassigned"], ["Processed", dateFor(row.processed_date)]]).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
      {row.processing_notes && <p className="ae-processing-note"><strong>Staff note:</strong> {row.processing_notes}</p>}
      <footer className="ae-actions"><button type="button" disabled={!row.user_id} onClick={() => openAdminPlayer(row.user_id)}><UserRound size={13} />Player dossier</button>{!inventory && row.user_id && <Link to={adminTargetUrl({ tab: "wallets", search: row.user_id })}><Wallet size={13} />Review wallet</Link>}{!inventory && actionsFor(row.status).map(action => { const [text, ActionIcon, tone] = actionDefinitions[action]; return <button type="button" key={action} data-tone={tone} onClick={() => setEditing({ row, action })}><ActionIcon size={13} />{text}</button>; })}</footer>
    </article>)}</div>
    {!query.isPending && !query.isError && !searching && !rows.length && <div className="ae-empty"><Icon size={28} /><strong>No {title.toLowerCase()} found</strong><p>Try a different search or filter.</p><button type="button" onClick={() => { setSearch(""); navigate(adminTargetUrl({ tab: type })); }}>Reset filters</button></div>}
    {!!rows.length && <footer className="ae-footer"><span>{rows.length} of {first?.total?.toLocaleString()} loaded</span>{query.hasNextPage && <button type="button" disabled={query.isFetching || searching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}Load next 25</button>}</footer>}
    {editing && <WithdrawalAction key={`${editing.row.id}:${editing.action}`} request={editing.row} action={editing.action} onClose={() => setEditing(null)} onSaved={refresh} />}
  </section>;
}
