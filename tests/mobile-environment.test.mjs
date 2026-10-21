import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiBase, validateMobileStartUrl } from "../src/lib/appEnvironment.js";
import { corsOptions } from "../server/cors-options.js";
import { transform } from "esbuild";
import fs from "node:fs/promises";
import viteConfig from "../vite.config.js";

test("native localhost uses HTTPS production API, web development stays local", () => {
  assert.equal(resolveApiBase(undefined, true, "localhost"), "https://www.topfragg.gg/api");
  assert.equal(resolveApiBase(undefined, false, "localhost"), "http://localhost:4000/api");
  assert.equal(resolveApiBase(undefined, false, "topfragg.gg"), "/api");
  assert.equal(resolveApiBase("https://staging.topfragg.gg/api/", true), "https://staging.topfragg.gg/api");
  for (const url of ["/api", "http://topfragg.gg/api", "https://secret@topfragg.gg/api", "https://topfragg.gg/api?token=x", "https://topfragg.gg"]) {
    assert.throws(() => resolveApiBase(url, true));
  }
});

test("account launch URLs cannot redirect the in-app browser to an untrusted site", () => {
  const valid = "https://topfragg.gg/api/mobile/oauth/start?ticket=one-use";
  assert.equal(validateMobileStartUrl(valid, "https://topfragg.gg"), valid);
  for (const url of ["https://evil.example/api/mobile/oauth/start?ticket=x", "https://topfragg.gg.evil.example/api/mobile/oauth/start?ticket=x", "https://topfragg.gg/login?ticket=x", "http://topfragg.gg/api/mobile/oauth/start?ticket=x", "https://topfragg.gg/api/mobile/oauth/start"]) {
    assert.throws(() => validateMobileStartUrl(url, "https://topfragg.gg"));
  }
});

test("native CORS origin is exact while configured web restrictions remain intact", () => {
  const options = corsOptions({ CORS_ORIGIN: "https://topfragg.gg, https://www.topfragg.gg" });
  assert(options.origin.includes("capacitor://localhost"));
  assert(options.origin.includes("https://topfragg.gg"));
  assert(!options.origin.includes("https://evil.example"));
  assert(!options.origin.includes("capacitor://localhost.evil.example"));
  assert.equal(corsOptions({}).origin, true);
});

test("native build mode embeds the app flag and HTTPS API without changing web mode", async () => {
  const config = viteConfig({ mode: "ios" });
  assert.equal(config.build.outDir, "dist-ios");
  assert.equal(viteConfig({ mode: "production" }).build, undefined);
  const source = await fs.readFile(new URL("../src/lib/appEnvironment.js", import.meta.url), "utf8");
  const { code } = await transform(source, { format: "esm", define: config.define });
  assert(!code.includes("import.meta.env"));
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  assert.equal(module.isNativeBuild, true);
  assert.equal(module.apiBase, resolveApiBase(process.env.VITE_NATIVE_API_URL, true));
});

test("the public iPhone build keeps purchases and cash payouts unavailable", async () => {
  const config = viteConfig({ mode: "ios" });
  const source = await fs.readFile(new URL("../src/lib/commerce.js", import.meta.url), "utf8");
  const { code } = await transform(source, { format: "esm", define: config.define });
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  assert.equal(module.publicCommerceEnabled, false);
  for (const name of ["create-checkout", "depositToWallet", "withdrawFromWallet", "buyWithCredits", "subscribePremium", "forgeMoneyToCredits"]) assert(module.blockedPublicCommerceFunctions.has(name));
  assert.equal(module.monthlyEightsPrizeLabel, "$100");
});
