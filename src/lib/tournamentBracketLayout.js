import { visibleTournamentMatches } from "./tournamentBracketView.js";

export const BRACKET_METRICS = Object.freeze({
  cardWidth: 248,
  cardHeight: 100,
  columnGap: 56,
  rowGap: 24,
  headerHeight: 48,
  padding: 18,
});

const laneKeys = ["winner", "loser", "grand_final"];
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 1;
const laneOf = (match) => laneKeys.includes(match?.bracket) ? match.bracket : "winner";
const position = (match) => `${laneOf(match)}:${positive(match.round)}:${positive(match.match_number)}`;
const identity = (match) => String(match.id || position(match));
const freshness = (match) => {
  const date = Date.parse(match.updated_date || match.created_date || "");
  return (Number.isFinite(date) ? date : 0)
    + Number(Boolean(match.winner_id)) * 100
    + (Number(Boolean(match.team_a_id)) + Number(Boolean(match.team_b_id))) * 10;
};
const compareMatches = (a, b) => positive(a.round) - positive(b.round)
  || positive(a.match_number) - positive(b.match_number)
  || identity(a).localeCompare(identity(b));
const routeKey = (route) => `${route.from}:${route.to}:${route.outcome}:${route.slot}`;
const isComplete = (match) => Boolean(match?.completed || match?.status === "completed");

function roundLabel(lane, round, finalRound, doubleElimination) {
  if (lane === "grand_final") return round > 1 ? "Bracket reset" : "Grand final";
  if (lane === "loser") return round === finalRound ? "Lower final" : `Lower round ${round}`;
  const remaining = finalRound - round;
  if (remaining === 0) return doubleElimination ? "Winners final" : "Final";
  if (remaining === 1) return "Semifinals";
  if (remaining === 2) return "Quarterfinals";
  return `Round of ${2 ** (remaining + 1)}`;
}

function findChampion(rows, tournament) {
  if (tournament.winner_id) return {
    id: tournament.winner_id,
    name: tournament.winner_name || tournament.champion_name || "Tournament winner",
    matchId: null,
  };
  const finals = rows.filter((match) => match.bracket === "grand_final");
  const doubleElimination = (tournament.bracket_type || tournament.format) === "double_elimination"
    || rows.some((match) => laneOf(match) === "loser");
  // A winners final only qualifies a team for the championship. Missing grand
  // final records must not turn that qualification into a tournament win.
  if (tournament.status === "cancelled" || doubleElimination && !finals.length) return null;
  const candidates = finals.length ? finals : rows.filter((match) => laneOf(match) === "winner");
  const finalRound = Math.max(0, ...candidates.map((match) => positive(match.round)));
  const match = candidates.find((row) => positive(row.round) === finalRound && isComplete(row) && row.winner_id
    && (finals.length || row.is_final || row.bracket_final || tournament.status === "completed"));
  if (!match) return null;
  // A lower-bracket win in the first grand final creates a reset, rather than a champion.
  if (match.double_elimination_reset_eligible && !match.double_elimination_reset
    && String(match.winner_id) === String(match.team_b_id)
    && tournament.status !== "completed") return null;
  const name = match.winner_name || (String(match.winner_id) === String(match.team_a_id)
    ? match.team_a_name : match.team_b_name);
  return { id: match.winner_id, name: name || "Tournament winner", matchId: identity(match) };
}

/**
 * Build board coordinates from the stored progression routes. Winner/lower/final
 * boards have independent coordinates; routes between boards remain metadata.
 */
