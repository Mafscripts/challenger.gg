import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, Radio, RefreshCw, Twitch, Unlink, Youtube } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const providers = [
  { id: "twitch", name: "Twitch", icon: Twitch, tone: "text-[#bf94ff]", background: "bg-[#9146FF]/10" },
  { id: "youtube", name: "YouTube", icon: Youtube, tone: "text-red-400", background: "bg-red-500/10" },
  { id: "kick", name: "Kick", icon: Radio, tone: "text-green-400", background: "bg-green-500/10" },
];
const connectionApi = provider => provider === "twitch" ? base44.twitch : {
  connect: () => base44.streamAccounts.connect(provider),
  disconnect: () => base44.streamAccounts.disconnect(provider),
};
const twitchIdentityFor = user => user?.twitch_user_id ? {
  id: user.twitch_user_id, login: user.twitch_login, display_name: user.twitch_display_name || user.twitch_login,
} : null;
const callbackMessages = {
  connected: "Account connected. Your verified channel is now shown on TopFragg.",
  cancelled: "Connection cancelled. You can try again whenever you are ready.",
  invalid: "This connection request expired. Please use the Connect button again.",
  "already-linked": "This channel is already connected to another TopFragg account.",
  "no-channel": "No channel was found on that account. Create your channel, then reconnect.",
  "not-configured": "Account connections still need administrator setup for this provider.",
  error: "The account could not be connected. Please try again.",
};

