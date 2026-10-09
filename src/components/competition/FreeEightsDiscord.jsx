import React, { useEffect, useId, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, ExternalLink, Headphones, Link2, Loader2, Mic, MicOff, ShieldCheck, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { topfraggDiscordInviteUrl } from "@/lib/discordCommunity";
import { freeEightsVoiceChannelName } from "@/lib/freeEightsRoomIdentity";
import BadgeTooltip from "@/components/ui/BadgeTooltip";

export const hasFreeEightsDiscordLink = (user) => /^\d{17,20}$/.test(String(user?.discord_user_id || "")) && Boolean(user?.discord_connected_at);
export const isFreeEightsDiscordRequired = (result) => result?.code === "FREE_EIGHTS_DISCORD_REQUIRED"
  || result?.data?.code === "FREE_EIGHTS_DISCORD_REQUIRED"
  || (result?.error || result?.message) === "Connect Discord to join Free 8s";

const voiceLabels = {
  not_linked: "Discord Not Linked",
  not_in_waiting_room: "Join 8s Waiting Room",
  in_waiting_room: "In Waiting Room",
  in_team_voice: "Team Voice",
  move_failed: "Voice move failed · bot will retry",
};

export function FreeEightsVoiceBadge({ status = "unknown", waitingRoomUrl }) {
  const tooltipId = useId();
  if (!voiceLabels[status]) return <span className="inline-flex min-h-8 items-center text-xs text-vapor/45" aria-label="Discord voice">&mdash;</span>;
  const ready = ["in_waiting_room", "in_team_voice"].includes(status);
  const StatusIcon = ready ? CheckCircle2 : status === "not_linked" ? Link2 : status === "move_failed" ? AlertTriangle : status === "not_in_waiting_room" ? Headphones : MicOff;
  const badgeStyle = status === "in_waiting_room" ? "border-green/20 bg-green/[0.08] text-green"
    : status === "in_team_voice" ? "border-cyan/20 bg-cyan/[0.08] text-cyan"
    : ["not_in_waiting_room", "not_linked", "move_failed"].includes(status) ? "border-orange/20 bg-orange/[0.08] text-orange"
    : "border-white/[0.08] bg-white/[0.03] text-vapor";
  const label = voiceLabels[status];
  const description = {
    not_linked: "Link your Discord account to join Free 8s.",
    not_in_waiting_room: "Open the 8s Waiting Room in Discord.",
    in_waiting_room: "Connected to the 8s Waiting Room and ready to play.",
    in_team_voice: "Connected to your assigned team voice channel.",
    move_failed: "The bot will retry moving you into team voice.",
  }[status];
  const canJoin = status === "not_in_waiting_room" && Boolean(waitingRoomUrl);
  const Badge = canJoin ? "a" : "span";
  const toneClass = badgeStyle.split(" ").find((token) => token.startsWith("text-")) || "text-white";
  return <Badge {...(canJoin ? { href: waitingRoomUrl, target: "_blank", rel: "noopener noreferrer" } : { tabIndex: 0 })} aria-describedby={tooltipId} className={`group/badge relative inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${badgeStyle} ${canJoin ? "transition-colors hover:border-orange/50 hover:bg-orange/15" : "cursor-default"}`}><StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{label}</span>{canJoin && <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />}<BadgeTooltip id={tooltipId} label={status === "not_in_waiting_room" ? "8s Waiting Room" : label} description={description} icon={StatusIcon} toneClass={toneClass} /></Badge>;
}

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
            <li>Connect Discord securely. If you are not a member, you will go directly to the Topfragg server invitation. Join using your linked Discord account, then return here and accept the match.</li>
            <li>Use the lobby’s join button to enter its private <span className="font-bold text-white">8s Waiting Room</span>.</li>
            <li>Once both team channels are ready, the bot moves players connected to the waiting room into their assigned team voice.</li>
          </ol>
        </div>
        <p className="mt-4 text-xs leading-5 text-vapor"><span className="font-bold text-white">You must link Discord and join the Topfragg server to create or join Free 8s.</span> All eight players must be in the Waiting Room before maps are generated.</p>
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

export function FreeEightsDiscordServerDialog({ result, onOpenChange, returnFocusTo }) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const joinLink = useRef(null);
  const opener = useRef(null);
  useEffect(() => { setMessage(""); }, [result]);
  const check = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const status = await base44.discord.membership();
      if (status.success && status.in_guild) {
        onOpenChange(false);
      } else setMessage(status.error || "Join the server with your linked Discord account, then check again.");
    } catch { setMessage("Discord membership could not be checked. Please try again shortly."); }
    finally { setChecking(false); }
  };
  return <Dialog open={Boolean(result)} onOpenChange={onOpenChange}>
    <DialogPortal>
      <DialogOverlay className="z-[110] bg-black/70 backdrop-blur-sm" />
      <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-purple-400/25 bg-card p-6 shadow-[0_24px_80px_rgba(0,0,0,.6)] sm:p-7"
        onOpenAutoFocus={(event) => { opener.current = document.activeElement; event.preventDefault(); joinLink.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); const target = returnFocusTo?.current || opener.current; if (target?.isConnected) target.focus(); }}>
        <DialogClose asChild><button type="button" aria-label="Close Discord server popup" className="absolute right-4 top-4 rounded-lg p-1.5 text-vapor hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button></DialogClose>
        <DialogTitle className="pr-5 text-2xl font-black text-white">Join the Topfragg Discord</DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-vapor">Free 8s requires server membership as well as a linked Discord account. Join with the same account you linked to Topfragg, then return here and check your membership.</DialogDescription>
        <p className="mt-4 text-xs leading-5 text-vapor">Once membership is confirmed, accept or create the lobby again. Join the 8s Waiting Room before the match starts.</p>
        <p role="status" className="mt-4 text-xs leading-5 text-purple-200">{message || result?.error}</p>
        <div className="mt-6 flex flex-col gap-2">
          <a ref={joinLink} href={result?.action_url || topfraggDiscordInviteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-5 py-3 text-xs font-black text-white hover:bg-[#4752C4]">Join Topfragg Discord <ExternalLink className="h-4 w-4" /></a>
          <button type="button" onClick={check} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{checking && <Loader2 className="h-4 w-4 animate-spin" />}{checking ? "Checking membership…" : "I’ve joined — check again"}</button>
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  </Dialog>;
}

export function FreeEightsDiscordNotice({ user, returnTo = "/ranked/8s" }) {
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
    <p className="mt-1 text-xs leading-5 text-vapor">{linked ? "Each lobby gets a private 8s Waiting Room for its eight players. Create or join a lobby, then use its join button. All eight players must be there before maps are generated and the bot moves you into team voice." : "Link your Discord account and join the Topfragg server before creating or joining a Free 8s lobby."}</p>
    {callbackError && <p role="alert" className="mt-2 text-xs text-orange">{callbackError}</p>}
    {!linked && <div className="mt-3"><ConnectFreeEightsDiscord returnTo={returnTo} /></div>}
    {linked && <a href={topfraggDiscordInviteUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-purple-200">Join Topfragg Discord <ExternalLink className="h-3.5 w-3.5" /></a>}
  </div>;
}

export function FreeEightsVoiceStatus({ matchId, user, waitingForMaps = false, voiceView }) {
  const { voice, hasConfirmedStatus, displayReadyCount } = voiceView;
  const summary = waitingForMaps ? "Join this lobby’s Waiting Room. Maps and the timer start once all eight players are connected." : null;
  return <section className="relative m-3 overflow-hidden rounded-2xl border border-purple-400/20 bg-[#171b26] shadow-[0_8px_30px_rgba(0,0,0,.12)] sm:m-4" aria-label="Free 8s Discord voice readiness">
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/60 to-transparent" />
    <div className="relative flex flex-col gap-4 bg-gradient-to-r from-[#5865F2]/[0.09] via-transparent to-transparent p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/15 text-purple-200"><Headphones className="h-5 w-5" aria-hidden="true" /></div>
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-sm font-black text-white sm:text-base">Discord team voice</h3>
            <span className="rounded-md border border-purple-400/20 bg-purple-400/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-purple-200">Free 8s · Test</span>
            {hasConfirmedStatus && <span role="status" className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${displayReadyCount === 8 ? "text-green" : "text-vapor"}`}><Mic className="h-3.5 w-3.5" aria-hidden="true" />{displayReadyCount}/8 voice ready</span>}
          </div>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-vapor">This lobby has its own private Waiting Room for eight players. Join it before maps are generated; the bot then moves you into your team’s private voice channel.</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-5">
            <span className="text-vapor">Your Discord room:</span>
            <span className="font-mono font-black text-cyan">{freeEightsVoiceChannelName(matchId, "waiting")}</span>
          </p>
        </div>
      </div>
      <div className="min-h-[42px] shrink-0">
        {!hasFreeEightsDiscordLink(user) ? <ConnectFreeEightsDiscord returnTo={`/8s-match/${matchId}`} /> : voice?.waiting_room_url ? <a href={voice.waiting_room_url} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#5865F2] px-4 py-3 text-[11px] font-black text-white shadow-[0_4px_16px_rgba(88,101,242,.2)] transition hover:bg-[#4752C4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-card lg:w-auto"><Headphones className="h-4 w-4" aria-hidden="true" />Join 8s Waiting Room<ExternalLink className="ml-1 h-3.5 w-3.5 opacity-75" aria-hidden="true" /></a> : <button type="button" disabled className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] font-black text-vapor lg:w-auto"><Headphones className="h-4 w-4" aria-hidden="true" />Join 8s Waiting Room<ExternalLink className="ml-1 h-3.5 w-3.5 opacity-75" aria-hidden="true" /></button>}
      </div>
    </div>
    {summary && <div className="border-t border-white/[0.06] bg-black/[0.12] p-4 sm:px-5">
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs leading-5 text-vapor">
        <Headphones className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="line-clamp-2 min-w-0" title={summary}>{summary}</p>
      </div>
    </div>}
  </section>;
}
