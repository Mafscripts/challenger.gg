import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CalendarDays, Check, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { hasRolePower, effectiveRoleForUser } from "@/lib/roles";
import { FULL_RESET_CATEGORIES, PROGRESSION_CATEGORIES, SEASON_LADDERS, seasonLadder } from "@/lib/progressionResets";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminTargetUrl } from "@/lib/adminWorkspace";

const field = "w-full rounded-lg border border-white/10 bg-background/70 px-3 py-2.5 text-sm focus:border-cyan/50 focus:outline-none disabled:opacity-50";
const localDate = (value) => new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const defaultDates = () => { const start = new Date(), end = new Date(start); end.setMonth(end.getMonth() + 3); return { start_date: localDate(start), end_date: localDate(end) }; };

export default function ProgressionResets({ user, onChanged }) {
  const role = effectiveRoleForUser(user), allowed = hasRolePower(role, "super_admin"), client = useQueryClient();
  const refresh = useRef(null);
  const [overview, setOverview] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [mode, setMode] = useState(role === "ceo" ? "reset" : "season"), [selected, setSelected] = useState([]);
  const [reason, setReason] = useState(""), [confirmation, setConfirmation] = useState("");
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [result, setResult] = useState(null);
  const [requestId, setRequestId] = useState("");
  const [form, setForm] = useState(() => ({ season_number: "2", season_name: "Season 2", ranked_policy: "soft", ...defaultDates() }));
  const load = async () => {
    setLoading(true); setError("");
    try { const response = await base44.functions.invoke("getProgressionResetOverview", {}); if (!response.data?.success) throw new Error(response.data?.error || "Could not load progression."); setOverview(response.data); }
    catch (error) { setError(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);
  refresh.current = () => { if (allowed && !busy && !loading && !review) void load(); };
  useEffect(() => {
    const listener = event => { if (event.detail?.refreshRequested) refresh.current?.(); };
    window.addEventListener("topfragg:admin-changed", listener);
    return () => window.removeEventListener("topfragg:admin-changed", listener);
  }, []);
  const categories = mode === "season" ? SEASON_LADDERS : PROGRESSION_CATEGORIES;
  const choices = PROGRESSION_CATEGORIES.filter((entry) => selected.includes(entry.id));
  const active = (overview?.seasons || []).filter((season) => season.is_active);
  const nextNumber = useMemo(() => Math.max(2, ...selected.map((id) => overview?.next_numbers?.[id] || 2)), [overview, selected]);
  useEffect(() => { setForm((current) => ({ ...current, season_number: String(nextNumber), season_name: `Season ${nextNumber}` })); }, [nextNumber]);
  if (!allowed) return <p className="p-6 text-sm text-vapor">Super Admin or CEO access required.</p>;
  const phrase = mode === "full" ? "RESET WEBSITE" : mode === "season" ? "START SEASON" : "RESET SELECTED";
  const changeMode = (value) => { setMode(value); setSelected(value === "full" ? [...FULL_RESET_CATEGORIES] : []); setError(""); setResult(null); setConfirmation(""); };
  const openReview = (event) => {
    event.preventDefault(); setError(""); setConfirmation("");
    if (mode === "season" && (new Date(form.end_date) <= new Date(form.start_date) || new Date(form.start_date).getTime() > Date.now() + 60000 || new Date(form.end_date).getTime() <= Date.now())) {
      setError("The season starts when confirmed. Choose a start time at or before now and an end in the future."); return;
    }
    setRequestId(crypto.randomUUID()); setReview(true);
  };
  const execute = async () => {
    if (busy || confirmation !== phrase || !selected.length) return;
    setBusy(true); setError("");
    try {
      const response = await base44.functions.invoke(mode === "season" ? "adminStartProgressionSeason" : "adminResetProgression", {
        categories: selected, full_reset: mode === "full", confirmation, reason: reason.trim(), request_id: requestId,
        ...(mode === "season" ? { ...form, season_number: Number(form.season_number), season_name: form.season_name.trim(), start_date: new Date(form.start_date).toISOString(), end_date: new Date(form.end_date).toISOString() } : {}),
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Reset failed.");
      setResult({ ...response.data, labels: choices.map((entry) => entry.label).join(", "), mode });
      setReview(false); setSelected([]); setConfirmation(""); setReason("");
      await client.invalidateQueries(); await load(); await onChanged?.();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5 p-5 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan">Progression management</p><h2 className="mt-1 text-xl font-black">Resets & Seasons</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-vapor">Choose the categories to reset. New seasons archive the previous ladder standings. Match history, payment history, accounts and purchased cosmetics are kept.</p></div><button type="button" disabled={loading || busy} onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-vapor"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-400/25 bg-purple-400/5 p-4 text-xs leading-6 text-purple-200"><p>Automatic two-month reward seasons are configured in Reward Items &amp; Seasons and preserve global progression. The controls below are manual progression resets.</p><Link to={adminTargetUrl({ tab: "rewards" })} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-purple-400/25 px-3 py-2 text-xs font-bold">Open reward seasons<ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Reset action">{[["full", "Full reset · keep credits", RotateCcw], ["reset", "Category reset", RotateCcw], ["season", "New season", CalendarDays]].map(([value, label, Icon]) => <button key={value} type="button" disabled={busy || value !== "season" && role !== "ceo"} aria-pressed={mode === value} onClick={() => changeMode(value)} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold disabled:opacity-40 ${mode === value ? "border-cyan/30 bg-cyan/10 text-cyan" : "border-white/10 text-vapor"}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    {mode === "full" && <div className="rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-xs leading-6"><strong className="block text-sm text-red-300">Full website progression reset — credits are protected</strong>Resets wallet money, earnings, trophies, XP / TP ranks, Ranked ELO, Free 8s ELO, Wager / Money 8s records, verified game ranks, Challenge standings and team records for all accounts. Credits, accounts, team membership, purchased cosmetics and payment / match history are kept. Pending payments, held funds or withdrawals must be resolved first.</div>}
    {role !== "ceo" && <p className="text-xs text-vapor">Category resets are CEO only. Super Admins can start ladder seasons.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Accounts", overview?.totals?.users], ["Wallet money", overview ? `$${Number(overview.totals.money).toFixed(2)}` : null], ["Credits", overview?.totals?.credits], ["Trophy items", overview?.totals?.trophy_items]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/[.07] bg-card/50 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-vapor">{label}</p><p className="mt-2 font-mono text-lg font-black">{value ?? "…"}</p></div>)}</div>
    {result && <div role="status" className="rounded-xl border border-green/25 bg-green/5 p-4 text-sm"><p className="font-bold text-green">{result.mode === "season" ? "New season started" : "Selected categories reset"}</p><p className="mt-1 text-xs text-vapor">{result.labels} · {result.users_reset} accounts processed.</p></div>}
    {error && !review && <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/5 p-4 text-xs text-red-300">{error}</p>}
    <form onSubmit={openReview} className="space-y-5">
      <section className="rounded-xl border border-white/10 bg-card/70 p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-black">{mode === "season" ? "Select ladders" : "Select categories"}</h3><button type="button" disabled={busy || mode === "full"} onClick={() => setSelected(selected.length === categories.length ? [] : categories.map((entry) => entry.id))} className="text-[10px] font-bold text-cyan">{selected.length === categories.length ? "Clear selection" : "Select all"}</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{categories.map((entry) => <label key={entry.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${selected.includes(entry.id) ? "border-cyan/35 bg-cyan/[0.045]" : "border-white/[.07] bg-background/30"}`}><input type="checkbox" checked={selected.includes(entry.id)} disabled={busy || loading || mode === "full"} onChange={() => setSelected((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])} className="mt-0.5 accent-cyan-400" /><span><strong className="block text-xs font-black">{entry.label}</strong><span className="mt-1.5 block text-[11px] leading-relaxed text-vapor">{entry.description}</span>{mode === "season" && <span className="mt-2 block text-[10px] font-bold text-cyan">{active.find((season) => seasonLadder(season) === entry.id)?.name || "Season 1"}</span>}</span></label>)}</div>
      </section>
      {mode === "season" && <section className="rounded-xl border border-white/10 bg-card/70 p-5"><h3 className="mb-4 text-sm font-black">New season details</h3><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["season_number", "Season number", "number"], ["season_name", "Season name", "text"], ["start_date", "Starts", "datetime-local"], ["end_date", "Ends", "datetime-local"]].map(([key, label, type]) => <label key={key} className="space-y-2 text-[10px] font-bold uppercase tracking-wide text-vapor"><span>{label}</span><input required type={type} min={type === "number" ? nextNumber : undefined} max={type === "number" ? 10000 : undefined} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} disabled={busy} className={field} /></label>)}</div>{selected.includes("ranked") && <label className="mt-4 block max-w-lg space-y-2 text-xs text-vapor"><span>Ranked starting ELO</span><select value={form.ranked_policy} onChange={(event) => setForm((current) => ({ ...current, ranked_policy: event.target.value }))} disabled={busy} className={field}><option value="soft">Soft reset: below Platinum → 0; Platinum and above → 1800</option><option value="zero">Everyone starts at 0 ELO</option></select></label>}<p className="mt-3 text-xs text-vapor">XP starts at 0 XP and level 1. Free 8s starts at 0 ELO for every game. The reset takes effect when you confirm.</p></section>}
      <section className="rounded-xl border border-white/10 bg-card/70 p-5"><label className="block text-xs font-bold"><span>Reason for the audit log</span><textarea required minLength={3} maxLength={500} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} placeholder="Why are these categories being reset?" className={`${field} mt-2 resize-none`} /></label><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-vapor">{selected.length} selected · {overview?.totals?.users ?? "…"} accounts</p><button type="submit" disabled={busy || loading || !overview || !selected.length || reason.trim().length < 3} className="inline-flex items-center gap-2 rounded-lg border border-orange/30 bg-orange/10 px-4 py-2.5 text-xs font-black text-orange disabled:opacity-40"><RotateCcw className="h-4 w-4" />Review {mode === "season" ? "new season" : "reset"}</button></div></section>
    </form>
    <Dialog open={review} onOpenChange={(open) => { if (!busy) setReview(open); }}><DialogContent className="admin-action-dialog border-white/10 bg-card text-foreground sm:max-w-lg"><DialogHeader><DialogTitle>{mode === "season" ? `Start ${form.season_name}?` : mode === "full" ? "Reset the whole website except credits?" : "Reset selected progression?"}</DialogTitle><DialogDescription>This applies to every account in the selected categories.</DialogDescription></DialogHeader><ul className="space-y-2 rounded-xl border border-white/10 bg-background/40 p-4">{choices.map((entry) => <li key={entry.id} className="flex items-center gap-2 text-xs font-bold"><Check className="h-3.5 w-3.5 text-cyan" />{entry.label}</li>)}</ul><p className="text-xs text-vapor">{mode === "season" ? "Previous ladder results are archived before the new season begins." : mode === "full" ? "All listed progression and wallet money will be cleared. Every credit balance is kept. Accounts, team membership, purchased cosmetics and match / payment histories remain available." : "Selected balances and progression are cleared. Match and payment histories remain available."}</p><label className="space-y-2 text-xs font-bold"><span>Type {phrase} to confirm</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} placeholder={phrase} className={field} /></label>{error && <p role="alert" className="text-xs text-red-300">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setReview(false)} className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold">Cancel</button><button type="button" onClick={() => void execute()} disabled={busy || confirmation !== phrase} className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "season" ? "Start season" : mode === "full" ? "Reset website · keep credits" : "Reset selected categories"}</button></div></DialogContent></Dialog>
  </div>;
}
