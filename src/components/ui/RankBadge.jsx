import React from "react";
import { getRankForElo } from "@/lib/ranks";

const iconUrl = ({ accent, secondary, glow, shape = "shield" }) => {
  const innerShape = shape === "diamond"
    ? `<path d="M50 18 80 40 50 86 20 40Z" fill="url(#gem)" stroke="${accent}" stroke-width="4"/><path d="M35 40h30L50 86Z" fill="${secondary}" opacity=".75"/>`
    : shape === "crest"
      ? `<path d="M50 15c15 10 27 10 34 8v28c0 21-13 35-34 44-21-9-34-23-34-44V23c7 2 19 2 34-8Z" fill="url(#gem)" stroke="${accent}" stroke-width="4"/><path d="M32 43h36l-8 28H40Z" fill="${secondary}" opacity=".72"/>`
      : `<path d="M50 12 82 26v27c0 22-13 36-32 45-19-9-32-23-32-45V26Z" fill="url(#gem)" stroke="${accent}" stroke-width="4"/><path d="M31 37h38L61 70H39Z" fill="${secondary}" opacity=".7"/>`;

  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 100 100">
      <defs>
        <radialGradient id="bg" cx="50%" cy="45%" r="58%">
          <stop offset="0%" stop-color="${glow}" stop-opacity=".8"/>
          <stop offset="55%" stop-color="#071015" stop-opacity=".95"/>
          <stop offset="100%" stop-color="#020306"/>
        </radialGradient>
        <linearGradient id="gem" x1="18" y1="12" x2="82" y2="92" gradientUnits="userSpaceOnUse">
          <stop stop-color="${secondary}"/>
          <stop offset=".52" stop-color="${accent}"/>
          <stop offset="1" stop-color="#061018"/>
        </linearGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <rect width="100" height="100" rx="16" fill="url(#bg)"/>
      <circle cx="50" cy="50" r="38" fill="none" stroke="${accent}" stroke-opacity=".18" stroke-width="2"/>
      <g filter="url(#glow)">${innerShape}</g>
      <path d="M20 20h60M18 80h64" stroke="${accent}" stroke-opacity=".24" stroke-width="2"/>
    </svg>
  `)}`;
};

const ranks = {
  novice: { label: "Novice", gradient: "from-gray-400 to-gray-600", text: "text-gray-300", icon: iconUrl({ accent: "#9ca3af", secondary: "#e5e7eb", glow: "#64748b" }) },
  amateur: { label: "Amateur", gradient: "from-blue-400 to-blue-600", text: "text-blue-300", icon: iconUrl({ accent: "#60a5fa", secondary: "#bfdbfe", glow: "#2563eb" }) },
  pro: { label: "Pro", gradient: "from-blue-400 to-blue-600", text: "text-blue-400", icon: iconUrl({ accent: "#38bdf8", secondary: "#0ea5e9", glow: "#1d4ed8", shape: "crest" }) },
  champion: { label: "Champion", gradient: "from-orange to-red-500", text: "text-orange", icon: iconUrl({ accent: "#f97316", secondary: "#facc15", glow: "#dc2626", shape: "crest" }) },
  bronze: { label: "Bronze", gradient: "from-amber-700 to-amber-900", text: "text-amber-300", icon: iconUrl({ accent: "#b45309", secondary: "#fed7aa", glow: "#7c2d12" }) },
  silver: { label: "Silver", gradient: "from-gray-300 to-gray-500", text: "text-gray-200", icon: iconUrl({ accent: "#d1d5db", secondary: "#f8fafc", glow: "#64748b" }) },
  gold: { label: "Gold", gradient: "from-yellow-400 to-yellow-600", text: "text-yellow-300", icon: iconUrl({ accent: "#facc15", secondary: "#fef08a", glow: "#ca8a04", shape: "crest" }) },
  platinum: { label: "Platinum", gradient: "from-teal-300 to-teal-500", text: "text-teal-200", icon: iconUrl({ accent: "#2dd4bf", secondary: "#99f6e4", glow: "#0f766e" }) },
  diamond: { label: "Diamond", gradient: "from-cyan to-blue-500", text: "text-cyan", icon: iconUrl({ accent: "#22d3ee", secondary: "#7dd3fc", glow: "#0891b2", shape: "diamond" }) },
  master: { label: "Master", gradient: "from-purple-400 to-purple-600", text: "text-purple-300", icon: iconUrl({ accent: "#c084fc", secondary: "#e9d5ff", glow: "#7e22ce", shape: "crest" }) },
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
      <div className={`${sizes[size]} rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center font-bold font-mono shadow-lg overflow-hidden`}>
        <img src={cfg.icon} alt={label} className="w-full h-full object-cover" />
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
