import React, { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, ExternalLink, Headphones, Link2, Loader2, Mic, MicOff, ShieldCheck, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const hasFreeEightsDiscordLink = (user) => /^\d{17,20}$/.test(String(user?.discord_user_id || "")) && Boolean(user?.discord_connected_at);
export const isFreeEightsDiscordRequired = (result) => result?.code === "FREE_EIGHTS_DISCORD_REQUIRED"
  || result?.data?.code === "FREE_EIGHTS_DISCORD_REQUIRED"
  || (result?.error || result?.message) === "Connect Discord to join Free 8s";

const voiceLabels = {
  checking: "Checking voice…",
  unavailable: "Voice status unavailable",
  not_linked: "Discord not linked",
  not_in_waiting_room: "Join the 8s Waiting Room",
  in_waiting_room: "Ready · in Waiting Room",
  in_team_voice: "Ready · in team voice",
  move_failed: "Voice move failed · bot will retry",
};

export function FreeEightsDiscordDialog({ open, onOpenChange, returnTo = "/ranked/8s", trigger, returnFocusTo }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const connectButton = useRef(null);
  const opener = useRef(null);
  useEffect(() => { if (open) setError(""); }, [open]);
  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    setError("");
    try {
      const result = await base44.discord.connect(returnTo);
      window.location.assign(result.authorization_url);
    } catch (error) {
      setError(error.message || "Discord could not be connected. Please try again.");
      setConnecting(false);
    }
  };
  return <Dialog open={open} onOpenChange={(value) => { if (value) setError(""); onOpenChange?.(value); }}>
    {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
    <DialogPortal>
      <DialogOverlay className="z-[110] bg-black/70 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className="fixed left-1/2 top-1/2 z-[120] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-purple-400/25 bg-card p-6 text-foreground shadow-[0_24px_80px_rgba(0,0,0,.6)] sm:p-7"
        onOpenAutoFocus={(event) => { opener.current = document.activeElement; event.preventDefault(); connectButton.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); const target = returnFocusTo?.current || opener.current; if (target?.isConnected) target.focus(); }}
      >
        <DialogClose asChild><button type="button" aria-label="Close Discord connection popup" className="absolute right-4 top-4 rounded-lg p-1.5 text-vapor transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"><X className="h-5 w-5" /></button></DialogClose>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-400/15 text-purple-300"><ShieldCheck className="h-6 w-6" /></div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-purple-300">Free 8s · Discord connection</p>
        <DialogTitle className="pr-5 text-2xl font-black leading-tight text-white">Connect Discord to join Free 8s</DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-vapor">Discord linking is required so Topfragg can identify you and move you into your team’s voice channel when teams are ready.</DialogDescription>
        <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/20 p-4">
          <p className="text-xs font-bold text-white">What happens next?</p>
          <ol className="mt-2 list-decimal space-y-2 pl-4 text-xs leading-5 text-vapor">
            <li>Connect Discord securely, then return here and accept the match.</li>
            <li>Join the <span className="font-bold text-white">8s Waiting Room</span> yourself.</li>
            <li>Once both team channels are ready, the bot moves players connected to the waiting room into their assigned team voice.</li>
          </ol>
        </div>
        <p className="mt-4 text-xs leading-5 text-vapor"><span className="font-bold text-white">Without linking, you cannot create or join Free 8s.</span> You can close this popup and connect later. During this voice test, missing voice players do not cancel the match.</p>
        <p className="mt-3 text-[11px] leading-5 text-vapor">Discord asks you to approve access to your basic profile. Your Discord password is never shared with Topfragg.</p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-orange/25 bg-orange/5 px-3 py-2 text-xs leading-5 text-orange">{error}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button ref={connectButton} type="button" onClick={connect} disabled={connecting} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-5 py-3 text-xs font-black text-white transition hover:bg-[#4752C4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-60">{connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}{connecting ? "Connecting…" : "Connect Discord"}</button>
          <DialogClose asChild><button type="button" className="rounded-xl border border-white/10 px-5 py-3 text-xs font-bold text-vapor transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400">Not now</button></DialogClose>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}

