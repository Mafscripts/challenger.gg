import React from "react";
import { TrendingUp } from "lucide-react";

function getTeamRecord(players = []) {
  const wins = players.reduce((sum, player) => sum + (player.wager_wins || 0), 0);
  const losses = players.reduce((sum, player) => sum + (player.wager_losses || 0), 0);
  const total = wins + losses;

  return {
    wins,
    losses,
    total,
    winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0",
  };
}

function RecordCard({ label, color, record }) {
  const colorClass = color === "cyan" ? "text-cyan" : "text-orange";
  const bgClass = color === "cyan" ? "bg-cyan" : "bg-orange";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${bgClass}`} />
        <span className={`text-sm font-bold ${colorClass}`}>{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="premium-card rounded-xl p-3">
          <p className="text-[10px] text-vapor uppercase tracking-wider">Record</p>
          <p className="text-lg font-black font-mono">{record.wins}-{record.losses}</p>
        </div>
        <div className="premium-card rounded-xl p-3">
          <p className="text-[10px] text-vapor uppercase tracking-wider">Win Rate</p>
          <p className={`text-lg font-black font-mono ${colorClass}`}>{record.winRate}%</p>
        </div>
        <div className="premium-card rounded-xl p-3">
          <p className="text-[10px] text-vapor uppercase tracking-wider">Matches</p>
          <p className="text-lg font-black font-mono">{record.total}</p>
        </div>
      </div>
    </div>
  );
}

export default function RecentForm({ teamAPlayers, teamBPlayers }) {
  const hasPlayers = (teamAPlayers?.length || 0) + (teamBPlayers?.length || 0) > 0;
  const teamARecord = getTeamRecord(teamAPlayers);
  const teamBRecord = getTeamRecord(teamBPlayers);

  return (
    <div className="premium-panel rounded-3xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-green" />
        <h3 className="font-bold text-sm">Team Record</h3>
      </div>

      {!hasPlayers ? (
        <div className="py-8 text-center text-sm text-vapor">No participant records yet.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <RecordCard label="Team Alpha" color="cyan" record={teamARecord} />
          <RecordCard label="Team Bravo" color="orange" record={teamBRecord} />
        </div>
      )}
    </div>
  );
}
