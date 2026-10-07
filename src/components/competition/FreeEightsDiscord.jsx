import React, { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link2, Loader2, ShieldCheck, X } from "lucide-react";
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
  const [voice, setVoice] = useState(null);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const refresh = () => base44.discord.freeEightsVoice(matchId)
      .then((data) => { if (!cancelled) setVoice(data); })
      .catch(() => { if (!cancelled) setVoice(null); });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [matchId, user?.id]);
  const statuses = Object.fromEntries((voice?.players || []).map((player) => [player.user_id, player]));
  const stale = !voice?.fresh || Date.now() - new Date(voice.checked_at).getTime() >= 20_000;
  return <section className="m-3 rounded-xl border border-purple-300/20 bg-purple-300/5 p-4 sm:m-4" aria-label="Free 8s Discord voice readiness">
    <p className="text-sm font-black text-white">Free 8s · Discord voice test</p>
    <p className="mt-1 text-xs leading-5 text-vapor">Join the 8s Waiting Room yourself. The bot moves players already connected there into Team A (Alpha) or Team B (Bravo). Missing voice players do not block this test match.</p>
    {voice?.waiting_room_url && <a href={voice.waiting_room_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-cyan underline">Open 8s Waiting Room</a>}
    {!hasFreeEightsDiscordLink(user) && <div className="mt-3"><ConnectFreeEightsDiscord returnTo={`/8s-match/${matchId}`} /></div>}
    {(!voice?.enabled || !voice?.configured || stale) && <p className="mt-2 text-xs text-orange">Voice status unavailable. The test bot may be disabled, unconfigured, or offline.</p>}
    {voice?.error && <p role="status" className="mt-2 text-xs text-orange">{voice.error}</p>}
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {players.map((player) => {
        const current = statuses[player.user_id];
        const status = !stale && current?.team === player.team ? current.status : "unavailable";
        const ready = ["in_waiting_room", "in_team_voice"].includes(status);
        return <li key={player.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs"><span className="font-bold text-white">{player.full_name || player.user_name || "Player"}</span><span className={ready ? "text-green" : "text-orange"}>{voiceLabels[status] || voiceLabels.checking}</span></li>;
      })}
    </ul>
  </section>;
}
