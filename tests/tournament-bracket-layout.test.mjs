import test from "node:test";
import assert from "node:assert/strict";
import { BRACKET_METRICS, buildTournamentBracketLayout } from "../src/lib/tournamentBracketLayout.js";

function elimination(teams) {
  const size = 2 ** Math.ceil(Math.log2(teams)), rounds = Math.log2(size), matches = [];
  let nextTeam = 1;
  for (let round = 1; round <= rounds; round += 1) for (let number = 1; number <= size / 2 ** round; number += 1) {
    const row = { id: `w${round}-${number}`, bracket: "winner", round, match_number: number, status: "pending", is_final: round === rounds };
    if (round === 1) {
      row.team_a_id = `t${nextTeam++}`;
      row.team_a_name = row.team_a_id;
      // Spread byes among first-round matches, as the generated bracket does.
      const bye = number % 2 === 1 && number <= (size - teams) * 2;
      if (!bye) { row.team_b_id = `t${nextTeam++}`; row.team_b_name = row.team_b_id; }
      else Object.assign(row, { status: "completed", completed: true, winner_id: row.team_a_id, bye: true });
    }
    if (round < rounds) Object.assign(row, {
      next_match_id: `w${round + 1}-${Math.ceil(number / 2)}`,
      next_match_round: round + 1, next_match_number: Math.ceil(number / 2),
      next_match_bracket: "winner", slot_in_next: number % 2 === 1 ? "team_a" : "team_b",
    });
    matches.push(row);
  }
  return matches;
}

const nodeMap = (layout) => new Map(layout.lanes.flatMap((lane) => lane.nodes).map((node) => [node.id, node]));
function assertGeometry(layout) {
  const { cardWidth, cardHeight, rowGap } = BRACKET_METRICS;
  for (const lane of layout.lanes) {
    for (const round of lane.rounds) {
      const nodes = lane.nodes.filter((node) => node.column === round.index).sort((a, b) => a.y - b.y);
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        assert.equal(node.x, round.x);
        assert.ok(node.x + cardWidth <= lane.width);
        assert.ok(node.y + cardHeight <= lane.height);
        if (index) assert.ok(node.y - nodes[index - 1].y >= cardHeight + rowGap);
      }
    }
    const byId = new Map(lane.nodes.map((node) => [node.id, node]));
    for (const edge of lane.edges) {
      assert.ok(byId.has(edge.from) && byId.has(edge.to));
      assert.ok(edge.x2 > edge.x1);
      assert.equal(edge.y2, byId.get(edge.to).y + (edge.slot === "team_b" ? 71 : 44));
    }
  }
}

test("board dimensions follow the shared card geometry", () => {
  assert.deepEqual(BRACKET_METRICS, { cardWidth: 248, cardHeight: 100, columnGap: 56, rowGap: 24, headerHeight: 48, padding: 18 });
  assert.ok(Object.isFrozen(BRACKET_METRICS));
});

test("empty and malformed collections return an empty safe board", () => {
  for (const input of [[], null, "bad", [null, undefined]]) {
    assert.deepEqual(buildTournamentBracketLayout(input), { lanes: [], externalRoutes: [], champion: null });
  }
});

test("12 teams in 16 slots retain byes and center every later match on its feeders", () => {
  const layout = buildTournamentBracketLayout(elimination(12)), lane = layout.lanes[0], nodes = nodeMap(layout);
  assert.equal(lane.nodes.length, 15);
  assert.deepEqual(lane.rounds.map((round) => round.label), ["Round of 16", "Quarterfinals", "Semifinals", "Final"]);
  assert.equal(lane.nodes.filter((node) => node.match.bye && node.column === 0).length, 4);
  assert.equal(lane.edges.length, 14);
  for (const node of lane.nodes.filter((entry) => entry.column > 0)) {
    const feeders = lane.edges.filter((edge) => edge.to === node.id).map((edge) => nodes.get(edge.from));
    assert.equal(node.y, feeders.reduce((sum, feeder) => sum + feeder.y, 0) / feeders.length);
  }
  assertGeometry(layout);
});

test("six teams use the real eight-slot tree rather than six equally stacked lists", () => {
  const layout = buildTournamentBracketLayout(elimination(6)), lane = layout.lanes[0];
  assert.equal(lane.nodes.length, 7);
  assert.deepEqual(lane.rounds.map((round) => round.label), ["Quarterfinals", "Semifinals", "Final"]);
  assert.equal(lane.nodes.filter((node) => node.column === 0 && node.match.bye).length, 2);
  assert.equal(lane.nodes.find((node) => node.id === "w3-1").y, 252);
  assertGeometry(layout);
});

