import test from "node:test";
import assert from "node:assert/strict";
import { loginDestination } from "../src/lib/loginDestination.js";
const origin = "https://www.topfragg.gg";

test("ordinary sign-in and old dashboard links lead to the new homepage", () => {
  for (const requested of [undefined, null, "", "/dashboard", "/dashboard/"]) assert.equal(loginDestination(requested, origin), "/");
  assert.equal(loginDestination("/dashboard?game=mw4#matches", origin), "/?game=mw4#matches");
});

test("explicit match and competition return links are preserved", () => {
  for (const requested of ["/xp?game=bo7", "/8s-match/abc", "/tournaments/123#bracket"]) assert.equal(loginDestination(requested, origin), requested);
});

test("unsafe external links and authentication loops fall back to home", () => {
  for (const requested of ["https://example.com", "//example.com", "javascript:alert(1)", "/login?returnTo=/dashboard", "/logout", "/change-password", "/register", "http://["]) assert.equal(loginDestination(requested, origin), "/");
});
