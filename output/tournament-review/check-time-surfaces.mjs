import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";
import { tournamentTimeParts, formatTournamentTime } from "../../src/lib/tournamentTime.js";

// Render the actual public components and providers. Only API responses are synthetic.
const root = process.cwd().replaceAll("\\", "/");
await mkdir("output/tournament-review", { recursive: true });
const eventTime = "2026-10-24T00:15:00Z";
const fixtureApi = `
window.calls=[];window.writes=[];
export const invalidateApiCache=()=>{};
const actor={id:'fixture_player',display_name:'Fixture player',full_name:'Fixture player',username:'fixture-player',role:'user',activision_id:'Fixture#1234567',twitch:'fixtureplayer'};
const tournament={id:'fixture-mw4',name:'MW4 cross-region time fixture',game_id:'mw4',game_name:'Modern Warfare 4',game:'Modern Warfare 4',game_mode:'snd',team_size:'4v4',region:'NA + EU',platform:'Cross platform',entry_type:'free',entry_fee:0,prize_pool:2500,start_date:'${eventTime}',registration_end:'2026-10-24T00:00:00Z',created_date:'2026-10-23T01:00:00Z',max_teams:48,registered_teams:1,status:'open',bracket_type:'double_elimination'};
const call=(name,payload,result)=>{window.calls.push({name,payload});return Promise.resolve(structuredClone(result));};
const entity=name=>({filterFresh:(filter,sort,limit)=>call(name+'.filterFresh',{filter,sort,limit},name==='Tournament'?[tournament]:[]),filter:(filter,sort,limit)=>call(name+'.filter',{filter,sort,limit},name==='Tournament'&&filter.status==='open'?[tournament]:[]),get:id=>call(name+'.get',{id},name==='Tournament'?tournament:null),subscribe:()=>()=>{},create:()=>{throw Error('Unexpected fixture create '+name)},update:()=>{throw Error('Unexpected fixture update '+name)},delete:()=>{throw Error('Unexpected fixture delete '+name)}});
export const base44={auth:{me:()=>call('auth.me',{},actor),isAuthenticated:()=>call('auth.isAuthenticated',{},true)},entities:new Proxy({},{get:(_,name)=>entity(name)}),profile:{teamPage:()=>call('profile.teamPage',{}, {teams:[],membersByTeam:{}}),tournamentParticipants:id=>call('profile.tournamentParticipants',{id},[])},functions:{invoke:(name,payload)=>{if(name==='syncTournamentLifecycle')return call(name,payload,{data:{success:true}});window.writes.push({name,payload});throw Error('Unexpected fixture write '+name)}}};
`;
const bundle = await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Link,Routes,Route}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{AuthProvider}from'./src/lib/AuthContext.jsx';
import Tournaments from './src/pages/Tournaments.jsx';import UpcomingTournaments from './src/components/competition/UpcomingTournaments.jsx';import TournamentsPreview from './src/components/home/TournamentsPreview.jsx';
const event={id:'fixture-mw4',name:'MW4 cross-region time fixture',game_id:'mw4',game_mode:'snd',team_size:'4v4',region:'NA + EU',entry_type:'free',prize_pool:2500,start_date:'${eventTime}',max_teams:48,registered_teams:1,status:'open'};
const query={data:[event],isPending:false,isFetching:false,isError:false,refetch:()=>{throw Error('A display preference must not refresh schedule data')}};
function Combined(){return <main style={{maxWidth:1440,margin:'0 auto',padding:'20px 12px'}}><UpcomingTournaments query={query}/><TournamentsPreview/></main>}
const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><AuthProvider><BrowserRouter><nav aria-label="Fixture pages" style={{display:'flex',gap:20,padding:12}}><Link to="/tournaments">Tournament center</Link><Link to="/combined">Upcoming and home</Link></nav><Routes><Route path="/tournaments" element={<Tournaments/>}/><Route path="/combined" element={<Combined/>}/></Routes></BrowserRouter></AuthProvider></QueryClientProvider>);
` },
  bundle: true, write: false, platform: "browser", format: "iife", define: { "import.meta.env": "{}" }, alias: { "@": `${root}/src` }, loader: { ".css": "empty" },
  plugins: [{ name: "fixture-api-only", setup(plugin) {
    plugin.onResolve({ filter: /(?:^|\/)api\/base44Client(?:\.js)?$/ }, args => ({ path: args.path, namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: fixtureApi }));
  } }],
});
const cssFiles = (await readdir("dist/assets")).filter(file => file.endsWith(".css"));
const styles = (await Promise.all(["competition-presentation", "competition-route", "tournaments-page", "upcoming-tournaments", "tournament-time"].map(name => readFile(`src/styles/${name}.css`, "utf8")))).join("\n");
const app = express();app.use(express.static("dist"));app.use(express.static("public"));
app.get("/fixture.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.get(/.*/, (_req, res) => res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${cssFiles.map(file => `<link rel="stylesheet" href="/assets/${file}">`).join("")}<style>${styles}</style></head><body style="background:#080f17;color:#eef8fd;margin:0"><div id="root"></div><script src="/fixture.js"></script></body></html>`));
const server = app.listen(0, "127.0.0.1");await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  for (const browserZone of ["Europe/Amsterdam", "America/Los_Angeles"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: browserZone, locale: "en-US" });
    await context.addInitScript(() => { sessionStorage.setItem("bootstrap:fixture_player", "1");const NativeDate=Date;const now=NativeDate.parse("2026-10-23T00:15:00Z");window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}; });
    const page = await context.newPage();const errors = [];page.on("pageerror", error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const picker = () => page.getByRole("combobox", { name: "Tournament time zone" });
    const callCount = () => page.evaluate(() => window.calls.length);
    const assertCombined = async zone => {
      const parts = tournamentTimeParts(eventTime, { timeZone: zone });
      assert.equal(await page.locator(".play-upcoming-calendar > small").textContent(), parts.month, "calendar month follows the chosen zone");
      assert.equal(await page.locator(".play-upcoming-calendar > strong").innerText(), parts.day, "calendar day follows the chosen zone");
      assert.equal(await page.locator(".play-upcoming-calendar > span").innerText(), parts.weekday, "calendar weekday follows the chosen zone");
      const schedule = await page.locator(".play-upcoming-schedule time").innerText();assert.ok(schedule.includes(parts.timeLabel) && schedule.includes(parts.zoneLabel), "calendar time and offset follow the chosen zone");
      const home = await page.locator("[data-tournament-time]").innerText();assert.equal(home, formatTournamentTime(eventTime, { timeZone: zone }), "homepage preview matches the actual selected timezone");
      assert.ok(!/\b(?:AM|PM)\b/.test(schedule + home), "both public components use 24-hour dates");
    };
    const assertCenter = async zone => {
      await page.locator(".tournament-spotlight").waitFor();
      assert.equal(await page.locator(".tournament-spotlight [data-tournament-time]").innerText(), formatTournamentTime(eventTime, { timeZone: zone }), "spotlight uses the same date as other tournament surfaces");
      assert.equal(await page.locator(".tournament-list-card").count(), 1, "real schedule card remains rendered");
    };
    const assertFits = async label => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} page has no horizontal overflow`);
      assert.ok(await picker().isVisible(), `${label} timezone picker is visible`);
      assert.ok(await picker().evaluate(el => {const rect=el.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth;}), `${label} entire timezone picker fits in the viewport`);
    };
    await page.goto(`${origin}/combined`);await page.locator("[data-tournament-time]").waitFor();await page.waitForFunction(() => window.calls.filter(call => call.name === "Tournament.filter").length === 3);
    assert.equal(await picker().inputValue(), "local");await assertCombined(browserZone);
    const initialCalls = await callCount();
    for (const zone of ["Europe/Amsterdam", "America/Los_Angeles"]) { await picker().selectOption(zone);await assertCombined(zone);assert.equal(await callCount(), initialCalls, "changing mounted public dates does not refetch data"); }
    for (const width of [390, 320]) {await page.setViewportSize({width,height:844});await picker().selectOption("Europe/Amsterdam");await assertCombined("Europe/Amsterdam");await assertFits(`${width}px upcoming/home`);await picker().selectOption("America/Los_Angeles");await assertCombined("America/Los_Angeles");await assertFits(`${width}px upcoming/home LA`);}
    await page.setViewportSize({width:1440,height:1100});await page.getByRole("link", {name:"Tournament center",exact:true}).click();await assertCenter("America/Los_Angeles");
    assert.equal(await picker().inputValue(), "America/Los_Angeles", "SPA navigation remembers the selected zone");
    await page.waitForFunction(() => window.calls.some(call => call.name === "profile.teamPage"));
    const centerCalls = await callCount();const centerCountdown = await page.locator(".tournament-spotlight-countdown").innerText();
    await picker().selectOption("Europe/Amsterdam");await assertCenter("Europe/Amsterdam");assert.equal(await callCount(), centerCalls, "center display selection does not refetch API data");assert.equal(await page.locator(".tournament-spotlight-countdown").innerText(), centerCountdown, "timezone preference leaves the instant/countdown unchanged");
    for(const width of[390,320]){await page.setViewportSize({width,height:844});await assertCenter("Europe/Amsterdam");await assertFits(`${width}px tournament center`);}
    await page.getByRole("link", {name:"Upcoming and home",exact:true}).click();await page.locator("[data-tournament-time]").waitFor();assert.equal(await picker().inputValue(), "Europe/Amsterdam");await assertCombined("Europe/Amsterdam");
    await page.reload();await page.locator("[data-tournament-time]").waitFor();assert.equal(await picker().inputValue(), "Europe/Amsterdam", "saved timezone survives a full reload");await assertCombined("Europe/Amsterdam");
    assert.equal(await page.evaluate(() => window.writes.length), 0, "no real or fixture tournament mutation is performed");assert.deepEqual(errors, [], "all real public components render without runtime errors");
    await context.close();
  }
  console.log("Tournament public time surfaces passed: real UpcomingTournaments, TournamentsPreview and Tournaments spotlight/list; EU/NA automatic zones, October 23/24 day boundary, 24-hour clock, cross-component live preference sync, SPA/reload persistence, unchanged countdown/API reads, 320/390px full controls, no runtime errors or writes.");
} finally { await browser?.close();server.close(); }
