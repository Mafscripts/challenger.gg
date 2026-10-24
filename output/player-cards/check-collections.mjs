import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readdir} from 'node:fs/promises';
import express from 'express';
import assert from 'node:assert/strict';
const root=process.cwd().replaceAll('\\','/');
const bundle=await build({stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import Cards from './src/components/settings/PlayerCardSection.jsx';createRoot(document.getElementById('root')).render(<div style={{maxWidth:1140,margin:'20px auto'}}><Cards user={{id:'review',display_name:'Player Preview',activision_id:'Preview#1234567',player_card_theme:'snack-bandit',player_card_motion:'on'}}/></div>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{}'},alias:{'@':`${root}/src`},loader:{'.css':'empty'},plugins:[{name:'collection-fixture',setup(p){p.onResolve({filter:/^@\/api\/base44Client$/},a=>({path:a.path,namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const base44={auth:{updateMe:async body=>{window.savedCard=body;return body;}}};',loader:'js'}));}}]});
const css=(await readdir('dist/assets')).filter(p=>p.endsWith('.css'));
const app=express();app.use(express.static('dist'));app.get('/studio',(_q,r)=>r.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(p=>`<link rel="stylesheet" href="/assets/${p}">`).join('')}</head><body style="margin:0;background:#08131e;color:#eef7ff"><div class="app-style-arena" id="root"></div><script src="/fixture.js"></script></body></html>`));app.get('/fixture.js',(_q,r)=>r.type('js').send(bundle.outputFiles[0].text));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const{chromium}=createRequire(import.meta.url)('C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'no-preference'});
 const failures=[];page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});await page.goto(`http://127.0.0.1:${server.address().port}/studio`);await page.waitForSelector('.player-card-option');
 for(const [collection,count]of[['cartoon',6],['legendary',5],['retro',4],['signature',25],['classic-cartoon',5],['all',45]]){
  await page.locator(`.player-card-collections [data-collection="${collection}"]`).click();assert.equal(await page.locator('.player-card-option').count(),count);console.log(collection,count);
 }
 await page.locator('.player-card-collections [data-collection="legendary"]').click();await page.locator('.player-card-option').filter({hasText:'Crown of Ashes'}).click();await page.getByRole('button',{name:'Save player card'}).click();await page.waitForFunction(()=>window.savedCard);assert.equal((await page.evaluate(()=>window.savedCard)).player_card_theme,'crown-of-ashes');
 await page.screenshot({path:'output/player-cards/legendary-studio.png',fullPage:true});
 await page.locator('.player-card-collections [data-collection="cartoon"]').click();await page.screenshot({path:'output/player-cards/cartoon-studio.png',fullPage:true});
 await page.locator('.player-card-collections [data-collection="classic-cartoon"]').click();await page.screenshot({path:'output/player-cards/classic-cartoon-studio.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/player-cards/classic-cartoon-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.player-card-collections [data-collection="retro"]').click();await page.screenshot({path:'output/player-cards/retro-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(failures,[]);console.log('Collection filters, selection, save, assets and mobile width passed');
}finally{await browser?.close();server.close();}
