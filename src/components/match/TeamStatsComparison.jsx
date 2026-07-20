import React from "react";
import { Trophy, TrendingDown, Target, DollarSign, BookOpen, Star, Flame } from "lucide-react";

function TeamStat({ label, valueA, valueB, icon: Icon, color, format }) {
  const aBetter = valueA > valueB;
  const bBetter = valueB > valueA;
  
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-white/5 last:border-0">
      <div className={`text-right font-mono font-bold ${aBetter ? `text-${color}` : 'text-foreground'}`}>
        {format ? format(valueA) : valueA}
      </div>
      <div className="text-center flex items-center justify-center">
        <Icon className="w-3 h-3 text-vapor" />
        <span className="text-[9px] text-vapor ml-1 uppercase">{label}</span>
      </div>
      <div className={`font-mono font-bold ${bBetter ? `text-${color}` : 'text-foreground'}`}>
        {format ? format(valueB) : valueB}
      </div>
    </div>
  );
}

export default function TeamStatsComparison({ teamAPlayers, teamBPlayers }) {
  const hasPlayers = (teamAPlayers?.length || 0) + (teamBPlayers?.length || 0) > 0;
  const calcTeamStats = (players) => {
    if (!players || players.length === 0) return { wins: 0, losses: 0, winRate: 0, earnings: 0, matches: 0, avgLevel: 0, streak: 0 };
    
    const wins = players.reduce((sum, p) => sum + (p.wager_wins || 0), 0);
    const losses = players.reduce((sum, p) => sum + (p.wager_losses || 0), 0);
    const matches = wins + losses;
    const earnings = players.reduce((sum, p) => sum + (p.total_wager_earnings || 0), 0);
    const avgLevel = players.reduce((sum, p) => sum + (p.xp_level || 1), 0) / players.length;
    const streak = Math.max(...players.map(p => p.current_win_streak || 0));
    
    return {
      wins,
      losses,
      winRate: matches > 0 ? ((wins / matches) * 100).toFixed(1) : 0,
      earnings,
      matches,
      avgLevel: avgLevel.toFixed(1),
      streak
    };
  };
  
  const statsA = calcTeamStats(teamAPlayers);
  const statsB = calcTeamStats(teamBPlayers);

  return (
    <div className="premium-panel rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-cyan" />
          <h3 className="font-bold text-sm">Team Comparison</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-cyan font-bold">Team Alpha</span>
          <span className="text-vapor">vs</span>
          <span className="text-orange font-bold">Team Bravo</span>
        </div>
      </div>
      
      {!hasPlayers ? (
        <div className="py-8 text-center text-sm text-vapor">No participant records yet.</div>
      ) : (
        <div className="space-y-1">
          <TeamStat label="Wins" valueA={statsA.wins} valueB={statsB.wins} icon={Trophy} color="green" />
          <TeamStat label="Losses" valueA={statsA.losses} valueB={statsB.losses} icon={TrendingDown} color="red-400" />
          <TeamStat label="Win Rate" valueA={`${statsA.winRate}%`} valueB={`${statsB.winRate}%`} icon={Target} color="cyan" />
          <TeamStat label="Earnings" valueA={statsA.earnings} valueB={statsB.earnings} icon={DollarSign} color="green" format={(v) => `$${v.toLocaleString()}`} />
          <TeamStat label="Matches" valueA={statsA.matches} valueB={statsB.matches} icon={BookOpen} color="purple-400" />
          <TeamStat label="Avg Level" valueA={statsA.avgLevel} valueB={statsB.avgLevel} icon={Star} color="yellow-400" />
          <TeamStat label="Streak" valueA={`${statsA.streak}W`} valueB={`${statsB.streak}W`} icon={Flame} color="orange" />
        </div>
      )}
    </div>
  );
}
