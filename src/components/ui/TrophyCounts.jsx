import BadgeTooltip from "@/components/ui/BadgeTooltip";
import { trophyAssets } from "@/lib/trophyAssets";

const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const trophySlots = [
  { key: "gold", label: "Gold trophies", className: "border-yellow-400/20 bg-yellow-400/[0.08] text-yellow-300" },
  { key: "silver", label: "Silver trophies", className: "border-slate-300/20 bg-slate-300/[0.07] text-slate-200" },
  { key: "bronze", label: "Bronze trophies", className: "border-amber-600/25 bg-amber-600/[0.09] text-amber-500" },
  { key: "premium", label: "Premium trophies", className: "border-purple-300/20 bg-purple-300/[0.07] text-purple-300" },
];

export function TrophySymbol({ type = "gold", className = "h-5 w-5" }) {
  if (!trophyAssets[type]) return null;
  return <img src={trophyAssets[type]} alt="" aria-hidden="true" width="352" height="512" decoding="async" className={`inline-block shrink-0 object-contain ${className}`} />;
}

export default function TrophyCounts({ trophies, align = "start", className = "" }) {
  const justify = align === "end" ? "justify-end" : "justify-start";

  return (
    <div className={`flex flex-wrap ${justify} gap-1.5 overflow-visible ${className}`}>
      {trophySlots.map(({ key, label, className: toneClass }) => {
        const count = number(trophies?.[key]);
        return (
          <BadgeTooltip key={key} label={label} description={`${count} ${label.toLowerCase()}`} toneClass={toneClass.split(" ").find((token) => token.startsWith("text-"))}>
            <span tabIndex={0} aria-label={`${label}: ${count}`} className={`relative inline-flex h-8 min-w-10 cursor-default select-none items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-black transition-all duration-200 hover:-translate-y-0.5 ${count === 0 ? "opacity-70" : "ring-1 ring-current/10 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_5px_18px_-10px_currentColor]"} ${toneClass}`}>
              <TrophySymbol type={key} className="h-6 w-4" />
              <span className={count === 0 ? "text-vapor/65" : "text-white"}>{count}</span>
            </span>
          </BadgeTooltip>
        );
      })}
    </div>
  );
}
