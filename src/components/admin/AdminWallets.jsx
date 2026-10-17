import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Coins, Equal, Loader2, LockKeyhole, Minus, Plus, Search, ShieldCheck, SlidersHorizontal, Wallet, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import "@/styles/admin-wallets.css";

const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
const credits = (value) => Number(value || 0).toLocaleString();
const nameFor = (user) => user.display_name || user.full_name || user.username || "Player";

function WalletEditor({ row, onClose, onSaved }) {
  const [type, setType] = useState("money");
  const [operation, setOperation] = useState("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null), inFlight = useRef(false);
  const before = Number(type === "money" ? row.available_balance : row.credits);
  const units = type === "money" ? 100 : 1;
  const entered = Number(amount), rounded = Math.round(entered * units);
  const afterUnits = operation === "set" ? rounded : Math.round(before * units) + (operation === "remove" ? -rounded : rounded);
  const after = afterUnits / units;
  const valid = amount.trim() !== "" && Number.isFinite(entered) && Number.isSafeInteger(rounded) && entered >= 0
    && (operation === "set" || entered > 0) && Math.abs(entered * units - rounded) < 0.000001
    && Number.isSafeInteger(afterUnits) && after >= 0 && after !== before && reason.trim();
  const display = type === "money" ? money : (value) => `${credits(value)} credits`;
  const change = (setter, value) => { setter(value); setError(""); request.current = null; };
  const submit = async (event) => {
    event.preventDefault();
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setSaving(true); setError("");
    request.current ||= crypto.randomUUID();
    try {
      const response = await base44.functions.invoke("adminAdjustWallet", {
        user_id: row.id, type, operation, amount: entered, reason: reason.trim(), expected_balance: before, request_id: request.current,
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not save this adjustment.");
      toast({ title: "Balance updated", description: `${nameFor(row)}: ${display(before)} to ${display(response.data.balance_after ?? after)}.` });
      onSaved();
      onClose();
    } catch (failure) { setError(failure.message || "Could not save this adjustment."); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent className="admin-wallet-editor" onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }} onInteractOutside={(event) => { if (saving) event.preventDefault(); }}>
      <DialogHeader><span className="aw-eyebrow"><ShieldCheck size={13} /> CEO CONTROLS</span><DialogTitle>Adjust balance</DialogTitle><DialogDescription>{nameFor(row)} &middot; {row.email}</DialogDescription></DialogHeader>
      <form onSubmit={submit}><fieldset disabled={saving}>
        <div className="aw-field"><span>Balance</span><div className="aw-choices">{[["money", "Money", Wallet], ["credits", "Credits", Coins]].map(([value, label, Icon]) => <button type="button" aria-pressed={type === value} key={value} onClick={() => change(setType, value)}><Icon size={15} /> {label}</button>)}</div></div>
        <div className="aw-field"><span>Action</span><div className="aw-choices">{[["add", "Add", Plus], ["remove", "Remove", Minus], ["set", "Set balance", Equal]].map(([value, label, Icon]) => <button type="button" aria-pressed={operation === value} data-action={value} key={value} onClick={() => change(setOperation, value)}><Icon size={14} /> {label}</button>)}</div></div>
        <label className="aw-field"><span>{operation === "set" ? "New balance" : "Amount"} {type === "money" ? "(USD)" : "(credits)"}</span><input autoFocus type="number" inputMode={type === "money" ? "decimal" : "numeric"} min={operation === "set" ? "0" : type === "money" ? "0.01" : "1"} step={type === "money" ? "0.01" : "1"} required value={amount} onChange={(event) => change(setAmount, event.target.value)} placeholder={type === "money" ? "0.00" : "0"} /></label>
        <div className="aw-preview"><div><span>Current balance</span><strong>{display(before)}</strong></div><ArrowRight size={17} /><div><span>After adjustment</span><strong data-negative={after < 0}>{amount !== "" && Number.isFinite(after) ? display(after) : display(before)}</strong></div></div>
        {after < 0 && amount !== "" && <p className="aw-error">The amount exceeds the available balance.</p>}
        <label className="aw-field"><span>Reason <small>Required</small></span><textarea required maxLength={1000} value={reason} onChange={(event) => change(setReason, event.target.value)} placeholder="Explain why this balance is being adjusted..." rows={3} /></label>
        <p className="aw-editor-note"><ShieldCheck size={14} /> This change will be recorded in the audit log and transaction history.</p>
      </fieldset>
        {error && <div className="aw-error" role="alert"><p>{error}</p><button type="button" onClick={() => { onSaved(); onClose(); }}>Close &amp; refresh balance</button></div>}
        <div className="aw-editor-footer"><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" data-danger={operation === "remove"} disabled={!valid || saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} {saving ? "Saving..." : "Save adjustment"}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function AdminWallets({ user, onRefresh }) {
  const role = effectiveRoleForUser(user), canView = hasRolePower(role, "admin"), canAdjust = role === "ceo";
  const [search, setSearch] = useState(""), [debounced, setDebounced] = useState(""), [filter, setFilter] = useState("all"), [editing, setEditing] = useState(null);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const query = useInfiniteQuery({
    queryKey: ["admin-console", user.id, role, "walletDirectory", debounced, filter], initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const response = await base44.functions.invoke("getAdminWallets", { search: debounced, filter, cursor: pageParam });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load wallets.");
      return response.data;
    }, getNextPageParam: (page) => page.next_cursor || undefined, enabled: canView, staleTime: 30000, refetchOnWindowFocus: false,
  });
  const summary = useQuery({ queryKey: ["admin-console", user.id, role, "walletSummary"], enabled: canView,
    queryFn: async () => {
      const response = await base44.functions.invoke("getAdminWalletSummary", {});
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load wallet totals.");
      return response.data;
    }, staleTime: 30000, refetchOnWindowFocus: false });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap((page) => page.rows).map((row) => [row.id, row])).values()], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0, searching = search.trim() !== debounced;
  if (!canView) return <p className="p-6 text-sm text-vapor">Admin access is required to view wallets. Only the CEO can adjust balances.</p>;
  return <section className="admin-wallets">
    <header className="aw-heading"><div><span className="aw-eyebrow">ECONOMY &amp; BALANCES</span><h2><Wallet size={21} /> Wallets</h2><p>Account balances, credits and funds held in play.</p></div><span className="aw-access"><LockKeyhole size={13} /> {canAdjust ? "CEO controls enabled" : "View only · CEO controls"}</span></header>
    <div className="aw-summary">{[["Available funds", "available", Wallet, money], ["Credits", "credits", Coins, credits], ["Pending", "pending", Wallet, money], ["In escrow", "escrow", LockKeyhole, money]].map(([label, key, Icon, format]) => <div key={key}><span><Icon size={14} /> {label}</span><strong>{summary.data ? format(summary.data[key]) : "—"}</strong></div>)}</div>
    {summary.isError && <p className="aw-feedback aw-error" role="alert">Wallet totals could not be loaded. <button onClick={() => summary.refetch()}>Try again</button></p>}
    <div className="aw-toolbar"><div className="aw-search"><Search size={16} /><input aria-label="Search wallets" placeholder="Search player, email or account ID..." value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button aria-label="Clear wallet search" onClick={() => setSearch("")}><X size={14} /></button>}</div><div className="aw-filters" aria-label="Wallet filter">{[["all", "All accounts"], ["funded", "With balance"], ["held", "Funds held"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <div className="aw-list-summary"><strong>{total.toLocaleString()} accounts</strong><span>Newest accounts first</span></div>
    <div className="aw-table-wrap"><table><thead><tr><th>Player</th><th>Available</th><th>Credits</th><th>Pending / Escrow</th><th>Withdrawable</th><th>Earned</th>{canAdjust && <th><span className="sr-only">Controls</span></th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <td><div className="aw-player"><span>{nameFor(row).slice(0, 1).toUpperCase()}</span><div>{row.username ? <Link to={`/profile/${encodeURIComponent(row.username)}`}>{nameFor(row)}</Link> : <strong>{nameFor(row)}</strong>}<small>{row.email}</small></div></div></td>
      <td><strong className="aw-money">{money(row.available_balance)}</strong></td><td><span className="aw-credits"><Coins size={12} />{credits(row.credits)}</span></td>
      <td><div className="aw-held"><span>{money(row.pending_balance)} <small>pending</small></span><span>{money(row.escrow_balance)} <small>escrow</small></span></div></td>
      <td>{money(row.withdrawable_balance)}</td><td>{money(row.total_earnings)}</td>{canAdjust && <td><button className="aw-manage" aria-label={`Adjust balance for ${nameFor(row)}`} onClick={() => setEditing(row)}><SlidersHorizontal size={13} /> Adjust</button></td>}
    </tr>)}</tbody></table></div>
    {(query.isPending || searching) && <p className="aw-feedback" role="status"><Loader2 size={15} className="animate-spin" /> Loading wallets...</p>}
    {query.isError && <div className="aw-feedback aw-error" role="alert"><span>{query.error?.message || "Could not load wallets."}</span><button disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
    {!query.isPending && !searching && !query.isError && !rows.length && <div className="aw-empty"><Wallet size={28} /><strong>No accounts found</strong><p>Try another search or filter.</p></div>}
    {!!rows.length && <footer className="aw-footer"><p>{rows.length} of {total.toLocaleString()} accounts loaded</p>{query.hasNextPage && <button disabled={query.isFetching || searching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />} Load next 25</button>}</footer>}
    {editing && canAdjust && <WalletEditor key={editing.id} row={editing} onClose={() => setEditing(null)} onSaved={() => { void onRefresh(); }} />}
  </section>;
}
