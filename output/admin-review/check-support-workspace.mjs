import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import express from "express";
import assert from "node:assert/strict";
const root = process.cwd().replaceAll("\\", "/");
const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import AdminTickets from './src/components/admin/AdminTickets.jsx';
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Fixture(){const[role,setRole]=useState('admin');window.changeStaffRole=setRole;return <BrowserRouter><QueryClientProvider client={client}><AdminTickets user={{id:'staff',role,display_name:'Helper'}}/></QueryClientProvider></BrowserRouter>};createRoot(document.getElementById('root')).render(<Fixture/>);` }, bundle: true, write: false, platform: "browser", format: "iife", define: { "import.meta.env": "{}" }, alias: { "@": `${root}/src` }, loader: { ".css": "empty" }, plugins: [{ name: "support-fixture", setup(plugin) {
  plugin.onResolve({ filter: /^@\/(api\/base44Client|components\/support\/SupportRecords)$/ }, args => ({ path: args.path, namespace: "fixture" }));
  plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "jsx", contents: args.path.includes("SupportRecords") ? `export default function Records(){return null;}` : `
const rows=Array.from({length:16},(_,i)=>({id:'ticket:case-'+i,kind:'ticket',record_id:'case-'+i,closed:false,channel:'live',mode:'',unread:true,incoming_token:'a'.repeat(64),activity_at:'2026-10-24T10:00:00.000Z',disputes:[],ticket:{id:'case-'+i,user_id:'player-'+i,username:'Player '+i,subject:'Live support '+i,description:'Need help '+i,request_type:'live_support',status:i===2?'waiting_for_user':'open',created_date:'2026-10-24T10:00:00.000Z',assigned_admin_id:'staff',assigned_admin_name:'Helper',messages:[]}}));
window.fixtureCalls=[];window.openedPlayers=[];window.addEventListener('topfragg:admin-player-open',e=>window.openedPlayers.push(e.detail.userId));
export const base44={functions:{invoke:async(name,p={})=>{window.fixtureCalls.push({name,p});if(name==='getAdminTicketCounts')return{data:{success:true,unread:47,new:47,mine:16,waiting:0,awaiting:1,categories:{all:47,live:47},unread_categories:{all:47,live:47}}};if(name==='getAdminTickets'){let list=rows.filter(r=>!p.record_id||r.record_id===p.record_id);if(p.view==='awaiting')list=list.filter(r=>r.ticket.status==='waiting_for_user');if(p.view==='new')list=list.filter(r=>r.unread);const offset=Number(p.cursor||0);return{data:{success:true,rows:list.slice(offset,offset+10),next_cursor:offset+10<list.length?String(offset+10):null}}}if(name==='markSupportCaseRead'){const row=rows.find(r=>r.record_id===p.id);if(row)row.unread=false;}if(name==='replyTicket'){rows.find(r=>r.record_id===p.ticket_id).ticket.messages.push({id:crypto.randomUUID(),sender_staff:true,sender_name:'Helper',content:p.message,created_date:new Date().toISOString()});}return{data:{success:true}}}}};` }));
} }] });
const css = (await readdir("dist/assets")).filter(name => name.endsWith(".css"));
const supportCss = await readFile("src/styles/support-workspace.css", "utf8");
const app = express(); app.use(express.static("dist"));
app.get("/fixture.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.get(/.*/, (_req, res) => res.type("html").send(`<!doctype html><html><head>${css.map(name => `<link rel="stylesheet" href="/assets/${name}">`).join("")}<style>${supportCss}.at-workspace{height:640px!important;min-height:0!important}.at-inbox,.at-reading-pane{overflow:auto!important;max-height:640px}</style></head><body style="background:#08131e;color:#eef7ff"><div class="app-style-arena" id="root"></div><script src="/fixture.js"></script></body></html>`));
const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"); let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }), errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/review?tab=tickets&case=ticket%3Acase-1&status=open`);
  await page.waitForSelector(".at-detail");
  assert.match(await page.locator('.at-categories button[data-category="live"] .at-category-unread').innerText(), /47 new/);
  await page.locator("#at-reply").fill("Draft survives a reload");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.locator(".at-inbox").evaluate(element => { element.scrollTop = 500; });
  await page.reload(); await page.waitForSelector(".at-case-timeline");
  assert.match(await page.locator(".at-detail h3").innerText(), /Live support 1/);
  assert.ok(await page.locator(".at-inbox").evaluate(element => element.scrollTop) >= 450);
  await page.getByRole("button", { name: "Conversation", exact: true }).click();
  assert.equal(await page.locator("#at-reply").inputValue(), "Draft survives a reload");
  await page.getByRole("button", { name: "Player 1", exact: false }).filter({ has: page.locator("svg") }).last().click();
  assert.deepEqual(await page.evaluate(() => window.openedPlayers), ["player-1"]);
  await page.evaluate(() => window.changeStaffRole("developer"));
  await page.waitForTimeout(100); assert.equal(await page.locator("#at-reply").inputValue(), "");
  await page.evaluate(() => window.changeStaffRole("admin"));
  await page.waitForTimeout(100); assert.equal(await page.locator("#at-reply").inputValue(), "Draft survives a reload");
  await page.locator("#at-reply").press("Enter"); await page.waitForFunction(() => window.fixtureCalls.some(call => call.name === "replyTicket"));
  assert.equal(await page.locator("#at-reply").inputValue(), "");
  await page.locator('[data-view="new"]').click(); await page.waitForFunction(() => window.fixtureCalls.some(call => call.name === "getAdminTickets" && call.p.view === "new"));
  await page.locator('[data-view="awaiting"]').click(); await page.waitForFunction(() => window.fixtureCalls.some(call => call.name === "getAdminTickets" && call.p.view === "awaiting"));
  assert.equal(await page.locator(".at-ticket-row").count(), 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "output/admin-review/support-workspace.png", fullPage: true });
  console.log("Support UI: global unread, deep link, filters, draft/scroll reload, role isolation, player dossier and Enter reply passed.");
} finally { await browser?.close(); server.close(); }
