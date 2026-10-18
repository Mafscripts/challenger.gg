import test from "node:test";
import assert from "node:assert/strict";
import { assertNetworkAccess, networkProtectionEnabled } from "./network-access.js";

let sequence = 0;
function setup(t, lookup) {
  const keys = ["VPN_BLOCK_ENABLED", "PROXYCHECK_PAUSED", "PROXYCHECK_API_KEY", "VPN_ALLOWED_IPS", "NODE_ENV"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { VPN_BLOCK_ENABLED: "true", PROXYCHECK_PAUSED: "false", PROXYCHECK_API_KEY: `test-secret-${++sequence}`, VPN_ALLOWED_IPS: "" });
  t.after(() => { for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; });
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const fetch = t.mock.method(globalThis, "fetch", lookup);
  return { fetch, warnings };
}
const clean = (status = "ok") => Response.json({ status, "1.1.1.1": { detections: { vpn: false, proxy: false, tor: false } } });

test("Proxycheck is paused by default, even with an old production enable flag or missing key and visitor IP", async (t) => {
  const f = setup(t, async () => { throw new Error("Paused protection must never call Proxycheck"); });
  delete process.env.PROXYCHECK_PAUSED;
  delete process.env.PROXYCHECK_API_KEY;
  assert.equal(networkProtectionEnabled(), false);
  for (const ip of [null, "1.1.1.1"]) assert.deepEqual(await assertNetworkAccess(ip), {
    allowed: true, protection_enabled: false, checked: false, reason: "protection_paused",
  });
  process.env.PROXYCHECK_PAUSED = "true";
  assert.equal((await assertNetworkAccess("1.1.1.1")).reason, "protection_paused");
  assert.equal(f.fetch.mock.callCount(), 0);
});

test("a valid clean verdict and warning verdict are accepted and cached", async (t) => {
  const f = setup(t, async (url) => {
    assert.equal(url.origin, "https://proxycheck.io");
    assert.equal(url.pathname, "/v3/1.1.1.1");
    assert.equal(url.searchParams.get("key"), process.env.PROXYCHECK_API_KEY);
    return clean("warning");
  });
  assert.equal((await assertNetworkAccess("1.1.1.1")).reason, "provider_check");
  assert.equal((await assertNetworkAccess("1.1.1.1")).reason, "cached_check");
  assert.equal(f.fetch.mock.callCount(), 1);
});

test("known VPN, proxy and Tor verdicts remain blocked", async (t) => {
  for (const field of ["vpn", "proxy", "tor"]) {
    await t.test(field, async (t) => {
      setup(t, async () => Response.json({ status: "ok", "1.1.1.1": { detections: { vpn: false, proxy: false, tor: false, [field]: true } } }));
      await assert.rejects(assertNetworkAccess("1.1.1.1"), { code: "VPN_BLOCKED", status: 403 });
    });
  }
});

test("provider denials retain specific safe reasons across cached failures", async (t) => {
  const cases = [
    [403, "denied", "100 queries exhausted, if you sign up for a free API key you'll be able to make 1,000 free queries per day.", "provider_unregistered_quota_exceeded"],
    [403, "denied", "1,000 Free queries exhausted. Try tomorrow.", "provider_quota_exceeded"],
    [401, "denied", "Invalid API key", "provider_key_rejected"],
    [200, "error", "Your API Key has been disabled.", "provider_key_rejected"],
    [429, "denied", "Too many requests per second", "provider_rate_limited"],
    [403, "denied", "Access blocked by provider", "provider_access_denied"],
    [503, "error", "Service unavailable", "provider_unavailable"],
  ];
  for (const [http, status, message, reason] of cases) await t.test(reason, async (t) => {
    const f = setup(t, async () => Response.json({ status, message }, { status: http }));
    for (let i = 0; i < 2; i++) await assert.rejects(assertNetworkAccess("1.1.1.1"), { status: 503, code: "VPN_CHECK_UNAVAILABLE", networkReason: reason });
    assert.equal(f.fetch.mock.callCount(), 1);
  });
});

test("timeouts, connection failures and malformed JSON fail closed with useful diagnostics", async (t) => {
  for (const [name, reason] of [["TimeoutError", "provider_timeout"], ["AbortError", "provider_timeout"], ["TypeError", "provider_connection_failed"]]) await t.test(name, async (t) => {
    setup(t, async () => { throw Object.assign(new Error("URL contains a secret"), { name }); });
    await assert.rejects(assertNetworkAccess("1.1.1.1"), { code: "VPN_CHECK_UNAVAILABLE", networkReason: reason });
  });
  await t.test("malformed JSON", async (t) => {
    setup(t, async () => new Response("<html>error</html>"));
    await assert.rejects(assertNetworkAccess("1.1.1.1"), { code: "VPN_CHECK_UNAVAILABLE", networkReason: "provider_invalid_response" });
  });
  await t.test("missing detection fields", async (t) => {
    setup(t, async () => Response.json({ status: "ok", "1.1.1.1": { detections: { vpn: false } } }));
    await assert.rejects(assertNetworkAccess("1.1.1.1"), { code: "VPN_CHECK_UNAVAILABLE", networkReason: "provider_invalid_response" });
  });
});

test("provider text and request secrets never appear in errors or warning logs", async (t) => {
  // Move beyond the throttle window for this diagnostic reason.
  const now = Date.now(); t.mock.method(Date, "now", () => now + 100000);
  const f = setup(t, async () => Response.json({ status: "denied", message: `Invalid API key ${process.env.PROXYCHECK_API_KEY}, IP 1.1.1.1, private detail` }, { status: 401 }));
  let failure;
  try { await assertNetworkAccess("1.1.1.1"); } catch (error) { failure = error; }
  const output = JSON.stringify({ message: failure.message, reason: failure.networkReason, warnings: f.warnings });
  assert.ok(f.warnings.length > 0);
  for (const value of [process.env.PROXYCHECK_API_KEY, "1.1.1.1", "private detail"]) assert.equal(output.includes(value), false);
});

test("missing visitor IP never bypasses protection; CEO account exceptions still work", async (t) => {
  const f = setup(t, async () => { throw new Error("No provider call expected"); });
  delete process.env.NODE_ENV;
  await assert.rejects(assertNetworkAccess(null), { networkReason: "visitor_ip_missing" });
  assert.equal((await assertNetworkAccess("1.1.1.1", { vpnAllowed: true })).reason, "account_exception");
  assert.equal(f.fetch.mock.callCount(), 0);
});
