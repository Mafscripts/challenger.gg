import test from "node:test";
import assert from "node:assert/strict";
import { containsBlockedLanguage } from "./profanity-filter.js";

test("blocks common profanity in supported languages", () => {
  ["fucking", "motherfucking", "klootzak", "kutwijf", "putain", "arschloch", "pendejo"].forEach((message) => {
    assert.equal(containsBlockedLanguage(message), true);
  });
});

test("blocks punctuation and leetspeak bypass attempts", () => {
  ["f.u.c.k", "sh1t", "p-u-t-a", "m3rde"].forEach((message) => {
    assert.equal(containsBlockedLanguage(message), true);
  });
});

test("allows ordinary matchmaking text", () => {
  [
    "Looking for two players for ranked",
    "German speaking team needs one substitute",
    "Anyone available for a best of three?",
  ].forEach((message) => {
    assert.equal(containsBlockedLanguage(message), false);
  });
});
