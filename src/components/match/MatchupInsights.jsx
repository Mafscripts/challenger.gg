import React from "react";
import { Trophy, DollarSign, TrendingUp, Flame, Target, BookOpen } from "lucide-react";

function InsightCard({ label, value, subtext, icon: Icon, color, highlight }) {
  return (
    <div className={`glass rounded-lg border p-3 ${highlight ? `border-${color}/30 bg-${color}/5` : 'border-white/5'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`w-3 h-3 ${color}`} />}
        <p className="text-[9px] text-vapor uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
      {subtext && <p className="text-[9px] text-vapor mt-0.5">{subtext}</p>}
    </div>
  );
}

export default function MatchupInsights({ teamAPlayers, teamBPlayers }) {
  const allPlayers = [...(teamAPlayers || []), ...(teamBPlayers || [])];
  if (allPlayers.length === 0) {
    return (
      <div className="glass rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-cyan" />
          <h3 className="font-bold text-sm">Matchup Insights</h3>
        </div>
        <div className="py-8 text-center text-sm text-vapor">No participant records yet.</div>
      </div>
    );
  }
  
  // Calculate insights
  const highestEarner = allPlayers.reduce((max, p) => 
    (p.total_wager_earnings || 0) > (max?.total_wager_earnings || 0) ? p : max, null);
  
  const highestWinRate = allPlayers.reduce((max, p) => {
    const wins = p.wager_wins || 0;
    const losses = p.wager_losses || 0;
    const rate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
    const maxWins = max?.wager_wins || 0;
    const maxLosses = max?.wager_losses || 0;
    const maxRate = maxWins + maxLosses > 0 ? (maxWins / (maxWins + maxLosses)) * 100 : 0;
    return rate > maxRate ? p : max;
  }, null);
  
  const mostExperienced = allPlayers.reduce((max, p) => 
    (p.wager_wins + p.wager_losses) > (max?.wager_wins + max?.wager_losses || 0) ? p : max, null);
  
  const bestStreak = allPlayers.reduce((max, p) => 
    (p.current_win_streak || 0) > (max?.current_win_streak || 0) ? p : max, null);
  
  const biggestWin = allPlayers.reduce((max, p) => 
    (p.biggest_wager_win || 0) > (max?.biggest_wager_win || 0) ? p : max, null);
  
  // Team totals
  const teamAEarnings = (teamAPlayers || []).reduce((sum, p) => sum + (p.total_wager_earnings || 0), 0);
  const teamBEarnings = (teamBPlayers || []).reduce((sum, p) => sum + (p.total_wager_earnings || 0), 0);
  
  const teamAWins = (teamAPlayers || []).reduce((sum, p) => sum + (p.wager_wins || 0), 0);
  const teamALosses = (teamAPlayers || []).reduce((sum, p) => sum + (p.wager_losses || 0), 0);
  const teamAWinRate = teamAWins + teamALosses > 0 ? ((teamAWins / (teamAWins + teamALosses)) * 100).toFixed(1) : 0;
  
  const teamBWins = (teamBPlayers || []).reduce((sum, p) => sum + (p.wager_wins || 0), 0);
  const teamBLosses = (teamBPlayers || []).reduce((sum, p) => sum + (p.wager_losses || 0), 0);
  const teamBWinRate = teamBWins + teamBLosses > 0 ? ((teamBWins / (teamBWins + teamBLosses)) * 100).toFixed(1) : 0;

  return (
    <div className="glass rounded-xl border border-white/5 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-cyan" />
        <h3 className="font-bold text-sm">Matchup Insights</h3>
      </div>

      {/* Individual Highlights */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        <InsightCard 
          label="Highest Earner" 
          value={`$${highestEarner?.total_wager_earnings || 0}`}
          subtext={highestEarner?.full_name}
          icon={DollarSign}
          color="text-green"
        />
        <InsightCard 
          label="Best Win Rate" 
          value={`${(() => {
            const wins = highestWinRate?.wager_wins || 0;
            const losses = highestWinRate?.wager_losses || 0;
            return wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0;
          })()}%`}
          subtext={highestWinRate?.full_name}
          icon={TrendingUp}
          color="text-cyan"
        />
        <InsightCard 
          label="Most Experienced" 
          value={(mostExperienced?.wager_wins || 0) + (mostExperienced?.wager_losses || 0)}
          subtext="matches"
          icon={BookOpen}
          color="text-purple-400"
        />
        <InsightCard 
          label="Best Streak" 
          value={`${bestStreak?.current_win_streak || 0}`}
          subtext="wins"
          icon={Flame}
          color="text-orange"
          highlight
        />
        <InsightCard 
          label="Biggest Win" 
          value={`$${biggestWin?.biggest_wager_win || 0}`}
          subtext={biggestWin?.full_name}
          icon={Trophy}
          color="text-yellow-400"
        />
      </div>

      {/* Team Comparison */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InsightCard 
          label="Team Alpha Earnings" 
          value={`$${teamAEarnings}`}
          icon={DollarSign}
          color="text-cyan"
        />
        <InsightCard 
          label="Team Bravo Earnings" 
          value={`$${teamBEarnings}`}
          icon={DollarSign}
          color="text-orange"
        />
        <InsightCard 
          label="Team Alpha Win Rate" 
          value={`${teamAWinRate}%`}
          icon={Target}
          color="text-cyan"
        />
        <InsightCard 
          label="Team Bravo Win Rate" 
          value={`${teamBWinRate}%`}
          icon={Target}
          color="text-orange"
        />
      </div>
    </div>
  );
}
