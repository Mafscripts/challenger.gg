import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";

export default function ConversationSafety({ playerId, messages, userId }) {
  const [open, setOpen] = useState(false), [blocked, setBlocked] = useState(false), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; setBlocked(false); setOpen(false); setReason(""); setError(""); base44.community.blocked().then(data => { if (active) setBlocked(data.user_ids.includes(playerId)); }).catch(() => {}); return () => { active = false; }; }, [playerId]);
  const latest = [...messages].reverse().find(message => message.sender_id === playerId && message.recipient_id === userId);
  const act = async action => {
    setBusy(true); setError("");
    try {
      if (action === "block") { const result = await base44.community.block(playerId, !blocked); setBlocked(result.blocked); toast({ title: result.blocked ? "Player blocked" : "Player unblocked", description: result.blocked ? "New direct messages between these accounts are blocked." : "Direct messaging is available again." }); }
      else { await base44.community.report(latest.id, reason); setReason(""); toast({ title: "Report sent", description: "Your report is available to TopFragg staff in Support." }); setOpen(false); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <><button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 text-cyan" aria-label="Report or block player"><ShieldCheck size={18} /></button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="min-w-0 [&>*]:min-w-0"><DialogHeader><DialogTitle>Conversation safety</DialogTitle><DialogDescription>Block new direct messages or report an offensive message to the TopFragg moderation team.</DialogDescription></DialogHeader><button type="button" disabled={busy} onClick={() => act("block")} className="min-h-11 rounded-lg border border-red-400/25 px-4 font-bold text-red-300">{blocked ? "Unblock player" : "Block player"}</button>{latest && <form onSubmit={event => { event.preventDefault(); void act("report"); }} className="min-w-0 space-y-3"><p className="text-sm text-vapor">Report the latest incoming message:</p><blockquote className="max-h-32 overflow-y-auto rounded-lg bg-secondary p-3 text-sm [overflow-wrap:anywhere]">{latest.content}</blockquote><label className="block text-sm">What is wrong with this message?<textarea required minLength={5} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-secondary p-3" /></label><button type="submit" disabled={busy || reason.trim().length < 5} className="min-h-11 rounded-lg bg-cyan px-4 font-bold text-background disabled:opacity-40">Send report</button></form>}{error && <p role="alert" className="text-sm text-red-300">{error}</p>}</DialogContent></Dialog></>;
}
