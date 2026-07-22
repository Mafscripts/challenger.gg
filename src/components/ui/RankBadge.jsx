import React from "react";
import { getRankForElo } from "@/lib/ranks";

const ranks = {
  novice: { label: "Novice", text: "text-gray-300", icon: "/assets/ranks/bronze.png" },
  amateur: { label: "Amateur", text: "text-blue-300", icon: "/assets/ranks/silver.png" },
  bronze: { label: "Bronze", text: "text-amber-400", icon: "/assets/ranks/bronze.png" },
  silver: { label: "Silver", text: "text-gray-200", icon: "/assets/ranks/silver.png" },
  gold: { label: "Gold", text: "text-yellow-300", icon: "/assets/ranks/gold.png" },
  platinum: { label: "Platinum", text: "text-teal-200", icon: "/assets/ranks/platinum.png" },
  diamond: { label: "Diamond", text: "text-cyan", icon: "/assets/ranks/diamond.png" },
  master: { label: "Master", text: "text-red-400", icon: "/assets/ranks/master.png" },
  pro: { label: "Pro", text: "text-fuchsia-400", icon: "/assets/ranks/pro.png" },
  champion: { label: "Champion", text: "text-white", icon: "/assets/ranks/champion.png" },
};

export default function RankBadge({ rank, elo, size = "md", showLabel = true }) {
  const calculated = elo !== undefined ? getRankForElo(elo) : null;
  const rankKey = calculated?.tier || rank || "bronze";
  const cfg = ranks[rankKey] || ranks.bronze;
  const label = calculated?.tier ? calculated.name : cfg.label;
  const sizes = {
    sm: "h-12 w-12",
    md: "h-24 w-24",
    lg: "h-36 w-36",
    xl: "h-48 w-48",
  };
  const isChampion = rankKey === "champion";
  const isCompact = size === "sm";

  return (
    <div className={`group/rank flex shrink-0 flex-col items-center gap-1.5 ${isChampion ? "champion-rank-group" : ""}`}>
      <div className={`relative ${sizes[size]} ${isChampion ? `champion-rank-badge ${isCompact ? "champion-rank-badge--compact" : "champion-rank-badge--full"}` : ""}`}>
        {isChampion && <span aria-hidden="true" className="champion-rank-aura" />}
        <img src={cfg.icon} alt={label} className={`relative z-[1] h-full w-full object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] ${isChampion ? "champion-rank-core" : ""}`} />
        {isChampion && !isCompact && <img aria-hidden="true" src={cfg.icon} alt="" className="champion-rank-shine" />}
      </div>
      {showLabel && size !== "sm" && <span className={`text-xs font-mono font-black ${cfg.text}`}>{label}</span>}
    </div>
  );
}

export { ranks };
