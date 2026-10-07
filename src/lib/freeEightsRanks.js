// Free 8s has its own ladder; never use Ranked ELO or the legacy 8s rating.
export const FREE_EIGHTS_RANKS = [
  { key: "newb", name: "Newb", min: 0, max: 199, style: "border-slate-400/25 bg-slate-400/10 text-slate-300" },
  { key: "advanced", name: "Advanced", min: 200, max: 399, style: "border-green/25 bg-green/10 text-green" },
  { key: "amateur", name: "Amateur", min: 400, max: 599, style: "border-cyan/25 bg-cyan/10 text-cyan" },
  { key: "challenger", name: "Challenger", min: 600, max: 799, style: "border-purple-400/30 bg-purple-400/10 text-purple-300" },
  { key: "topfragger", name: "Topfragger", min: 800, max: Infinity, style: "border-yellow-300/30 bg-yellow-300/10 text-yellow-300" },
];

export const normalizeFreeEightsElo = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const getFreeEightsRank = (elo = 0) => FREE_EIGHTS_RANKS.find((rank) => normalizeFreeEightsElo(elo) <= rank.max);

export function calculateFreeEightsElo(winners, losers) {
  if (!winners.length || !losers.length) throw new Error("Both Free 8s teams are required for ELO");
  const ids = [...winners, ...losers].map((player) => player.user_id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("Free 8s ELO requires distinct players");
  const average = (players) => players.reduce((sum, player) => sum + normalizeFreeEightsElo(player.elo), 0) / players.length;
  const winnerAverage = average(winners);
  const loserAverage = average(losers);
  // Standard team-average ELO, K=40 and a 400-point expectation scale.
  const expectedWin = 1 / (1 + 10 ** ((loserAverage - winnerAverage) / 400));
  const change = Math.max(1, Math.round(40 * (1 - expectedWin)));
  const changes = {};
  for (const [players, didWin] of [[winners, true], [losers, false]]) {
    for (const player of players) {
      const before = normalizeFreeEightsElo(player.elo);
      const after = Math.max(0, before + (didWin ? change : -change));
      changes[player.user_id] = {
        previous_elo: before, new_elo: after, delta: after - before,
        previous_rank: getFreeEightsRank(before).name, new_rank: getFreeEightsRank(after).name,
        opponent_team_average_elo: Math.round(didWin ? loserAverage : winnerAverage),
      };
    }
  }
  return changes;
}
