import test from "node:test";
import assert from "node:assert/strict";
import { findActiveIpBan, knownUserIpAddresses, normalizeIpAddress, requestIpAddress } from "./ban-enforcement.js";
import { isCloudflareIp } from "../src/lib/cloudflareIps.js";

const proxiedRequest = (headers = {}, peer = "127.0.0.1") => ({
  ip: "172.71.158.85", socket: { remoteAddress: peer }, headers,
  app: { get: () => (ip) => ip === "127.0.0.1" },
});

test("Cloudflare edges are excluded from account links and IP ban enforcement", async () => {
  assert.deepEqual(knownUserIpAddresses({ last_login_ip: "172.71.158.85", registration_ip: "162.158.167.79",
    ip_history: [{ ip: "104.22.20.218" }, { ip: "172.69.23.149" }, { ip: "198.51.100.42" }] }), ["198.51.100.42"]);
  assert.equal(await findActiveIpBan("172.71.158.85"), null);
  assert.equal(isCloudflareIp("2606:4700:0000::1234"), true);
  assert.equal(isCloudflareIp("::ffff:ac47:9e55"), true);
  assert.equal(isCloudflareIp("172.72.0.1"), false);
});

test("restores the visitor across Cloudflare and local Nginx even with one configured hop", () => {
  assert.equal(requestIpAddress(proxiedRequest({ "x-forwarded-for": "203.0.113.99, 198.51.100.42, 172.71.158.85" })), "198.51.100.42");
  assert.equal(requestIpAddress(proxiedRequest({ "x-forwarded-for": "172.71.158.85", "cf-connecting-ip": "198.51.100.42" })), "198.51.100.42");
});

test("ignores forged Cloudflare headers and injected Cloudflare hops from direct visitors", () => {
  assert.equal(requestIpAddress(proxiedRequest({ "x-forwarded-for": "172.71.158.85", "cf-connecting-ip": "203.0.113.99" }, "198.51.100.42")), "198.51.100.42");
  assert.equal(requestIpAddress(proxiedRequest({ "x-forwarded-for": "172.71.158.85, 198.51.100.42", "cf-connecting-ip": "203.0.113.99" })), "198.51.100.42");
});

test("does not record a Cloudflare edge when the visitor is unavailable", () => {
  assert.equal(requestIpAddress(proxiedRequest({ "x-forwarded-for": "172.71.158.85" })), null);
});

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

test("reads flattened IP history from serialized users", () => {
  assert.deepEqual(
    knownUserIpAddresses({
      last_login_ip: "198.51.100.30",
      ip_history: [
        { ip: "198.51.100.20" },
        { ip: "127.0.0.1" },
      ],
    }),
    ["198.51.100.30", "198.51.100.20"],
  );
});
