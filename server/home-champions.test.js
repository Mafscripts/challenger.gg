import test from "node:test";
import assert from "node:assert/strict";
import { selectHomeChampions } from "./home-champions.js";

test("homepage leaders use each competition's real metric rather than one shared player ordering", () => {
  const result = selectHomeChampions({
    xp: [{ user_id: "xp-player", total_xp: 900 }, { user_id: "cash-player", total_xp: 50 }],
    wagers: [{ id: "xp-player", total_wager_earnings: 10 }, { id: "cash-player", total_wager_earnings: 400 }],
    tournaments: [{ id: "cash-player", tournament_wins: 1 }, { id: "event-player", tournament_wins: 12 }],
  });
  assert.deepEqual(result, { xp: { user_id: "xp-player", score: 900 }, wagers: { user_id: "cash-player", score: 400 }, tournaments: { user_id: "event-player", score: 12 } });
});

test("empty and zero-result ladders never invent a number one player", () => {
  assert.deepEqual(selectHomeChampions({}), { xp: null, wagers: null, tournaments: null });
  assert.equal(selectHomeChampions({ xp: [{ user_id: "new-player", total_xp: 0 }] }).xp, null);
  assert.equal(selectHomeChampions({ wagers: [{ id: "banned", is_banned: true, total_wager_earnings: 999 }] }).wagers, null);
});

test("ties have a stable order and the public selection contains no private account data", () => {
  const rows = [{ id: "b", tournament_wins: 3, email: "secret@example.test" }, { id: "a", tournament_wins: 3, password_hash: "private" }];
  assert.deepEqual(selectHomeChampions({ tournaments: rows }).tournaments, { user_id: "a", score: 3 });
  assert.deepEqual(selectHomeChampions({ tournaments: rows.reverse() }).tournaments, { user_id: "a", score: 3 });
});