test("explicit route topology controls vertical order even when match numbers differ", () => {
  const rows = elimination(8);
  for (const row of rows.filter((match) => match.round === 1)) {
    row.next_match_id = row.match_number <= 2 ? "w2-2" : "w2-1";
    row.next_match_number = row.match_number <= 2 ? 2 : 1;
  }
  const layout = buildTournamentBracketLayout(rows), nodes = nodeMap(layout);
  assert.ok(nodes.get("w2-2").y < nodes.get("w2-1").y);
  assert.equal(nodes.get("w2-2").y, (nodes.get("w1-1").y + nodes.get("w1-2").y) / 2);
  assertGeometry(layout);
});

test("destination source references work without outgoing route fields", () => {
  const rows = [
    { id: "a", round: 1, match_number: 1, team_a_id: "a1", team_b_id: "a2" },
    { id: "b", round: 1, match_number: 2, team_a_id: "b1", team_b_id: "b2" },
    { id: "final", round: 2, match_number: 1, team_a_source_match_id: "b", team_b_source_match_id: "a" },
  ];
  const layout = buildTournamentBracketLayout(rows), edges = layout.lanes[0].edges;
  assert.equal(edges.length, 2);
  assert.equal(edges.find((edge) => edge.slot === "team_a").from, "b");
  assertGeometry(layout);
});

test("round and number route fields resolve legacy explicit links", () => {
  const rows = elimination(4).map(({ next_match_id, ...row }) => row);
  const layout = buildTournamentBracketLayout(rows);
  assert.equal(layout.lanes[0].edges.length, 2);
  assertGeometry(layout);
});

test("route-less legacy winners receive positional links only across consecutive rounds", () => {
  const rows = elimination(4).map(({ next_match_id, next_match_round, next_match_number, next_match_bracket, slot_in_next, ...row }) => row);
  assert.equal(buildTournamentBracketLayout(rows).lanes[0].edges.length, 2);
  rows.find((row) => row.round === 2).round = 3;
  const sparse = buildTournamentBracketLayout(rows);
  assert.equal(sparse.lanes[0].edges.length, 0);
  assert.deepEqual(sparse.lanes[0].rounds.map((round) => round.round), [1, 3]);
});

test("future rounds remain visible while empty branches and their edges disappear", () => {
  const rows = elimination(4);
  Object.assign(rows[0], { team_a_id: null, team_b_id: null, status: "completed", empty_bracket_slot: true });
  const layout = buildTournamentBracketLayout(rows), lane = layout.lanes[0];
  assert.deepEqual(lane.nodes.map((node) => node.id), ["w1-2", "w2-1"]);
  assert.equal(lane.edges.length, 1);
  assert.equal(lane.nodes[1].match.bye, true);
  assert.equal(lane.nodes[1].y, lane.nodes[0].y);
  assertGeometry(layout);
});

test("an explicit missing source never receives a fabricated positional feeder", () => {
  const rows = elimination(4);
  Object.assign(rows[0], { next_match_id: "deleted-match", next_match_round: 2, next_match_number: 1 });
  const layout = buildTournamentBracketLayout(rows);
  assert.equal(layout.lanes[0].edges.length, 1);
  assert.equal(layout.lanes[0].edges[0].from, "w1-2");
});

function doubleElimination() {
  const rows = elimination(4);
  Object.assign(rows[0], { loser_match_id: "l1", loser_match_bracket: "loser", loser_slot_in_next: "team_a" });
  Object.assign(rows[1], { loser_match_id: "l1", loser_match_bracket: "loser", loser_slot_in_next: "team_b" });
  Object.assign(rows[2], { next_match_id: "gf", next_match_bracket: "grand_final", slot_in_next: "team_a", loser_match_id: "l2", loser_match_bracket: "loser", loser_slot_in_next: "team_b" });
  rows.push(
    { id: "l1", bracket: "loser", round: 1, match_number: 1, next_match_id: "l2", slot_in_next: "team_a" },
    { id: "l2", bracket: "loser", round: 2, match_number: 1, next_match_id: "gf", slot_in_next: "team_b" },
    { id: "gf", bracket: "grand_final", round: 1, match_number: 1, next_match_id: "reset", slot_in_next: "team_b", loser_match_id: "reset", loser_slot_in_next: "team_a" },
    { id: "reset", bracket: "grand_final", round: 2, match_number: 1, double_elimination_reset: true },
  );
  return rows;
}

