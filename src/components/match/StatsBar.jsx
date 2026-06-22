import React from "react";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, Flame, DollarSign, Star, Users, Shield, Clock, Settings, Radio } from "lucide-react";

export default function StatsBar({ teamAPlayers, teamBPlayers, wager }) {
  if (!teamAPlayers || teamAPlayers.length === 0) return null;
  
  const safeTeamB = teamBPlayers || [];
  const allPlayers = [...teamAPlayers, ...safeTeamB];
  
  const topEarner = allPlayers.reduce((max, p) => 
    (p.total_wager_earnings || 0) > (max.total_wager_earnings || 0) ? p : max
  );
  
  const topWinRate = allPlayers.reduce((max, p) => {
    const rate = (p.wager_wins || 0) / ((p.wager_wins || 0) + (p.wager_losses || 0) || 1);
    const maxRate = (max.wager_wins || 0) / ((max.wager_wins || 0) + (max.wager_losses || 0) || 1);
    return rate > maxRate ? p : max;
  });
  
  const topStreak = allPlayers.reduce((max, p) => 
    (p.current_win_streak || 0) > (max.current_win_streak || 0) ? p : max
  );
  
  const biggestWin = allPlayers.reduce((max, p) => 
    (p.biggest_wager_win || 0) > (max.biggest_wager_win || 0) ? p : max
  );
  
  const topXP = allPlayers.reduce((max, p) => 
    (p.xp_level || 0) > (max.xp_level || 0) ? p : max
  );
  
  const totalMatches = allPlayers.reduce((sum, p) => 
    sum + (p.wager_wins || 0) + (p.wager_losses || 0), 0
  );
  
  const teamAEarnings = teamAPlayers.reduce((sum, p) => sum + (p.total_wager_earnings || 0), 0);
  const teamBEarnings = safeTeamB.reduce((sum, p) => sum + (p.total_wager_earnings || 0), 0);
  
  const teamAWins = teamAPlayers.reduce((sum, p) => sum + (p.wager_wins || 0), 0);
  const teamALosses = teamAPlayers.reduce((sum, p) => sum + (p.wager_losses || 0), 0);
  const teamAWinRate = ((teamAWins / (teamAWins + teamALosses || 1)) * 100).toFixed(1);
  
  const teamBWins = safeTeamB.reduce((sum, p) => sum + (p.wager_wins || 0), 0);
  const teamBLosses = safeTeamB.reduce((sum, p) => sum + (p.wager_losses || 0), 0);
  const teamBWinRate = safeTeamB.length > 0 ? ((teamBWins / (teamBWins + teamBLosses || 1)) * 100).toFixed(1) : '0';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
      <div className="glass rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <Trophy className="w-3.5 h-3.5 text-yellow-400" />
          <p className="text-[9px] text-vapor uppercase">Top Earner</p>
        </div>
        <p className="text-xs font-bold truncate">{topEarner.full_name}</p>
        <p className="text-xs font-bold text-green">${topEarner.total_wager_earnings?.toLocaleString()}</p>
      </div>

      <div className="glass rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className="w-3.5 h-3.5 text-cyan" />
          <p className="text-[9px] text-vapor uppercase">Win Rate</p>
        </div>
        <p className="text-xs font-bold truncate">{topWinRate.full_name}</p>
        <p className="text-xs font-bold text-cyan">{((topWinRate.wager_wins || 0) / ((topWinRate.wager_wins || 0) + (topWinRate.wager_losses || 0) || 1) * 100).toFixed(1)}%</p>
      </div>

      <div className="glass rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <Flame className="w-3.5 h-3.5 text-orange" />
          <p className="text-[9px] text-vapor uppercase">Streak</p>
        </div>
        <p className="text-xs font-bold truncate">{topStreak.full_name}</p>
        <p className="text-xs font-bold text-orange">{topStreak.current_win_streak}W</p>
      </div>

      <div className="glass rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <DollarSign className="w-3.5 h-3.5 text-purple-400" />
          <p className="text-[9px] text-vapor uppercase">Biggest</p>
        </div>
        <p className="text-xs font-bold truncate">{biggestWin.full_name}</p>
        <p className="text-xs font-bold text-purple-400">${biggestWin.biggest_wager_win}</p>
      </div>

      <div className="glass rounded-lg p-3 border border-cyan/20 bg-cyan/5">
        <div className="flex items-center gap-1.5 mb-1">
          <Shield className="w-3.5 h-3.5 text-cyan" />
          <p className="text-[9px] text-vapor uppercase">Alpha</p>
        </div>
        <p className="text-xs font-bold text-cyan">${teamAEarnings.toLocaleString()}</p>
        <p className="text-[9px] text-cyan/70">{teamAWinRate}% WR</p>
      </div>

      <div className="glass rounded-lg p-3 border border-orange/20 bg-orange/5">
        <div className="flex items-center gap-1.5 mb-1">
          <Shield className="w-3.5 h-3.5 text-orange" />
          <p className="text-[9px] text-vapor uppercase">Bravo</p>
        </div>
        <p className="text-xs font-bold text-orange">${teamBEarnings.toLocaleString()}</p>
        <p className="text-[9px] text-orange/70">{teamBWinRate}% WR</p>
      </div>

      <div className="glass rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <Star className="w-3.5 h-3.5 text-yellow-400" />
          <p className="text-[9px] text-vapor uppercase">Top Level</p>
        </div>
        <p className="text-xs font-bold truncate">{topXP.full_name}</p>
        <p className="text-xs font-bold text-yellow-400">LVL {topXP.xp_level}</p>
      </div>

      <div className="glass rounded-lg p-3 border border-white/5">
        <div className="flex items-center gap-1.5 mb-1">
          <Users className="w-3.5 h-3.5 text-blue-400" />
          <p className="text-[9px] text-vapor uppercase">Matches</p>
        </div>
        <p className="text-xs font-bold">{totalMatches}</p>
        <p className="text-[9px] text-vapor">Total</p>
      </div>
    </div>
  );
}