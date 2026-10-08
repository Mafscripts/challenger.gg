import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Check,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { topfraggDiscordInviteUrl } from "@/lib/discordCommunity";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const callbackMessages = {
  connected: { success: true, message: "Discord connected and the Verified Player role was assigned." },
  "connected-no-server": { success: true, message: "Discord connected. Join the Topfragg server, then press Sync role." },
  "connected-role-pending": { success: true, message: "Discord connected. Press Sync role if the Verified Player role was not assigned yet." },
  cancelled: { success: false, message: "Discord connection was cancelled." },
  invalid: { success: false, message: "The Discord connection link expired. Please try again." },
  "already-linked": { success: false, message: "That Discord account is already connected to another Topfragg account." },
  "active-free-8s": { success: false, message: "Finish or leave your active Free 8s lobby before changing Discord accounts." },
  error: { success: false, message: "Discord could not be connected. Please try again." },
};

export default function DiscordSection({ user, onUserUpdate }) {
  const [webhookUrl, setWebhookUrl] = useState(user?.discord_webhook_url || "");
  const [alertsEnabled, setAlertsEnabled] = useState(user?.discord_alerts_enabled || false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [connectionResult, setConnectionResult] = useState(null);
  const [connectionAction, setConnectionAction] = useState(null);
  const connected = Boolean(user?.discord_user_id);

  useEffect(() => {
    setWebhookUrl(user?.discord_webhook_url || "");
    setAlertsEnabled(Boolean(user?.discord_alerts_enabled));
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("discord");
    if (!status || !callbackMessages[status]) return;
    setConnectionResult(callbackMessages[status]);
    params.delete("discord");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    onUserUpdate();
  }, [onUserUpdate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connect") !== "discord" || connected) return;
    params.delete("connect");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    setConnectionAction("connect");
    base44.discord.connect()
      .then((result) => window.location.assign(result.authorization_url))
      .catch((error) => {
        setConnectionResult({ success: false, message: error.message || "Discord connection is unavailable." });
        setConnectionAction(null);
      });
  }, [connected]);

  const handleConnect = async () => {
    setConnectionAction("connect");
    setConnectionResult(null);
    try {
      const result = await base44.discord.connect();
      window.location.assign(result.authorization_url);
    } catch (error) {
      setConnectionResult({ success: false, message: error.message || "Discord connection is unavailable." });
      setConnectionAction(null);
    }
  };

  const handleSync = async () => {
    setConnectionAction("sync");
    setConnectionResult(null);
    try {
      const result = await base44.discord.sync();
      await onUserUpdate();
      setConnectionResult(result.roleAssigned
        ? { success: true, message: result.profileRefreshed ? "Verified Player role and Discord profile synchronized successfully." : "Verified Player role synchronized successfully." }
        : { success: false, message: "Join the Topfragg Discord server first, then try again." });
    } catch (error) {
      setConnectionResult({ success: false, message: error.message || "Could not synchronize the Discord role." });
    } finally {
      setConnectionAction(null);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect Discord and remove the Verified Player role?")) return;
    setConnectionAction("disconnect");
    setConnectionResult(null);
    try {
      await base44.discord.disconnect();
      await onUserUpdate();
      setConnectionResult({ success: true, message: "Discord account disconnected." });
    } catch (error) {
      setConnectionResult({ success: false, message: error.message || "Could not disconnect Discord." });
    } finally {
      setConnectionAction(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await base44.auth.updateMe({
        discord_webhook_url: webhookUrl,
        discord_alerts_enabled: alertsEnabled,
      });
      setSaved(true);
      onUserUpdate();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setTestResult({ success: false, message: "Failed to save settings." });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await base44.functions.invoke("postDiscordCelebration", {
        event_type: "test",
        player_name: user?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player",
        webhook_url: webhookUrl,
      });
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Discord rejected the webhook message");
      }
      setTestResult({ success: true, message: "Test alert sent! Check your Discord channel." });
    } catch (error) {
      setTestResult({ success: false, message: error.message || "Failed to send. Check your webhook URL." });
    }
    setTesting(false);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass mb-6 overflow-hidden rounded-xl border border-[#5865F2]/20"
    >
      <div className="border-b border-white/5 bg-gradient-to-r from-[#5865F2]/15 via-cyan/[0.06] to-transparent p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#5865F2]/20 ring-1 ring-[#5865F2]/30">
            <ShieldCheck className="h-6 w-6 text-[#8b9cff]" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Discord Connection</h2>
            <p className="text-xs text-vapor">Securely link your Discord identity and receive the Verified Player role.</p>
          </div>
        </div>

        {connected ? (
          <div className="flex flex-col gap-4 rounded-xl border border-green/20 bg-green/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-12 w-12 border border-white/10">
                <AvatarImage src={user.discord_avatar_url || undefined} alt="" className="object-cover" />
                <AvatarFallback className="bg-[#5865F2]/20 text-lg font-black text-[#8b9cff]">
                  {(user.discord_display_name || user.discord_username || "D").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-bold">{user.discord_display_name || user.discord_username}</p>
                  <span className="rounded-full border border-green/20 bg-green/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green">Connected</span>
                </div>
                <p className="truncate text-xs text-vapor">@{user.discord_username} · Discord ID {user.discord_user_id}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSync} disabled={Boolean(connectionAction)} className="inline-flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 text-xs font-bold text-cyan transition hover:bg-cyan/20 disabled:opacity-50">
                {connectionAction === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync role
              </button>
              <button onClick={handleDisconnect} disabled={Boolean(connectionAction)} className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                {connectionAction === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-secondary/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">No Discord account connected</p>
              <p className="mt-1 text-xs text-vapor">Discord will ask you to approve basic identity access. If you are not in the Topfragg server yet, you will be redirected to its invitation after linking. Your password is never shared with Topfragg.</p>
            </div>
            <button onClick={handleConnect} disabled={Boolean(connectionAction)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6875f5] disabled:opacity-50">
              {connectionAction === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Connect Discord
            </button>
          </div>
        )}

        {connectionResult && (
          <div className={`mt-4 rounded-lg border p-3 text-xs ${connectionResult.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-300"}`}>
            {connectionResult.message}
          </div>
        )}
        {connected && <a href={topfraggDiscordInviteUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#8b9cff]">Join the Topfragg Discord server <ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>

      <div className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#5865F2]/20">
            <Bell className="h-5 w-5 text-[#8b9cff]" />
          </div>
          <div>
            <h3 className="font-bold">Discord Channel Alerts</h3>
            <p className="text-xs text-vapor">Optional webhook alerts for tournament wins and rewards. This is separate from account verification.</p>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-white/5 bg-secondary/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-vapor">Webhook setup</p>
          <ol className="list-inside list-decimal space-y-1.5 text-xs text-vapor">
            <li>In Discord, go to <span className="text-foreground">Server Settings → Integrations → Webhooks</span></li>
            <li>Create a webhook and select the channel for alerts</li>
            <li>Copy the webhook URL and paste it below</li>
          </ol>
          <a href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-cyan hover:underline">
            Discord webhook guide <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-vapor">Discord Webhook URL</span>
          <input type="password" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://discord.com/api/webhooks/..." className="w-full rounded-lg border border-white/5 bg-secondary px-4 py-2.5 font-mono text-sm focus:border-cyan/30 focus:outline-none" />
        </label>

        <div className="mb-5 flex items-center justify-between rounded-lg border border-white/5 bg-secondary/50 p-4">
          <div>
            <p className="text-sm font-semibold">Enable Discord Alerts</p>
            <p className="text-xs text-vapor">Receive celebratory alerts for wins and unlocks.</p>
          </div>
          <button onClick={() => setAlertsEnabled(!alertsEnabled)} className={`relative h-6 w-11 rounded-full transition-colors ${alertsEnabled ? "bg-cyan" : "bg-white/10"}`}>
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${alertsEnabled ? "translate-x-5" : ""}`} />
          </button>
        </div>

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-2.5 text-sm font-bold text-cyan transition hover:bg-cyan/20 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : saved ? "Saved!" : "Save alerts"}
          </button>
          <button onClick={handleTest} disabled={testing || !webhookUrl} className="flex items-center gap-2 rounded-lg border border-white/5 bg-secondary px-5 py-2.5 text-sm font-bold text-vapor transition hover:text-foreground disabled:opacity-50">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {testing ? "Sending..." : "Send test"}
          </button>
        </div>

        {testResult && (
          <div className={`mt-4 rounded-lg border p-3 text-xs ${testResult.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
            {testResult.message}
          </div>
        )}
      </div>
    </motion.section>
  );
}
