import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";

// Synthetic tournament data. No requests or mutations reach a website or database.
const root = process.cwd().replaceAll("\\", "/");
await mkdir("output/tournament-review", { recursive: true });
const api = `
window.calls=[];window.writes=[];
const scenario=new URLSearchParams(location.search).get('fixture')||'single';
const id='fixture-mw4';
const names=['6 paths','MFS','RNS','3manTeam','u18ers','CueREKuvez','cbdrewnick','no org','terroirst','IDf','Defjnehasthebestshoulders','Blupblupmeowwww'];
const name=(team)=>names[team]||team;
const team=(number)=>'fixture_team_'+number;
const match=(round,number,a,b,winner,bracket='winner',extra={})=>({id:bracket+'-'+round+'-'+number,tournament_id:id,round,match_number:number,bracket,status:scenario==='pending'?'pending':'completed',completed:scenario!=='pending',team_a_id:a===null?null:team(a),team_b_id:b===null?null:team(b),team_a_name:a===null?null:name(a),team_b_name:b===null?null:name(b),team_a_score:scenario==='pending'?null:a===winner?2:0,team_b_score:scenario==='pending'?null:b===winner?2:0,winner_id:scenario==='pending'?null:winner===null?null:team(winner),...extra});
const rows=[
match(1,1,0,null,0),match(1,2,1,2,1),match(1,3,3,null,3),match(1,4,4,5,5),match(1,5,6,null,6),match(1,6,7,8,8),match(1,7,9,null,9),match(1,8,10,11,11),
match(2,1,0,1,1),match(2,2,3,5,5),match(2,3,6,8,8),match(2,4,9,11,11),match(3,1,1,5,1),match(3,2,8,11,11),match(4,1,1,11,11)
];
for(const row of rows){if(row.round<4){row.next_match_id='winner-'+(row.round+1)+'-'+Math.ceil(row.match_number/2);row.slot_in_next=row.match_number%2?'team_a':'team_b';}}
if(scenario==='pending'){
 for(const row of rows){if(row.round>1){row.team_a_id=null;row.team_b_id=null;row.team_a_name=null;row.team_b_name=null;}}
 // A completed bye must show no played score, including legacy zero defaults.
 Object.assign(rows[0],{status:'completed',completed:true,winner_id:team(0),team_a_score:0,team_b_score:0});
}
if(scenario==='double'||scenario==='reset'){
 rows.length=0;
 rows.push(match(1,1,0,1,0),match(1,2,3,5,3),match(2,1,0,3,0),match(1,1,1,5,1,'loser'),match(2,1,1,3,1,'loser'),match(1,1,0,1,scenario==='reset'?1:0,'grand_final'));
 Object.assign(rows[0],{next_match_id:'winner-2-1',slot_in_next:'team_a',loser_match_id:'loser-1-1',loser_slot_in_next:'team_a'});
 Object.assign(rows[1],{next_match_id:'winner-2-1',slot_in_next:'team_b',loser_match_id:'loser-1-1',loser_slot_in_next:'team_b'});
 Object.assign(rows[2],{next_match_id:'grand_final-1-1',slot_in_next:'team_a',loser_match_id:'loser-2-1',loser_slot_in_next:'team_b'});
 Object.assign(rows[3],{next_match_id:'loser-2-1',slot_in_next:'team_a'});
 Object.assign(rows[4],{next_match_id:'grand_final-1-1',slot_in_next:'team_b'});
 if(scenario==='reset'){rows.push(match(2,1,0,1,1,'grand_final'));Object.assign(rows[5],{next_match_id:'grand_final-2-1',slot_in_next:'team_a'});}
}
const tournament={id,name:'MW4 Search & Destroy Championship',game_id:'mw4',game_name:'Modern Warfare 4',game:'Modern Warfare 4',game_mode:'snd',team_size:'4v4',region:'NA + EU',platform:'Cross platform',entry_type:'free',entry_fee:0,prize_pool:200,prize_distribution:{first_amount:150,second_amount:50},start_date:'2026-10-18T18:15:00Z',registration_end:'2026-10-18T18:00:00Z',max_teams:16,registered_teams:12,status:scenario==='pending'?'live':'completed',bracket_type:scenario==='double'||scenario==='reset'?'double_elimination':'single_elimination',check_in_required:false,registration_locked:true};
const participants=names.map((teamName,index)=>({id:'participant_'+index,tournament_id:id,team_id:team(index),team_name:teamName,captain_id:'captain_'+index,seed:index+1,members:[]}));
const call=async(name,payload,result)=>{window.calls.push({name,payload});await new Promise(resolve=>setTimeout(resolve,10));return structuredClone(result);};
export const invalidateApiCache=()=>{};
export const base44={auth:{me:()=>call('auth.me',{},null)},entities:new Proxy({},{get:(_target,entity)=>({get:(target)=>call(entity+'.get',{id:target},entity==='Tournament'?tournament:{}),filterFresh:(filter,sort,limit)=>call(entity+'.filterFresh',{filter,sort,limit},entity==='TournamentParticipant'?participants:entity==='TournamentMatch'?rows:[]),subscribe:()=>()=>{},create:()=>{throw Error('Mutation forbidden')},update:()=>{throw Error('Mutation forbidden')},delete:()=>{throw Error('Mutation forbidden')}})}),functions:{invoke:async(name,payload)=>{window.writes.push({name,payload});throw Error('Mutation forbidden');}}};
`;
const bundle = await build({
  stdin:{resolveDir:root,loader:"jsx",contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import TournamentOverview from './src/pages/TournamentOverview.jsx';createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path='/tournaments/:id' element={<TournamentOverview/>}/><Route path='*' element={<h1>Fixture match room</h1>}/></Routes></BrowserRouter>);`},
  bundle:true,write:false,platform:"browser",format:"iife",define:{"import.meta.env":"{}"},alias:{"@":`${root}/src`},loader:{".css":"empty"},plugins:[{name:"fixture-api-only",setup(plugin){plugin.onResolve({filter:/(?:^|\/)api\/base44Client(?:\.js)?$/},args=>({path:args.path,namespace:"fixture"}));plugin.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:api}));}}],
});
const cssFiles=(await readdir("dist/assets")).filter(file=>file.endsWith(".css"));
const styles=(await Promise.all(["competition-presentation","competition-route","tournament-overview","tournament-bracket-overview","player-cards"].map(name=>readFile(`src/styles/${name}.css`,"utf8")))).join("\n");
const app=express();app.use(express.static("dist"));app.use(express.static("public"));app.get("/fixture.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));app.get(/.*/,(_req,res)=>res.type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${cssFiles.map(file=>`<link rel="stylesheet" href="/assets/${file}">`).join("")}<style>${styles}</style></head><body style="background:#080f17;color:#eef8fd;margin:0"><div id="root"></div><script src="/fixture.js"></script></body></html>`));
const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
const{chromium}=createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");let browser;
try{
 browser=await chromium.launch({headless:true,channel:"chrome"});const page=await browser.newPage({viewport:{width:1600,height:1200}});const errors=[];page.on("pageerror",error=>errors.push(error.message));
 const url=`http://127.0.0.1:${server.address().port}/tournaments/fixture-mw4`;
 const ready=async(scenario="single")=>{await page.goto(`${url}?fixture=${scenario}&tab=bracket`);await page.locator(".tob-board").first().waitFor();await page.waitForTimeout(100);};
 const pageFits=async(width)=>{const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(sizes.scroll<=sizes.width,`${width}px bracket page does not overflow horizontally (${sizes.scroll})`);};
 await ready();
 // Layout assertions are intentionally against the real card and connector geometry.
 assert.equal(await page.locator(".tob-node").count(),15,"twelve teams keep all sixteen generated bracket slots, including four byes");
 const box=async(id)=>{const value=await page.locator(`.tob-node[data-match-id="${id}"]`).boundingBox();assert.ok(value,`match ${id} is visible`);return value;};
 for(const[round,count]of[[2,4],[3,2],[4,1]])for(let number=1;number<=count;number++){
  const [a,b,c]=await Promise.all([box(`winner-${round-1}-${number*2-1}`),box(`winner-${round-1}-${number*2}`),box(`winner-${round}-${number}`)]);
  const middle=((a.y+a.height/2)+(b.y+b.height/2))/2;assert.ok(Math.abs(c.y+c.height/2-middle)<2,`round ${round} match ${number} is centered between both feeders`);assert.ok(c.x>a.x+a.width,`round ${round} is placed after its feeder round`);
 }
 assert.ok(await page.locator(".tob-edge").count()>=14,"progression lines connect the elimination tree");
 const endpoints=await page.locator('.tob-edge').evaluateAll(paths=>paths.map(path=>{const start=path.getPointAtLength(0).matrixTransform(path.getScreenCTM()),end=path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM()),source=document.querySelector(`.tob-node[data-match-id="${path.dataset.from}"]`).getBoundingClientRect(),target=document.querySelector(`.tob-node[data-match-id="${path.dataset.to}"]`).getBoundingClientRect();return{from:path.dataset.from,to:path.dataset.to,start:{x:start.x,y:start.y},end:{x:end.x,y:end.y},source:{right:source.right,center:source.y+source.height/2},target:{left:target.left,top:target.top,bottom:target.bottom}};}));
 for(const edge of endpoints){assert.ok(Math.abs(edge.start.x-edge.source.right)<1&&Math.abs(edge.start.y-edge.source.center)<1,`${edge.from} connector starts at the feeder card edge`);assert.ok(Math.abs(edge.end.x-edge.target.left)<1&&edge.end.y>edge.target.top&&edge.end.y<edge.target.bottom,`${edge.to} connector reaches the next match team slot`);}
 assert.equal(await page.locator(".tob-node[data-match-id='winner-4-1']").getAttribute("href"),"/tournament-match/winner-4-1","final opens its real match room");
 assert.match(await page.locator(".tob-node[data-match-id='winner-4-1']").innerText(),/MFS[\s\S]*0[\s\S]*Blupblupmeowwww[\s\S]*2/);
 assert.match(await page.locator(".tob-node[data-match-id='winner-4-1'] .tob-team[data-winner='true']").innerText(),/Blupblupmeowwww/,'final winner is visibly distinguished');
 assert.match(await page.locator(".tob-round").last().innerText(),/Final/i,"last round has a human-readable final label");
 assert.match(await page.locator(".tob").innerText(),/Champion[\s\S]*Blupblupmeowwww|Blupblupmeowwww[\s\S]*Champion/i,"completed tournament names its champion");
 const bye=page.locator(".tob-node[data-match-id='winner-1-1']");assert.match(await bye.innerText(),/Bye|Auto.advance/i);assert.doesNotMatch(await bye.innerText(),/\b0\b/,"bye is not represented as a played zero score");
 await page.screenshot({path:"output/tournament-review/bracket-desktop.png",fullPage:true});await page.locator(".tob").screenshot({path:"output/tournament-review/bracket-preview.png"});
 const zoomIn=page.getByRole("button",{name:/Zoom in/i}),zoomOut=page.getByRole("button",{name:/Zoom out/i}),originalWidth=(await box('winner-1-1')).width;await zoomOut.click();await page.waitForTimeout(50);const smaller=await box('winner-1-1');assert.ok(smaller.width<originalWidth,'zooming out reduces match card size');await zoomIn.click();await page.waitForTimeout(50);assert.ok((await box('winner-1-1')).width>smaller.width,"zoom controls actually resize bracket cards");
 await page.getByRole('button',{name:'Go to final',exact:true}).click();const finalPosition=await page.locator('.tob-node[data-match-id="winner-4-1"]').evaluate(el=>{const node=el.getBoundingClientRect(),board=el.closest('.tob-board').getBoundingClientRect();return{top:node.top,bottom:node.bottom,boardTop:board.top,boardBottom:board.bottom};});assert.ok(finalPosition.top>=finalPosition.boardTop&&finalPosition.bottom<=finalPosition.boardBottom,'Go to final brings the final entirely into the scroll viewport');
 await page.getByRole('button',{name:'Reset view',exact:true}).click();await page.waitForTimeout(30);assert.deepEqual(await page.locator('.tob-board').evaluate(el=>({left:el.scrollLeft,top:el.scrollTop})),{left:0,top:0},'Reset view restores first round position');assert.equal(await page.locator('output[aria-label="Bracket zoom"]').innerText(),'100%','Reset view restores readable default zoom');
 await page.locator('.tob-round-nav').getByRole('button',{name:'Final',exact:true}).click();assert.ok(await page.locator('.tob-board').evaluate(el=>el.scrollTop)>0,'round navigation moves to the selected round');
 await page.locator('.tob-node[data-match-id="winner-4-1"]').click();await page.getByRole('heading',{name:'Fixture match room',exact:true}).waitFor();assert.match(page.url(),/\/tournament-match\/winner-4-1$/,'clicking the final reaches the real match-room route');
 await ready('pending');for(const id of ['winner-1-1','winner-2-1','winner-4-1'])assert.doesNotMatch(await page.locator(`.tob-node[data-match-id="${id}"]`).innerText(),/\b0\b/,`${id} unknown or bye scores do not invent zeroes`);assert.doesNotMatch(await page.locator('.tob').innerText(),/Champion\s+Blupblupmeowwww/i,"unfinished final does not invent a champion");
 for(const scenario of ['double','reset']){await ready(scenario);assert.ok(await page.locator('[data-lane="winner"]').count(),`${scenario} has separate upper bracket`);assert.ok(await page.locator('[data-lane="loser"]').count(),`${scenario} has separate lower bracket`);assert.ok(await page.locator('[data-lane="grand_final"]').count(),`${scenario} has separate grand final`);assert.match(await page.locator('[data-lane="grand_final"]').innerText(),/Grand final/i);if(scenario==='reset')assert.match(await page.locator('[data-lane="grand_final"]').innerText(),/Reset/i,'second grand-final match is explicitly labelled reset');}
 await ready();for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);await pageFits(width);const scroll=await page.locator('.tob-board').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight,overflowX:getComputedStyle(el).overflowX,overflowY:getComputedStyle(el).overflowY}));assert.ok(scroll.scrollWidth>scroll.width,`${width}px has a usable horizontal bracket surface`);assert.ok(['auto','scroll'].includes(scroll.overflowX),`${width}px horizontal scrolling stays in bracket`);if(scroll.scrollHeight>scroll.height)assert.ok(['auto','scroll'].includes(scroll.overflowY),`${width}px long bracket scrolls vertically inside board`);await page.locator('.tob-board').evaluate(el=>{el.scrollLeft=el.scrollWidth;el.scrollTop=el.scrollHeight;});assert.ok(await page.locator('.tob-board').evaluate(el=>el.scrollLeft)>0,`${width}px can reach later rounds`);if(width===390){await page.screenshot({path:'output/tournament-review/bracket-mobile.png',fullPage:true});}await page.locator('.tob-board').evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});}
 assert.equal(await page.evaluate(()=>window.writes.length),0,'browser checks never write or mutate');assert.deepEqual(errors,[],"no runtime errors");
 console.log('Tournament bracket browser checks passed: real sixteen-slot/twelve-team graph, centered feeder rounds and connectors, final/champion, real match links, byes and pending scores, separate double-elimination lanes and reset final, zoom, 320/390px contained scrolling, no runtime errors or mutations.');
}finally{await browser?.close();server.close();}



