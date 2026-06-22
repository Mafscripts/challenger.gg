import React from "react";
import { Trophy } from "lucide-react";

export default function TrophyCase({ teamAPlayers, teamBPlayers }) {
  if (!teamAPlayers || teamAPlayers.length === 0) return null;
  
  const safeTeamB = teamBPlayers || [];
  const allPlayers = [...teamAPlayers, ...safeTeamB];
  
  const totalGold = allPlayers.reduce((sum, p) => sum + (p.gold_count || 0), 0);
  const totalSilver = allPlayers.reduce((sum, p) => sum + (p.silver_count || 0), 0);
  const totalBronze = allPlayers.reduce((sum, p) => sum + (p.bronze_count || 0), 0);
  const totalPremium = allPlayers.reduce((sum, p) => sum + (p.premium_count || 0), 0);
  const totalChampion = allPlayers.reduce((sum, p) => sum + (p.champion_count || 0), 0);

  return (
    <div className="glass rounded-xl border border-white/5 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-yellow-400" />
        <h3 className="font-bold text-sm">COMBINED TROPHY CASE</h3>
      </div>
      
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div className="bg-yellow-400/5 rounded-lg p-3 text-center border border-yellow-400/20">
          <p className="text-2xl mb-1">🥇</p>
          <p className="text-xl font-black text-yellow-400">{totalGold}</p>
          <p className="text-[9px] text-vapor uppercase mt-0.5">Gold</p>
        </div>
        <div className="bg-gray-300/5 rounded-lg p-3 text-center border border-gray-300/20">
          <p className="text-2xl mb-1">🥈</p>
          <p className="text-xl font-black text-gray-300">{totalSilver}</p>
          <p className="text-[9px] text-vapor uppercase mt-0.5">Silver</p>
        </div>
        <div className="bg-amber-700/5 rounded-lg p-3 text-center border border-amber-700/20">
          <p className="text-2xl mb-1">🥉</p>
          <p className="text-xl font-black text-amber-600">{totalBronze}</p>
          <p className="text-[9px] text-vapor uppercase mt-0.5">Bronze</p>
        </div>
        <div className="bg-yellow-400/5 rounded-lg p-3 text-center border border-yellow-400/20">
          <p className="text-2xl mb-1">🏆</p>
          <p className="text-xl font-black text-yellow-400">{totalPremium}</p>
          <p className="text-[9px] text-vapor uppercase mt-0.5">Premium</p>
        </div>
        <div className="bg-purple-400/5 rounded-lg p-3 text-center border border-purple-400/20">
          <p className="text-2xl mb-1">👑</p>
          <p className="text-xl font-black text-purple-400">{totalChampion}</p>
          <p className="text-[9px] text-vapor uppercase mt-0.5">Champion</p>
        </div>
        <div className="bg-cyan/5 rounded-lg p-3 text-center border border-cyan/20">
          <p className="text-2xl mb-1">⚡</p>
          <p className="text-xl font-black text-cyan">{allPlayers.length}</p>
          <p className="text-[9px] text-vapor uppercase mt-0.5">Players</p>
        </div>
      </div>
    </div>
  );
}