export function ConnectFreeEightsDiscord({ returnTo = "/ranked/8s" }) {
  return <FreeEightsDiscordDialog returnTo={returnTo} trigger={<button type="button" className="rounded-lg border border-purple-300/30 bg-purple-300/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-purple-200">Connect Discord to join Free 8s</button>} />;
}

export function FreeEightsDiscordNotice({ user, returnTo = "/ranked/8s" }) {
  const [voice, setVoice] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    base44.discord.freeEightsVoice().then((data) => { if (!cancelled) setVoice(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id]);
  const linked = hasFreeEightsDiscordLink(user);
  const callbackStatus = new URLSearchParams(window.location.search).get("discord");
  const callbackError = {
    cancelled: "Discord connection was cancelled. Connect again to join.",
    invalid: "Discord connection expired or could not be verified. Connect again.",
    "already-linked": "That Discord account is linked to another Topfragg account.",
    "active-free-8s": "Finish or leave your Free 8s lobby before changing Discord accounts.",
    error: "Discord could not be connected. Please try again.",
  }[callbackStatus];
  return <div className="my-4 rounded-xl border border-purple-300/20 bg-purple-300/5 p-4">
    <p className="text-sm font-bold text-white">{linked ? "Discord connected · Free 8s voice test" : "Connect Discord to join Free 8s"}</p>
    <p className="mt-1 text-xs leading-5 text-vapor">{linked ? "Join the 8s Waiting Room in Discord. When teams are generated, the bot moves connected players to their team voice channel." : "Link your Discord account before creating or joining a Free 8s lobby."}</p>
    {callbackError && <p role="alert" className="mt-2 text-xs text-orange">{callbackError}</p>}
    <div className="mt-3">{!linked ? <ConnectFreeEightsDiscord returnTo={returnTo} /> : voice?.waiting_room_url ? <a href={voice.waiting_room_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-cyan underline">Open 8s Waiting Room</a> : <p className="text-xs text-vapor">The Discord waiting room has not been configured yet.</p>}</div>
  </div>;
}

export function FreeEightsVoiceStatus({ matchId, players, user }) {
  const [voiceResult, setVoiceResult] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const refresh = () => base44.discord.freeEightsVoice(matchId)
      .then((data) => { if (!cancelled) setVoiceResult({ matchId, userId: user.id, data }); })
      .catch(() => { if (!cancelled) setVoiceResult({ matchId, userId: user.id, data: null }); });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [matchId, user?.id]);
  const checking = !voiceResult || voiceResult.matchId !== matchId || voiceResult.userId !== user?.id;
  const voice = checking ? null : voiceResult.data;
  const statuses = Object.fromEntries((voice?.players || []).map((player) => [player.user_id, player]));
  const stale = !voice?.fresh || Date.now() - new Date(voice.checked_at).getTime() >= 20_000;
  const available = voice?.enabled && voice?.configured && !stale;
  const playerStates = players.map((player) => {
    const current = statuses[player.user_id];
    const status = checking ? "checking" : available && current?.team === player.team ? current.status : "unavailable";
    return { ...player, status, ready: ["in_waiting_room", "in_team_voice"].includes(status) };
  });
  const readyCount = playerStates.filter((player) => player.ready).length;
  const warning = !checking && (!available || Boolean(voice?.error));
  const summary = checking ? "Checking Discord voice status…"
    : voice?.error || (!available ? "Voice status unavailable. The bot may be offline or voice setup may be incomplete."
      : "Discord voice status is up to date.");
  const SummaryIcon = checking ? Loader2 : warning ? AlertTriangle : CheckCircle2;
  return <section className="relative m-3 overflow-hidden rounded-2xl border border-purple-400/20 bg-[#171b26] shadow-[0_8px_30px_rgba(0,0,0,.12)] sm:m-4" aria-label="Free 8s Discord voice readiness">
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/60 to-transparent" />
    <div className="relative flex flex-col gap-4 bg-gradient-to-r from-[#5865F2]/[0.09] via-transparent to-transparent p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/15 text-purple-200"><Headphones className="h-5 w-5" aria-hidden="true" /></div>
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-sm font-black text-white sm:text-base">Discord team voice</h3>
            <span className="rounded-md border border-purple-400/20 bg-purple-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-purple-200">Free 8s · Test</span>
          </div>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-vapor">Join the waiting room. When teams are ready, the bot moves you into your team’s private voice channel.</p>
        </div>
      </div>
      <div className="min-h-[42px] shrink-0">
        {!hasFreeEightsDiscordLink(user) ? <ConnectFreeEightsDiscord returnTo={`/8s-match/${matchId}`} /> : voice?.waiting_room_url ? <a href={voice.waiting_room_url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#5865F2] px-4 py-3 text-[11px] font-black text-white shadow-[0_4px_16px_rgba(88,101,242,.2)] transition hover:bg-[#4752C4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-card lg:w-auto"><Headphones className="h-4 w-4" aria-hidden="true" />Join 8s Waiting Room<ExternalLink className="ml-1 h-3.5 w-3.5 opacity-75" aria-hidden="true" /></a> : <button type="button" disabled className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] font-black text-vapor lg:w-auto"><Headphones className="h-4 w-4" aria-hidden="true" />Join 8s Waiting Room<ExternalLink className="ml-1 h-3.5 w-3.5 opacity-75" aria-hidden="true" /></button>}
      </div>
    </div>
    <div className="border-t border-white/[0.06] bg-black/[0.12] p-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">Player voice status</p>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${available && readyCount === players.length ? "text-green" : "text-vapor"}`}><Mic className="h-3.5 w-3.5" aria-hidden="true" />{available ? `${readyCount}/${players.length} voice ready` : checking ? "Checking voice…" : "Status unavailable"}</span>
      </div>
      <div role="status" className={`mb-3 flex h-16 items-center gap-2 rounded-xl border px-3 text-xs leading-5 sm:h-11 ${warning ? "border-orange/20 bg-orange/5 text-orange" : "border-white/[0.06] bg-white/[0.025] text-vapor"}`}>
        <SummaryIcon className={`h-4 w-4 shrink-0 ${checking ? "animate-spin" : available && !warning ? "text-green" : ""}`} aria-hidden="true" />
        <p className="line-clamp-2 min-w-0" title={summary}>{summary}</p>
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {playerStates.map((player) => {
          const name = player.full_name || player.user_name || "Player";
          const unavailable = ["unavailable", "checking"].includes(player.status);
          const StatusIcon = player.status === "checking" ? Loader2 : player.ready ? CheckCircle2 : player.status === "not_linked" ? Link2 : player.status === "move_failed" ? AlertTriangle : MicOff;
          const badgeStyle = player.ready ? "border-green/20 bg-green/[0.08] text-green" : unavailable ? "border-white/[0.08] bg-white/[0.03] text-vapor" : "border-orange/20 bg-orange/[0.08] text-orange";
          return <li key={player.user_id} className="flex flex-col items-start justify-between gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 w-full items-center gap-2.5 sm:w-auto sm:flex-1"><span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-purple-300/10 bg-purple-300/[0.08] text-xs font-black text-purple-200">{name.slice(0, 1).toUpperCase()}</span><span className="min-w-0 break-words text-xs font-bold text-white">{name}</span></div>
            <span title={voiceLabels[player.status] || voiceLabels.checking} className={`inline-flex h-8 w-full shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold sm:w-[220px] ${badgeStyle}`}><StatusIcon className={`h-3.5 w-3.5 shrink-0 ${player.status === "checking" ? "animate-spin" : ""}`} aria-hidden="true" /><span className="truncate">{voiceLabels[player.status] || voiceLabels.checking}</span></span>
          </li>;
        })}
      </ul>
      <p className="mt-3 text-[10px] leading-5 text-vapor">Join Discord voice yourself before you can be moved. Missing voice players do not block this test match.</p>
    </div>
  </section>;
}
