import assert from "node:assert/strict";
import test from "node:test";
import { tournamentFormat, tournamentPrizes, tournamentRegistration } from "../src/lib/tournamentOverview.js";

const now = Date.parse("2026-10-24T20:00:00Z");
const open = { status: "open", max_teams: 48, registered_teams: 1, registration_end: "2026-10-24T22:00:00Z", start_date: "2026-10-24T23:00:00Z" };

test("modern tournament format separates series, actual modes, team size and bracket", () => {
  assert.deepEqual(tournamentFormat({ game_id: "mw4", game_mode: "Best of 3", game_modes: ["hp", "hijacked", "snd"], team_size: "4v4", bracket_type: "double_elimination" }), {
    seriesLabel: "Best of 3", modesLabel: "Hardpoint / Hijacked / Search & Destroy", bracketLabel: "Double elimination", teamSizeLabel: "4v4",
  });
});

test("legacy formats retain their real series length and modes", () => {
  const cases = [
    ["bo1_snd", "Best of 1", "Search & Destroy"],
    ["snd", "Best of 3", "Search & Destroy"],
    ["hp", "Best of 3", "Hardpoint"],
    ["snd_hp_snd", "Best of 3", "Search & Destroy / Hardpoint"],
    ["bo3_hp_overload_snd", "Best of 3", "Hardpoint / Overload / Search & Destroy"],
    ["bo5_hp_overload_snd_hp_snd", "Best of 5", "Hardpoint / Overload / Search & Destroy"],
    ["mw4", "Best of 3", "Hardpoint / Hijacked / Search & Destroy"],
  ];
  for (const [game_mode, seriesLabel, modesLabel] of cases) {
    const view = tournamentFormat({ game_mode, format: "double_elimination" });
    assert.equal(view.seriesLabel, seriesLabel, game_mode);
    assert.equal(view.modesLabel, modesLabel, game_mode);
    assert.equal(view.bracketLabel, "Double elimination");
  }
});

test("configured modes follow the server series length, with human readable custom mode names", () => {
  assert.equal(tournamentFormat({ game_mode: "Best of 1", game_modes: ["hp", "hijacked", "snd"] }).modesLabel, "Hardpoint");
  assert.equal(tournamentFormat({ game_mode: "BO7", game_modes: ["control"] }).seriesLabel, "Best of 7");
  assert.equal(tournamentFormat({ game_mode: "Best of 3 Hardpoint / Search & Destroy / Hardpoint" }).modesLabel, "Hardpoint / Search & Destroy");
  assert.equal(tournamentFormat({ game_mode: "Best of 5", game_modes: ["unknown", "hp", "hp", "snd"] }).modesLabel, "Hardpoint / Search & Destroy");
});

test("guests can sign in for public registration and joined teams cannot register twice", () => {
  assert.equal(tournamentRegistration(open, { now }).label, "Sign in to join");
  assert.equal(tournamentRegistration(open, { now }).available, true);
  assert.equal(tournamentRegistration(open, { now, user: { id: "captain" } }).label, "Join tournament");
  const joined = tournamentRegistration(open, { now, joined: true });
  assert.equal(joined.available, false);
  assert.equal(joined.status, "joined");
  assert.equal(joined.label, "Team registered");
});

test("registration expires at the cutoff, independently from stale open status", () => {
  assert.equal(tournamentRegistration(open, { now: Date.parse(open.registration_end) - 1 }).available, true);
  const expired = tournamentRegistration(open, { now: Date.parse(open.registration_end) });
  assert.equal(expired.available, false);
  assert.equal(expired.status, "closed");
  assert.match(expired.reason, /deadline/);
});

test("registration uses the start date only when no valid explicit deadline exists", () => {
  const implicit = { ...open, registration_end: null };
  assert.equal(tournamentRegistration(implicit, { now }).deadline, new Date(open.start_date).toISOString());
  assert.equal(tournamentRegistration(implicit, { now: Date.parse(open.start_date) }).available, false);
  assert.equal(tournamentRegistration({ ...implicit, registration_end: "bad date" }, { now }).deadline, new Date(open.start_date).toISOString());
  assert.equal(tournamentRegistration({ ...implicit, start_date: null }, { now }).deadline, null);
  assert.equal(tournamentRegistration({ ...implicit, start_date: null }, { now }).available, true);
});

