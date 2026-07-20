import React from "react";
import { Award, Crown, Medal, Trophy, Users } from "lucide-react";

export default function TrophyCase({ teamAPlayers, teamBPlayers }) {
  if (!teamAPlayers || teamAPlayers.length === 0) return null;

  const allPlayers = [...teamAPlayers, ...(teamBPlayers || [])];
  const trophies = [
    { label: "Gold", value: allPlayers.reduce((sum, player) => sum + (player.gold_count || 0), 0), icon: Medal, tone: "text-yellow-400", tint: "bg-yellow-400/[0.035]" },
    { label: "Silver", value: allPlayers.reduce((sum, player) => sum + (player.silver_count || 0), 0), icon: Medal, tone: "text-gray-300", tint: "bg-gray-300/[0.025]" },
    { label: "Bronze", value: allPlayers.reduce((sum, player) => sum + (player.bronze_count || 0), 0), icon: Award, tone: "text-amber-600", tint: "bg-amber-700/[0.03]" },
    { label: "Premium", value: allPlayers.reduce((sum, player) => sum + (player.premium_count || 0), 0), icon: Trophy, tone: "text-yellow-400", tint: "bg-yellow-400/[0.035]" },
    { label: "Champion", value: allPlayers.reduce((sum, player) => sum + (player.champion_count || 0), 0), icon: Crown, tone: "text-purple-400", tint: "bg-purple-400/[0.035]" },
    { label: "Players", value: allPlayers.length, icon: Users, tone: "text-cyan", tint: "bg-cyan/[0.035]" },
  ];

  return (
    <div className="premium-panel rounded-3xl p-6">
      <div className="mb-5 flex items-center gap-2">
        <Trophy className="h-5 w-5 text-yellow-400" />
        <h3 className="text-sm font-black tracking-tight">Combined Trophy Case</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {trophies.map(({ label, value, icon: Icon, tone, tint }) => (
          <div key={label} className={`premium-card rounded-2xl p-4 text-center ${tint}`}>
            <Icon className={`mx-auto mb-3 h-6 w-6 ${tone}`} />
            <p className="font-mono text-2xl font-black text-white">{value}</p>
            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-vapor">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
