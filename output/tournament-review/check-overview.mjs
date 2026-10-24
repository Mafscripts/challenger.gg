import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";

// Synthetic fixture data; reads and writes never reach the website or its database.
const root = process.cwd().replaceAll("\\", "/");
await mkdir("output/tournament-review", { recursive: true });
const fixtureApi = `
window.calls=[];window.writes=[];window.toasts=[];
export const invalidateApiCache=()=>{};
const scenario=new URLSearchParams(location.search).get('fixture')||'open';
const future=(hours)=>new Date(Date.now()+hours*3600000).toISOString();
const actor={id:'fixture_dev',display_name:'dev',full_name:'dev',username:'topfragg-dev',role:'user',activision_id:'Livvy#1234567',twitch:'topfraggdev'};
const registered=['registered','member','slowmatches','registered-bracket-error','registered-live','registered-completed'].includes(scenario);
const live=['live','registered-live'].includes(scenario);
const completed=scenario==='registered-completed';
const member=(id,name)=>({user_id:id,user_name:name,full_name:name,is_active:true});
const ownMembers=[member('fixture_dev','dev'),member('fixture_wong','wong'),member('fixture_livvy','Livvy'),member('fixture_sage','Sage')];
const participant={id:'fixture_participant',tournament_id:'fixture-mw4',team_id:'fixture_team',team_name:'Aurora Wolves',captain_id:registered&&scenario!=='member'?actor.id:'fixture_captain',seed:1,members:registered?ownMembers:[member('fixture_captain','Aurora'),member('fixture_raptor','Raptor'),member('fixture_echo','Echo'),member('fixture_nova','Nova')]};
const tournament={id:'fixture-mw4',name:'MW4 Day 2 SEARCH AND DESTROY KICK OFF 2.500$ FREE entry',game_id:'mw4',game_name:'Modern Warfare 4',game:'Modern Warfare 4',game_mode:'snd',team_size:'4v4',region:'NA + EU',platform:'Cross platform',entry_type:scenario==='invite'?'invitational':'free',entry_fee:0,prize_pool:2500,prize_distribution:{first_amount:2000,second_amount:500,third_amount:0},start_date:future(10),registration_end:future(scenario==='expired'?-1:9.75),max_teams:48,registered_teams:scenario==='full'?48:1,status:live?'live':completed?'completed':'open',bracket_type:'double_elimination',check_in_required:false,registration_locked:live||completed||scenario==='locked',rules:'All teams must use the generated map order. Report each map score and keep your stream available for staff review.'};
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
const call=async(name,payload,result)=>{window.calls.push({name,payload});if(scenario==='slowauth'&&name==='auth.me'||scenario==='slowparticipants'&&name==='TournamentParticipant.filterFresh'||scenario==='slowmatches'&&name==='TournamentMatch.filterFresh')await new Promise(resolve=>setTimeout(resolve,1200));else await pause();return typeof result==='function'?result():structuredClone(result);};
const apiEntity=(name)=>({
 get:async(id)=>call(name+'.get',{id},()=>{if(name==='Tournament'){if(scenario==='error'&&!window.failedTournamentOnce){window.failedTournamentOnce=true;throw Error('Fixture tournament unavailable');}return structuredClone(tournament);}if(name==='User')return{id,full_name:id==='fixture_dev'?'dev':'Aurora',activision_id:'Aurora#1234567',elo:1600};throw Error('Unexpected get '+name);}),
 filterFresh:async(filter,sort,limit)=>call(name+'.filterFresh',{filter,sort,limit},()=>{if(name==='TournamentParticipant'){if(scenario==='participants-error'&&!window.failedParticipantsOnce){window.failedParticipantsOnce=true;throw Error('Fixture participants unavailable');}return[structuredClone(participant)];}if(name==='TournamentMatch'){if(['bracket-error','registered-bracket-error'].includes(scenario)&&!window.failedBracketOnce){window.failedBracketOnce=true;throw Error('Fixture bracket unavailable');}return live||completed?[{id:'fixture-round-1',tournament_id:tournament.id,round:1,match_number:1,bracket:'winner',status:completed?'completed':'live',winner_id:completed?'fixture_team':null,team_a_id:'fixture_team',team_a_name:'Aurora Wolves',team_b_id:'fixture_comets',team_b_name:'Neon Comets',team_a_score:completed?3:1,team_b_score:0}]:[];}if(name==='PlayerProfile')return[{user_id:filter.user_id,elo:1600,xp_level:12,wins:12,losses:4}];throw Error('Unexpected entity read '+name);}),
 filter:()=>{throw Error('Unexpected broad filter '+name)},list:()=>{throw Error('Unexpected broad list '+name)},subscribe:()=>()=>{},
 create:()=>{throw Error('Unexpected entity mutation '+name)},update:()=>{throw Error('Unexpected entity mutation '+name)},delete:()=>{throw Error('Unexpected entity mutation '+name)}
});
export const base44={auth:{me:()=>call('auth.me',{},()=>scenario==='guest'?null:actor)},entities:new Proxy({},{get:(_target,name)=>apiEntity(name)}),profile:{teamPage:()=>call('profile.teamPage',{},()=>({teams:[{id:'fixture_team',name:'Aurora Wolves',tag:'AW',team_type:'tournament',captain_id:actor.id,roster_size:4}],membersByTeam:{fixture_team:ownMembers}}))},functions:{invoke:async(name,payload)=>{window.writes.push({name,payload});throw Error('Fixture forbids writes '+name);}}};`;

