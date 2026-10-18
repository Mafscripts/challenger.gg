import React, { useState } from "react";
import { Loader2, UserMinus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export default function RemoveFreeEightsPlayerDialog({ player, busy, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const name = player.full_name || player.user_name || player.username || "this player";
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    try { await onSubmit(reason); }
    catch (failure) { setError(failure.message || "Could not remove this player. Try again."); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-lg border-white/10 bg-card text-white" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-400"><UserMinus className="h-5 w-5" /></span>
        <div className="min-w-0 pr-5"><DialogTitle className="text-xl font-black">Remove player</DialogTitle><DialogDescription className="mt-2 break-words text-sm leading-6 text-vapor">Remove <strong className="text-white">{name}</strong> from this Free 8s lobby?</DialogDescription></div>
      </div>
      <div className="rounded-xl border border-cyan/20 bg-cyan/[0.04] p-4 text-xs leading-5 text-vapor">
        <p className="font-bold text-white">This match room stays open.</p>
        <p className="mt-1">Everyone else keeps their place. The lobby waits for a replacement, then team selection starts again. Any captain draft and votes are reset.</p>
        <p className="mt-2">This player cannot rejoin this specific lobby. They can still play in other lobbies. No win, loss or ELO change is awarded.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div><label htmlFor="free-eights-remove-reason" className="text-[10px] font-black uppercase tracking-wider text-vapor">Reason · optional</label>
          <textarea id="free-eights-remove-reason" value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }} maxLength={500} rows={3} disabled={busy} placeholder="For example: AFK or not joining Discord voice…" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[var(--arena-inset)] px-3.5 py-3 text-sm text-white outline-none placeholder:text-vapor/60 focus:border-cyan/50 disabled:opacity-50" />
          <p className="mt-1 text-[11px] leading-5 text-vapor">The player receives the reason. This action is saved in the audit log.</p>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs leading-5 text-red-300">{error}</p>}
        <footer className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold text-vapor hover:bg-white/5 disabled:opacity-40">Keep player</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-red-500/35 bg-red-500/15 px-4 py-2.5 text-xs font-black text-red-400 hover:bg-red-500/25 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}{busy ? "Removing…" : "Remove player"}</button>
        </footer>
      </form>
    </DialogContent>
  </Dialog>;
}