export default function StreamConnectionsSection({ user, onUserUpdate }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const loadStatus = useCallback(async () => {
    setLoading(true); setStatusError(false);
    // Each provider group can still load when the other service is unavailable.
    const [streams, twitch] = await Promise.allSettled([
      Promise.resolve().then(() => base44.streamAccounts.status()),
      Promise.resolve().then(() => base44.twitch.status()),
    ]);
    setStatus(streams.status === "fulfilled" || twitch.status === "fulfilled" ? {
      ...(streams.status === "fulfilled" ? streams.value : {}),
      ...(twitch.status === "fulfilled" ? { twitch: twitch.value } : {}),
    } : null);
    const failed = streams.status === "rejected" || twitch.status === "rejected";
    setStatusError(failed);
    if (failed) setResult({ success: false, message: "Some connection statuses could not be loaded. Please retry." });
    else setResult(current => current?.message === "Some connection statuses could not be loaded. Please retry." ? null : current);
    setLoading(false);
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const twitchOutcome = params.get("twitch");
    if (callbackMessages[twitchOutcome]) {
      setResult({ success: twitchOutcome === "connected", message: twitchOutcome === "connected" ? "Twitch connected. Your channel is now linked to TopFragg." : `Twitch: ${callbackMessages[twitchOutcome]}` });
      params.delete("twitch");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
      void onUserUpdate();
      return;
    }
    const provider = params.get("stream_provider"), outcome = params.get("stream_status");
    if (!providers.some(item => item.id === provider) || !callbackMessages[outcome]) return;
    setResult({ success: outcome === "connected", message: `${providers.find(item => item.id === provider).name}: ${callbackMessages[outcome]}` });
    params.delete("stream_provider"); params.delete("stream_status");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    if (outcome === "connected") void onUserUpdate();
  }, [onUserUpdate]);

  const connect = async provider => {
    setBusy(provider); setResult(null);
    try {
      const response = await connectionApi(provider).connect();
      window.location.assign(response.authorization_url);
    } catch (error) { setResult({ success: false, message: error.message || "Connection is unavailable." }); setBusy(null); }
  };
  const disconnect = async () => {
    const provider = disconnecting;
    setDisconnecting(null); setBusy(provider); setResult(null);
    try {
      await connectionApi(provider).disconnect();
      await onUserUpdate(); await loadStatus();
      setResult({ success: true, message: `${providers.find(item => item.id === provider).name} account disconnected.${provider === "twitch" ? " Twitch live alerts are disabled." : ""}` });
    } catch (error) { setResult({ success: false, message: error.message || "Could not disconnect this account." }); }
    finally { setBusy(null); }
  };

  return <section className="glass mb-6 rounded-xl border border-white/5 p-5 sm:p-6">
    <div className="mb-5 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-cyan"><Radio className="h-5 w-5" /></span>
      <div><h2 className="text-lg font-bold">Streaming accounts</h2><p className="mt-1 text-xs leading-5 text-vapor">Connect Twitch, YouTube or Kick to verify your streaming channel. Manage all your streaming accounts in one place.</p></div>
    </div>
    <div className="stream-connections-grid grid gap-4 xl:grid-cols-3">
      {providers.map(({ id, name, icon: Icon, tone, background }) => {
        const identity = status?.[id]?.identity || (id === "twitch" ? twitchIdentityFor(user) : user?.stream_connections?.[id]);
        const connected = status?.[id]?.connected ?? Boolean(identity?.id);
        const configured = status?.[id]?.configured;
        const channelUrl = id === "twitch" ? (identity?.login ? `https://www.twitch.tv/${encodeURIComponent(identity.login)}` : "") : identity?.url;
        return <div key={id} className="flex flex-col rounded-xl border border-white/[0.08] bg-background/30 p-4">
          <div className="mb-4 flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone} ${background}`}><Icon className="h-5 w-5" /></span><h3 className="font-bold">{name}</h3><span className={`ml-auto rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${connected ? "border-green/20 bg-green/10 text-green" : "border-white/10 text-vapor"}`}>{connected ? "Connected" : "Not connected"}</span></div>
          {connected ? <div className="mb-4 min-w-0"><p className="truncate text-sm font-semibold">{identity?.display_name || `${name} channel`}</p>{channelUrl && <a href={channelUrl} target="_blank" rel="noopener noreferrer" className={`mt-1 inline-flex max-w-full items-center gap-1.5 text-xs ${tone}`}><span className="truncate">View channel</span><ExternalLink className="h-3 w-3 shrink-0" /></a>}</div>
            : <p className="mb-4 text-xs leading-5 text-vapor">{configured === false ? "An administrator needs to finish setting up this connection." : `Connect your ${name} account through its official sign-in screen.`}</p>}
          <button type="button" onClick={() => connected ? setDisconnecting(id) : connect(id)} disabled={Boolean(busy) || loading || (!connected && configured === false)} className={`mt-auto inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 ${connected ? "border-white/10 text-vapor hover:border-red-400/30 hover:text-red-300" : `border-white/10 ${background} ${tone} hover:border-cyan/25`}`}>
            {busy === id ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <Unlink className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}{connected ? `Disconnect ${name}` : `Connect ${name}`}
          </button>
        </div>;
      })}
    </div>
    {Boolean(status?.twitch?.connected ?? user?.twitch_user_id) && <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#9146FF]/20 bg-[#9146FF]/[0.06] p-3 text-xs leading-5 text-vapor"><Twitch className="mt-0.5 h-4 w-4 shrink-0 text-[#bf94ff]" /><p><strong className="text-[#bf94ff]">Twitch live alerts</strong><br />To enable Discord live alerts, connect Discord and ask staff for the Discord Streamer role. TopFragg then checks when you go live and posts an alert in the live-now channel.</p></div>}
    {result && <p role="status" className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${result.success ? "border-green/20 bg-green/5 text-green" : "border-orange/20 bg-orange/5 text-orange"}`}>{result.message}</p>}
    <p className="mt-4 text-xs leading-5 text-vapor">Connecting YouTube uses YouTube API Services to read and link your channel identity. Review our <a href="/privacy#youtube" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-4">Privacy Policy</a> and the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="text-cyan underline underline-offset-4">YouTube Terms of Service</a> before continuing. By connecting YouTube, you agree to those terms.</p>
    {!loading && statusError && <button type="button" onClick={loadStatus} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-cyan"><RefreshCw className="h-3.5 w-3.5" /> Retry connections</button>}
    <AlertDialog open={Boolean(disconnecting)} onOpenChange={open => { if (!open) setDisconnecting(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect {providers.find(item => item.id === disconnecting)?.name || "streaming account"}?</AlertDialogTitle><AlertDialogDescription>This removes the verified account connection from TopFragg. {disconnecting === "twitch" && "Twitch live alerts will also stop. "}You still need a supported stream channel to enter Cash Matches, Tournaments or Money 8s.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={disconnect}>Disconnect account</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}
