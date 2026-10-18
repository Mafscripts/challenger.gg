import { Award, Crown, Medal, Shield, Star, Trophy } from "lucide-react";
import BadgeTooltip from "@/components/ui/BadgeTooltip";

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

const additionalTrophies = [
  { key: "topfragg", icon: Shield, className: "border-cyan/20 bg-cyan/[0.08] text-cyan" },
  { key: "hosted", icon: Star, className: "border-green/20 bg-green/[0.08] text-green" },
];

export function TrophySymbol({ type = "gold", className = "h-5 w-5" }) {
  const slot = [...trophySlots, ...additionalTrophies].find((slot) => slot.key === type) || trophySlots[0];
  const Icon = slot.icon;
  const tone = slot.className.split(" ").find((token) => token.startsWith("text-"));
  return <Icon aria-hidden="true" className={`${tone} ${className}`} strokeWidth={2.25} />;
}

export default function TrophyCounts({ trophies, align = "start", className = "" }) {
  const justify = align === "end" ? "justify-end" : "justify-start";

  return (
    <div className={`flex flex-wrap ${justify} gap-1.5 overflow-visible ${className}`}>
      {trophySlots.map(({ key, label, icon: Icon, className: toneClass }) => {
        const count = number(trophies?.[key]);
        return (
          <BadgeTooltip key={key} label={label} description={`${count} ${label.toLowerCase()}`} icon={Icon} toneClass={toneClass.split(" ").find((token) => token.startsWith("text-"))}>
            <span tabIndex={0} aria-label={`${label}: ${count}`} className={`relative inline-flex h-8 min-w-10 cursor-default select-none items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-black transition-all duration-200 hover:-translate-y-0.5 ${count === 0 ? "opacity-70" : "ring-1 ring-current/10 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_5px_18px_-10px_currentColor]"} ${toneClass}`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10"><TrophySymbol type={key} className="h-3.5 w-3.5" /></span>
              <span className={count === 0 ? "text-vapor/65" : "text-white"}>{count}</span>
            </span>
          </BadgeTooltip>
        );
      })}
    </div>
  );
}
