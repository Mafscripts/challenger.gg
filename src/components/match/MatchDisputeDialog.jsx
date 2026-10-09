import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileText, Flag, Link2, Loader2, ShieldAlert, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { matchDisputeReasons, playerDisputeReasons, validateMatchDispute } from "@/lib/matchDisputes";

const fieldClass = "w-full rounded-xl border border-white/10 bg-[#0b111b] px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan/50 focus:ring-2 focus:ring-cyan/10 disabled:opacity-50";

function DisputeForm({ match, players, userId, submitting, onSubmit, onClose }) {
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const edit = (setter, value) => { setter(value); setError(""); };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const payload = validateMatchDispute({ reason, description, reported_against: target, evidence_urls: evidence });
      setResult(await onSubmit(payload));
    } catch (failure) { setError(failure.message || "Could not submit dispute. Please try again."); }
  };
  if (result) return <div className="py-7 text-center">
    <CheckCircle2 className="mx-auto h-14 w-14 text-green" />
    <h3 className="mt-4 text-xl font-black text-white">Dispute submitted</h3>
    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">Staff have your report, evidence and match details. Follow the conversation and reply in My Tickets.</p>
    <div className="mt-6 flex justify-center gap-3"><button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-slate-300">Back to match</button><Link to="/my-tickets" className="rounded-xl bg-cyan px-5 py-3 text-xs font-black text-background">View my ticket</Link></div>
  </div>;
  return <form onSubmit={submit} className="space-y-5">
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs text-slate-400"><Users className="h-4 w-4 text-cyan" /><strong className="text-white">{match.match_type === "money8s" ? "Money 8s" : "Free 8s"}</strong><span>· #{String(match.id).slice(-8)}</span><span>· {match.game_mode_display || match.game_mode} · BO{match.best_of || 3}</span></div>
    <fieldset disabled={submitting}><legend className="mb-2 text-xs font-bold text-slate-200">What is the issue?</legend><div className="grid grid-cols-2 gap-2">{matchDisputeReasons.map((item) => <label key={item.value} className={`relative flex cursor-pointer items-start gap-2 rounded-xl border p-3 transition ${reason === item.value ? "border-orange/60 bg-orange/10" : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"}`}><input type="radio" name="dispute-reason" value={item.value} checked={reason === item.value} onChange={() => edit(setReason, item.value)} className="mt-0.5 shrink-0 accent-orange" /><span><span className="block text-xs font-bold text-white">{item.label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">{item.detail}</span></span></label>)}</div></fieldset>
    <label className="block"><span className="mb-2 block text-xs font-bold text-slate-200">Player involved {playerDisputeReasons.has(reason) ? "*" : "(optional)"}</span><select aria-label="Player involved" value={target} onChange={(event) => edit(setTarget, event.target.value)} disabled={submitting} className={fieldClass}><option value="">{playerDisputeReasons.has(reason) ? "Select a player" : "General match or team issue"}</option>{players.filter((player) => player.user_id !== userId).map((player) => <option key={player.user_id} value={player.user_id}>{player.full_name || player.user_name || player.username} · {player.team === "host" ? "Team Alpha" : "Team Bravo"}</option>)}</select></label>
    <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200"><FileText className="h-3.5 w-3.5 text-orange" /> Explain what happened *</span><textarea aria-label="Explain what happened" value={description} onChange={(event) => edit(setDescription, event.target.value)} maxLength={4000} rows={3} disabled={submitting} placeholder="Describe the issue, the player involved, and when it happened. Include clip timestamps if available." className={`${fieldClass} resize-y`} /></label>
    <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-200"><Link2 className="h-3.5 w-3.5 text-cyan" /> Evidence URLs (optional)</span><textarea aria-label="Evidence URLs" value={evidence} onChange={(event) => edit(setEvidence, event.target.value)} rows={2} disabled={submitting} placeholder="https://… (one link per line, up to 10)" className={`${fieldClass} resize-y`} /><span className="mt-1.5 block text-[10px] text-slate-400">Add clips, screenshots or other proof that staff can access.</span></label>
    {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-300">{error}</p>}
    <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xs text-[10px] leading-5 text-slate-400">Your roster, maps, score reports and match chat are attached automatically.</p><button type="submit" disabled={submitting} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange px-5 py-3 text-xs font-black text-background disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}{submitting ? "Submitting…" : "Submit dispute"}</button></div>
  </form>;
}

export default function MatchDisputeDialog({ open, onOpenChange, match, players, userId, submitting, onSubmit }) {
  return <Dialog open={open} onOpenChange={(value) => { if (!submitting) onOpenChange(value); }}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto border-white/10 bg-[#111925] p-5 text-white shadow-[0_30px_120px_rgba(0,0,0,.65)] sm:p-7" onEscapeKeyDown={(event) => { if (submitting) event.preventDefault(); }} onPointerDownOutside={(event) => { if (submitting) event.preventDefault(); }}>
    <div className="pr-7"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange/25 bg-orange/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-orange"><ShieldAlert className="h-3.5 w-3.5" /> Match support</div><DialogTitle className="text-2xl font-black">Open a dispute</DialogTitle><DialogDescription className="mt-2 text-sm leading-6 text-slate-400">Tell us what happened so staff can review the right player and evidence.</DialogDescription></div>
    {open && <DisputeForm key={match.id} match={match} players={players} userId={userId} submitting={submitting} onSubmit={onSubmit} onClose={() => onOpenChange(false)} />}
  </DialogContent></Dialog>;
}
