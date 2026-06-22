import React, { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Save, Check, ExternalLink, Loader2, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function DiscordSection({ user, onUserUpdate }) {
  const [webhookUrl, setWebhookUrl] = useState(user?.discord_webhook_url || "");
  const [alertsEnabled, setAlertsEnabled] = useState(user?.discord_alerts_enabled || false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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
    } catch (e) {
      setTestResult({ success: false, message: "Failed to save settings." });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await base44.functions.invoke("postDiscordCelebration", {
        event_type: "test",
        player_name: user?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player",
        webhook_url: webhookUrl,
      });
      setTestResult({ success: true, message: "Test alert sent! Check your Discord channel." });
    } catch (e) {
      setTestResult({ success: false, message: "Failed to send. Check your webhook URL." });
    }
    setTesting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl border border-white/5 p-6 mb-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-[#5865F2]/20 flex items-center justify-center">
          <Bell className="w-5 h-5 text-[#5865F2]" />
        </div>
        <div>
          <h2 className="font-bold text-lg">Discord Alerts</h2>
          <p className="text-vapor text-xs">Get notified in your Discord channel for tournament wins and exclusive knife unlocks</p>
        </div>
      </div>

      <div className="bg-secondary/50 rounded-lg p-4 mb-5 border border-white/5">
        <p className="text-xs text-vapor mb-2 font-semibold uppercase tracking-wider">How to set up</p>
        <ol className="text-xs text-vapor space-y-1.5 list-decimal list-inside">
          <li>In Discord, go to <span className="text-foreground">Server Settings → Integrations → Webhooks</span></li>
          <li>Click <span className="text-foreground">New Webhook</span> and pick the channel for alerts</li>
          <li>Copy the <span className="text-foreground">Webhook URL</span> and paste it below</li>
        </ol>
        <a href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan text-xs mt-3 hover:underline">
          Discord webhook guide <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold text-vapor uppercase tracking-wider mb-2 block">Discord Webhook URL</label>
        <input
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full px-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none font-mono"
        />
      </div>

      <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border border-white/5 mb-5">
        <div>
          <p className="text-sm font-semibold">Enable Discord Alerts</p>
          <p className="text-xs text-vapor">Receive celebratory alerts for your wins and unlocks</p>
        </div>
        <button
          onClick={() => setAlertsEnabled(!alertsEnabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${alertsEnabled ? "bg-cyan" : "bg-white/10"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${alertsEnabled ? "translate-x-5" : ""}`} />
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-cyan/10 text-cyan text-sm font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !webhookUrl}
          className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-vapor text-sm font-bold rounded-lg border border-white/5 hover:text-foreground transition-all disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {testing ? "Sending..." : "Send Test Alert"}
        </button>
      </div>

      {testResult && (
        <div className={`mt-4 p-3 rounded-lg text-xs ${testResult.success ? "bg-green/10 text-green border border-green/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
          {testResult.message}
        </div>
      )}
    </motion.div>
  );
}
