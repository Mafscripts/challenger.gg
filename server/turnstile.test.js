import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registrationSecurityConfig, verifyLoginTurnstile, verifyRegistrationTurnstile } from "./turnstile.js";

const keys = ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_ALLOWED_HOSTNAMES"];
let originalEnv, originalFetch, calls;
beforeEach(() => {
  originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  originalFetch = globalThis.fetch;
  process.env.TURNSTILE_SITE_KEY = "test-site";
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  process.env.TURNSTILE_ALLOWED_HOSTNAMES = "topfragg.gg,www.topfragg.gg";
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return Response.json({ success: true, action: "login", hostname: "www.topfragg.gg" });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  keys.forEach(key => { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; });
});
const request = token => ({ body: { turnstile_token: token } });

test("login validates its token with Cloudflare and passes the visitor IP", async () => {
  await verifyLoginTurnstile(request("login-token"), "192.0.2.1");
  assert.deepEqual(calls, [{ url: "https://challenges.cloudflare.com/turnstile/v0/siteverify", body: { secret: "test-secret", response: "login-token", remoteip: "192.0.2.1" } }]);
  assert.deepEqual(registrationSecurityConfig(), { turnstile_required: true, turnstile_site_key: "test-site" });
});
test("missing, empty, oversized and non-string login tokens are rejected without a verification call", async () => {
  for (const token of [undefined, "", " ", "x".repeat(2049), 123]) await assert.rejects(verifyLoginTurnstile(request(token)), /before logging in/);
  assert.equal(calls.length, 0);
});
test("registration tokens cannot authorize login and login tokens cannot authorize registration", async () => {
  await assert.rejects(verifyRegistrationTurnstile(request("login-token")), /expired or failed/);
  globalThis.fetch = async () => Response.json({ success: true, action: "register", hostname: "topfragg.gg" });
  await assert.rejects(verifyLoginTurnstile(request("register-token")), /expired or failed/);
  await verifyRegistrationTurnstile(request("register-token"));
});
test("wrong hostnames, expired tokens and replayed tokens are rejected", async () => {
  for (const result of [{ success: true, action: "login", hostname: "other.example" }, { success: false, "error-codes": ["timeout-or-duplicate"] }]) {
    globalThis.fetch = async () => Response.json(result);
    await assert.rejects(verifyLoginTurnstile(request("bad-token")), /expired or failed/);
  }
});
test("Cloudflare outages and partial configuration fail closed", async () => {
  globalThis.fetch = async () => { throw new Error("Network down"); };
  await assert.rejects(verifyLoginTurnstile(request("token")), error => error.status === 503);
  delete process.env.TURNSTILE_SECRET_KEY;
  await assert.rejects(verifyLoginTurnstile(request("token")), error => error.status === 503);
});
test("unconfigured development environments preserve existing behavior", async () => {
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  await verifyLoginTurnstile(request(undefined));
  await verifyRegistrationTurnstile(request(undefined));
  assert.equal(calls.length, 0);
});
