import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";
import { buildFreeEightsStandings } from "../src/lib/freeEightsStandings.js";
import { listEntities } from "./entity.js";
import { prisma } from "./prisma.js";

test("Free 8s positions follow ELO ahead of wins, XP and legacy rating", () => {
  const rows = buildFreeEightsStandings([
    { user_id: "many-wins", free_eights_elo: 100, wins: 99, monthly_xp: 9000, rating: 2000 },
    { user_id: "higher-elo", free_eights_elo: 400, wins: 2, monthly_xp: 100, rating: 900 },
    { user_id: "zero", free_eights_elo: 0, wins: 100, rating: 9999 },
  ]);
  assert.deepEqual(rows.map((row) => row.userId), ["higher-elo", "many-wins", "zero"]);
  assert.deepEqual(rows.map((row) => row.score), [400, 100, 0]);
  assert.ok(rows.every((row) => !Object.hasOwn(row, "xp")));
});

test("persistent ELO and match records remain visible across month changes", () => {
  const rows = buildFreeEightsStandings([
    { user_id: "previous-month", monthly_key: "2000-01", free_eights_elo: 800, wins: 17, losses: 10, monthly_wins: 1 },
    { user_id: "current", monthly_key: new Date().toISOString().slice(0, 7), free_eights_elo: 200, wins: 9, losses: 6 },
  ]);
  assert.equal(rows[0].userId, "previous-month");
  assert.equal(rows[0].wins, 17);
  assert.equal(rows[0].losses, 10);
});

test("equal ELO uses wins, then fewer losses, with a stable final order", () => {
  const rows = buildFreeEightsStandings([
    { user_id: "z", free_eights_elo: 200, wins: 5, losses: 2 },
    { user_id: "a", free_eights_elo: 200, wins: 5, losses: 2 },
    { user_id: "more-losses", free_eights_elo: 200, wins: 5, losses: 3 },
    { user_id: "fewer-wins", free_eights_elo: 200, wins: 4, losses: 0 },
  ]);
  assert.deepEqual(rows.map((row) => row.userId), ["a", "z", "more-losses", "fewer-wins"]);
});

test("missing or invalid Free 8s ELO cannot fall back to a legacy rating", () => {
  for (const free_eights_elo of [undefined, null, -20, "bad", Infinity]) {
    assert.equal(buildFreeEightsStandings([{ user_id: "p", free_eights_elo, rating: 1500 }])[0].score, 0);
  }
});

test("database sorting includes a high-ELO player beyond the first 500 stored rows", async (t) => {
  const records = Array.from({ length: 501 }, (_, index) => ({ id: `s${index}`, free_eights_elo: index === 500 ? 1000 : 0, metadata: { user_id: `u${index}` } }));
  const previous = prisma.eightsStats.findMany;
  prisma.eightsStats.findMany = async ({ orderBy, take }) => {
    assert.deepEqual(orderBy, { free_eights_elo: "desc" });
    return records.slice().sort((a, b) => b.free_eights_elo - a.free_eights_elo).slice(0, take);
  };
  t.after(() => { prisma.eightsStats.findMany = previous; });
  const rows = await listEntities("EightsStats", {}, "-free_eights_elo", 500);
  assert.equal(rows.length, 500);
  assert.equal(buildFreeEightsStandings(rows)[0].userId, "u500");
});

test("the actual 8s table labels ELO correctly and hides XP only for Free 8s", async (t) => {
  const server = await createServer({ server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [], entries: [] } });
  t.after(() => server.close());
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => {
    if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args);
  });
  const { default: Ladder } = await server.ssrLoadModule("/src/components/competition/CompetitionLadder.jsx");
  const render = (mode) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Ladder, { mode })));
  const free = render("eights");
  assert.match(free, />8s ELO<\/span>/);
  assert.doesNotMatch(free, />XP<\/span>|>Rating<\/span>/);
  assert.match(render("money8s"), />XP<\/span>/);
  assert.match(render("xp"), />XP<\/span>/);
});
