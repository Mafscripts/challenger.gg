import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";

// The production page is rendered with an API-only synthetic fixture. No live calls or writes.
const root = process.cwd().replaceAll("\\", "/");
await mkdir("output/tournament-review", { recursive: true });
const overviewCheck = await readFile("output/tournament-review/check-overview.mjs", "utf8");
const source = overviewCheck.match(/const fixtureApi = `([\s\S]*?)`;\r?\n\r?\nconst bundle/);
assert.ok(source, "overview API fixture exists");
const fixtureApi = source[1]
  .replace("const future=(hours)=>", "const event=new URLSearchParams(location.search).get('event')||'2026-10-24T21:15:00Z';\nconst future=(hours)=>")
  .replace("start_date:future(10)", "start_date:event")
  .replace("registration_end:future(scenario==='expired'?-1:9.75)", "registration_end:new Date(Date.parse(event)-900000).toISOString()");
const bundle = await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import TournamentOverview from './src/pages/TournamentOverview.jsx';
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/tournaments/:id" element={<TournamentOverview/>}/><Route path="*" element={<h1>Fixture linked destination</h1>}/></Routes></BrowserRouter>);
` },
  bundle: true, write: false, platform: "browser", format: "iife", define: { "import.meta.env": "{}" }, alias: { "@": `${root}/src` }, loader: { ".css": "empty" },
  plugins: [{ name: "fixture-api-only", setup(plugin) {
    plugin.onResolve({ filter: /(?:^|\/)api\/base44Client(?:\.js)?$/ }, args => ({ path: args.path, namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: fixtureApi }));
  } }],
});
const cssFiles = (await readdir("dist/assets")).filter(file => file.endsWith(".css"));
const styles = (await Promise.all(["competition-presentation", "competition-route", "tournament-overview", "tournament-time", "player-cards"].map(name => readFile(`src/styles/${name}.css`, "utf8")))).join("\n");
const app = express();app.use(express.static("dist"));app.use(express.static("public"));
app.get("/fixture.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.get(/.*/, (_req, res) => res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${cssFiles.map(file => `<link rel="stylesheet" href="/assets/${file}">`).join("")}<style>${styles}</style></head><body style="background:#080f17;color:#eef8fd;margin:0"><div id="root"></div><script src="/fixture.js"></script></body></html>`));
const server = app.listen(0, "127.0.0.1");await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const zones = [
    { id: "Europe/Amsterdam", time: "23:15", offset: /GMT\+2|UTC\+02(?::00)?|CEST/, day: /24 Oct 2026/ },
    { id: "Europe/London", time: "22:15", offset: /GMT\+1|UTC\+01(?::00)?|BST/, day: /24 Oct 2026/ },
    { id: "America/New_York", time: "17:15", offset: /GMT-4|UTC[-−]04(?::00)?|EDT/, day: /24 Oct 2026/ },
    { id: "America/Los_Angeles", time: "14:15", offset: /GMT-7|UTC[-−]07(?::00)?|PDT/, day: /24 Oct 2026/ },
    { id: "America/Phoenix", time: "14:15", offset: /GMT-7|UTC[-−]07(?::00)?|MST/, day: /24 Oct 2026/ },
    { id: "America/Guatemala", time: "15:15", offset: /GMT-6|UTC[-−]06(?::00)?/, day: /24 Oct 2026/ },
    { id: "America/Costa_Rica", time: "15:15", offset: /GMT-6|UTC[-−]06(?::00)?/, day: /24 Oct 2026/ },
    { id: "America/Panama", time: "16:15", offset: /GMT-5|UTC[-−]05(?::00)?/, day: /24 Oct 2026/ },
    { id: "Asia/Kathmandu", time: "03:00", close: "02:45", offset: /GMT\+5:45|UTC\+05:45/, day: /25 Oct 2026/ },
    { id: "Pacific/Auckland", time: "10:15", offset: /GMT\+13|UTC\+13(?::00)?/, day: /25 Oct 2026/ },
    { id: "Africa/Johannesburg", time: "23:15", offset: /GMT\+2|UTC\+02(?::00)?/, day: /24 Oct 2026/ },
    { id: "America/Argentina/Buenos_Aires", time: "18:15", offset: /GMT-3|UTC[-−]03(?::00)?/, day: /24 Oct 2026/ },
  ];
  for (const zone of [...zones, { ...zones[5], fallback: true }]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: zone.id, locale: "en-US" });
    await context.addInitScript(forceFallback => {
      if (forceFallback) Object.defineProperty(Intl, "supportedValuesOf", { value: undefined, configurable: true });
      const NativeDate = Date;const now = NativeDate.parse("2026-10-24T11:15:00Z");
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, Boolean(zone.fallback));
    const page = await context.newPage();const errors = [];page.on("pageerror", error => errors.push(error.message));
    const ready = async (event = "2026-10-24T21:15:00Z") => { await page.goto(`${origin}/tournaments/fixture-mw4?event=${encodeURIComponent(event)}`);await page.locator(".tournament-overview").waitFor();await page.waitForFunction(() => window.calls.some(call => call.name === "TournamentParticipant.filterFresh"));await page.waitForTimeout(50); };
    const header = page.locator(".to-quick-facts > div").filter({ hasText: "Tournament starts" });
    const start = page.locator(".to-schedule-step").filter({ hasText: "Tournament starts" });
    const closes = page.locator(".to-schedule-step").filter({ hasText: "Registration closes" });
    const selector = page.getByRole("combobox", { name: /time zone/i });
    const callCount = () => page.evaluate(() => window.calls.length);
    const assertTime = async ({ time, offset, day = /24 Oct 2026/ }) => {
      for (const [label, item] of [["header", header], ["schedule", start]]) {
        const text = await item.innerText();assert.ok(text.includes(time), `${zone.id} ${label} displays ${time}: ${text}`);assert.match(text, day, `${zone.id} ${label} uses the selected date`);assert.ok(!/\b(?:AM|PM)\b/.test(text), `${label} uses a consistent 24-hour clock`);assert.match(text, offset, `${label} states the event-date UTC offset`);
      }
    };
    await ready();await assertTime(zone);
    assert.equal(await selector.inputValue(), "local", "default follows the browser's own IANA zone");
    const options = await selector.locator("option").evaluateAll(items => items.map(item => item.value));
    assert.ok(options.length > 350, "the selector offers the worldwide IANA catalog instead of a short regional preset list");
    for (const required of ["America/Belize", "America/El_Salvador", "America/Tegucigalpa", "America/Managua", "America/Panama", "America/Costa_Rica", "America/Guatemala", "Europe/Amsterdam", "Africa/Johannesburg", "Pacific/Auckland", "Asia/Tokyo", "Australia/Sydney", "UTC"]) {
      assert.ok(options.includes(required), `${required} is available for explicit selection`);
    }
    assert.ok(options.includes("Asia/Kathmandu") || options.includes("Asia/Katmandu"), "Nepal's fractional-offset timezone is available");
    const initialCount = await callCount();const countdown = await page.locator(".to-countdown").innerText();
    for (const comparison of zone.id === "Europe/Amsterdam" ? zones : zones.slice(0, 4)) {
      const canonical = await page.evaluate(id => new Intl.DateTimeFormat("en", { timeZone: id }).resolvedOptions().timeZone, comparison.id);
      const availableValue = options.includes(comparison.id) ? comparison.id : canonical;
      assert.ok(options.includes(availableValue), `${comparison.id} or its canonical IANA alias is available for selection`);
      await selector.selectOption(availableValue);await assertTime(comparison);
      assert.equal(await page.locator(".to-countdown").innerText(), countdown, "changing the display zone does not move the tournament countdown");
      assert.equal(await callCount(), initialCount, "changing the display zone does not reload API data");
      const expectedClose = comparison.close || comparison.time.replace(":15", ":00");assert.ok((await closes.innerText()).includes(expectedClose), "registration deadline uses the selected zone too");
    }
    await selector.selectOption("Europe/London");await page.reload();await page.locator(".tournament-overview").waitFor();await page.waitForFunction(() => window.calls.some(call => call.name === "TournamentParticipant.filterFresh"));
    assert.equal(await selector.inputValue(), "Europe/London", "chosen display zone survives a page reload");await assertTime(zones[1]);
    await selector.selectOption("local");await assertTime(zone);
    if (zone.id === "America/Guatemala") {
      await page.locator(".page-container").first().screenshot({ path: "output/tournament-review/times-central-america-preview.png" });
      await page.setViewportSize({ width: 320, height: 844 });await page.waitForTimeout(50);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "full world-zone selector also fits at 320px with automatic Central America");
      assert.ok(await selector.isVisible(), "Central American automatic zone remains selectable on mobile");
      await page.screenshot({ path: "output/tournament-review/times-central-america-mobile.png", fullPage: true });
    }
    if (zone.id === "Europe/Amsterdam") {
      await page.screenshot({ path: "output/tournament-review/times-desktop.png", fullPage: true });
      await page.locator(".overview-hero").screenshot({ path: "output/tournament-review/times-hero-preview.png" });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });await page.waitForTimeout(50);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px timezone controls do not overflow the page`);
        assert.ok(await selector.isVisible(), "timezone selector remains visible on mobile");
        assert.ok(await header.evaluate(el => el.scrollWidth <= el.clientWidth + 1), "header time fits the card");
        await selector.selectOption("America/Los_Angeles");await assertTime(zones[3]);
        if (width === 390) await page.screenshot({ path: "output/tournament-review/times-mobile.png", fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1100 });
      for (const test of [
        { event: "2026-10-25T00:30:00Z", select: "Europe/Amsterdam", time: "02:30", offset: /GMT\+2|UTC\+02(?::00)?|CEST/, day: /25 Oct 2026/ },
        { event: "2026-10-25T01:30:00Z", select: "Europe/Amsterdam", time: "02:30", offset: /GMT\+1|UTC\+01(?::00)?|CET/, day: /25 Oct 2026/ },
        { event: "2026-11-01T05:30:00Z", select: "America/New_York", time: "01:30", offset: /GMT-4|UTC[-−]04(?::00)?|EDT/, day: /1 Nov 2026/ },
        { event: "2026-11-01T06:30:00Z", select: "America/New_York", time: "01:30", offset: /GMT-5|UTC[-−]05(?::00)?|EST/, day: /1 Nov 2026/ },
        { event: "2026-10-24T00:15:00Z", select: "America/Los_Angeles", time: "17:15", offset: /GMT-7|UTC[-−]07(?::00)?|PDT/, day: /23 Oct 2026/ },
      ]) { await ready(test.event);await selector.selectOption(test.select);await assertTime(test); }
      await ready("2026-10-25T01:00:00Z");await selector.selectOption("Europe/Amsterdam");
      await assertTime({ time: "02:00", offset: /GMT\+1|UTC\+01(?::00)?|CET/, day: /25 Oct 2026/ });
      assert.match(await closes.innerText(), /02:45/, "registration can fall before the autumn clock change");
      assert.match(await closes.innerText(), /GMT\+2|UTC\+02(?::00)?|CEST/, "registration has its own event-specific offset before the clock change");
    }
    assert.deepEqual(errors, [], `${zone.id} has no browser runtime errors`);
    assert.equal(await page.evaluate(() => window.writes.length), 0, "time controls never mutate tournament data");
    results.push(`${zone.id}${zone.fallback ? " (legacy Intl fallback)" : ""}`);await context.close();
  }
  console.log(`Tournament time browser checks passed: ${results.join(", ")}; automatic worldwide zones and >350-zone explicit catalog including Central America, header/schedule/deadline agreement, 24-hour clock, explicit DST and fractional offsets, EU and NA fall-back, previous/next-day boundary, unchanged countdown and API reads, no writes, 320/390px mobile.`);
} finally { await browser?.close();server.close(); }
