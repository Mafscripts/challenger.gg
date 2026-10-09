import test from "node:test";
import assert from "node:assert/strict";
import { participantBelongsToUser, profileMatchOutcome, tournamentMatchSideFor } from "../src/lib/profileMatchResults.js";

const wager = (winner = "alpha-captain", type = "8s") => ({ id: "wager1", status: "completed", match_type: type,
  host_id: "alpha-captain", challenger_id: "bravo-captain", winner_id: winner });
const roster = Array.from({ length: 8 }, (_, index) => ({ wager_id: "wager1", user_id: index === 0 ? "alpha-captain" : index === 4 ? "bravo-captain" : `player${index}`,
  team: index < 4 ? "host" : "challenger" }));
const entry = (side = "a", tournament = "tournament1") => ({ id: `entry-${side}`, tournament_id: tournament,
  team_id: `team-${side}`, captain_id: `captain-${side}`, members: [{ user_id: `captain-${side}` }, { user_id: "member" }] });
const tournament = (winner = "team-a") => ({ id: "tournament-match", tournament_id: "tournament1", status: "completed",
  team_a_id: "team-a", team_a_participant_id: "entry-a", team_b_id: "team-b", team_b_participant_id: "entry-b", winner_id: winner });

for (const type of ["8s", "money8s", "wagers"]) {
  for (const winner of ["alpha-captain", "bravo-captain"]) test(`${type}: every player on the winning team gets a win, not just its captain (${winner})`, () => {
    const match = wager(winner, type);
    for (const player of roster) {
      const winningSide = winner === "alpha-captain" ? "host" : "challenger";
      assert.equal(profileMatchOutcome(match, player.user_id, { wagerParticipants: roster }), player.team === winningSide ? "win" : "loss");
    }
  });
}

test("saved personal reward results work when recent participant rows are missing or stale", () => {
  const match = { ...wager(), xp_changes: { member: { won: true }, loser: { won: false } } };
  assert.equal(profileMatchOutcome(match, "member"), "win");
  assert.equal(profileMatchOutcome(match, "loser"), "loss");
  assert.equal(profileMatchOutcome(match, "member", { wagerParticipants: [{ wager_id: match.id, user_id: "member", team: "challenger" }] }), "win");
  const ranked = { ...wager(), match_type: "ranked", elo_changes: { member: { won: true } } };
  assert.equal(profileMatchOutcome(ranked, "member"), "win");
});

test("loss at zero ELO is determined from the actual team, not an ELO sign or win-rate guess", () => {
  const match = { ...wager(), free_eights_elo_changes: { player5: { delta: 0, previous_elo: 0, new_elo: 0 } } };
  assert.equal(profileMatchOutcome(match, "player5", { wagerParticipants: roster }), "loss");
});

test("legacy side names and numeric IDs identify the player's correct team", () => {
  const match = { ...wager("2"), host_id: "1", challenger_id: 2 };
  assert.equal(profileMatchOutcome(match, "3", { wagerParticipants: [{ wager_id: match.id, user_id: 3, side: "team_b" }] }), "win");
  assert.equal(profileMatchOutcome(match, 4, { wagerParticipants: [{ wager_id: match.id, user_id: "4", team: "Team Alpha" }] }), "loss");
});

for (const winner of ["team-a", "team-b", "entry-a", "entry-b"]) test(`tournament members use the winning team/entry ID (${winner})`, () => {
  const match = tournament(winner);
  for (const side of ["a", "b"]) {
    const participant = entry(side);
    const expected = winner.endsWith(side) ? "win" : "loss";
    for (const userId of ["member", participant.captain_id]) {
      assert.equal(profileMatchOutcome(match, userId, { tournamentParticipants: [participant] }), expected);
    }
  }
});

test("solo tournament entries support user IDs as well as participant IDs", () => {
  const match = { ...tournament(), team_a_id: "solo-a", team_b_id: "solo-b", winner_id: "solo-a" };
  const participants = [{ id: "entry-a", tournament_id: "tournament1", user_id: "solo-a" }, { id: "entry-b", tournament_id: "tournament1", user_id: "solo-b" }];
  assert.equal(profileMatchOutcome(match, "solo-a", { tournamentParticipants: participants }), "win");
  assert.equal(profileMatchOutcome(match, "solo-b", { tournamentParticipants: participants }), "loss");
});

test("tournament side detection is scoped to the match's tournament", () => {
  const participant = entry("a", "other-tournament");
  assert.equal(tournamentMatchSideFor(tournament(), [participant]), null);
  assert.equal(profileMatchOutcome(tournament(), "member", { tournamentParticipants: [participant] }), "pending");
  assert.equal(participantBelongsToUser(participant, "member"), true);
  assert.equal(participantBelongsToUser(participant, "outsider"), false);
});

test("missing or ambiguous membership and unknown winners never imply a loss", () => {
  assert.equal(profileMatchOutcome(wager(), "missing-member"), "pending");
  assert.equal(profileMatchOutcome({ ...wager(), winner_id: "unknown-winner" }, "alpha-captain"), "pending");
  assert.equal(profileMatchOutcome(wager(), "member", { wagerParticipants: [
    { wager_id: "wager1", user_id: "member", team: "host" }, { wager_id: "wager1", user_id: "member", team: "challenger" },
  ] }), "pending");
  assert.equal(profileMatchOutcome(tournament(), "member", { tournamentParticipants: [entry("a"), entry("b")] }), "pending");
});

test("unfinished, disputed, cancelled or expired matches never use leftover result/reward fields", () => {
  for (const status of ["open", "in_progress", "disputed", "cancelled", "expired"]) {
    const match = { ...wager(), status, xp_changes: { member: { won: true } } };
    assert.equal(profileMatchOutcome(match, "member"), "pending");
    assert.equal(profileMatchOutcome(match, "alpha-captain"), "pending");
  }
  assert.equal(profileMatchOutcome({ ...tournament(), status: undefined, completed: false }, "member", { tournamentParticipants: [entry()] }), "pending");
});

test("ranked/XP/wager captain and legacy solo results remain correct", () => {
  for (const match_type of ["ranked", "xp", "wagers"]) {
    const match = { ...wager(), match_type };
    assert.equal(profileMatchOutcome(match, "alpha-captain"), "win");
    assert.equal(profileMatchOutcome(match, "bravo-captain"), "loss");
  }
  assert.equal(profileMatchOutcome({ winner_id: "solo", loser_id: "opponent" }, "solo"), "win");
  assert.equal(profileMatchOutcome({ winner_id: "solo", loser_id: "opponent" }, "opponent"), "loss");
});
