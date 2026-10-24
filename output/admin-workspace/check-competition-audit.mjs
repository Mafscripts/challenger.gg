import { build } from "esbuild";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import express from "express";

const root = process.cwd().replaceAll("\\", "/");
const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useLocation}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import Config from './src/components/admin/FreeEightsGamesAdmin.jsx';import Progression from './src/components/admin/ProgressionResets.jsx';import Matches from './src/components/admin/AdminMatches.jsx';import Challenges from './src/components/admin/ChallengeTeamAdmin.jsx';
const q=new URLSearchParams(window.location.search),kind=q.get('kind'),user={id:'staff',role:q.get('role')||'admin'},client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Fixture(){const location=useLocation();return <><div id='route'>{location.pathname+location.search}</div>{kind==='config'?<Config user={user}/>:kind==='progression'?<Progression user={{id:'staff',role:'ceo'}}/>:kind==='challenge'?<Challenges user={user}/>:<Matches user={user} initialMode='wagers' initialState='active'/>}</>}
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/admin?tab='+({config:'eightsGames',progression:'progression',challenge:'challenges'}[kind]||'wagers')]}><QueryClientProvider client={client}><Fixture/></QueryClientProvider></MemoryRouter>);`
}, bundle: true, write: false, platform: "browser", format: "iife", define: { "import.meta.env": "{}" }, alias: { "@": `${root}/src` }, loader: { ".css": "empty" }, plugins: [{ name: "mock-api", setup(plugin) {
  plugin.onResolve({ filter: /^@\/api\/base44Client$/ }, args => ({ path: args.path, namespace: "mock-api" }));
  plugin.onLoad({ filter: /.*/, namespace: "mock-api" }, () => ({ loader: "js", contents: `
window.calls=[];let config={id:'bo7',name:'Black Ops',number:'7',color:'orange',enabled:true,modes:[{id:'hp',name:'Hardpoint',maps:[{name:'Raid',image:''}]},{id:'snd',name:'Search',maps:[{name:'Express',image:''}]}],formats:[{id:'hp_bo1',name:'Hardpoint BO1',modes:['hp']}]};
const match={id:'wagers:one',record_id:'one',mode:'wagers',mode_label:'Wager',title:'dev vs ouji',team_a_name:'dev',team_b_name:'ouji',status:'resolved',created_date:'2026-10-24T12:00:00Z',players:[],room_url:'/wagers-match/one',game_name:'Black Ops 7',game_mode:'hp',score_a:1,score_b:0,support_cases:[{id:'ticket:closed',kind:'ticket',title:'Closed admin call',status:'closed'}]};
export const base44={functions:{invoke:async(name,payload)=>{window.calls.push({name,payload});if(name==='getFreeEightsGames')return{data:{success:true,games:[structuredClone(config)],version:'v1'}};if(name==='updateFreeEightsGames'){if(window.rejectSave)return{data:{success:false,error:'Settings changed; reload.'}};config=structuredClone(payload.games[0]);return{data:{success:true,games:payload.games,version:'v2'}};}if(name==='getProgressionResetOverview'){if(!window.progressionReady)return{data:{success:false,error:'Temporary overview failure'}};return{data:{success:true,totals:{users:3,money:0,credits:5,trophy_items:0},seasons:[],next_numbers:{}}};}if(name==='getAdminMatches')return{data:{success:true,...(payload.match?{match:{...match,details:{}}}:{rows:[match],next_cursor:null,unavailable_modes:[]})}};throw Error('Unexpected API '+name);}}};`
  }));
} }] });
const app = express();
app.get("/review", (_req, res) => res.type("html").send(`<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>`));
app.get("/fixture.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(10000);
  const visit = kind => page.goto(`http://127.0.0.1:${server.address().port}/review?${kind}`);
  await visit("kind=config");
  await page.getByLabel("Game name", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save games", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Remove Hardpoint mode", exact: true }).isDisabled(), true, "cannot remove the only mode used by all series");
  assert.equal(await page.getByRole("button", { name: "Remove Search mode", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "Add game", exact: true }).click();
  await page.getByRole("button", { name: "Remove game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByLabel("Game name", { exact: true }).inputValue(), "New game");
  await page.getByRole("button", { name: "Remove game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove game", exact: true }).click();
  assert.equal(await page.getByLabel("Game name", { exact: true }).inputValue(), "Black Ops");
  await page.getByLabel("Game name", { exact: true }).fill("Unsaved name");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('topfragg:admin-changed', {detail:{refreshRequested:true}})));
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByLabel("Game name", { exact: true }).inputValue(), "Unsaved name", "global refresh respects unsaved edits");
  await page.evaluate(() => { window.rejectSave = true; });
  await page.getByRole("button", { name: "Save games", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Settings changed" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save games", exact: true }).isEnabled(), true, "failed save keeps editable draft");
  await page.getByRole("button", { name: "Discard edits", exact: true }).click();
  assert.equal(await page.getByLabel("Game name", { exact: true }).inputValue(), "Black Ops");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('topfragg:admin-changed', {detail:{refreshRequested:true}})));
  await page.waitForFunction(() => window.calls.filter(call=>call.name==='getFreeEightsGames').length===2);
  await visit("kind=config&role=moderator");
  await page.getByText("Read-only view.", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("Game name", { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Save games", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Add game", exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.calls.some(call=>call.name==='updateFreeEightsGames')), false);

  await visit("kind=progression");
  await page.getByRole("alert").filter({ hasText: "Temporary overview failure" }).waitFor();
  await page.evaluate(() => { window.progressionReady = true; window.dispatchEvent(new CustomEvent('topfragg:admin-changed', {detail:{refreshRequested:true}})); });
  await page.waitForFunction(() => window.calls.filter(call=>call.name==='getProgressionResetOverview').length===2);
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  assert.equal(await page.getByRole("link", { name: "Open reward seasons", exact: true }).getAttribute("href"), "/admin?tab=rewards");

  await visit("kind=matches");
  await page.locator(".am-match-row").waitFor();
  assert.deepEqual(await page.evaluate(() => window.calls[0].payload), { mode: "wagers", state: "active", search: "", cursor: null });
  await page.locator(".am-match-row").click();
  await page.locator(".am-detail-heading").waitFor();
  assert.match(await page.locator("#route").innerText(), /tab=wagers&match=wagers%3Aone/);
  assert.equal(await page.locator(".am-support").getAttribute("href"), "/admin?tab=tickets&case=ticket%3Aclosed&status=all");
  assert.equal(await page.locator(".am-detail-heading .am-status").getAttribute("data-tone"), "completed");
  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await page.waitForFunction(() => window.calls.at(-1).payload.mode==='all');
  assert.match(await page.locator("#route").innerText(), /tab=wagers&mode=all/);
  await page.getByLabel("Match status", { exact: true }).selectOption("all");
  await page.waitForFunction(() => window.calls.at(-1).payload.state==='all');
  assert.match(await page.locator("#route").innerText(), /state=all/);

  await visit("kind=challenge");
  await page.locator(".am-match-row").waitFor();
  assert.equal(await page.evaluate(() => window.calls.length), 1);
  assert.equal(await page.evaluate(() => window.calls[0].name), "getAdminMatches");
  assert.equal(await page.evaluate(() => window.calls[0].payload.mode), "challenge");
  assert.deepEqual(errors, []);
  console.log("Competition browser checks passed: draft-safe reload/removal/discard, permission controls, guarded mode deletion, failed save preservation, global refresh, progression retry, reward link, embedded mode/state/tab navigation, closed support link, challenge single paged request.");
} finally { await browser?.close(); server.close(); }
