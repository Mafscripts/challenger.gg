const bracket = (match) => match?.bracket || "winner";
const position = (match) => `${bracket(match)}:${Number(match.round || 1)}:${Number(match.match_number || 1)}`;
const complete = (match) => Boolean(match.completed || match.status === "completed");
const freshness = (match) => {
  const date = Date.parse(match.updated_date || match.created_date || "");
  return (Number.isFinite(date) ? date : 0)
    + 10 * (Number(Boolean(match.team_a_id)) + Number(Boolean(match.team_b_id)))
    + 100 * Number(Boolean(match.winner_id));
};

// Keep genuine future matches, but remove branches that cannot receive any team.
// Looking only at empty slots would also hide semifinals before round one finishes.
export function visibleTournamentMatches(matches = []) {
  const positions = new Map();
  for (const match of matches) {
    const key = position(match), previous = positions.get(key);
    if (!previous || freshness(match) >= freshness(previous)) positions.set(key, match);
  }
  const rows = [...positions.values()], byId = new Map(rows.map((match) => [String(match.id), match]));
  const incoming = new Map();
  for (const source of rows) for (const outcome of ["winner", "loser"]) {
    const prefix = outcome === "winner" ? "next" : "loser";
    const slot = source[outcome === "winner" ? "slot_in_next" : "loser_slot_in_next"];
    if (!["team_a", "team_b"].includes(slot)) continue;
    const id = source[`${prefix}_match_id`];
    const round = source[`${prefix}_match_round`], number = source[`${prefix}_match_number`];
    const destination = id ? byId.get(String(id)) : positions.get(`${source[`${prefix}_match_bracket`] || bracket(source)}:${round}:${number}`);
    if (destination) incoming.set(`${position(destination)}:${slot}`, { source, outcome });
  }
  const memo = new Map(), visiting = new Set();
  const possible = (match) => {
    const key = position(match);
    if (memo.has(key)) return memo.get(key);
    // Incomplete legacy data must not cause a real match to disappear.
    if (visiting.has(key)) return { winner: true, loser: true, slots: 2 };
    if (!match.team_a_id && !match.team_b_id && (match.empty_bracket_slot || complete(match) && !match.winner_id)) {
      const empty = { winner: false, loser: false, slots: 0, a: false, b: false };
      memo.set(key, empty); return empty;
    }
    visiting.add(key);
    const slotPossible = (slot) => {
      if (match[`${slot}_id`]) return true;
      const sourceId = match[`${slot}_source_match_id`];
      let route = incoming.get(`${key}:${slot}`);
      if (sourceId) {
        const source = byId.get(String(sourceId));
        if (!source) return true;
        route = { source, outcome: match[`${slot}_source_outcome`] === "loser" ? "loser" : "winner" };
      }
      // Older single elimination brackets used round/number routes only.
      if (!route && bracket(match) === "winner" && Number(match.round) > 1) {
        const number = (Number(match.match_number || 1) - 1) * 2 + (slot === "team_a" ? 1 : 2);
        const source = positions.get(`winner:${Number(match.round) - 1}:${number}`);
        if (source) route = { source, outcome: "winner" };
      }
      if (route) return possible(route.source)[route.outcome];
      if (match.empty_bracket_slot || complete(match)) return false;
      return bracket(match) !== "winner" || Number(match.round || 1) > 1;
    };
    const a = slotPossible("team_a"), b = slotPossible("team_b");
    const slots = Number(a) + Number(b);
    const resolved = complete(match) && (match.winner_id || match.empty_bracket_slot || slots < 2);
    const result = {
      slots, a, b,
      winner: resolved ? Boolean(match.winner_id) : slots > 0,
      loser: resolved ? Boolean(match.winner_id && match.team_a_id && match.team_b_id) : slots > 1,
    };
    visiting.delete(key); memo.set(key, result); return result;
  };
  return rows.filter((match) => possible(match).slots > 0).map((match) => ({
    ...match, bye: possible(match).slots === 1, team_a_bye: !possible(match).a, team_b_bye: !possible(match).b,
  }));
}
