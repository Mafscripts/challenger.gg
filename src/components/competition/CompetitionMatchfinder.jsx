import React from "react";
import { Gamepad2, Keyboard, Loader2, MonitorCheck, MonitorX, Swords } from "lucide-react";
import { wagerPlayRule } from "@/lib/wagerRules";
import { formatMatchfinderPostedAt, roundedMatchfinderPostedAt } from "@/lib/matchfinderPosts";

const tones = {
  cyan: "border-cyan/20 bg-cyan/10 text-cyan",
  green: "border-green/20 bg-green/10 text-green",
  orange: "border-orange/20 bg-orange/10 text-orange",
};
const xpColumns = "grid-cols-[90px_minmax(180px,1.2fr)_minmax(120px,.8fr)_minmax(150px,1fr)_minmax(110px,.8fr)_75px_minmax(190px,1.1fr)]";

export function CompetitionMatchfinder({ children, loading, emptyMessage = "No open matches right now.", variant }) {
  if (loading) return <div className="competition-empty-state px-5 py-14 text-center text-sm text-vapor" role="status"><span className="competition-empty-icon"><Loader2 size={25} className="animate-spin" aria-hidden="true" /></span><p>Loading matches…</p></div>;
  if (React.Children.toArray(children).length === 0) return <div className="competition-empty-state px-5 py-14 text-center text-sm text-vapor"><span className="competition-empty-icon"><Swords size={26} aria-hidden="true" /></span><p>{emptyMessage}</p><small>Choose another mode or post a match to get things started.</small></div>;
  return (
    <div className="overflow-x-auto">
      <div className={variant === "xp" ? "min-w-[1080px]" : "min-w-[1220px]"}>
        <div className={`grid ${variant === "xp" ? xpColumns : "grid-cols-[minmax(150px,.85fr)_minmax(210px,1.2fr)_minmax(150px,.85fr)_minmax(120px,.65fr)_minmax(90px,.5fr)_minmax(120px,.7fr)_minmax(210px,1fr)]"} gap-5 border-b border-white/[0.06] bg-white/[0.015] px-5 py-3 text-[8px] font-black uppercase tracking-[0.16em] text-vapor`}>
          {variant === "xp" ? <><span>Match</span><span>Mode</span><span>Series</span></> : <><span>Game</span><span>Competition</span></>}
          <span>Allowed input</span>
          <span>PC players</span>
          <span>Posted</span>
          {variant !== "xp" && <span>Starting</span>}
          <span className="text-right">Action</span>
        </div>
        {children}
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
  postedAt,
  starting = "Available now",
  tone = "cyan",
  action,
  variant,
  teamSize,
  bestOf = 1,
}) {
  const rule = wagerPlayRule(playRule);
  const InputIcon = rule.value === "mixed_pc_allowed" ? Keyboard : Gamepad2;
  const PcIcon = rule.pcAllowed ? MonitorCheck : MonitorX;

  if (variant === "xp") {
    const size = Math.max(1, Number.parseInt(String(teamSize || "1v1"), 10) || 1);
    const series = [1, 3, 5].includes(Number(bestOf)) ? Number(bestOf) : 1;
    return <article className={`competition-match-row grid ${xpColumns} min-h-[88px] items-center gap-5 border-b border-white/[0.055] px-5 py-4 transition-colors last:border-b-0 hover:bg-white/[0.02]`}>
      <p className="font-mono text-2xl font-black tracking-tight text-cyan">{size}v{size}</p>
      <p className="min-w-0 text-sm font-bold text-white">{game}</p>
      <p className="text-sm font-bold text-white">Best of {series}</p>
      <div className="flex items-center gap-2"><InputIcon className="h-4 w-4 shrink-0 text-cyan" /><span className="text-xs font-bold text-white">{rule.inputLabel}</span></div>
      <div className="flex items-center gap-2"><PcIcon className={`h-4 w-4 shrink-0 ${rule.pcAllowed ? "text-green" : "text-orange"}`} /><span className={`text-xs font-bold ${rule.pcAllowed ? "text-green" : "text-orange"}`}>{rule.pcAllowed ? "Allowed" : "Not allowed"}</span></div>
      <time dateTime={roundedMatchfinderPostedAt(postedAt)?.toISOString()} className="text-xs font-bold tabular-nums text-vapor">{formatMatchfinderPostedAt(postedAt)}</time>
      <div className="justify-self-end text-right">{action}</div>
    </article>;
  }

  return (
    <article className="competition-match-row grid min-h-[92px] grid-cols-[minmax(150px,.85fr)_minmax(210px,1.2fr)_minmax(150px,.85fr)_minmax(120px,.65fr)_minmax(90px,.5fr)_minmax(120px,.7fr)_minmax(210px,1fr)] items-center gap-5 border-b border-white/[0.055] px-5 py-4 last:border-b-0 hover:bg-white/[0.02]">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tones[tone] || tones.cyan}`}><Swords className="h-4 w-4" /></span>
        <div className="min-w-0"><p className="truncate text-sm font-black text-white">{game}</p><p className="mt-1 truncate text-[10px] text-vapor">{gameDetail}</p></div>
      </div>
      <div className="min-w-0"><p className="truncate text-sm font-black text-white">{competition}</p><p className="mt-1 truncate text-[10px] text-vapor">{competitionDetail}</p></div>
      <div className="flex items-center gap-2"><InputIcon className="h-4 w-4 shrink-0 text-cyan" /><span className="text-xs font-black text-white">{rule.inputLabel}</span></div>
      <div className="flex items-center gap-2"><PcIcon className={`h-4 w-4 shrink-0 ${rule.pcAllowed ? "text-green" : "text-orange"}`} /><span className={`text-xs font-black ${rule.pcAllowed ? "text-green" : "text-orange"}`}>{rule.pcAllowed ? "Allowed" : "Not allowed"}</span></div>
      <time dateTime={roundedMatchfinderPostedAt(postedAt)?.toISOString()} className="text-xs font-bold tabular-nums text-vapor">{formatMatchfinderPostedAt(postedAt)}</time>
      <span className="text-xs font-bold text-vapor">{starting}</span>
      <div className="justify-self-end text-right">{action}</div>
    </article>
  );
}
