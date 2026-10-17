import React from "react";
import { Gamepad2, Keyboard, MonitorCheck, MonitorX, Swords } from "lucide-react";
import { wagerPlayRule } from "@/lib/wagerRules";
import { formatMatchfinderPostedAt, roundedMatchfinderPostedAt } from "@/lib/matchfinderPosts";

const tones = {
  cyan: "border-cyan/20 bg-cyan/10 text-cyan",
  green: "border-green/20 bg-green/10 text-green",
  orange: "border-orange/20 bg-orange/10 text-orange",
};
const xpColumns = "grid-cols-[90px_minmax(180px,1.2fr)_minmax(150px,1fr)_minmax(135px,.85fr)_100px_75px_minmax(190px,1.1fr)]";

export function CompetitionMatchfinder({ children, loading, emptyMessage = "No open matches right now.", variant }) {
  return (
    <div className="overflow-x-auto">
      <div className={variant === "xp" ? "min-w-[1120px]" : "min-w-[1220px]"}>
        <div className={`grid ${variant === "xp" ? xpColumns : "grid-cols-[minmax(150px,.85fr)_minmax(210px,1.2fr)_minmax(150px,.85fr)_minmax(120px,.65fr)_minmax(90px,.5fr)_minmax(120px,.7fr)_minmax(210px,1fr)]"} gap-5 border-b border-white/[0.06] bg-white/[0.015] px-5 py-3 text-[8px] font-black uppercase tracking-[0.16em] text-vapor`}>
          {variant === "xp" ? <><span>Format</span><span>Match</span><span>Teams</span></> : <><span>Game</span><span>Competition</span></>}
          <span>Allowed input</span>
          <span>PC players</span>
          <span>Posted</span>
          {variant !== "xp" && <span>Starting</span>}
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
  postedAt,
  starting = "Available now",
  tone = "cyan",
  action,
  variant,
  teamSize,
  bestOf = 1,
  teamCounts,
}) {
  const rule = wagerPlayRule(playRule);
  const InputIcon = rule.value === "mixed_pc_allowed" ? Keyboard : Gamepad2;
  const PcIcon = rule.pcAllowed ? MonitorCheck : MonitorX;

  if (variant === "xp") {
    const size = Math.max(1, Number.parseInt(String(teamSize || "1v1"), 10) || 1);
    const alpha = teamCounts?.alpha || 0, bravo = teamCounts?.bravo || 0;
    const open = Math.max(0, size * 2 - alpha - bravo);
    return <article className={`grid ${xpColumns} min-h-[104px] items-center gap-5 border-b border-white/[0.055] px-5 py-5 transition-colors last:border-b-0 hover:bg-white/[0.02]`}>
      <div><p className="font-mono text-2xl font-black tracking-tight text-cyan">{size}v{size}</p><p className="mt-1 text-[9px] font-bold text-vapor">{size === 1 ? "Solo duel" : "Team match"}</p></div>
      <div className="min-w-0"><p className="truncate text-sm font-black text-white">{game}</p><p className="mt-1.5 truncate text-[10px] text-vapor">{competitionDetail}</p><p className="mt-1 text-[9px] font-bold text-cyan/80">BO{bestOf} <span className="px-1 text-white/20">·</span> Competitive XP</p></div>
      <div><div className="flex items-center gap-2.5 font-mono text-xs font-black"><span className="text-orange" aria-label={`Team Alpha: ${alpha} of ${size} players`}>{alpha}/{size}</span><span className="text-[9px] font-medium text-vapor">vs</span><span className="text-cyan" aria-label={`Team Bravo: ${bravo} of ${size} players`}>{bravo}/{size}</span></div>
        <div className="mt-2 flex gap-1.5" aria-hidden="true">{[alpha, bravo].map((count, side) => <div key={side} className="flex gap-1">{Array.from({ length: size }, (_, index) => <span key={index} className={`h-1 w-3.5 rounded-sm ${index < count ? side === 0 ? "bg-orange" : "bg-cyan" : "bg-white/10"}`} />)}</div>)}</div>
        <p className="mt-1.5 text-[10px] text-vapor">{open ? `${open} open ${open === 1 ? "slot" : "slots"}` : "Teams full"}</p>
      </div>
      <div className="flex items-center gap-2"><InputIcon className="h-4 w-4 shrink-0 text-cyan" /><span className="text-xs font-bold text-white">{rule.inputLabel}</span></div>
      <div className="flex items-center gap-2"><PcIcon className={`h-4 w-4 shrink-0 ${rule.pcAllowed ? "text-green" : "text-orange"}`} /><span className={`text-xs font-bold ${rule.pcAllowed ? "text-green" : "text-orange"}`}>{rule.pcAllowed ? "Allowed" : "Not allowed"}</span></div>
      <time dateTime={roundedMatchfinderPostedAt(postedAt)?.toISOString()} className="text-xs font-bold tabular-nums text-vapor">{formatMatchfinderPostedAt(postedAt)}</time>
      <div className="justify-self-end text-right">{action}</div>
    </article>;
  }

  return (
    <article className="grid min-h-[92px] grid-cols-[minmax(150px,.85fr)_minmax(210px,1.2fr)_minmax(150px,.85fr)_minmax(120px,.65fr)_minmax(90px,.5fr)_minmax(120px,.7fr)_minmax(210px,1fr)] items-center gap-5 border-b border-white/[0.055] px-5 py-4 last:border-b-0 hover:bg-white/[0.02]">
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
