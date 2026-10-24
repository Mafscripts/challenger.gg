import {build} from 'esbuild';import{createRequire}from'node:module';import{readdir,writeFile}from'node:fs/promises';import express from'express';import sharp from'sharp';
const root=process.cwd().replaceAll('\\','/');
const result=await build({stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import MatchTeamTable from './src/components/match/MatchTeamTable.jsx';import {playerCardThemes} from './src/lib/playerCards.js';const players=playerCardThemes.map((t,i)=>({id:t.id,user_id:t.id,name:t.name,activision_id:'Preview#1234567',player_card_theme:t.id,player_card_motion:i===7?'on':'auto',elo:1600,wins:12,losses:4}));createRoot(document.getElementById('root')).render(<MemoryRouter><div style={{width:1160,margin:'25px auto'}} className="matchroom-refresh"><MatchTeamTable ranked label="Animation review" name="Live player cards" players={players}/></div></MemoryRouter>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{}'},alias:{'@':`${root}/src`},loader:{'.css':'empty'},plugins:[{name:'preview-stubs',setup(p){p.onResolve({filter:/^@\/(api\/base44Client|lib\/AuthContext)$/},a=>({path:a.path,namespace:'fixture'}));p.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('AuthContext')?'export const useAuth=()=>({user:null});':'export const base44={};',loader:'js'}));}}]});
const css=(await readdir('dist/assets')).filter(p=>p.endsWith('.css'));
const html=`<!doctype html><html><head>${css.map(p=>`<link rel="stylesheet" href="/assets/${p}">`).join('')}</head><body style="margin:0;background:#08131e;color:#eef7ff"><div class="app-style-arena" id="root"></div><script src="/review.js"></script></body></html>`;
const app=express();app.use(express.static('dist'));app.get('/motion-review',(_q,r)=>r.type('html').send(html));app.get('/review.js',(_q,r)=>r.type('js').send(result.outputFiles[0].text));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const{chromium}=createRequire(import.meta.url)('C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');let browser;
try{browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:1400},reducedMotion:'no-preference'});await page.goto(`http://127.0.0.1:${server.address().port}/motion-review`);await page.waitForSelector('[data-player-card="chrome-circuit"] .pc-scene-light');await page.waitForTimeout(250);
const themeMotion=[];
for(const card of await page.locator('[data-player-card]').all()){
 await card.scrollIntoViewIfNeeded();await page.waitForTimeout(60);
 const frames=[];
 for(const time of [1000,3000]){await card.evaluate((n,t)=>{for(const a of n.getAnimations({subtree:true})){a.pause();a.currentTime=t;}},time);frames.push(await card.screenshot());}
 const first=await sharp(frames[0]).raw().toBuffer({resolveWithObject:true});const second=await sharp(frames[1]).raw().toBuffer();let pixels=0;
 for(let i=0;i<second.length;i+=first.info.channels)if(Math.abs(first.data[i]-second[i])+Math.abs(first.data[i+1]-second[i+1])+Math.abs(first.data[i+2]-second[i+2])>18)pixels++;
 themeMotion.push({theme:await card.getAttribute('data-player-card'),changedPixels:pixels});
 await card.evaluate(n=>{for(const a of n.getAnimations({subtree:true}))a.play();});
}
console.log('All theme motion:',JSON.stringify(themeMotion));if(themeMotion.some(x=>x.changedPixels<100))throw new Error('Theme motion not visible');
const chrome=page.locator('[data-player-card="chrome-circuit"]');await chrome.scrollIntoViewIfNeeded();await page.waitForTimeout(100);
const box=await chrome.locator('.match-player-identity').boundingBox();
console.log('Actual Chrome motion:',await chrome.evaluate(node=>({paused:node.querySelector('.pc-atmosphere').dataset.motionPaused,animation:getComputedStyle(node.querySelector('.pc-scene-light')).animationName,state:getComputedStyle(node.querySelector('.pc-scene-light')).animationPlayState})));
const frames=[];for(const time of[2000,5000]){await chrome.evaluate((node,time)=>{for(const a of node.getAnimations({subtree:true})){a.pause();a.currentTime=time;}},time);await page.waitForTimeout(30);frames.push(await chrome.screenshot());}
const a=await sharp(frames[0]).raw().toBuffer({resolveWithObject:true});const b=await sharp(frames[1]).raw().toBuffer();let changed=0;for(let i=0;i<b.length;i+=a.info.channels)if(Math.abs(a.data[i]-b[i])+Math.abs(a.data[i+1]-b[i+1])+Math.abs(a.data[i+2]-b[i+2])>18)changed++;
console.log('Visibly changed Chrome pixels:',changed,'of',a.info.width*a.info.height);console.log('Text stable:',JSON.stringify(box)===JSON.stringify(await chrome.locator('.match-player-identity').boundingBox()));await writeFile('output/player-cards/chrome-animation-before.png',frames[0]);await writeFile('output/player-cards/chrome-animation-after.png',frames[1]);
await page.emulateMedia({reducedMotion:'reduce'});console.log('Explicit On ignores device reduction:',await chrome.locator('.pc-scene-light').evaluate(n=>getComputedStyle(n).animationName!=='none'));
const auto=page.locator('[data-player-card="tokyo-afterglow"]');console.log('Auto respects reduced motion:',await auto.locator('.pc-scene-light').evaluate(n=>getComputedStyle(n).animationName==='none'));
await page.emulateMedia({reducedMotion:'no-preference'});await chrome.evaluate(node=>node.dataset.cardAnimation='off');console.log('Off hides effects:',await chrome.locator('.pc-atmosphere').evaluate(n=>getComputedStyle(n).display==='none'));
await chrome.evaluate(node=>node.dataset.cardAnimation='on');await chrome.evaluate(node=>{for(const a of node.getAnimations({subtree:true}))a.play();});const layouts=[];
for(const width of [600,1158,1600]){
 await chrome.evaluate((node,width)=>node.closest('.match-team-card').parentElement.style.width=width+'px',width);
 await page.waitForTimeout(1000);
 layouts.push(await chrome.evaluate(node=>{const rect=node.getBoundingClientRect(),css=getComputedStyle(node,'::before');return{width:rect.width,height:rect.height,layout:node.dataset.cardLayout,image:css.backgroundImage.match(/desktop-fit[^/]*\/[^"\)]+/)?.[0],sizing:css.backgroundSize,transform:css.transform};}));
}
console.log('Measured responsive formats:',JSON.stringify(layouts));
if(layouts[0].layout!=='compact'||layouts[1].layout!=='row'||layouts[2].layout!=='wide'||layouts.some(x=>x.transform!=='none'||!x.sizing.includes('auto 100%')))throw new Error('Card framing regression');
await chrome.evaluate(node=>node.closest('.match-team-card').parentElement.style.width='1160px');await page.waitForTimeout(100);await page.screenshot({path:'output/player-cards/animated-match-cards.png',fullPage:true});
}finally{await browser?.close();server.close();}
