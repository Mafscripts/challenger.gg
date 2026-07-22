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
  master: { label: "Master", text: "text-purple-300", icon: "/assets/ranks/master.png" },
  pro: { label: "Pro", text: "text-blue-400", icon: "/assets/ranks/pro.png" },
  champion: { label: "Champion", text: "text-orange", icon: "/assets/ranks/champion.png" },
};

export default function RankBadge({ rank, division, elo, size = "md", showLabel = true }) {
  const calculated = elo !== undefined ? getRankForElo(elo) : null;
  const rankKey = calculated?.tier || rank || "bronze";
  const cfg = ranks[rankKey] || ranks.bronze;
  const label = calculated?.tier ? calculated.name : `${cfg.label}${division ? ` ${division}` : ""}`;
  const sizes = {
    sm: "h-12 w-12",
    md: "h-24 w-24",
    lg: "h-36 w-36",
    xl: "h-48 w-48",
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <img src={cfg.icon} alt={label} className={`${sizes[size]} object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)]`} />
      {showLabel && size !== "sm" && <span className={`text-xs font-mono font-black ${cfg.text}`}>{label}</span>}
    </div>
  );
}

export { ranks };
