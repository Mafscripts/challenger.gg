import test from "node:test";
import assert from "node:assert/strict";
import { challengerIdentityAfterAccept } from "./wager-acceptance.js";

test("stores the accepting captain as challenger for a team wager", () => {
  assert.deepEqual(challengerIdentityAfterAccept({}, {
    isTeamMatch: true,
    individualSide: false,
    acceptingUserId: "captain-2",
    acceptingUserName: "Bravo Captain",
  }), {
    challenger_id: "captain-2",
    challenger_name: "Bravo Captain",
  });
});

test("does not mark an 8s player assigned to the host side as challenger", () => {
  assert.deepEqual(challengerIdentityAfterAccept({}, {
    isTeamMatch: false,
    individualSide: "host",
    acceptingUserId: "player-2",
    acceptingUserName: "Player Two",
  }), {
    challenger_id: "",
    challenger_name: "",
  });
});

test("preserves an existing challenger identity", () => {
  assert.deepEqual(challengerIdentityAfterAccept({
    challenger_id: "existing-id",
    challenger_name: "Existing Captain",
  }, {
    isTeamMatch: true,
    individualSide: false,
    acceptingUserId: "new-id",
    acceptingUserName: "New Captain",
  }), {
    challenger_id: "existing-id",
    challenger_name: "Existing Captain",
  });
});
