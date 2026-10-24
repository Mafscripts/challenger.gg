import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Palette, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { verifiedNameColors, premiumNameEffects, allNameColors } from "@/lib/nameColors";

export default function NameColorSection({ user, onUserUpdate }) {
  const [draft, setDraft] = useState(user?.display_name_color || "");
  const [trialActive, setTrialActive] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { setDraft(user?.display_name_color || ""); setResult(null); }, [user?.id, user?.display_name_color]);
  useEffect(() => {
    let cancelled = false;
    base44.functions.invoke("getAnimatedNameFreeTrialStatus", {})
      .then((response) => { if (!cancelled) setTrialActive(response.data?.trial?.active === true); })
      .catch(() => { /* Premium access still works when the optional trial cannot be loaded. */ })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [user?.id]);
  const premium = user?.is_premium === true && (!user.premium_expires || Date.parse(user.premium_expires) > Date.now());
  const verified = user?.verified_player || user?.is_verified_player || user?.badges?.some((badge) => badge.type === "verified_player");
  const canAnimate = premium || trialActive;
  const canColor = verified || canAnimate;
  const allowed = (draft === "" || (draft.startsWith("fx-") ? canAnimate : canColor)) && allNameColors.some((option) => option.value === draft);
  const name = user?.display_name || user?.full_name || user?.username || "Your name";
  const save = async (event) => {
    event.preventDefault();
    if (!allowed || saving) return;
    setSaving(true); setResult(null);
    try {
      const updatedUser = await base44.auth.updateMe({ display_name_color: draft });
      window.dispatchEvent(new CustomEvent("topfragg:profile-updated", { detail: { userId: user.id, displayNameColor: draft } }));
      await onUserUpdate?.(updatedUser);
      setResult({ success: true, message: "Name color saved." });
    } catch (error) { setResult({ success: false, message: error.message || "Could not save name color." }); }
    finally { setSaving(false); }
  };
  return <section className="glass mb-6 rounded-xl border border-white/5 p-6" aria-label="Custom name color">
    <header className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/20"><Palette className="h-5 w-5 text-cyan" /></span><div><h2 className="text-lg font-bold">Custom name color</h2><p className="text-xs text-vapor">Choose how your name appears across Topfragg.</p></div></header>
    <form onSubmit={save} className="space-y-4">
      <div className="flex min-h-20 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-secondary px-4 py-5" aria-label="Name color preview">
        <span data-name-effect={draft || undefined} style={draft ? { "--player-name-color": draft } : undefined} className={`player-name-wrap break-words text-2xl font-black ${draft ? "player-name-color" : "text-white"}`}>{name}</span>
      </div>
      <div><label htmlFor="settings-name-effect" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-vapor">Name color or effect</label>
        <select id="settings-name-effect" value={draft} onChange={(event) => { setDraft(event.target.value); setResult(null); }} disabled={saving} className="w-full rounded-lg border border-white/10 bg-secondary px-4 py-2.5 text-sm outline-none focus:border-cyan/30 disabled:opacity-50">
          <optgroup label="Name colors">{verifiedNameColors.map((option) => <option key={option.value} value={option.value} disabled={Boolean(option.value) && !canColor}>{option.label}</option>)}</optgroup>
          <optgroup label="Animated name effects · Premium or free trial">{premiumNameEffects.map((option) => <option key={option.value} value={option.value} disabled={!canAnimate}>{option.label}</option>)}</optgroup>
        </select>
      </div>
      <p className="text-xs leading-5 text-vapor">{checking && !premium ? "Checking free trial availability…" : canAnimate ? "Animated effects are available on your account. Pulsar Rush uses the pink and white starburst animation." : <>Animated effects require <Link to="/premium" className="font-bold text-cyan">Topfragg Premium</Link> or an active free trial. Verified players can choose solid name colors.</>}</p>
      {result && <p role="status" className={`rounded-lg border p-3 text-xs ${result.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>{result.message}</p>}
      <div className="flex justify-end"><button type="submit" disabled={saving || !allowed || draft === (user?.display_name_color || "")} className="inline-flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-2.5 text-sm font-bold text-cyan hover:bg-cyan/20 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save name color</button></div>
    </form>
  </section>;
}
