import React from "react";
import { Star, Trophy, Medal, Award, Crown, Target } from "lucide-react";

function PlayerRow({ player, teamColor }) {
  const wins = player.wager_wins || 0;
  const losses = player.wager_losses || 0;
  const name = player.full_name || player.username || player.user_name || "Unnamed player";
  
  return (
    <div className="flex items-center gap-1 py-1.5 border-b border-white/5 last:border-0">
      {/* Player Info */}
      <div className="flex items-center gap-1.5 w-32 shrink-0">
        <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${teamColor === 'cyan' ? 'from-cyan to-cyan/60' : 'from-orange to-orange/60'} flex items-center justify-center text-background font-black text-[9px] font-mono shrink-0`}>
          {name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold ${teamColor === 'cyan' ? 'text-cyan' : 'text-orange'} truncate`}>
            {name}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[7px] px-1 py-0.5 bg-yellow-400/10 text-yellow-400 rounded font-mono font-bold shrink-0">
              L{player.xp_level || 1}
            </span>
            {player.is_premium && (
              <span className="text-[7px] px-1 py-0.5 bg-yellow-400/10 text-yellow-400 rounded font-bold flex items-center gap-0.5 shrink-0">
                <Star className="w-1.5 h-1.5" />
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* W-L */}
      <div className="text-center min-w-[45px]">
        <p className="text-[7px] text-vapor uppercase tracking-wider">W-L</p>
        <p className="text-[10px] font-bold">{wins}-{losses}</p>
      </div>
      
      {/* Streak */}
      <div className="text-center min-w-[40px]">
        <p className="text-[7px] text-vapor uppercase tracking-wider">Streak</p>
        <p className="text-[10px] font-bold text-orange">{player.current_win_streak || 0}W</p>
      </div>
      
      {/* Earnings */}
      <div className="text-center min-w-[55px]">
        <p className="text-[7px] text-vapor uppercase tracking-wider">Earnings</p>
        <p className="text-[10px] font-bold text-green">${(player.total_wager_earnings || 0).toLocaleString()}</p>
      </div>
      
      {/* Trophies */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        <div className="flex flex-col items-center gap-0.5">
          <Trophy className="w-3 h-3 text-yellow-400" />
          <p className="text-[9px] font-bold text-yellow-400 leading-none">{player.gold_count || 0}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Medal className="w-3 h-3 text-gray-300" />
          <p className="text-[9px] font-bold text-gray-300 leading-none">{player.silver_count || 0}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Award className="w-3 h-3 text-amber-600" />
          <p className="text-[9px] font-bold text-amber-600 leading-none">{player.bronze_count || 0}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Crown className="w-3 h-3 text-purple-400" />
          <p className="text-[9px] font-bold text-purple-400 leading-none">{player.premium_count || 0}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <Target className="w-3 h-3 text-cyan-400" />
          <p className="text-[9px] font-bold text-cyan-400 leading-none">{player.champion_count || 0}</p>
        </div>
      </div>
    </div>
  );
}

function TeamAverage({ players, teamColor }) {
  if (!players || players.length === 0) return null;
  
  const totalEarnings = players.reduce((sum, p) => sum + (p.total_wager_earnings || 0), 0);
  const totalWins = players.reduce((sum, p) => sum + (p.wager_wins || 0), 0);
  const totalLosses = players.reduce((sum, p) => sum + (p.wager_losses || 0), 0);
  const avgStreak = Math.round(players.reduce((sum, p) => sum + (p.current_win_streak || 0), 0) / players.length);
  
  return (
    <div className={`flex items-center gap-1 py-1.5 px-2 border-t-2 ${teamColor === 'cyan' ? 'border-cyan/30 bg-cyan/5' : 'border-orange/30 bg-orange/5'} rounded-lg mt-2`}>
      <p className={`text-[10px] font-bold ${teamColor === 'cyan' ? 'text-cyan' : 'text-orange'} min-w-[130px]`}>TEAM AVG</p>
      <div className="text-center min-w-[45px]">
        <p className="text-[10px] font-bold">{totalWins}-{totalLosses}</p>
      </div>
      <div className="text-center min-w-[40px]">
        <p className="text-[10px] font-bold text-orange">{avgStreak}W</p>
      </div>
      <div className="text-center min-w-[55px]">
        <p className="text-[10px] font-bold text-green">${totalEarnings.toLocaleString()}</p>
      </div>
      <div className="ml-auto" />
    </div>
  );
}

export default function TeamRoster({ players, teamColor, teamName }) {
  if (!players || players.length === 0) {
    return (
      <div className={`glass rounded-xl border ${teamColor === 'cyan' ? 'border-cyan/20' : 'border-orange/20'} overflow-hidden`}>
        <div className={`px-4 py-3 ${teamColor === 'cyan' ? 'bg-cyan/5 border-b border-cyan/20' : 'bg-orange/5 border-b border-orange/20'}`}>
          <h3 className={`font-bold text-sm ${teamColor === 'cyan' ? 'text-cyan' : 'text-orange'}`}>{teamName} ROSTER</h3>
        </div>
        <div className="py-8 text-center">
          <p className="text-vapor text-sm">No players recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass rounded-xl border ${teamColor === 'cyan' ? 'border-cyan/20' : 'border-orange/20'} overflow-hidden`}>
      <div className={`px-4 py-3 ${teamColor === 'cyan' ? 'bg-cyan/5 border-b border-cyan/20' : 'bg-orange/5 border-b border-orange/20'}`}>
        <h3 className={`font-bold text-sm ${teamColor === 'cyan' ? 'text-cyan' : 'text-orange'}`}>{teamName} ROSTER</h3>
      </div>
      <div className="p-2">
        {players.map((player, idx) => (
          <PlayerRow key={player.id || idx} player={player} teamColor={teamColor} />
        ))}
        <TeamAverage players={players} teamColor={teamColor} />
      </div>
    </div>
  );
}
