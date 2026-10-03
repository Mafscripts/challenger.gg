import test from "node:test";
import assert from "node:assert/strict";
import { knownUserIpAddresses, normalizeIpAddress, requestIpAddress } from "./ban-enforcement.js";

test("normalizes mapped IPv4 addresses", () => {
  assert.equal(normalizeIpAddress("::ffff:203.0.113.10"), "203.0.113.10");
  assert.equal(normalizeIpAddress("[2001:db8::10]"), "2001:db8::10");
});

test("does not treat local or link-local addresses as user IPs", () => {
  assert.equal(requestIpAddress({ ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } }), null);
  assert.equal(requestIpAddress({ ip: "::1", socket: { remoteAddress: "::1" } }), null);
  assert.deepEqual(
    knownUserIpAddresses({
      last_login_ip: "127.0.0.1",
      registration_ip: "203.0.113.10",
      metadata: {
        ip_history: [
          { ip: "127.0.0.1" },
          { ip: "169.254.1.1" },
          { ip: "198.51.100.20" },
        ],
      },
    }),
    ["203.0.113.10", "198.51.100.20"],
  );
});

test("uses the normalized forwarded IP when Express trust proxy is configured", () => {
  assert.equal(
    requestIpAddress({ ip: "::ffff:198.51.100.42", socket: { remoteAddress: "127.0.0.1" } }),
    "198.51.100.42",
  );
});