const bundle = await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import TournamentOverview from './src/pages/TournamentOverview.jsx';
createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/tournaments/:id" element={<TournamentOverview/>}/><Route path="/login" element={<h1>Fixture login destination</h1>}/><Route path="*" element={<h1>Fixture linked destination</h1>}/></Routes></BrowserRouter>);
` },
  bundle: true, write: false, platform: "browser", format: "iife", define: { "import.meta.env": "{}" }, alias: { "@": `${root}/src` }, loader: { ".css": "empty" },
  plugins: [{ name: "fixture-api-only", setup(plugin) {
    plugin.onResolve({ filter: /(?:^|\/)api\/base44Client(?:\.js)?$/ }, args => ({ path: args.path, namespace: "fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: fixtureApi }));
    // Keep the real toast hooks/UI. The fixture does not replace application components.
  } }],
});
const cssFiles = (await readdir("dist/assets")).filter(file => file.endsWith(".css"));
const styles = (await Promise.all(["competition-presentation", "competition-route", "tournament-overview", "player-cards"].map(name => readFile(`src/styles/${name}.css`, "utf8")))).join("\n");
const app = express();app.use(express.static("dist"));app.use(express.static("public"));
app.get("/fixture.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.get(/.*/, (_req, res) => res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${cssFiles.map(file => `<link rel="stylesheet" href="/assets/${file}">`).join("")}<style>${styles}</style></head><body style="background:#080f17;color:#eef8fd;margin:0"><div id="root"></div><script src="/fixture.js"></script></body></html>`));
const server = app.listen(0, "127.0.0.1");await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];page.on("pageerror", error => errors.push(error.message));
  const url = `http://127.0.0.1:${server.address().port}/tournaments/fixture-mw4`;
  const ready = async (scenario = "open", extra = "") => { await page.goto(`${url}?fixture=${scenario}${extra}`);await page.locator(".tournament-overview").waitFor();await page.waitForFunction(() => window.calls.some(call => call.name === 'TournamentParticipant.filterFresh'));await page.waitForTimeout(100); };
  const tab = name => page.getByRole("tab", { name: new RegExp(`^${name === "Participants" ? "(?:Teams|Participants)" : name}(?: |$)`, "i") });
  const overflow = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  await ready();
  assert.match(await page.locator("h1").innerText(), /MW4 Day 2 SEARCH AND DESTROY KICK OFF 2\.500\$ FREE entry/);
  const cover = page.getByRole("img", { name: /Modern Warfare 4/i });await cover.waitFor();
  assert.match(await cover.getAttribute("src"), /\/assets\/mw4\/tournament-cover\.webp/);
  assert.ok(await cover.evaluate(img => img.complete && img.naturalWidth > 0), "MW4 cover is a real retained asset");
  assert.ok(await page.locator("h1").evaluate(el => el.scrollWidth <= el.clientWidth + 1), "long title fits its allocated column");
  assert.ok(await page.locator("h1").evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 25, "hero title remains readable");
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === 'profile.teamPage').length), 0, "initial overview does not fetch the player team directory");
  const initial = await page.evaluate(() => window.calls.filter(call => call.name.startsWith('Tournament')));
  assert.equal(initial.filter(call => call.name === 'Tournament.get').length, 1, "one tournament lookup");
  for (const entity of ["TournamentParticipant", "TournamentMatch"]) {
    const call = initial.find(call => call.name === `${entity}.filterFresh`);assert.ok(call, `${entity} scoped read exists`);assert.deepEqual(call.payload.filter, { tournament_id: "fixture-mw4" });assert.ok(call.payload.limit <= 256);
  }
  assert.match(await page.locator("body").innerText(), /\$2,?500|\$2\.500/);
  assert.equal(await page.getByRole("button", { name: "Join tournament", exact: true }).count(), 1, "one clear registration action is presented");
  assert.equal(await page.locator(".overview-prize").count(), 2, "only announced nonzero placements are promoted");
  await page.screenshot({ path: "output/tournament-review/overview-desktop.png", fullPage: true });
  await page.locator(".overview-hero").screenshot({ path: "output/tournament-review/overview-hero-preview.png" });

  await tab("Participants").click();await page.getByRole("button", { name: /Aurora Wolves.*View players/i }).waitFor();assert.match(page.url(), /tab=participants/);
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === 'User.get').length), 0, "participant directory does not fetch all player dossiers up front");
  await page.getByRole("button", { name: /Aurora Wolves.*View players/i }).click();await page.getByRole("heading", { name: "Aurora Wolves", exact: true }).waitFor();await page.waitForFunction(() => window.calls.filter(call => call.name === 'User.get').length === 4);
  await page.getByRole("button", { name: "Close roster" }).click();
  await tab("Rules").click();await page.getByRole("heading", { name: "Format and fair play" }).waitFor();assert.match(await page.locator(".overview-rules").innerText(), /generated map order/);assert.match(await page.getByRole("link", { name: "View platform rules" }).getAttribute("href"), /^\/rules/);
  await tab("Bracket").click();await page.getByText("Bracket not generated yet", { exact: true }).waitFor();assert.match(page.url(), /tab=bracket/);
  await page.goBack();await page.getByRole("heading", { name: "Format and fair play" }).waitFor();
  await page.reload();await page.getByRole("heading", { name: "Format and fair play" }).waitFor();assert.equal(await tab("Rules").getAttribute("aria-selected"), "true", "refresh restores active URL tab");
  await tab("Overview").click();
  await tab("Overview").focus();await page.keyboard.press("ArrowRight");await page.getByText("Bracket not generated yet",{exact:true}).waitFor();assert.equal(await tab("Bracket").getAttribute("aria-selected"),"true","keyboard arrow moves to the next tournament tab");await page.keyboard.press("Home");await page.waitForFunction(()=>document.querySelector('#tournament-tab-overview')?.getAttribute('aria-selected')==='true');
  await page.getByRole("button", { name: "Join tournament", exact: true }).first().click();await page.getByRole("dialog", { name: /^Join MW4/ }).waitFor();await page.getByRole("button", { name: /Aurora Wolves.*Ready/i }).waitFor();
  assert.equal(await page.evaluate(() => window.calls.filter(call => call.name === 'profile.teamPage').length), 1, "team choices fetch only when registration opens");
  const registration = page.getByRole("dialog");assert.equal(await registration.getByRole("button", { name: "Join tournament", exact: true }).isDisabled(), true, "registration requires an explicit team selection");
  await registration.getByRole("button", { name: /Aurora Wolves.*Ready/i }).click();assert.equal(await registration.getByRole("button", { name: "Join tournament", exact: true }).isEnabled(), true, "valid complete team enables registration");
  await page.getByRole("button", { name: "Close registration" }).click();assert.equal(await page.evaluate(() => window.writes.length), 0, "opening/closing a registration creates no mutation");

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });await page.waitForTimeout(100);const size = await overflow();assert.ok(size.scroll <= size.width, `${width}px overview has no horizontal page overflow (${size.scroll})`);
    assert.ok(await cover.isVisible(), `${width}px retains MW4 image`);assert.ok(await page.locator("h1").evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}px long title does not clip`);
    for (const name of ["Overview", "Bracket", "Participants", "Rules"]) assert.ok(await tab(name).isVisible(), `${width}px ${name} tab visible`);
    await tab("Participants").click();const partSize = await overflow();assert.ok(partSize.scroll <= partSize.width, `${width}px participants do not overflow`);
    await tab("Rules").click();const ruleSize = await overflow();assert.ok(ruleSize.scroll <= ruleSize.width, `${width}px rules do not overflow`);
    await tab("Overview").click();
    if (width === 390) await page.screenshot({ path: "output/tournament-review/overview-mobile.png", fullPage: true });
  }

  await page.setViewportSize({ width: 1440, height: 1100 });
  await ready("guest");await page.getByRole("button", { name: /Join tournament|Sign in.*join|Log in.*join/i }).first().click();await page.getByRole("heading", { name: "Fixture login destination" }).waitFor();
  await page.goto(`${url}?fixture=guest&join=1`);await page.getByRole("heading",{name:"Fixture login destination"}).waitFor();assert.equal(await page.getByRole("dialog").count(),0,"guest direct registration link redirects to login before opening the chooser");
  for(const scenario of ['slowauth','slowparticipants']){await ready(scenario);assert.equal(await page.getByRole('button',{name:'Checking registration...',exact:true}).isDisabled(),true,scenario+' holds registration until identity and existing membership are known');await page.getByRole('button',{name:'Join tournament',exact:true}).waitFor();}
  await ready('slowmatches');assert.equal(await page.getByRole('button',{name:'Leave tournament',exact:true}).count(),0,'leave stays unavailable before match-lock read completes');await page.getByRole('button',{name:'Leave tournament',exact:true}).waitFor();
  for(const[scenario,reason]of[['locked',/Registration locked/],['expired',/Registration closed/],['invite',/Invite only/]]){await ready(scenario);assert.equal(await page.getByRole('button',{name:'Join tournament',exact:true}).count(),0,scenario+' cannot register');assert.match(await page.locator('.to-status').innerText(),reason);}
  await ready("full");assert.equal(await page.getByRole("button", { name: "Join tournament", exact: true }).count(), 0, "full tournament has no enabled join action");assert.match(await page.locator(".overview-hero").innerText(), /full|unavailable/i);
  await ready("registered");assert.match(await page.locator(".overview-hero").innerText(), /Tournament joined|registered|your team/i);assert.equal(await page.getByRole("button", { name: "Join tournament", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Leave tournament", exact: true }).click();await page.getByRole("alertdialog").waitFor();await page.getByRole("button", { name: "Keep my spot" }).click();assert.equal(await page.evaluate(() => window.writes.length), 0, "leave confirmation cancellation has no mutation");
  await ready("member");assert.match(await page.locator(".overview-hero").innerText(), /Tournament joined|registered|your team/i);assert.equal(await page.getByRole("button", { name: "Leave tournament", exact: true }).count(), 0, "registered non-captain cannot remove the team");
  for(const scenario of ['registered-live','registered-completed']){
    await page.setViewportSize({width:800,height:1100});await ready(scenario);
    const summary=page.locator('.to-joined-actions .to-registered'),bracketButton=page.locator('.to-joined-actions').getByRole('button',{name:'View bracket',exact:true});
    await summary.waitFor();await bracketButton.waitFor();const summaryBox=await summary.boundingBox(),buttonBox=await bracketButton.boundingBox();
    assert.ok(summaryBox.y+summaryBox.height<=buttonBox.y+1||buttonBox.y+buttonBox.height<=summaryBox.y+1||summaryBox.x+summaryBox.width<=buttonBox.x+1||buttonBox.x+buttonBox.width<=summaryBox.x+1,scenario+' registered summary and bracket CTA never overlap at800px');
    assert.match(await page.locator('.to-deadline').innerText(),/Tournament status/);assert.ok(!/Starts in|Registration closes/i.test(await page.locator('.to-deadline').innerText()),scenario+' terminal status does not show a start or registration countdown');
    const tabletSize=await overflow();assert.ok(tabletSize.scroll<=tabletSize.width,scenario+' tablet has no horizontal overflow');
    await bracketButton.click();await page.getByRole('link',{name:/Aurora Wolves.*Neon Comets/i}).waitFor();assert.equal(await tab('Bracket').getAttribute('aria-selected'),'true',scenario+' registered team can follow the bracket');
  }
  await ready("live", "&tab=bracket");await page.getByRole("link", { name: /Aurora Wolves.*Neon Comets/i }).waitFor();assert.equal(await page.getByRole("link", { name: /Aurora Wolves.*Neon Comets/i }).getAttribute("href"), "/tournament-match/fixture-round-1");assert.equal(await page.getByRole("button", { name: "Join tournament", exact: true }).count(), 0, "live competition does not offer a join action");
  await page.setViewportSize({width:320,height:844});await page.waitForTimeout(100);const bracketSize=await overflow();assert.ok(bracketSize.scroll<=bracketSize.width,"320px live bracket scrolls inside its own panel, not the page");
  await ready('participants-error');const participantError=page.getByRole('alert').filter({hasText:'Registration could not be checked.'});await participantError.waitFor();assert.equal(await page.getByRole('button',{name:'Join tournament',exact:true}).count(),0,'failed participant data never allows a duplicate registration');await participantError.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('button',{name:'Join tournament',exact:true}).waitFor();
  await ready('bracket-error','&tab=bracket');const bracketError=page.getByRole('alert').filter({hasText:'The bracket could not be loaded.'});await bracketError.waitFor();assert.equal(await page.getByText('Bracket not generated yet',{exact:true}).count(),0,'failed match data is not presented as an empty bracket');await bracketError.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('Bracket not generated yet',{exact:true}).waitFor();
  await ready('registered-bracket-error','&tab=bracket');await page.getByRole('alert').filter({hasText:'The bracket could not be loaded.'}).waitFor();assert.equal(await page.getByRole('button',{name:'Leave tournament',exact:true}).count(),0,'failed match data never exposes unsafe team withdrawal');await page.getByRole('alert').filter({hasText:'The bracket could not be loaded.'}).getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('button',{name:'Leave tournament',exact:true}).waitFor();
  await page.goto(`${url}?fixture=error`);await page.getByRole("heading",{name:"Tournament could not be loaded"}).waitFor();await page.getByRole("button",{name:"Try again",exact:true}).click();await page.locator(".tournament-overview").waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='Tournament.get').length),2,"recoverable error has a working retry");
  assert.deepEqual(errors, [], "no runtime errors");
  console.log("Tournament overview browser checks passed: retained MW4 cover, readable long title, one join action, paid prize places only, scoped reads, URL/keyboard tabs and roster, join chooser/login/full/registered/live/lock/deadline/invite actions, registered live/completed bracket CTA and 800px collision guard, loading races and errors/retry, no writes, desktop and 320/390px mobile.");
} finally { await browser?.close();server.close(); }
