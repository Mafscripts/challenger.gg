import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";

const root = process.cwd().replaceAll("\\", "/");
const fixtureApi = `
window.calls=[];window.events=[];window.fixture={imageFailures:1,rank:'top250',rankUpdated:'2026-10-24T14:00:00Z',appealStatus:'closed'};
window.addEventListener('topfragg:admin-player-open',event=>window.events.push(event.detail));
window.addEventListener('topfragg:admin-changed',()=>{window.events.push({changed:true});window.query?.invalidateQueries({queryKey:['admin-console']},{cancelRefetch:false});});
const player={id:'player1',display_name:'dev',username:'topfragg-dev',email:'dev@example.test',role:'user'};
const state=()=>({user_id:'player1',user_name:'dev',rank:window.fixture.rank,status:'manual_review',updated_date:window.fixture.rankUpdated,attempts:[{id:'good',has_image:true,rank:'top250',submitted_at:'2026-10-24'},{id:'bad',has_image:true,submitted_at:'2026-10-24'}]});
const call=(name,payload)=>window.calls.push({name,payload});
export const base44={functions:{invoke:async(name,payload={})=>{call(name,payload);await new Promise(r=>setTimeout(r,20));
if(name==='getAdminUsers')return{data:{success:true,rows:[player]}};
if(name==='updateUserRole')return{data:{success:true,user:{...player,role:payload.role}}};
if(name==='getAdminAuditLogs')return{data:{success:true,total:1,rows:[{id:'admin:event',record_id:'event',source:'admin',action_code:'role_change',actor_id:'staff',actor_name:'Helper',target_id:'player1',target_name:'dev',target_kind:'Account',created_date:'2026-10-24T14:00:00Z'}]}};
if(name==='getAdminAuditEntry')return{data:{success:true,details:{reason:'Reviewed'}}};
if(name==='getSiteAnnouncement')return{data:{success:true,announcement:{enabled:true,title:'Website update',message:'Updates in progress',kind:'website',revision:'one',rules_by_kind:{}}}};
if(name==='updateSiteAnnouncement')return{data:{success:true,announcement:{...payload,revision:'two'}}};
throw Error('Unexpected function '+name);}},rankVerification:{
list:async(filter,cursor)=>{call('rankList',{filter,cursor});return{rows:[state()],next_cursor:null};},
player:async(id)=>{call('rankPlayer',{id});return state();},
image:async(id,attempt)=>{call('rankImage',{id,attempt});if(attempt==='bad'&&window.fixture.imageFailures-->0)throw Error('Screenshot unavailable');return{image:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'};},
review:async(id,payload)=>{call('rankReview',{id,...payload});window.fixture.rank=payload.rank;window.fixture.rankUpdated='2026-10-24T15:00:00Z';return state();}},banAppeals:{
detail:async(id,before)=>{call('appealDetail',{id,before});return{appeal:{status:window.fixture.appealStatus},messages:[],next_cursor:null};},
reply:async(id,payload)=>{call('appealReply',{id,...payload});window.fixture.appealStatus='awaiting_user';return{success:true};}}};`;
const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import Rank from './src/components/admin/RankVerificationAdmin.jsx';import Roles from './src/components/admin/RoleManagement.jsx';import Appeal from './src/components/support/BanAppealConversation.jsx';import Audit from './src/components/admin/AuditLog.jsx';import Notice from './src/components/admin/SiteAnnouncementAdmin.jsx';
const query=new QueryClient({defaultOptions:{queries:{retry:false}}});window.query=query;const user={id:'ceo1',role:'ceo'};
function App(){const[rows,setRows]=useState([{id:'player1',display_name:'dev',username:'topfragg-dev',role:'user'}]);const[search,setSearch]=useState('');const section=new URLSearchParams(location.search).get('section');return section==='roles'?<Roles actorRole='ceo' search={search} onSearch={setSearch} onUserUpdated={updated=>setRows([updated])} onRefresh={async()=>{window.refreshed=(window.refreshed||0)+1;}} directory={{rows,total:rows.length,isPending:false,isError:false,searchPending:false}}/>:section==='appeal'?<Appeal appealId='appeal1' ceo scope='ceo1:appeal1'/>:section==='audit'?<Audit user={user}/>:section==='notice'?<Notice user={user}/>:<Rank user={user}/>;}createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><BrowserRouter><App/></BrowserRouter></QueryClientProvider>);
` }, bundle:true, write:false, platform:"browser", format:"iife", define:{"import.meta.env":"{}"}, alias:{"@":`${root}/src`},loader:{".css":"empty"}, plugins:[{name:"fixture",setup(plugin){plugin.onResolve({filter:/^@\/api\/base44Client$/},args=>({path:args.path,namespace:"fixture"}));plugin.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"js",contents:fixtureApi}));}}] });
const files=(await readdir("dist/assets")).filter(file=>file.endsWith(".css"));
const styles=(await Promise.all(["admin-audit","admin-roles","admin-workspace"].map(name=>readFile(`src/styles/${name}.css`,"utf8")))).join("\n");
const app=express();app.use(express.static("dist"));app.get("/fixture.js",(_req,res)=>res.type("js").send(bundle.outputFiles[0].text));app.get("/admin",(_req,res)=>res.type("html").send(`<!doctype html><html><head>${files.map(file=>`<link rel="stylesheet" href="/assets/${file}">`).join("")}<style>${styles}</style></head><body style="background:#07141d;color:white"><div id="root"></div><script src="/fixture.js"></script></body></html>`));
const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
const {chromium}=createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");let browser;
try{
browser=await chromium.launch({headless:true,channel:"chrome"});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});const url=`http://127.0.0.1:${server.address().port}/admin`;
await page.goto(url+'?section=rank');await page.getByRole('button',{name:/dev manual review/}).waitFor();
assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='getAdminUsers').length),0,'rank page does not preload a user directory');
await page.getByLabel('Find player for rank review').fill('d');await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='getAdminUsers').length),0,'one character does not trigger player search');
await page.getByLabel('Find player for rank review').fill('dev');await page.getByRole('button',{name:'dev Review player →'}).waitFor();
const search=await page.evaluate(()=>window.calls.find(call=>call.name==='getAdminUsers').payload);assert.equal(search.include_wallets,false);assert.equal(search.include_security,false);
await page.getByRole('button',{name:'dev Review player →'}).click();await page.getByText('Screenshot unavailable',{exact:true}).waitFor();assert.equal(await page.getByAltText('Player rank screenshot',{exact:true}).count(),1,'one failed screenshot does not hide successful screenshots');
await page.getByLabel('Reason',{exact:true}).fill('Draft review');await page.getByRole('button',{name:'Retry screenshots'}).click();await page.waitForFunction(()=>document.querySelectorAll('img[alt="Player rank screenshot"]').length===2);assert.equal(await page.getByLabel('Reason',{exact:true}).inputValue(),'Draft review','retrying an image preserves the review draft');
await page.getByRole('button',{name:'Player dossier',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.events.at(-1)),{userId:'player1'});
await page.getByLabel('Reason',{exact:true}).fill('Verified submission');await page.getByRole('button',{name:'Approve / set rank'}).click();await page.waitForFunction(()=>window.calls.some(call=>call.name==='rankReview'));
await page.waitForFunction(()=>window.calls.filter(call=>call.name==='rankList').length===2);assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='rankReview').length),1);await page.screenshot({path:'output/admin-review/rank-access.png'});

