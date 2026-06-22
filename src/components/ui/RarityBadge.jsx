import React from "react";

const rarityConfig = {
  common: { label: "Common", color: "text-gray-400", bg: "bg-gray-400/10", border: "border-gray-400/20", glow: "" },
  uncommon: { label: "Uncommon", color: "text-green", bg: "bg-green/10", border: "border-green/20", glow: "" },
  rare: { label: "Rare", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", glow: "" },
  epic: { label: "Epic", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20", glow: "shadow-purple-400/20 shadow-lg" },
  legendary: { label: "Legendary", color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", glow: "glow-legendary" },
  mythic: { label: "Mythic", color: "text-fuchsia-400", bg: "bg-fuchsia-400/10", border: "border-fuchsia-400/20", glow: "glow-mythic" },
  exclusive: { label: "Exclusive", color: "text-cyan", bg: "bg-cyan/10", border: "border-cyan/20", glow: "glow-cyan" },
};

export default function RarityBadge({ rarity = "common", className = "" }) {
  const cfg = rarityConfig[rarity] || rarityConfig.common;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${cfg.color} ${cfg.bg} border ${cfg.border} ${className}`}>
      {cfg.label}
    </span>
  );
}

export { rarityConfig };