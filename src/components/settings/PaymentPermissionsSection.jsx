import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Coins, Loader2, Save, ShieldCheck, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

function PermissionToggle({ icon: Icon, title, description, enabled, onChange, tone }) {
  return (
    <div className="flex items-center justify-between gap-5 rounded-xl border border-white/[0.07] bg-background/35 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}><Icon className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-vapor">{description}</p>
        </div>
      </div>
      <button type="button" role="switch" aria-checked={enabled} onClick={() => onChange(!enabled)} className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${enabled ? "border-green/40 bg-green" : "border-white/10 bg-white/[0.06]"}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

export default function PaymentPermissionsSection({ user, onUserUpdate }) {
  const [tournamentCredits, setTournamentCredits] = useState(user?.allow_team_credit_payments === true);
  const [wagerWallet, setWagerWallet] = useState(user?.allow_team_wager_payments === true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTournamentCredits(user?.allow_team_credit_payments === true);
    setWagerWallet(user?.allow_team_wager_payments === true);
  }, [user?.allow_team_credit_payments, user?.allow_team_wager_payments]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.auth.updateMe({
        allow_team_credit_payments: tournamentCredits,
        allow_team_wager_payments: wagerWallet,
      });
      setSaved(true);
      await onUserUpdate?.();
      toast({ title: "Payment permissions saved", description: "Team captains can only charge the payment methods you enabled." });
      window.setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      toast({ title: "Could not save permissions", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass mb-6 overflow-hidden rounded-xl border border-white/5">
      <div className="flex items-start gap-3 border-b border-white/[0.06] px-6 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange/10 text-orange"><ShieldCheck className="h-5 w-5" /></div>
        <div>
          <h2 className="text-lg font-bold">Team Payment Permissions</h2>
          <p className="mt-1 text-xs leading-5 text-vapor">Off by default. A captain cannot charge your balance unless you allow it here.</p>
        </div>
      </div>
      <div className="space-y-3 p-6">
        <PermissionToggle icon={Coins} title="Tournament Credits" description="Allow your own tournament entry fee to be deducted when your captain registers the team." enabled={tournamentCredits} onChange={setTournamentCredits} tone="border-yellow-400/20 bg-yellow-400/10 text-yellow-300" />
        <PermissionToggle icon={Wallet} title="Wager Wallet" description="Allow your own wager entry to be secured when your captain enrolls the team." enabled={wagerWallet} onChange={setWagerWallet} tone="border-green/20 bg-green/10 text-green" />
        <div className="rounded-lg border border-cyan/15 bg-cyan/[0.05] px-4 py-3 text-[11px] leading-5 text-vapor">This never lets a captain choose an amount. Only the published entry fee can be charged, and every charge creates a notification and balance popup.</div>
        <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-2.5 text-sm font-bold text-cyan transition-colors hover:bg-cyan/20 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : saved ? "Saved" : "Save permissions"}
        </button>
      </div>
    </motion.section>
  );
}
