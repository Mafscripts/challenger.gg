import React from "react";
import { getRankForElo } from "@/lib/ranks";

const ranks = {
  novice: { label: "Novice", gradient: "from-gray-400 to-gray-600", text: "text-gray-300" },
  amateur: { label: "Amateur", gradient: "from-blue-400 to-blue-600", text: "text-blue-300" },
  pro: { label: "Pro", gradient: "from-purple-400 to-purple-600", text: "text-purple-300" },
  champion: { label: "Champion", gradient: "from-orange to-red-500", text: "text-orange" },
  bronze: { label: "Bronze", gradient: "from-amber-700 to-amber-900", text: "text-amber-300" },
  silver: { label: "Silver", gradient: "from-gray-300 to-gray-500", text: "text-gray-200" },
  gold: { label: "Gold", gradient: "from-yellow-400 to-yellow-600", text: "text-yellow-300" },
  platinum: { label: "Platinum", gradient: "from-teal-300 to-teal-500", text: "text-teal-200" },
  diamond: { label: "Diamond", gradient: "from-cyan to-blue-500", text: "text-cyan" },
  master: { label: "Master", gradient: "from-purple-400 to-purple-600", text: "text-purple-300" },
};

export default function RankBadge({ rank, division, elo, size = "md" }) {
  const calculated = elo !== undefined ? getRankForElo(elo) : null;
  const rankKey = calculated?.tier || rank || "bronze";
  const label = calculated?.tier ? calculated.name : `${(ranks[rankKey] || ranks.bronze).label}${division ? ` ${division}` : ""}`;
  const cfg = ranks[rankKey] || ranks.bronze;
  const sizes = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-20 h-20 text-xl",
    xl: "w-28 h-28 text-2xl",
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${sizes[size]} rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center font-bold font-mono shadow-lg`}>
        {rank.charAt(0).toUpperCase()}
      </div>
      {size !== "sm" && (
        <span className={`text-xs font-mono font-bold ${cfg.text}`}>
          {label}
        </span>
      )}
    </div>
  );
}

export { ranks };
