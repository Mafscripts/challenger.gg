import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { xpMatchAwaitingAcceptance, xpMatchDestination } from "@/lib/xpMatchAccess";

export default function XPMatchPostAction({ match, userId, onChanged }) {
  const [busy, setBusy] = useState(false);
  if (match.status === "open" && match.host_id === userId) {
    const requestStatus = match.xp_cancel_request?.status;
    const cancel = async () => {
      if (busy) return;
      setBusy(true);
      try {
        const { data } = await base44.functions.invoke(match.challenger_id ? "requestXPCancellation" : "cancelXPMatch", { xp_match_id: match.id });
        if (!data?.success) throw new Error(data?.error || "Could not cancel your XP post.");
        toast({ title: match.challenger_id ? "Cancellation requested" : "XP post cancelled",
          description: match.challenger_id ? "The opposing captain must agree before this match can be cancelled." : "Your open post has been removed." });
        await onChanged?.();
      } catch (error) {
        toast({ title: "Cancellation failed", description: error.message, variant: "destructive" });
      } finally { setBusy(false); }
    };
    return <button type="button" onClick={cancel} disabled={busy || ["pending", "declined"].includes(requestStatus)} className="site-hover min-w-44 rounded-lg border border-red-400/25 bg-red-400/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-300 disabled:opacity-50">
      {busy ? "Cancelling…" : requestStatus === "pending" ? "Request pending" : requestStatus === "declined" ? "Cancellation declined" : match.challenger_id ? "Request cancellation" : "Cancel post"}
    </button>;
  }
  if (xpMatchAwaitingAcceptance(match)) return <span className="text-xs font-bold text-vapor">Waiting for an opponent to accept</span>;
  return <Link to={xpMatchDestination(match)} className="site-hover inline-flex min-w-44 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan">Open match room</Link>;
}
