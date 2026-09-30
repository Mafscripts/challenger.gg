import React from "react";
import { Gamepad2, Keyboard, MonitorCheck, MonitorX, Swords } from "lucide-react";
import { wagerPlayRule } from "@/lib/wagerRules";

const tones = {
  cyan: "border-cyan/20 bg-cyan/10 text-cyan",
  green: "border-green/20 bg-green/10 text-green",
  orange: "border-orange/20 bg-orange/10 text-orange",
};

export function CompetitionMatchfinder({ children, loading, emptyMessage = "No open matches right now." }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1120px]">
        <div className="grid grid-cols-[minmax(150px,.85fr)_minmax(210px,1.2fr)_minmax(150px,.85fr)_minmax(120px,.65fr)_minmax(120px,.7fr)_minmax(210px,1fr)] gap-5 border-b border-white/[0.06] bg-white/[0.015] px-5 py-3 text-[8px] font-black uppercase tracking-[0.16em] text-vapor">
          <span>Game</span>
          <span>Competition</span>
          <span>Allowed input</span>
          <span>PC players</span>
          <span>Starting</span>
          <span className="text-right">Action</span>
        </div>
        {loading ? (
          <div className="px-5 py-14 text-center text-sm text-vapor">Loading matches...</div>
        ) : React.Children.count(children) === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-vapor">{emptyMessage}</div>
        ) : children}
      </div>
    </div>
  );
}

export function CompetitionMatchfinderRow({
  game,
  gameDetail,
  competition,
  competitionDetail,
  playRule,
  starting = "Available now",
  tone = "cyan",
  action,
}) {
  const rule = wagerPlayRule(playRule);
  const InputIcon = rule.value === "mixed_pc_allowed" ? Keyboard : Gamepad2;
  const PcIcon = rule.pcAllowed ? MonitorCheck : MonitorX;

  return (
    <article className="grid min-h-[92px] grid-cols-[minmax(150px,.85fr)_minmax(210px,1.2fr)_minmax(150px,.85fr)_minmax(120px,.65fr)_minmax(120px,.7fr)_minmax(210px,1fr)] items-center gap-5 border-b border-white/[0.055] px-5 py-4 last:border-b-0 hover:bg-white/[0.02]">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tones[tone] || tones.cyan}`}><Swords className="h-4 w-4" /></span>
        <div className="min-w-0"><p className="truncate text-sm font-black text-white">{game}</p><p className="mt-1 truncate text-[10px] text-vapor">{gameDetail}</p></div>
      </div>
      <div className="min-w-0"><p className="truncate text-sm font-black text-white">{competition}</p><p className="mt-1 truncate text-[10px] text-vapor">{competitionDetail}</p></div>
      <div className="flex items-center gap-2"><InputIcon className="h-4 w-4 shrink-0 text-cyan" /><span className="text-xs font-black text-white">{rule.inputLabel}</span></div>
      <div className="flex items-center gap-2"><PcIcon className={`h-4 w-4 shrink-0 ${rule.pcAllowed ? "text-green" : "text-orange"}`} /><span className={`text-xs font-black ${rule.pcAllowed ? "text-green" : "text-orange"}`}>{rule.pcAllowed ? "Allowed" : "Not allowed"}</span></div>
      <span className="text-xs font-bold text-vapor">{starting}</span>
      <div className="justify-self-end text-right">{action}</div>
    </article>
  );
}
