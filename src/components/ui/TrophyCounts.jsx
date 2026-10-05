import { Award, Crown, Medal, Trophy } from "lucide-react";

const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const trophySlots = [
  { key: "gold", label: "Gold trophies", icon: Trophy, className: "border-yellow-400/20 bg-yellow-400/[0.08] text-yellow-300" },
  { key: "silver", label: "Silver trophies", icon: Medal, className: "border-slate-300/20 bg-slate-300/[0.07] text-slate-200" },
  { key: "bronze", label: "Bronze trophies", icon: Award, className: "border-amber-600/25 bg-amber-600/[0.09] text-amber-500" },
  { key: "premium", label: "Premium trophies", icon: Crown, className: "border-purple-300/20 bg-purple-300/[0.07] text-purple-300" },
];

export default function TrophyCounts({ trophies, align = "start", className = "" }) {
  const justify = align === "end" ? "justify-end" : "justify-start";

  return (
    <div className={`flex flex-wrap ${justify} gap-1.5 overflow-visible ${className}`}>
      {trophySlots.map(({ key, label, icon: Icon, className: toneClass }) => {
        const count = number(trophies?.[key]);
        return (
          <span key={key} aria-label={`${label}: ${count}`} className={`group/trophy relative inline-flex h-8 min-w-10 cursor-default select-none items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-black transition-all duration-200 hover:-translate-y-0.5 ${count === 0 ? "opacity-70" : "ring-1 ring-current/10 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_5px_18px_-10px_currentColor]"} ${toneClass}`}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10"><Icon className="h-3.5 w-3.5" strokeWidth={2.25} /></span>
            <span className={count === 0 ? "text-vapor/65" : "text-white"}>{count}</span>
            <span className="pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-1/2 z-[70] flex -translate-x-1/2 translate-y-1 items-center gap-2 whitespace-nowrap rounded-lg border border-white/[0.12] bg-[#111821] px-2.5 py-2 text-[10px] font-bold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,.65)] transition-all duration-150 group-hover/trophy:visible group-hover/trophy:translate-y-0 group-hover/trophy:opacity-100">
              <span className="text-vapor">{label}</span><span className="font-mono text-white">{count}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}
