import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";

const root = process.cwd().replaceAll("\\", "/");
const fixture = String.raw`
window.reads=[];window.calls=[];window.entitiesRead=[];
const q=new URLSearchParams(location.search),actor={id:'staff',role:q.get('fixtureRole')||'ceo',display_name:'Staff',username:'staff-account'};
const player={id:'player',display_name:'dev',username:'topfragg-dev',full_name:'Developer player',email:'player@example.test',role:'user',created_date:'2026-10-01T12:00:00Z',account_created_date:'2026-10-01T12:00:00Z',is_banned:false,is_premium:true,credits:12,available_balance:4,pending_balance:0,escrow_balance:0,withdrawable_balance:4,total_earnings:5,ranked_stats:{game_id:'mw4',elo:1200,wins:3,losses:1,win_streak:2,peak_elo:1300,matches_played:4}};
const support={id:'ticket:case1',record_id:'case1',kind:'ticket',channel:'tickets',closed:false,unread:false,ticket:{id:'case1',user_id:'player',username:'dev',subject:'Fixture support case',description:'Need fixture help',status:'open',messages:[],internal_notes:[],created_date:'2026-10-01T12:00:00Z'},disputes:[]};
const matchFor=mode=>({id:mode+':match1',record_id:'match1',mode,mode_label:mode,status:'disputed',title:'dev vs Fixture opponent',players:[{user_id:'player',user_name:'dev',team:'alpha'}],created_date:'2026-10-01T12:00:00Z',support_cases:[{id:'ticket:case1',kind:'ticket',title:'Fixture support case',status:'open'}],room_url:'/xp-match/match1',details:{series_maps:[{name:'Fixture map',mode:'snd'}],game_mode:'snd',best_of:1},team_a_name:'dev',team_b_name:'Fixture opponent',game_name:'Modern Warfare 4'});
const tournament={id:'tournament1',name:'Fixture tournament',game_id:'mw4',game_mode:'bo3',game_modes:['hp','snd'],team_size:'2v2',max_teams:8,registered_teams:2,entry_fee:0,entry_type:'free',prize_pool:0,status:'open',bracket_type:'single_elimination',image_url:'',reward_item_ids:[],elimination_reward_item_ids:[],placement_trophy_item_ids:{1:[],2:[],3:[]},created_date:'2026-10-24T12:00:00Z'};
const catalog={id:'catalog1',name:'Fixture catalog',category:'calling_card',rarity:'rare',price:25,is_active:true,image_url:'',description:'Fixture catalog item',created_date:'2026-10-24T12:00:00Z'};
const dashboard={success:true,generated_at:'2026-10-24T12:00:00Z',players:{total:1204,unrestricted:1203,banned:1,temporary_bans:0,permanent_bans:1,suspended:0,new_7d:1,new_24h:0,premium:1},matches:Object.fromEntries(['free8s','money8s','xp','ranked','challenge','wagers','tournament'].map(mode=>[mode,{active:1,disputed:1,created_24h:0,completed:0,total:1}])),operations:{},support:{total:1,open:1,closed:0,unread:1,mine:1,waiting:0,awaiting:0,appeals:1},economy:{available:4,credits:12,pending:0,escrow:0,pending_withdrawals:1,pending_withdrawal_amount:10}};
window.fixture={actor,async invoke(name,payload={}){window.calls.push({name,...payload});window.reads.push({name,payload});await new Promise(r=>setTimeout(r,20));let data;
if(name==='getAdminDashboard')data=dashboard;
else if(name==='syncTournamentLifecycle')data={success:true,synced:[]};
else if(name==='getAdminUsers')data={success:true,rows:[player],total:1,next_cursor:null};
else if(name==='getAdminMatches'){const mode=payload.match?.split(':')[0]||(payload.mode==='eights'?'free8s':payload.mode==='all'?'xp':payload.mode||'xp');const match=matchFor(mode);data={success:true,rows:[match],match:payload.match?match:undefined,next_cursor:null,unavailable_modes:[]};}
else if(name==='getAdminAlerts')data={success:true,rows:[{id:'a'.repeat(32),group_key:'a'.repeat(32),alert_count:1,status:'needs_review',category:'platform',priority:'normal',title:'Fixture platform alert',message:'Please check the platform',reporter:{id:'player',name:'dev'},created_date:'2026-10-24T12:00:00Z',latest_date:'2026-10-24T12:00:00Z'}],total:1,next_cursor:null,counts:{all:1,needs_review:1,reviewed:0,categories:{calls:0,evidence:0,disputes:0,platform:1}},unavailable_sources:[]};
else if(name==='getAdminPlayerDossier')data={success:true,player,section:payload.section,permissions:{wallet:true},limit:20,stats:{ranked:player.ranked_stats},rows:[]};
else if(name==='getAdminTickets')data={success:true,rows:[support],next_cursor:null};
else if(name==='getAdminTicketCounts')data={success:true,total:1,open:1,closed:0,mine:1,waiting:0,saved:0,unread:0,categories:{all:1,live:0,calls:0,disputes:0,tickets:1,money8s:0,wagers:0,tournament:0},unread_categories:{}};
else if(name==='getAdminWallets')data={success:true,rows:[player],total:1,next_cursor:null};
else if(name==='getAdminWalletSummary')data={success:true,available:4,credits:12,pending:0,escrow:0};
else if(name==='getAdminWithdrawals')data={success:true,rows:[{id:'fixture-withdrawal',user_id:'player',player,amount:10,status:'pending',payment_method:'bank',requested_date:'2026-10-24T12:00:00Z'}],total:1,next_cursor:null,counts:{pending:1,approved:0,processing:0,completed:0}};
else if(name==='getAdminInventory')data={success:true,rows:[{id:'owned1',user_id:'player',player,item_name:'Fixture owned card',item_category:'calling_card',item_rarity:'rare',purchase_method:'reward',created_date:'2026-10-24T12:00:00Z'}],total:1,next_cursor:null};
else if(name==='getAdminAuditLogs')data={success:true,rows:[{id:'admin:event1',record_id:'event1',source:'admin',created_date:'2026-10-24T12:00:00Z',action_code:'user_updated',actor_id:'staff',actor_name:'Staff',target_id:'player',target_name:'dev',target_kind:'Account',description:'Fixture staff action'}],total:1,next_cursor:null};
else if(name==='getAdminUserCount')data={success:true,total:1204};
else if(name==='getReferralProgram')data={success:true,program:{enabled:true,max_rewards:100,reward_credits:10},rewarded_users:2};
else if(name==='getAnimatedNameFreeTrialStatus')data={success:true,trial:{active:false}};
else if(name==='getSiteAnnouncement')data={success:true,announcement:{enabled:true,title:'Fixture maintenance',message:'Fixture website message',kind:'website',rules_text:'',rules_by_kind:{}}};
else if(name==='getFreeEightsGames')data={success:true,games:DEFAULT_EIGHTS_GAMES,version:'default'};
else if(name==='getProgressionResetOverview')data={success:true,totals:{users:1204,money:0,credits:12,trophy_items:0},seasons:[],next_numbers:{}};
else if(name==='getAdminRewardOverview')data={success:true,settings:{enabled:true,tournament_drop_chance:0},items:[{id:'reward1',name:'Fixture reward card',category:'reward_item',rarity:'epic',image_url:'',reward:{effect:'xp',value:5,sources:['xp','event'],active:true}}],campaigns:[],seasons:[],grants:[],tournaments:[tournament]};
else if(name==='rankVerification.list')data={rows:[{user_id:'player',user_name:'Fixture rank request',status:'manual_review',rank:'diamond'}],next_cursor:null};
else if(name==='banAppeals.list')data={appeals:[{id:'appeal1',status:'awaiting_ceo',user:player,ban_reason:'Fixture appeal reason',updated_date:'2026-10-24T12:00:00Z'}],next_cursor:null};
else throw Error('Unmocked function or unexpected mutation: '+name);
return {data};},async entity(entity,filter={},sort,limit){window.entitiesRead.push({entity,filter,sort,limit});window.reads.push({name:'entity:'+entity,payload:filter});await new Promise(r=>setTimeout(r,20));return({Tournament:[tournament],TournamentMatch:[{id:'match1',tournament_id:'tournament1',team_a_name:'dev',team_b_name:'Fixture opponent',round:1,match_number:1,status:'pending'}],MarketplaceItem:[catalog],AdminAlert:[{id:'alert1',title:'Fixture admin alert',message:'Fixture platform alert',status:'open',type:'admin_request',created_date:'2026-10-24T12:00:00Z',requested_by:'player',username:'dev'}],Ticket:[support.ticket],TournamentParticipant:[],User:[player]})[entity]||[];}};
`;
const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,useLocation}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{DEFAULT_EIGHTS_GAMES}from './src/lib/freeEightsGames.js';import Admin from './src/pages/Admin.jsx';import Bridge from './src/components/admin/AdminWorkspaceBridge.jsx';${fixture}
const query=new QueryClient({defaultOptions:{queries:{retry:false}}});window.fixtureClient=query;function App(){const location=useLocation();return <><output id="review-route">{location.pathname+location.search}</output><Admin/><Bridge user={window.fixture.actor}/></>;}createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>);` },
  bundle: true, write: false, platform: "browser", format: "iife", define: { "import.meta.env": "{}" }, alias: { "@": `${root}/src` }, loader: { ".css": "empty" },
  plugins: [{ name: "fixture", setup(plugin) {
    plugin.onResolve({ filter: /(?:^|\/)api\/base44Client(?:\.js)?$/ }, args => ({ path: args.path, namespace: "api-fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "api-fixture" }, () => ({ loader: "js", contents: `export const base44={functions:{invoke:(...args)=>window.fixture.invoke(...args)},entities:new Proxy({},{get:(_target,entity)=>({filterFresh:(...args)=>window.fixture.entity(entity,...args),filter:(...args)=>window.fixture.entity(entity,...args),list:()=>window.fixture.entity(entity),get:async()=>null,subscribe:()=>()=>{}})}),auth:{me:async()=>window.fixture.actor},rankVerification:{list:async(...args)=>(await window.fixture.invoke('rankVerification.list',{args})).data},banAppeals:{list:async(payload)=>(await window.fixture.invoke('banAppeals.list',payload)).data},integrations:{Core:{}}};` }));
    plugin.onResolve({ filter: /(?:^|\/)lib\/AuthContext(?:\.jsx)?$/ }, args => ({ path: args.path, namespace: "auth-fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "auth-fixture" }, () => ({ loader: "jsx", contents: "export const useAuth=()=>({user:window.fixture.actor,isLoadingAuth:false});export const AuthProvider=({children})=>children;" }));
  } }] });
const files = (await readdir("dist/assets")).filter(file => file.endsWith(".css"));
const custom = await Promise.all(["admin-console", "admin-workspace", "admin-player-dossier", "admin-matches", "admin-dashboard", "admin-wallets", "admin-audit", "admin-alerts", "admin-users", "admin-economy", "admin-roles", "admin-tickets", "support-workspace", "competition-rewards"].map(async name => { try { return await readFile(`src/styles/${name}.css`, "utf8"); } catch { return ""; } }));
const app = express(); app.use(express.static("dist")); app.get("/fixture.js", (_req, response) => response.type("js").send(bundle.outputFiles[0].text));
app.get("/admin", (_req, response) => response.type("html").send(`<!doctype html><html><head>${files.map(file => `<link rel="stylesheet" href="/assets/${file}">`).join("")}<style>${custom.join("\n")}</style></head><body style="background:#07141d;color:white"><div id="root"></div><script src="/fixture.js"></script></body></html>`));
const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const tabs = [
  ["dashboard","Dashboard","getAdminDashboard","Competition"], ["users","Users","getAdminUsers","dev"], ["roles","Roles","getAdminUsers","Role Management"],
  ["alerts","Alerts","getAdminAlerts","Fixture platform alert"], ["tickets","Tickets","getAdminTickets","Need fixture help"], ["banAppeals","Ban appeals","banAppeals.list","Fixture appeal reason"],
  ["matches","All matches","getAdminMatches","dev vs Fixture opponent"], ["wagers","Wagers","getAdminMatches","dev vs Fixture opponent"], ["live8s","Live 8s Rooms","getAdminMatches","dev vs Fixture opponent"],
  ["challenges","Challenge a Team","getAdminMatches","dev vs Fixture opponent"], ["eightsGames","8s Games & Maps","getFreeEightsGames","Free 8s games & map pools"],
  ["ranked","Ranked Management","getAdminUsers","Ranked Player Management"], ["progression","Resets & Seasons","getProgressionResetOverview","Progression management"],
  ["verifyRank","Verify Rank","rankVerification.list","Fixture rank request"], ["tournaments","Tournaments","entity:Tournament","Fixture tournament"],
  ["tournamentMatches","Tournament Matches","getAdminMatches","dev vs Fixture opponent"], ["wallets","Wallets","getAdminWallets","dev"],
  ["websiteUpdates","Website updates","getSiteAnnouncement","Fixture maintenance"], ["referrals","Referrals","getReferralProgram","Save referral settings"],
  ["freeTrials","Free Trials","getAnimatedNameFreeTrialStatus","Users included"], ["withdrawals","Withdrawals","getAdminWithdrawals","fixture-withdrawal"],
  ["rewards","Reward Items & Seasons","getAdminRewardOverview","Fixture reward card"], ["marketplace","Marketplace","entity:MarketplaceItem","Fixture catalog"],
  ["inventory","Inventory","getAdminInventory","Fixture owned card"], ["audit","Audit Logs","getAdminAuditLogs","Fixture staff action"],
];
const reports = [], failures = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.setDefaultTimeout(8000);
  const jsErrors = [];
  page.on("pageerror", error => jsErrors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}/admin`;
  const settle = async () => { await page.waitForFunction(() => window.fixtureClient && window.fixtureClient.isFetching() === 0); await page.waitForTimeout(70); };
  for (const [id, label, primary, marker] of tabs) {
    const errorStart = jsErrors.length;
    try {
      await page.goto(`${base}?tab=${id}`);
      await page.locator("#admin-section-title").filter({ hasText: label }).waitFor();
      await page.waitForFunction(name => window.reads?.some(read => read.name === name), primary);
      await settle();
      const workspace = page.locator("#admin-workspace");
      assert.ok((await workspace.innerText()).toLowerCase().includes(marker.toLowerCase()), `${id}: expected content marker '${marker}'`);
      assert.equal(await workspace.getByRole("alert").count(), 0, `${id}: no loading/read errors`);
      assert.equal(await workspace.getByText(/^(Loading |Opening section|Finding players)/).count(), 0, `${id}: loading resolves`);
      const reads = await page.evaluate(() => window.reads);
      if (["wallets","inventory","withdrawals","freeTrials","verifyRank","matches","wagers","live8s","challenges","tournamentMatches"].includes(id)) {
        assert.equal(reads.some(read => read.name === "entity:User" || read.name === "getAdminUsers"), false, `${id}: no hidden broad users fetch`);
      }
      if (["matches","wagers","live8s","challenges","tournamentMatches"].includes(id)) assert.equal(reads.filter(read => read.name === "getAdminMatches").length, 1, `${id}: one first match page request`);
      if (id === "alerts") assert.equal(reads.some(read => ["entity:AdminAlert", "entity:Ticket"].includes(read.name)), false, "alerts: no broad legacy alert or ticket read");
      const initial = reads.filter(read => read.name === primary).length;
      await page.getByRole("button", { name: "Refresh data", exact: true }).click();
      await page.waitForFunction(({name,count}) => window.reads.filter(read=>read.name===name).length>count, {name:primary,count:initial}, {timeout:2500});
      await settle();
      assert.equal(await page.evaluate(name => window.reads.filter(read=>read.name===name).length, primary), initial + 1, `${id}: header refresh should read primary once`);
      assert.deepEqual(jsErrors.slice(errorStart), [], `${id}: no JS errors`);
      reports.push({id,status:"passed",reads:reads.map(read=>read.name)});
      console.log(`PASS ${id}: loaded, refresh, bounded reads`);
    } catch (error) { failures.push({id,error:error.message,jsErrors:jsErrors.slice(errorStart)}); console.error(`FAIL ${id}: ${error.message}`); }
  }
  // Navigate through the real sidebar in the same mounted application.
  await page.goto(`${base}?tab=dashboard`); await settle();
  for (const [id,label] of tabs) {
    try {
      await page.locator(".admin-console-sidebar").getByRole("button", {name:label,exact:true}).click();
      await page.waitForFunction(id => new URLSearchParams(location.search).get('tab')===id, id);
      await settle();
      assert.equal(await page.locator("#admin-section-title").innerText(),label);
    } catch(error) { failures.push({id:`navigation:${id}`,error:error.message}); }
  }
  // Related actions retain their explicit target filters.
  await page.goto(`${base}?tab=wagers`); await settle();
  await page.locator(".admin-section-links").getByRole("button",{name:"Disputed wagers",exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('state')==='disputed');
  assert.equal(new URLSearchParams(await page.evaluate(()=>location.search)).get("mode"),"wagers");
  await page.goto(`${base}?tab=wallets`); await settle();
  await page.locator(".admin-section-links").getByRole("button",{name:"Withdrawal requests",exact:true}).click();
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('tab')==='withdrawals');
  await settle();
  // Forbidden destinations disappear and direct URLs return to the dashboard.
  const forbidden = ["roles","banAppeals","verifyRank","progression","wallets","websiteUpdates","referrals","freeTrials","withdrawals","rewards","inventory"];
  await page.goto(`${base}?tab=dashboard&fixtureRole=moderator`); await settle();
  for (const id of forbidden) {
    const label=tabs.find(tab=>tab[0]===id)[1];
    assert.equal(await page.locator(".admin-console-sidebar").getByRole("button",{name:label,exact:true}).count(),0,`moderator: ${id} absent`);
  }
  for (const id of ["wallets","roles","rewards"]) {
    await page.goto(`${base}?tab=${id}&fixtureRole=moderator`);
    await page.getByRole("heading",{name:"Dashboard",exact:true}).waitFor(); await settle();
    assert.equal(await page.evaluate(() => window.reads.some(read=>['getAdminWallets','getAdminRewardOverview'].includes(read.name))),false,`moderator denied ${id}: no protected reads`);
  }
  await page.goto(`${base}?tab=ranked&fixtureRole=moderator`); await settle();
  await page.getByText("Read-only view.",{exact:false}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Apply ELO Correction",exact:true}).isDisabled(),true);
  await page.getByRole("button", { name: /dev.*Peak/ }).click();
  assert.equal(await page.locator("form").getByRole("button", { name: /^dev/ }).isEnabled(), true, "read-only staff can still open the selected player's dossier");
  await page.goto(`${base}?tab=marketplace&fixtureRole=moderator`); await settle();
  for (const action of ["Edit", "Activate", "Deactivate", "Delete"]) assert.equal(await page.locator("#admin-workspace").getByRole("button", { name: action, exact: true }).count(), 0, `moderator catalog action ${action} absent`);
  await page.goto(`${base}?tab=tournaments&fixtureRole=moderator`); await settle();
  for(const action of ["Edit","Generate","Repair bracket","Reset & reopen","Remove all","Reopen","Close","Complete","Close reg","+24h","Start","Cancel","Delete"])
    assert.equal(await page.locator("#admin-workspace").getByRole("button",{name:action,exact:true}).count(),0,`moderator tournament action ${action} absent`);
  assert.equal(await page.locator("#admin-workspace").getByRole("link",{name:/Open/}).count()>0,true,"moderator can still inspect tournament");
  // Server-matched Activision results must survive rendering even if the
  // search string is not part of the player's display name.
  await page.goto(`${base}?tab=ranked`); await settle();
  await page.getByRole("textbox", { name: "Search ranked players", exact: true }).fill("SearchOnly#123");
  await page.waitForFunction(() => window.calls.some(call => call.name === "getAdminUsers" && call.search === "SearchOnly#123")); await settle();
  const rankedPlayer = page.getByRole("button", { name: /dev.*Peak/ });
  assert.equal(await rankedPlayer.count(), 1, "server Activision matches are not filtered out by the page");
  await rankedPlayer.click();
  await page.getByLabel("New exact ELO", { exact: true }).fill("1400");
  await page.getByPlaceholder("Describe the bug or correction...").fill("Fixture correction only");
  await page.evaluate(() => {
    const original = window.fixture.invoke;
    window.fixture.invoke = async (name, payload) => {
      if (name !== "adminAdjustRankedElo") return original(name, payload);
      window.calls.push({ name, ...payload });
      await new Promise(resolve => setTimeout(resolve, 350));
      return { data: { success: true, before_elo: 1200, after_elo: 1400 } };
    };
  });
  await page.getByRole("button", { name: "Apply ELO Correction", exact: true }).click();
  await page.waitForFunction(() => window.calls.some(call => call.name === "adminAdjustRankedElo"));
  assert.equal(await page.getByRole("textbox", { name: "Search ranked players" }).isDisabled(), true, "the active player cannot change while saving");
  await settle(); await page.waitForFunction(() => !document.querySelector('[aria-label="Search ranked players"]').disabled);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === "adminAdjustRankedElo").length), 1);
  await page.goto(`${base}?tab=marketplace`); await settle();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmDelete = page.getByRole("dialog", { name: "Delete marketplace item", exact: true });
  await confirmDelete.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 0, "canceling deletion leaves the catalog intact");
  await page.goto(`${base}?tab=withdrawals`); await settle();
  await page.locator("#admin-workspace").screenshot({ path: "output/admin-workspace/admin-pages-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}?tab=inventory`); await settle();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "admin inventory remains within the mobile viewport");
  await page.locator("#admin-workspace").screenshot({ path: "output/admin-workspace/admin-pages-mobile.png" });
  assert.deepEqual(jsErrors,[],"all pages and navigation have no JS errors");
  console.log("PASS sidebar navigation, related targets, moderator gates and read-only competition controls");
} catch(error) { failures.push({id:"cross-page",error:error.message}); console.error(error); }
finally { await browser?.close(); server.close(); }
await writeFile("output/admin-workspace/all-pages-report.json", JSON.stringify({reports,failures},null,2));
if(failures.length) { console.error(JSON.stringify(failures,null,2)); process.exitCode=1; }
else console.log(`All ${reports.length} admin pages passed with real Admin + Bridge components and synthetic read-only fixtures.`);
