import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Gift, Link2, Loader2, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ReferralSection() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    base44.functions.invoke("getReferralStatus")
      .then((response) => setStatus(response.data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const copyInvite = async () => {
    if (!status?.invite_url) return;
    try {
      await navigator.clipboard.writeText(status.invite_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy your invite link:", status.invite_url);
    }
  };

  const program = status?.program;
  const referrals = Number(status?.successful_referrals || 0);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      id="referrals"
      className="glass relative overflow-hidden rounded-xl border border-green/15 p-6"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-green/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green/20"><Gift className="h-5 w-5 text-green" /></div>
          <div>
            <h2 className="font-bold text-lg">Invite players</h2>
            <p className="text-xs text-vapor">Share Topfragg and unlock a welcome reward for new players.</p>
          </div>
        </div>
        <div className="rounded-lg border border-green/20 bg-green/[0.08] px-3 py-2 text-right">
          <p className="font-mono text-lg font-black text-green">{referrals}</p>
          <p className="text-[8px] font-black uppercase tracking-wider text-vapor">Joined</p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-green" /></div>
      ) : program?.enabled ? (
        <>
          <div className="mt-5 rounded-lg border border-white/5 bg-black/15 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your invite link</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">{status.invite_url}</p>
          </div>
          <button type="button" onClick={copyInvite} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-green/25 bg-green/[0.1] px-4 py-3 text-xs font-black uppercase tracking-wider text-green transition-colors hover:bg-green/[0.18]">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Invite link copied" : "Copy invite link"}
          </button>
          <div className="mt-4 flex gap-2 text-xs leading-relaxed text-vapor">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" />
            <span>The first <strong className="text-foreground">{program.max_rewards}</strong> verified players using an invite link receive <strong className="text-green">{program.reward_credits} credits</strong> automatically.</span>
          </div>
        </>
      ) : (
        <div className="mt-5 flex gap-2 rounded-lg border border-white/5 bg-secondary/50 p-3 text-xs text-vapor"><Link2 className="h-4 w-4 shrink-0" />Invites are temporarily unavailable. Your personal code is kept ready for the next campaign.</div>
      )}
    </motion.section>
  );
}
