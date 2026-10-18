const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const partyMatchLabel = (match) => match.lane === "final" ? (match.round === 2 ? "Grand Final reset" : "Grand Final")
  : `${match.lane === "lower" ? "Losers" : "Winners"} R${match.round} · Match ${match.number}`;

// Balanced seed positions distribute byes rather than placing empty branches together.
function seedPositions(size) {
  let seeds = [1, 2];
  while (seeds.length < size) seeds = seeds.flatMap((seed) => [seed, seeds.length * 2 + 1 - seed]);
  return seeds;
}

export function createPartyBracket(teamIds, { format = "single_elimination", best_of = 3, game_mode = "snd", id = "" } = {}) {
  if (!["single_elimination", "double_elimination"].includes(format)) fail("Choose single or double elimination");
  if (![1, 3, 5].includes(best_of) || !["snd", "hardpoint", "cdl"].includes(game_mode)) fail("Choose a valid game mode and series format");
  if (teamIds.length < 2 || teamIds.length > 16 || new Set(teamIds).size !== teamIds.length) fail("A bracket needs 2–16 unique teams");
  const size = 2 ** Math.ceil(Math.log2(teamIds.length)), rounds = Math.log2(size);
  const seeds = seedPositions(size).map((seed) => teamIds[seed - 1] || null);
  const bracket = { id, format, best_of, game_mode, status: "in_progress", started_at: new Date().toISOString(), champion_id: null, matches: [] };
  const key = (lane, round, number) => `${id ? `${id}-` : ""}${lane}-${round}-${number}`;
  const get = (lane, round, number) => bracket.matches.find((match) => match.id === key(lane, round, number));
  const add = (lane, round, number, slots = [null, null]) => {
    const match = { id: key(lane, round, number), lane, round, number, slots, status: "pending", teams: [null, null], score: null, winner_id: null, loser_id: null, messages: [], reports: {} };
    bracket.matches.push(match); return match;
  };
  const source = (match, outcome = "winner") => ({ match_id: match.id, outcome });
  for (let round = 1; round <= rounds; round++) for (let number = 1; number <= size / 2 ** round; number++) {
    add("upper", round, number, round === 1 ? [{ team_id: seeds[(number - 1) * 2] }, { team_id: seeds[(number - 1) * 2 + 1] }]
      : [source(get("upper", round - 1, number * 2 - 1)), source(get("upper", round - 1, number * 2))]);
  }
  if (format === "double_elimination") {
    for (let round = 1; round <= rounds * 2 - 2; round++) {
      const count = size / 2 ** (Math.floor((round + 1) / 2) + 1);
      for (let number = 1; number <= count; number++) {
        const slots = round === 1 ? [source(get("upper", 1, number * 2 - 1), "loser"), source(get("upper", 1, number * 2), "loser")]
          : round % 2 === 0 ? [source(get("lower", round - 1, number)), source(get("upper", round / 2 + 1, count - number + 1), "loser")]
            : [source(get("lower", round - 1, number * 2 - 1)), source(get("lower", round - 1, number * 2))];
        add("lower", round, number, slots);
      }
    }
    const upperFinal = get("upper", rounds, 1);
    add("final", 1, 1, [source(upperFinal), source(rounds === 1 ? upperFinal : get("lower", rounds * 2 - 2, 1), rounds === 1 ? "loser" : "winner")]);
  }
  advancePartyBracket(bracket);
  return bracket;
}

export function advancePartyBracket(bracket) {
  const byId = new Map(bracket.matches.map((match) => [match.id, match]));
  // Matches are stored in dependency order; empty branches resolve only after their sources do.
  for (const match of bracket.matches) {
    if (["completed", "bye"].includes(match.status)) continue;
    const resolved = match.slots.map((slot) => {
      if (!slot) return { done: true, team: null };
      if ("team_id" in slot) return { done: true, team: slot.team_id };
      const from = byId.get(slot.match_id);
      return { done: Boolean(from && ["completed", "bye"].includes(from.status)), team: from?.[`${slot.outcome}_id`] || null };
    });
    match.teams = resolved.map((slot) => slot.team);
    if (!resolved.every((slot) => slot.done)) continue;
    if (match.teams.every(Boolean)) { match.status = "ready"; continue; }
    match.status = "bye";
    match.winner_id = match.teams.find(Boolean) || null;
    match.loser_id = null;
  }
  const last = bracket.matches.at(-1);
  if (last.status === "completed" || last.status === "bye") {
    // The winners finalist must lose twice. A lower-bracket victory triggers one reset.
    if (bracket.format === "double_elimination" && last.lane === "final" && last.round === 1 && last.winner_id === last.teams[1]) {
      bracket.matches.push({ ...last, id: `${bracket.id ? `${bracket.id}-` : ""}final-2-1`, round: 2, slots: last.teams.map((team_id) => ({ team_id })), teams: [...last.teams], status: "ready", score: null, winner_id: null, loser_id: null, messages: [], reports: {}, completed_at: null, series_maps: [], maps_generated_at: null });
    } else {
      bracket.status = "completed"; bracket.champion_id = last.winner_id; bracket.completed_at = new Date().toISOString();
    }
  }
  return bracket;
}

export function recordPartyScore(bracket, matchId, scores) {
  if (bracket.status !== "in_progress") fail("This bracket is already complete", 409);
  const match = bracket.matches.find((entry) => entry.id === matchId);
  if (!match || match.status !== "ready") fail("This match is not ready for a result", 409);
  const required = Math.ceil(bracket.best_of / 2);
  if (!Array.isArray(scores) || scores.length !== 2 || scores.some((score) => !Number.isInteger(score) || score < 0 || score > required)
      || scores[0] === scores[1] || Math.max(...scores) !== required) fail(`Enter a finished series: first to ${required} map ${required === 1 ? "win" : "wins"}`);
  match.score = [...scores];
  match.winner_id = match.teams[scores[0] > scores[1] ? 0 : 1];
  match.loser_id = match.teams[scores[0] > scores[1] ? 1 : 0];
  match.status = "completed"; match.completed_at = new Date().toISOString();
  return advancePartyBracket(bracket);
}
