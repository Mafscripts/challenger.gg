import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Save, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { MATCH_PRESET_LIMIT } from "@/lib/matchPresets";
import { wagerPlayRule } from "@/lib/wagerRules";

export default function MatchPresetPicker({ userId, settings, choices, onApply }) {
  const client = useQueryClient();
  const key = ["match-presets", userId];
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({ queryKey: key, queryFn: () => base44.profile.matchPresets(), enabled: Boolean(userId), staleTime: 60_000, retry: false });
  const presets = (query.data || []).filter((preset) => preset.mode === settings.mode && preset.game_id === settings.game_id);
  const otherPresets = (query.data || []).filter((preset) => !presets.some((visible) => visible.id === preset.id));
  const existing = presets.find((preset) => preset.name.toLowerCase() === name.trim().toLowerCase());
  const mutation = useMutation({
    mutationFn: (action) => action.remove ? base44.profile.deleteMatchPreset(action.remove) : base44.profile.saveMatchPreset(action.preset),
    onSuccess: (presets, action) => {
      client.setQueryData(key, presets);
      setError("");
      setNotice(action.remove ? "Preset removed." : "Settings saved to your account.");
      if (action.remove) setName("");
    },
    onError: (failure) => { setError(failure.message || "Settings could not be saved. Please try again."); setNotice(""); },
  });
  const canSave = Boolean(settings.game_mode && settings.team_size && name.trim() && !query.isPending && !query.isError && !mutation.isPending);

  if (!userId) return null;
  return <details className="mb-5 rounded-xl border border-cyan/20 bg-cyan/[0.03]">
    <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-cyan"><Bookmark className="mr-2 inline h-4 w-4" />Saved match settings{presets.length > 0 && ` · ${presets.length}`}</summary>
    <div className="border-t border-white/[0.06] p-4">
      <p className="text-[11px] leading-5 text-vapor">Reuse this competition's game mode, team size, series and input rules. Select your current team and review the entry each time. Maps stay in the normal matchroom flow.</p>
      {query.isPending ? <p className="mt-3 text-xs text-vapor">Loading your presets…</p> : query.isError ? <button type="button" onClick={() => query.refetch()} className="site-hover mt-3 rounded px-2 py-2 text-xs text-cyan">Could not load presets. Retry</button> : <>
        {presets.length === 0 && <p className="mt-3 text-xs text-vapor">No presets for this competition and game yet. Choose your settings, then save them below.</p>}
        <ul className="mt-3 space-y-2">
          {presets.map((preset) => {
            const choice = choices.find((item) => item.id === preset.game_mode);
            return <li key={preset.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/40 p-2">
              <button type="button" disabled={!choice || mutation.isPending} onClick={() => { onApply(preset); setName(preset.name); setError(""); setNotice("Preset applied. Choose your team and review all settings before posting."); }} className="site-hover min-w-0 flex-1 rounded px-2 py-2 text-left disabled:opacity-50">
                <strong className="block break-words text-xs text-cyan">{preset.name}</strong>
                <span className="mt-1 block text-[10px] leading-5 text-vapor">{preset.team_size} · {choice?.name || "Format no longer available"}{["xp", "wager"].includes(preset.mode) ? ` · BO${preset.best_of}` : ""} · {wagerPlayRule(preset.play_rule).shortLabel}</span>
              </button>
              <button type="button" aria-label={`Delete preset ${preset.name}`} disabled={mutation.isPending} onClick={() => mutation.mutate({ remove: preset.id })} className="site-hover shrink-0 rounded-lg p-2 text-vapor hover:text-red-400 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
            </li>;
          })}
        </ul>
        {otherPresets.length > 0 && <details className="mt-3 rounded-lg border border-white/[0.07] p-3">
          <summary className="cursor-pointer text-[11px] font-bold text-vapor">Manage settings from other modes / games ({otherPresets.length})</summary>
          <ul className="mt-2 space-y-1">{otherPresets.map((preset) => <li key={preset.id} className="flex items-center justify-between gap-3 py-1"><span className="min-w-0 break-words text-xs">{preset.name}<small className="block text-[10px] text-vapor">{preset.mode === "wager" ? "Cash Matches" : preset.mode === "eights" ? "Free 8s" : preset.mode.toUpperCase()} · {preset.game_id.toUpperCase()}</small></span><button type="button" disabled={mutation.isPending} aria-label={`Delete preset ${preset.name}`} onClick={() => mutation.mutate({ remove: preset.id })} className="site-hover shrink-0 rounded p-2 text-vapor hover:text-red-400 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></li>)}</ul>
        </details>}
        <div className="mt-3 flex flex-wrap gap-2">
          <input aria-label="Preset name" maxLength={48} value={name} onChange={(event) => { setName(event.target.value); setNotice(""); }} placeholder="My standard 2v2 S&D" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-xs focus:border-cyan/40 focus:outline-none" />
          <button type="button" disabled={!canSave || (!existing && (query.data || []).length >= MATCH_PRESET_LIMIT)} onClick={() => mutation.mutate({ preset: { ...settings, name: name.trim(), ...(existing ? { id: existing.id } : {}) } })} className="site-hover flex items-center gap-2 rounded-lg border border-cyan/20 px-3 py-2 text-xs font-bold text-cyan disabled:opacity-40"><Save className="h-3.5 w-3.5" />{mutation.isPending ? "Saving…" : existing ? "Update preset" : "Save settings"}</button>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-vapor">{(query.data || []).length}/{MATCH_PRESET_LIMIT} presets across your account. {!settings.game_mode || !settings.team_size ? "Choose a game mode and team size to save." : "Using an existing name updates that preset."}</p>
      </>}
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-green">{notice}</p>}
    </div>
  </details>;
}