test("double elimination separates lower/finals and retains reset outcome routes", () => {
  const layout = buildTournamentBracketLayout(doubleElimination());
  assert.deepEqual(layout.lanes.map((lane) => lane.key), ["winner", "loser", "grand_final"]);
  assert.deepEqual(layout.lanes.map((lane) => lane.nodes.length), [3, 2, 2]);
  assert.deepEqual(layout.lanes[2].rounds.map((round) => round.label), ["Grand final", "Bracket reset"]);
  assert.equal(layout.externalRoutes.length, 5);
  assert.equal(layout.lanes[2].edges.length, 2);
  assert.deepEqual(layout.lanes[2].edges.map((edge) => edge.outcome).sort(), ["loser", "winner"]);
  assert.equal(layout.lanes[2].nodes[0].y, layout.lanes[2].nodes[1].y);
  assertGeometry(layout);
});

test("global match numbers are unique across every lane", () => {
  const layout = buildTournamentBracketLayout(doubleElimination()), numbers = layout.lanes.flatMap((lane) => lane.nodes.map((node) => node.number));
  assert.equal(new Set(numbers).size, numbers.length);
  assert.deepEqual(numbers.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test("duplicate records choose the latest visible match and resolve legacy aliases", () => {
  const rows = elimination(4);
  const latestFinal = { ...rows[2], id: "new-final", updated_date: "2026-10-24T10:00:00Z" };
  rows.push(latestFinal);
  const layout = buildTournamentBracketLayout(rows);
  assert.equal(layout.lanes[0].nodes.length, 3);
  assert.equal(layout.lanes[0].nodes[2].id, "new-final");
  assert.equal(layout.lanes[0].edges.length, 2);
  assert.ok(layout.lanes[0].edges.every((edge) => edge.to === "new-final"));
});

test("self and backward cyclic routes do not create invalid connecting lines", () => {
  const rows = elimination(4);
  Object.assign(rows[2], { next_match_id: "w1-1", slot_in_next: "team_a" });
  const layout = buildTournamentBracketLayout(rows);
  assert.equal(layout.lanes[0].edges.length, 2);
  rows[0].next_match_id = rows[0].id;
  assert.equal(buildTournamentBracketLayout(rows).lanes[0].edges.length, 1);
  assertGeometry(layout);
});

test("input matches stay untouched, including frozen arrays and objects", () => {
  const rows = elimination(6), before = JSON.stringify(rows);
  rows.forEach(Object.freeze); Object.freeze(rows);
  const layout = buildTournamentBracketLayout(rows);
  assert.equal(JSON.stringify(rows), before);
  assert.notEqual(layout.lanes[0].nodes[0].match, rows[0]);
});

test("a champion needs a completed final and a lower-side grand final win awaits its reset", () => {
  const rows = elimination(4);
  assert.equal(buildTournamentBracketLayout(rows).champion, null);
  Object.assign(rows[2], { completed: true, winner_id: "champ", winner_name: "Champions" });
  assert.deepEqual(buildTournamentBracketLayout(rows).champion, { id: "champ", name: "Champions", matchId: "w2-1" });
  const final = { id: "gf", bracket: "grand_final", round: 1, team_a_id: "upper", team_b_id: "lower", completed: true, winner_id: "lower", double_elimination_reset_eligible: true };
  assert.equal(buildTournamentBracketLayout([final]).champion, null);
  assert.equal(buildTournamentBracketLayout([final], { status: "completed" }).champion.id, "lower");
});

test("missing double-elimination finals never promote the winners-bracket qualifier to champion", () => {
  const rows = elimination(4);
  Object.assign(rows[2], { completed: true, bracket_final: true, winner_id: "qualifier", winner_name: "Qualifier" });
  assert.equal(buildTournamentBracketLayout(rows, { bracket_type: "double_elimination" }).champion, null);
  assert.equal(buildTournamentBracketLayout(rows, { format: "double_elimination" }).champion, null);
  const lower = { id: "lower", bracket: "loser", round: 1, match_number: 1, team_a_id: "a", team_b_id: "b" };
  assert.equal(buildTournamentBracketLayout([...rows, lower]).champion, null);
  assert.equal(buildTournamentBracketLayout(rows, { bracket_type: "double_elimination", winner_id: "actual", winner_name: "Confirmed winner" }).champion.id, "actual");
});

test("cancelled tournaments do not infer champions from historical completed matches", () => {
  const rows = elimination(4);
  Object.assign(rows[2], { completed: true, winner_id: "old-result" });
  assert.equal(buildTournamentBracketLayout(rows, { status: "cancelled" }).champion, null);
});
