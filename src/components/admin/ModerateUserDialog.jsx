import React, { useState } from "react";
import { Ban, Loader2, ShieldAlert, UserCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const actions = {
  warning: { title: "Warn player", submit: "Send warning", description: "Send a formal warning and record the reason in the moderation history." },
  suspension: { title: "Suspend account", submit: "Suspend account", description: "Temporarily restrict this player's access to Topfragg." },
  temporary_ban: { title: "Temporary account ban", submit: "Apply temporary ban", description: "Block this account until the selected ban duration expires." },
  ban: { title: "Permanent account ban", submit: "Ban account permanently", description: "Permanently block this account. A staff member must remove the ban to restore access." },
  email_ban: { title: "Permanent email ban", submit: "Apply email ban", description: "Permanently block this account and its email address." },
  ip_ban: { title: "Permanent IP ban", submit: "Apply permanent IP ban", description: "Permanently block this account and all of its recorded public IP addresses." },
  remove_ban: { title: "Remove account ban", submit: "Remove ban", description: "Remove this player's active account bans and suspension. Record why access is being restored." },
};
const durations = { "24h": "24 hours", "3d": "3 days", "7d": "7 days", "14d": "14 days", "30d": "30 days" };

export default function ModerateUserDialog({ request, busy, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const { user, action, duration, sharedAccounts = 0 } = request;
  const config = actions[action];
  const name = user.display_name || user.full_name || user.username || user.email;
  const restoring = action === "remove_ban";
  const Icon = restoring ? UserCheck : action === "warning" ? ShieldAlert : Ban;
  const durationLabel = ["suspension", "temporary_ban"].includes(action) ? durations[duration] || duration
    : action === "warning" ? "Warning only" : restoring ? "Access restored" : "Permanent";
  const submit = async (event) => {
    event.preventDefault();
    if (busy || reason.trim().length < 5 || reason.trim().length > 2000) return;
    setError("");
    try { await onSubmit(reason.trim()); }
    catch (failure) { setError(failure.message || "Could not save the moderation action. Please try again."); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] max-w-[560px] gap-0 overflow-y-auto p-0">
      <header className="border-b border-white/10 bg-background/30 p-5 pr-12 sm:p-6 sm:pr-12">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-vapor">Account moderation</p>
        <DialogTitle className="flex items-center gap-3 text-xl"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${restoring ? "border-green/25 bg-green/10 text-green" : "border-red-500/25 bg-red-500/10 text-[#ff3b3b]"}`}><Icon className="h-5 w-5" /></span>{config.title}</DialogTitle>
        <DialogDescription className="mt-3 text-xs leading-6">{config.description}</DialogDescription>
      </header>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/30 p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan/20 bg-cyan/5 text-sm font-black text-cyan">{name?.charAt(0).toUpperCase()}</span><div className="min-w-0"><p className="break-words text-sm font-black">{name}</p><p className="mt-1 break-all text-xs text-vapor">{user.email}</p></div><span className={`ml-auto shrink-0 rounded-md border px-2 py-1 text-[10px] font-black ${restoring ? "border-green/20 text-green" : "border-red-500/25 text-red-400"}`}>{durationLabel}</span></div>
        {action === "ip_ban" && <section className="rounded-xl border border-white/10 bg-background/30 p-4"><h3 className="text-[10px] font-black uppercase tracking-wider text-vapor">IP addresses to block</h3><div className="mt-3 flex flex-wrap gap-2">{(user.moderation_ips || []).map((ip) => <code key={ip} className="rounded-md border border-white/10 px-2 py-1 text-xs">{ip}</code>)}</div>
          {sharedAccounts > 0 && <p className="mt-3 text-xs leading-5 text-orange">{sharedAccounts} other {sharedAccounts === 1 ? "account shares" : "accounts share"} these addresses and may also lose access.</p>}
        </section>}
        <div><label htmlFor="moderation-reason" className="mb-2 block text-[10px] font-black uppercase tracking-wider text-vapor">{restoring ? "Reason for removing the ban" : action === "warning" ? "Warning reason" : "Reason shown to the player"} <span className="text-red-400">*</span></label>
          <textarea id="moderation-reason" value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} minLength={5} maxLength={2000} required rows={4} autoFocus placeholder={restoring ? "Explain why the ban is being removed…" : "Explain clearly why this moderation action is being taken…"} className="w-full resize-y rounded-xl border border-white/10 bg-background/60 px-4 py-3 text-sm leading-6 outline-none focus:border-cyan/50 focus:ring-2 focus:ring-cyan/10 disabled:opacity-50" />
          <div className="mt-2 flex items-start justify-between gap-4 text-[11px] text-vapor"><p className="leading-5">{restoring ? "Saved in the moderation history and audit log." : "This explanation is saved with the action and shown to the player. Minimum 5 characters."}</p><span className="shrink-0">{reason.length}/2,000</span></div>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs leading-5 text-red-300">{error}</p>}
        <footer className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold text-vapor hover:bg-white/5 disabled:opacity-40">Cancel</button><button type="submit" disabled={busy || reason.trim().length < 5 || reason.trim().length > 2000} className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${restoring ? "border-green/30 bg-green/10 text-green hover:bg-green/20" : "border-red-500/35 bg-red-500/15 text-[#ff3b3b] hover:bg-red-500/25"}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{busy ? "Saving…" : config.submit}</button></footer>
      </form>
    </DialogContent>
  </Dialog>;
}
