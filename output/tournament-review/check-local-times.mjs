import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";

// Real public components with API-only example data. This does not reach a live API or database.
const root = process.cwd().replaceAll("\\", "/");
await mkdir("output/tournament-review", { recursive: true });
const eventTime = "2026-10-24T21:15:00Z";
const overviewSource = await readFile("output/tournament-review/check-overview.mjs", "utf8");
const overviewFixture = overviewSource.match(/const fixtureApi = `([\s\S]*?)`;\r?\n\r?\nconst bundle/);
assert.ok(overviewFixture, "the overview API-only fixture is available");
const fixtureApi = overviewFixture[1]
  .replace("const future=(hours)=>", "const event=new URLSearchParams(location.search).get('event')||'2026-10-24T21:15:00Z';\nconst future=(hours)=>")
  .replace("start_date:future(10)", "start_date:event")
  .replace("registration_end:future(scenario==='expired'?-1:9.75)", "registration_end:new Date(Date.parse(event)-900000).toISOString()");
const surfacesSource = await readFile("output/tournament-review/check-time-surfaces.mjs", "utf8");
const surfacesFixture = surfacesSource.match(/const fixtureApi = `([\s\S]*?)`;\r?\nconst bundle/);
assert.ok(surfacesFixture, "the public surface API-only fixture is available");
const publicFixtureApi = surfacesFixture[1].replaceAll("${eventTime}", eventTime);
const compile = (contents, api) => build({
  stdin: { resolveDir: root, loader: "jsx", contents }, bundle: true, write: false,
  platform: "browser", format: "iife", define: { "import.meta.env": "{}" },
  alias: { "@": `${root}/src` }, loader: { ".css": "empty" },
  plugins: [{ name: "api-only-fixture", setup(plugin) {
    plugin.onResolve({ filter: /(?:^|\/)api\/base44Client(?:\.js)?$/ }, args => ({ path: args.path, namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: api }));
  } }],
});
const [overview, publicPages] = await Promise.all([
  compile(`import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import TournamentOverview from'./src/pages/TournamentOverview.jsx';createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/tournaments/:id" element={<TournamentOverview/>}/></Routes></BrowserRouter>);`, fixtureApi),
  compile(`
import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route,Link}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{AuthProvider}from'./src/lib/AuthContext.jsx';import Tournaments from'./src/pages/Tournaments.jsx';import UpcomingTournaments from'./src/components/competition/UpcomingTournaments.jsx';import TournamentsPreview from'./src/components/home/TournamentsPreview.jsx';
const event={id:'fixture-mw4',name:'MW4 cross-region time fixture',game_id:'mw4',game_mode:'snd',team_size:'4v4',region:'NA + EU',entry_type:'free',prize_pool:2500,start_date:'${eventTime}',max_teams:48,registered_teams:1,status:'open'};
const query={data:[event],isPending:false,isFetching:false,isError:false,refetch:()=>{throw Error('A local date display must not refresh API data')}};
function Combined(){return <main style={{maxWidth:1440,margin:'0 auto',padding:'20px 12px'}}><UpcomingTournaments query={query}/><TournamentsPreview/></main>}
const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><AuthProvider><BrowserRouter><nav aria-label="Fixture pages" style={{display:'flex',gap:20,padding:12}}><Link to="/tournaments">Tournament center</Link><Link to="/combined">Upcoming and home</Link></nav><Routes><Route path="/tournaments" element={<Tournaments/>}/><Route path="/combined" element={<Combined/>}/></Routes></BrowserRouter></AuthProvider></QueryClientProvider>);
`, publicFixtureApi),
]);
const cssFiles = (await readdir("dist/assets")).filter(file => file.endsWith(".css"));
const styles = (await Promise.all(["competition-presentation", "competition-route", "tournament-overview", "tournaments-page", "upcoming-tournaments", "player-cards"].map(name => readFile(`src/styles/${name}.css`, "utf8")))).join("\n");
const app = express();app.use(express.static("dist"));app.use(express.static("public"));
app.get("/fixture-overview.js", (_req, res) => res.type("js").send(overview.outputFiles[0].text));
app.get("/fixture-public.js", (_req, res) => res.type("js").send(publicPages.outputFiles[0].text));
app.get(/.*/, (req, res) => res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${cssFiles.map(file => `<link rel="stylesheet" href="/assets/${file}">`).join("")}<style>${styles}</style></head><body style="background:#080f17;color:#eef8fd;margin:0"><div id="root"></div><script src="${/^\/tournaments\/./.test(req.path) ? "/fixture-overview.js" : "/fixture-public.js"}"></script></body></html>`));
const server = app.listen(0, "127.0.0.1");await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const zones = [
  { id: "Europe/Amsterdam", time: "23:15", close: "23:00", date: "24 Oct 2026", old: "America/Phoenix" },
  { id: "America/New_York", time: "17:15", close: "17:00", date: "24 Oct 2026" },
  { id: "America/Guatemala", time: "15:15", close: "15:00", date: "24 Oct 2026" },
  { id: "America/Panama", time: "16:15", close: "16:00", date: "24 Oct 2026" },
  { id: "Asia/Kathmandu", time: "03:00", close: "02:45", date: "25 Oct 2026" },
  { id: "Pacific/Auckland", time: "10:15", close: "10:00", date: "25 Oct 2026" },
  { id: "America/Phoenix", time: "14:15", close: "14:00", date: "24 Oct 2026", old: "Europe/Amsterdam" },
];
let browser;
let canonicalCountdown;
const completed = [];
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const zone of zones) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: zone.id, locale: "en-US" });
    await context.addInitScript(old => {
      sessionStorage.setItem("bootstrap:fixture_player", "1");
      if (old) localStorage.setItem("topfragg:tournament-timezone", old);
      const NativeDate = Date;const now = NativeDate.parse("2026-10-24T11:15:00Z");
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, zone.old || "");
    const page = await context.newPage();const errors = [];page.on("pageerror", error => errors.push(error.message));
    const clean = async label => {
      const text = await page.locator("body").innerText();
      assert.doesNotMatch(text, /\bGMT[+-]?|\bUTC[+-]?|America\/|Europe\/|Asia\/|Pacific\/|Your time|Selected time zone|Phoenix|Tournament time zone/i, `${zone.id} ${label}: no offsets, city labels or time-zone controls are shown`);
      assert.equal(await page.getByRole("combobox", { name: /time zone/i }).count(), 0, `${label}: there is no time-zone picker`);
      const timeTitles = await page.locator("time[title]").evaluateAll(items => items.map(item => item.title).join(" "));
      assert.doesNotMatch(timeTitles, /\bGMT|\bUTC|America\/|Europe\/|Asia\/|Pacific\/|Phoenix/i, `${label}: hovering a time does not bring back a city or offset`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${zone.id} ${label}: no horizontal overflow`);
    };
    const assertDate = async (locator, time = zone.time, date = zone.date) => {
      const text = await locator.innerText();assert.ok(text.includes(time), `${zone.id}: ${time} appears in ${text}`);assert.ok(text.includes(date), `${zone.id}: ${date} appears in ${text}`);assert.doesNotMatch(text, /\b(?:AM|PM)\b/, "dates retain the 24-hour clock");
    };
    await page.goto(`${origin}/tournaments/fixture-mw4`);await page.locator(".tournament-overview").waitFor();await page.waitForFunction(() => window.calls.some(call => call.name === "TournamentParticipant.filterFresh"));
    const header = page.locator(".to-quick-facts > div").filter({ hasText: "Tournament starts" });
    const starts = page.locator(".to-schedule-step").filter({ hasText: "Tournament starts" });
    const closes = page.locator(".to-schedule-step").filter({ hasText: "Registration closes" });
    await assertDate(header);await assertDate(starts);await assertDate(closes, zone.close);await clean("overview");
    assert.equal(await page.evaluate(() => localStorage.getItem("topfragg:tournament-timezone")), null, "the retired manual override is cleared");
    const countdown = await page.locator(".to-countdown").innerText();canonicalCountdown ??= countdown;
    assert.equal(countdown, canonicalCountdown, `${zone.id}: every viewer has the same actual countdown`);
    assert.equal(await page.evaluate(() => window.writes.length), 0, "the overview only reads fixture data");
    await page.reload();await page.locator(".tournament-overview").waitFor();await page.waitForFunction(() => window.calls.some(call => call.name === "TournamentParticipant.filterFresh"));await assertDate(header);await clean("reloaded overview");
    if (zone.id === "Europe/Amsterdam") {
      await page.screenshot({ path: "output/tournament-review/local-times-desktop.png", fullPage: true });
      await page.locator(".overview-hero").screenshot({ path: "output/tournament-review/local-times-hero-preview.png" });
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });await assertDate(header);await clean(`${width}px overview`);
        if (width === 390) await page.screenshot({ path: "output/tournament-review/local-times-mobile.png", fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
    await page.goto(`${origin}/combined`);await page.locator("[data-tournament-time]").waitFor();await page.waitForFunction(() => window.calls.filter(call => call.name === "Tournament.filter").length === 3);
    const day = zone.date.split(" ")[0];
    assert.equal(await page.locator(".play-upcoming-calendar > strong").innerText(), day, `${zone.id}: calendar day matches the local event date`);
    assert.equal(await page.locator(".play-upcoming-calendar > small").textContent(), "Oct", "calendar month matches the local event date");
    assert.ok((await page.locator(".play-upcoming-schedule time").innerText()).includes(zone.time), "upcoming calendar uses the local clock time");
    await assertDate(page.locator("[data-tournament-time]"));await clean("upcoming and home");
    await page.getByRole("link", { name: "Tournament center", exact: true }).click();await page.locator(".tournament-spotlight").waitFor();
    await assertDate(page.locator(".tournament-spotlight [data-tournament-time]"));await clean("tournament center");
    assert.equal(await page.locator(".tournament-list-card").count(), 1, "the scheduled tournament remains visible");
    if (["Europe/Amsterdam", "America/Guatemala"].includes(zone.id)) {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });await assertDate(page.locator(".tournament-spotlight [data-tournament-time]"));await clean(`${width}px center`);
      }
      await page.getByRole("link", { name: "Upcoming and home", exact: true }).click();await page.locator("[data-tournament-time]").waitFor();
      for (const width of [390, 320]) {await page.setViewportSize({ width, height: 844 });await assertDate(page.locator("[data-tournament-time]"));await clean(`${width}px upcoming and home`);}
    }
    assert.equal(await page.evaluate(() => window.writes.length), 0, "public tournament dates do not mutate data");
    assert.deepEqual(errors, [], `${zone.id}: real public components have no browser runtime errors`);
    completed.push(`${zone.id} ${zone.time}${zone.old ? " (ignores old saved zone)" : ""}`);
    await context.close();
  }
  console.log(`Clean automatic tournament time checks passed: ${completed.join("; ")}. Actual overview header/deadline/schedule, upcoming calendar, home preview and tournament center; same UTC instant/countdown, next-day boundaries, old preferences ignored on navigation/reload, no visible GMT/IANA/city selector, 320/390px mobile, no API mutations or runtime errors.`);
} finally { await browser?.close();server.close(); }

