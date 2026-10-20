import test from "node:test";
import assert from "node:assert/strict";
import { nativeNavigationTab } from "../src/lib/nativeNavigation.js";

test("competition pages keep Play selected, while active match rooms select Matches", () => {
  for (const route of ["/ranked", "/ranked/8s", "/xp", "/wagers", "/tournaments", "/tournaments/event-1", "/streamer-tournament/event-1", "/matchfinder", "/challenge-a-team"]) assert.equal(nativeNavigationTab(route), "/ranked", route);
  for (const route of ["/my-matches", "/ranked-match/game-1", "/8s-match/game-1", "/wagers-match/game-1", "/tournament-match/game-1"]) assert.equal(nativeNavigationTab(route), "/my-matches", route);
});

test("native tabs use full route segments and do not highlight unrelated pages", () => {
  assert.equal(nativeNavigationTab("/"), "/dashboard");
  assert.equal(nativeNavigationTab("/dashboard"), "/dashboard");
  assert.equal(nativeNavigationTab("/settings"), "/settings");
  assert.equal(nativeNavigationTab("/messages"), "/messages");
  for (const route of ["/admin", "/login", "/ranked-unknown", "/messages-unknown"]) assert.equal(nativeNavigationTab(route), null);
});
