import React from "react";
import { Trophy } from "lucide-react";

const getRecord = (players = []) => {
  const wins = players.reduce((sum, player) => sum + (player.wager_wins || 0), 0);
  const losses = players.reduce((sum, player) => sum + (player.wager_losses || 0), 0);
  const total = wins + losses;
  return {
    wins,
    losses,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
  };
};

export default function HeadToHead({ teamAPlayers, teamBPlayers }) {
  const hasPlayers = (teamAPlayers?.length || 0) + (teamBPlayers?.length || 0) > 0;
  const teamA = getRecord(teamAPlayers);
  const teamB = getRecord(teamBPlayers);

  return (
    <div className="glass rounded-xl border border-white/5 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-yellow-400" />
        <h3 className="font-bold text-sm">TEAM RECORD COMPARISON</h3>
      </div>

      {!hasPlayers ? (
        <div className="py-8 text-center text-sm text-vapor">No participant records yet.</div>
      ) : (
        <>

          <div className="flex items-center justify-center gap-8 mb-4">
            <div className="text-center">
              <p className="text-3xl font-black text-cyan">{teamA.wins}-{teamA.losses}</p>
              <p className="text-xs text-vapor uppercase">Team Alpha Record</p>
            </div>
            <div className="text-2xl text-vapor font-bold">vs</div>
            <div className="text-center">
              <p className="text-3xl font-black text-orange">{teamB.wins}-{teamB.losses}</p>
              <p className="text-xs text-vapor uppercase">Team Bravo Record</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/50 rounded-lg p-4 border border-white/5">
              <p className="text-xs text-vapor mb-1 uppercase tracking-wider">Team Alpha Win Rate</p>
              <p className="text-lg font-bold text-cyan">{teamA.winRate}%</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-4 border border-white/5">
              <p className="text-xs text-vapor mb-1 uppercase tracking-wider">Team Bravo Win Rate</p>
              <p className="text-lg font-bold text-orange">{teamB.winRate}%</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