await page.goto(url+'?section=roles');await page.getByRole('button',{name:'dev',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.events.at(-1)),{userId:'player1'});await page.getByLabel('New role for dev').selectOption('admin');await page.getByRole('button',{name:'Save role for dev'}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='updateUserRole').length),0);
await page.getByRole('button',{name:'Save role for dev'}).click();await page.getByRole('button',{name:'Change role',exact:true}).click();await page.waitForFunction(()=>window.refreshed===1);assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='updateUserRole').length),1);

await page.goto(url+'?section=appeal');const textarea=page.getByLabel('Reply as admin team');await textarea.waitFor({state:'visible'});await page.getByText(/Sending a message reopens/).waitFor();await textarea.fill('First line');await textarea.press('Shift+Enter');await textarea.press('b');assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='appealReply').length),0);await textarea.press('Enter');await page.waitForFunction(()=>window.calls.filter(call=>call.name==='appealReply').length===1);await page.waitForFunction(()=>document.querySelector('textarea').value==='');assert.equal(await page.evaluate(()=>window.calls.find(call=>call.name==='appealReply').payload.content),'First line\nb');

await page.goto(url+'?section=audit&tab=audit&source=system&period=week&action=role_change');await page.getByText('Player role changed',{exact:true}).waitFor();const filters=await page.evaluate(()=>window.calls.find(call=>call.name==='getAdminAuditLogs').payload);assert.equal(filters.source,'system');assert.equal(filters.period,'week');assert.equal(filters.action,'role_change');await page.getByRole('button',{name:'dev',exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.events.at(-1)),{userId:'player1'});await page.getByRole('button',{name:'View details for Player role changed'}).click();await page.getByText('Reviewed',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='getAdminAuditEntry').length),1);await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.waitForFunction(()=>window.calls.filter(call=>call.name==='getAdminAuditLogs').length===2);await page.getByRole('button',{name:'Clear filters'}).click();await page.waitForFunction(()=>window.calls.some(call=>call.name==='getAdminAuditLogs'&&call.payload.action===''&&call.payload.period==='all'&&call.payload.source==='all'));

await page.goto(url+'?section=notice');await page.getByLabel('Title',{exact:true}).fill('Changed title');await page.getByRole('button',{name:'Discard changes'}).click();assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),'Website update');assert.equal(await page.evaluate(()=>window.calls.filter(call=>call.name==='updateSiteAnnouncement').length),0);await page.getByLabel('Update type',{exact:true}).selectOption('topfragg_variant_rules');assert.equal(await page.getByRole('link',{name:'View published rules ↗'}).getAttribute('href'),'/rules#topfragg-variant');assert.equal(await page.getByRole('button',{name:'Publish rules & notify everyone'}).count(),1);
assert.deepEqual(errors,[]);console.log('Access/records browser checks passed: bounded rank search, isolated screenshot errors/retry, single review + refresh, dossier links, role confirmation cancel/save, appeal Enter/Shift+Enter, audit URL filters/details/refresh/reset, announcement discard/rules link.');
}finally{await browser?.close();server.close();}
