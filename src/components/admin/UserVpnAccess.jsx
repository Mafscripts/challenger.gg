import React, { useEffect, useState } from "react";
import { Loader2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { effectiveRoleForUser } from "@/lib/roles";

export default function UserVpnAccess({ user, actor, onUpdated }) {
  const currentAllowed = user.vpn_access_allowed === true;
  const [allowed, setAllowed] = useState(currentAllowed);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setAllowed(currentAllowed); setReason(""); setError(""); }, [user.id, currentAllowed]);
  useEffect(() => setSaved(false), [user.id]);
  if (effectiveRoleForUser(actor) !== "ceo") return null;
  const save = async () => {
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await base44.functions.invoke("setAdminUserVpnAccess", {
        user_id: user.id, allowed, expected_allowed: currentAllowed, reason: reason.trim(),
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not save VPN access.");
      onUpdated(response.data.user);
      setSaved(true);
    } catch (failure) { setError(failure.message || "Could not save VPN access."); }
    finally { setBusy(false); }
  };
  return <section className="au-security">
    <div className="au-card-heading"><h3><ShieldCheck size={15} />VPN access</h3><span className="inline-flex items-center gap-1 rounded-md border border-green/20 bg-green/5 px-2 py-1 text-[9px] font-black uppercase text-green"><LockKeyhole size={11} />CEO only</span></div>
    <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-background/30 p-4"><div><label htmlFor={`vpn-access-${user.id}`} className="cursor-pointer text-xs font-black text-white">Allow VPN for this account</label><p className="mt-1.5 max-w-xl text-[11px] leading-5 text-vapor">Skip VPN, proxy and Tor connection checks for this player. Account, email and IP bans still apply.</p></div><Switch id={`vpn-access-${user.id}`} checked={allowed} onCheckedChange={(value) => { setAllowed(value); setSaved(false); }} disabled={busy} className="shrink-0" /></div>
    <p className="mt-3 text-[11px] text-vapor">Saved setting: <strong className={currentAllowed ? "text-green" : "text-white"}>{currentAllowed ? "VPN allowed" : "Standard connection protection"}</strong></p>
    {user.is_banned && <p className="mt-2 text-xs text-orange">This account is banned. A VPN exception does not restore account access.</p>}
    <div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-[180px] flex-1"><span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-vapor">Reason for the audit log · optional</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={busy} placeholder="Why is this exception being changed?" className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2.5 text-xs outline-none focus:border-cyan/50 disabled:opacity-50" /></label><button type="button" onClick={save} disabled={busy || allowed === currentAllowed} className="inline-flex items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2.5 text-xs font-black text-cyan hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{busy ? "Saving…" : "Save VPN access"}</button></div>
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
    {saved && <p role="status" className="mt-3 text-xs text-green">VPN access updated. The player can retry their connection or sign in again.</p>}
  </section>;
}