export function buildTournamentBracketLayout(matches = [], tournament = {}) {
  const raw = (Array.isArray(matches) ? matches : []).filter((match) => match && typeof match === "object");
  const ids = new Map();
  for (const match of raw) {
    const normalized = { ...match, bracket: laneOf(match), round: positive(match.round), match_number: positive(match.match_number) };
    const key = identity(normalized), previous = ids.get(key);
    if (!previous || freshness(normalized) >= freshness(previous)) ids.set(key, normalized);
  }
  const rows = visibleTournamentMatches([...ids.values()]).sort((a, b) => laneKeys.indexOf(laneOf(a)) - laneKeys.indexOf(laneOf(b)) || compareMatches(a, b));
  const byPosition = new Map(rows.map((match) => [position(match), match]));
  const byId = new Map(rows.map((match) => [identity(match), match]));
  const numbers = new Map(rows.map((match, index) => [identity(match), index + 1]));
  // Duplicate legacy records can still be referenced by their old id. Resolve
  // them only when a visible record occupies that very same bracket position.
  const aliases = new Map(raw.filter((match) => match.id).map((match) => [String(match.id), byPosition.get(position(match))]));
  const resolveId = (id) => byId.get(String(id)) || aliases.get(String(id));
  const routes = new Map(), incomingSlots = new Map();
  const declaredSlots = new Set();
  const adjacency = new Map();
  const reaches = (from, to, seen = new Set()) => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...(adjacency.get(from) || [])].some((id) => reaches(id, to, seen));
  };
  const addRoute = (source, target, outcome, slot) => {
    if (!source || !target) return;
    const from = identity(source), to = identity(target);
    if (from === to || reaches(to, from)) return;
    if (laneOf(source) === laneOf(target) && positive(target.round) <= positive(source.round)) return;
    const slotKey = `${to}:${slot}`, existing = incomingSlots.get(slotKey);
    if (existing && (existing.from !== from || existing.outcome !== outcome)) return;
    const route = { from, to, fromLane: laneOf(source), toLane: laneOf(target), outcome, slot };
    route.id = routeKey(route);
    routes.set(route.id, route);
    incomingSlots.set(slotKey, route);
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  };

  // The destination's explicit source is authoritative for each team slot.
  for (const target of rows) for (const slot of ["team_a", "team_b"]) {
    const sourceId = target[`${slot}_source_match_id`];
    if (!sourceId) continue;
    declaredSlots.add(`${identity(target)}:${slot}`);
    addRoute(resolveId(sourceId), target, target[`${slot}_source_outcome`] === "loser" ? "loser" : "winner", slot);
  }
  for (const source of rows) for (const outcome of ["winner", "loser"]) {
    const prefix = outcome === "winner" ? "next" : "loser";
    const targetId = source[`${prefix}_match_id`];
    const targetRound = source[`${prefix}_match_round`], targetNumber = source[`${prefix}_match_number`];
    const target = targetId ? resolveId(targetId)
      : targetRound && targetNumber ? byPosition.get(`${source[`${prefix}_match_bracket`] || laneOf(source)}:${positive(targetRound)}:${positive(targetNumber)}`) : null;
    if (!target) continue;
    const slot = source[outcome === "winner" ? "slot_in_next" : "loser_slot_in_next"] === "team_b" ? "team_b" : "team_a";
    const key = `${identity(target)}:${slot}`;
    if (!declaredSlots.has(key)) addRoute(source, target, outcome, slot);
  }

  // Only genuinely route-less legacy winner brackets use number-based pairing.
  // Never invent lower-bracket links or reconnect a filtered/explicit branch.
  const explicitWinnerRoutes = raw.some((match) => laneOf(match) === "winner" && (
    match.next_match_id || match.next_match_round || match.next_match_number
    || match.team_a_source_match_id || match.team_b_source_match_id
  ));
  if (!explicitWinnerRoutes) for (const source of rows.filter((match) => laneOf(match) === "winner")) {
    const target = byPosition.get(`winner:${positive(source.round) + 1}:${Math.ceil(positive(source.match_number) / 2)}`);
    addRoute(source, target, "winner", positive(source.match_number) % 2 === 1 ? "team_a" : "team_b");
  }

  const { cardWidth, cardHeight, columnGap, rowGap, headerHeight, padding } = BRACKET_METRICS;
  const top = padding + headerHeight, step = cardHeight + rowGap;
  const doubleElimination = rows.some((match) => laneOf(match) !== "winner")
    || (tournament.bracket_type || tournament.format) === "double_elimination";
  const lanes = laneKeys.map((key) => {
    const laneRows = rows.filter((match) => laneOf(match) === key);
    if (!laneRows.length) return null;
    const roundNumbers = [...new Set(laneRows.map((match) => positive(match.round)))].sort((a, b) => a - b);
    const rounds = roundNumbers.map((round, index) => ({
      key: `${key}:${round}`, label: roundLabel(key, round, roundNumbers.at(-1), doubleElimination),
      x: padding + index * (cardWidth + columnGap), round, index,
    }));
    const placed = new Map(), nodes = [];
    for (const round of rounds) {
      const columnRows = laneRows.filter((match) => positive(match.round) === round.round);
      const desired = columnRows.map((match, index) => {
        const feeders = [...routes.values()].filter((route) => route.to === identity(match) && route.fromLane === key && route.toLane === key)
          .map((route) => placed.get(route.from)).filter(Boolean);
        // A reset can receive both outcomes from one match; count its centre once.
        const centers = [...new Map(feeders.map((node) => [node.id, node.y + cardHeight / 2])).values()];
        const y = centers.length ? centers.reduce((sum, center) => sum + center, 0) / centers.length - cardHeight / 2 : top + index * step;
        return { match, y };
      }).sort((a, b) => a.y - b.y || compareMatches(a.match, b.match));
      let bottom = top - rowGap;
      for (const { match, y: idealY } of desired) {
        const node = { id: identity(match), match, x: round.x, y: Math.max(top, idealY, bottom + rowGap), column: round.index, number: numbers.get(identity(match)) };
        nodes.push(node); placed.set(node.id, node); bottom = node.y + cardHeight;
      }
    }
    const edges = [...routes.values()].filter((route) => route.fromLane === key && route.toLane === key).map((route) => {
      const from = placed.get(route.from), to = placed.get(route.to);
      return { ...route, x1: from.x + cardWidth, y1: from.y + cardHeight / 2, x2: to.x, y2: to.y + (route.slot === "team_b" ? 71 : 44) };
    });
    return {
      key, label: key === "winner" ? doubleElimination ? "Winners bracket" : "Tournament bracket" : key === "loser" ? "Lower bracket" : "Championship",
      width: padding * 2 + rounds.length * cardWidth + (rounds.length - 1) * columnGap,
      height: Math.max(...nodes.map((node) => node.y + cardHeight)) + padding,
      rounds, nodes, edges,
    };
  }).filter(Boolean);
  return {
    lanes,
    externalRoutes: [...routes.values()].filter((route) => route.fromLane !== route.toLane),
    champion: findChampion(rows, tournament),
  };
}