test("locks, generated brackets and full fields block entry with distinct reasons", () => {
  assert.equal(tournamentRegistration({ ...open, registration_locked: true }, { now }).status, "locked");
  assert.equal(tournamentRegistration({ ...open, bracket_generated: true }, { now }).available, false);
  const full = tournamentRegistration({ ...open, registered_teams: 48 }, { now });
  assert.equal(full.status, "full");
  assert.equal(full.label, "Tournament full");
  assert.equal(tournamentRegistration({ ...open, max_teams: 0, registered_teams: 100 }, { now }).available, true);
});

test("only an invited captain can enter invitational events", () => {
  for (const settings of [{ invite_only: true }, { entry_type: "invitational" }]) {
    const event = { ...open, ...settings, invited_user_ids: [123] };
    assert.equal(tournamentRegistration(event, { now }).status, "invite_only");
    assert.equal(tournamentRegistration(event, { now, user: { id: "other" } }).available, false);
    assert.equal(tournamentRegistration(event, { now, user: { id: "123" } }).available, true);
  }
});

test("the registration action explains completed, live, draft, closed and cancelled events", () => {
  for (const [status, expected] of [["completed", "completed"], ["in_progress", "live"], ["live", "live"], ["draft", "draft"], ["closed", "closed"], ["cancelled", "cancelled"]]) {
    const view = tournamentRegistration({ ...open, status }, { now });
    assert.equal(view.available, false, status);
    assert.equal(view.status, expected, status);
    assert.ok(view.reason.length > 10);
  }
});

test("legacy payout percentages match the actual announced prize amounts", () => {
  assert.deepEqual(tournamentPrizes({ prize_pool: 2500, prize_distribution: { first: 80, second: 20 } }), [
    { place: 1, label: "1st place", amount: 2000 },
    { place: 2, label: "2nd place", amount: 500 },
  ]);
});

test("explicit amounts and legacy absolute payouts are not interpreted as percentages", () => {
  assert.deepEqual(tournamentPrizes({ prize_pool: 1000, prize_distribution: { first_amount: 80, first: 70, second_amount: 20, second: 30 } }).map(row => row.amount), [80, 20]);
  assert.deepEqual(tournamentPrizes({ prize_pool: 2500, prize_distribution: { first: 2000, second: 500 } }).map(row => row.amount), [2000, 500]);
  assert.deepEqual(tournamentPrizes({ prize_pool: 12.35, prize_distribution: { first: 60, second: 40 } }).map(row => row.amount), [7.41, 4.94]);
});

test("unset second and third prizes do not invent podium payouts", () => {
  assert.deepEqual(tournamentPrizes({ prize_pool: 2500 }), [{ place: 1, label: "1st place", amount: 2500 }]);
  assert.deepEqual(tournamentPrizes({ prize_pool: 2500, prize_distribution: { first_amount: 0, second_amount: 0, third: 10 } }), [{ place: 1, label: "1st place", amount: 2500 }]);
});

test("an explicitly announced third prize is retained without inferring a split", () => {
  assert.deepEqual(tournamentPrizes({ prize_pool: 2500, prize_distribution: { first_amount: 2000, second_amount: 400, third_amount: 100 } }).map(row => row.amount), [2000, 400, 100]);
  assert.equal(tournamentPrizes({ prize_pool: 100, third_place_prize: 10 }).at(-1).amount, 10);
});

test("presentation helpers do not mutate event fields and guard malformed money", () => {
  const tournament = { ...open, game_mode: "Best of 3", game_modes: ["hp", "snd"], prize_pool: "not money", prize_distribution: { first_amount: -5, second_amount: Infinity } };
  const original = structuredClone(tournament);
  tournamentFormat(tournament); tournamentRegistration(tournament, { now });
  assert.deepEqual(tournamentPrizes(tournament), [{ place: 1, label: "1st place", amount: 0 }]);
  assert.deepEqual(tournament, original);
});
