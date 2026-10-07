import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

export const hasFreeEightsDiscordLink = (user) => /^\d{17,20}$/.test(String(user?.discord_user_id || "")) && Boolean(user?.discord_connected_at);

const voiceLabels = {
  checking: "Checking voice…",
  unavailable: "Voice status unavailable",
  not_linked: "Discord not linked",
  not_in_waiting_room: "Join the 8s Waiting Room",
  in_waiting_room: "Ready · in Waiting Room",
  in_team_voice: "Ready · in team voice",
  move_failed: "Voice move failed · bot will retry",
};

export function ConnectFreeEightsDiscord({ returnTo = "/ranked/8s" }) {
  const [connecting, setConnecting] = useState(false);
  const connect = async () => {
    setConnecting(true);
    try {
      const result = await base44.discord.connect(returnTo);
      window.location.assign(result.authorization_url);
    } catch (error) {
      toast({ title: "Discord connection unavailable", description: error.message, variant: "destructive" });
      setConnecting(false);
    }
  };
  return <button type="button" onClick={connect} disabled={connecting} className="rounded-lg border border-purple-300/30 bg-purple-300/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-purple-200 disabled:opacity-50">{connecting ? "Connecting…" : "Connect Discord to join Free 8s"}</button>;
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
