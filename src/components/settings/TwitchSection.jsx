import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Link2, Loader2, Radio, Unlink } from "lucide-react";
import { base44 } from "@/api/base44Client";

const callbackMessages = {
  connected: { success: true, message: "Twitch connected. Ask Topfragg staff for the Streamer role to enable live alerts." },
  cancelled: { success: false, message: "Twitch connection was cancelled." },
  invalid: { success: false, message: "The Twitch connection link expired. Please try again." },
  "already-linked": { success: false, message: "That Twitch account is already connected to another Topfragg account." },
  error: { success: false, message: "Twitch could not be connected. Please try again." },
};

export default function TwitchSection({ user, onUserUpdate }) {
  const [action, setAction] = useState(null);
  const [result, setResult] = useState(null);
  const connected = Boolean(user?.twitch_user_id);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("twitch");
    if (!status || !callbackMessages[status]) return;
    setResult(callbackMessages[status]);
    params.delete("twitch");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    onUserUpdate();
  }, [onUserUpdate]);

  const connect = async () => {
    setAction("connect");
    setResult(null);
    try {
      const response = await base44.twitch.connect();
      window.location.assign(response.authorization_url);
    } catch (error) {
      setResult({ success: false, message: error.message || "Twitch connection is unavailable." });
      setAction(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect this Twitch account? Live alerts will stop.")) return;
    setAction("disconnect");
    setResult(null);
    try {
      await base44.twitch.disconnect();
      await onUserUpdate();
      setResult({ success: true, message: "Twitch account disconnected. Live alerts are disabled." });
    } catch (error) {
      setResult({ success: false, message: error.message || "Twitch could not be disconnected." });
    } finally {
      setAction(null);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass mb-6 overflow-hidden rounded-xl border border-[#9146FF]/25"
    >
      <div className="bg-gradient-to-r from-[#9146FF]/15 via-[#9146FF]/[0.04] to-transparent p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#9146FF]/20 ring-1 ring-[#9146FF]/30">
            <Radio className="h-6 w-6 text-[#bf94ff]" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Twitch live alerts</h2>
            <p className="text-xs text-vapor">Connect Twitch so Topfragg can announce your live streams in Discord.</p>
          </div>
        </div>

        {connected ? (
          <div className="rounded-xl border border-green/20 bg-green/[0.06] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {user.twitch_avatar_url ? <img src={user.twitch_avatar_url} alt="" className="h-12 w-12 rounded-full border border-white/10 object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#9146FF]/20 font-black text-[#bf94ff]">T</div>}
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><p className="truncate font-bold">{user.twitch_display_name || user.twitch_login}</p><span className="rounded-full border border-green/20 bg-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green">Connected</span></div>
                  <p className="truncate text-xs text-vapor">twitch.tv/{user.twitch_login}</p>
                </div>
              </div>
              <button onClick={disconnect} disabled={Boolean(action)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                {action === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />} Disconnect Twitch
              </button>
            </div>
            <div className="mt-4 rounded-lg border border-[#9146FF]/20 bg-[#9146FF]/[0.06] p-3 text-xs text-vapor">
              <span className="font-bold text-[#bf94ff]">How it works:</span> when you go live, Topfragg checks Twitch and posts one official alert in <span className="text-foreground">🔴・live-now</span>. You need the Discord <span className="text-foreground">Streamer</span> role to prevent spam.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-secondary/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">No Twitch account connected</p>
              <p className="mt-1 text-xs text-vapor">Connect the real Twitch account you stream from. Topfragg only uses it to identify your channel and check whether you are live.</p>
            </div>
            <button onClick={connect} disabled={Boolean(action)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#9146FF] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#a866ff] disabled:opacity-50">
              {action === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Connect Twitch
            </button>
          </div>
        )}

        <a href="https://www.twitch.tv/" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-[#bf94ff] hover:underline">Open Twitch <ExternalLink className="h-3 w-3" /></a>
        {result && <div className={`mt-4 rounded-lg border p-3 text-xs ${result.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>{result.message}</div>}
      </div>
    </motion.section>
  );
}
