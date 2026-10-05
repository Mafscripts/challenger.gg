import React from "react";
import { Award, Medal, Trophy, Users } from "lucide-react";

export default function TrophyCase({ teamAPlayers, teamBPlayers }) {
  if (!teamAPlayers || teamAPlayers.length === 0) return null;

  const allPlayers = [...teamAPlayers, ...(teamBPlayers || [])];
  const trophies = [
    { label: "Gold", value: allPlayers.reduce((sum, player) => sum + (player.gold_count || 0), 0), icon: Medal, tone: "text-yellow-400", tint: "bg-yellow-400/[0.035]" },
    { label: "Silver", value: allPlayers.reduce((sum, player) => sum + (player.silver_count || 0), 0), icon: Medal, tone: "text-gray-300", tint: "bg-gray-300/[0.025]" },
    { label: "Bronze", value: allPlayers.reduce((sum, player) => sum + (player.bronze_count || 0), 0), icon: Award, tone: "text-amber-600", tint: "bg-amber-700/[0.03]" },
    { label: "Premium", value: allPlayers.reduce((sum, player) => sum + (player.premium_count || 0), 0), icon: Trophy, tone: "text-yellow-400", tint: "bg-yellow-400/[0.035]" },
    { label: "Players", value: allPlayers.length, icon: Users, tone: "text-cyan", tint: "bg-cyan/[0.035]" },
  ];

  return (
    <div className="premium-panel rounded-3xl p-6">
      <div className="mb-5 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-yellow-400" />
        <h3 className="text-sm font-black tracking-tight">Combined Trophy Case</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {trophies.map(({ label, value, icon: Icon, tone, tint }) => (
          <div key={label} title={`${label}: ${value}`} className={`group/trophy relative premium-card rounded-2xl p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-20px_currentColor] ${tint}`}>
            <Icon className={`mx-auto mb-3 h-6 w-6 ${tone}`} />
            <p className="font-mono text-2xl font-black text-white">{value}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-vapor">{label}</p>
            <span className="pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-1/2 z-[70] -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border border-white/[0.12] bg-[#111821] px-2.5 py-2 text-[10px] font-bold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,.65)] transition-all duration-150 group-hover/trophy:visible group-hover/trophy:translate-y-0 group-hover/trophy:opacity-100">{label}: {value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
