// Author a portable reference clip from the same complete-frame material merge.
// Media authoring only; this does not run or test the browser renderer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [ffmpeg,itemId='first-drop-ion-rift-15']=process.argv.slice(2);if(!ffmpeg)throw new Error('Pass the FFmpeg executable.');
const items=JSON.parse(await fs.readFile(path.join(root,'content/rewards/material-loops.json'),'utf8'));
const item=items.find(item=>item.id===itemId);if(!item)throw new Error('Unknown item.');
const assets=path.join(root,'public/assets/rewards'),size=1152,zoomed=Math.round(size*Math.max(1,item.zoom));
const filename=itemId==='first-drop-ion-rift-15'?'ion-rift-overload-preview.mp4':`${itemId}-preview.mp4`;
const output=path.join(assets,'material-loops',filename);
await fs.mkdir(path.dirname(output),{recursive:true});
const filter=[
 '[0:v]format=gbrap[art]',
 `[1:v]setpts=PTS/${item.playback_rate},scale=${zoomed}:${zoomed}:flags=lanczos,crop=${size}:${size},format=gbrap[movie]`,
 `[2:v]format=gbrp,extractplanes=r,scale=${size}:${size}:flags=bilinear,format=gbrap[mask]`,
 '[art][movie][mask]maskedmerge=planes=7[combined]',
 '[3:v][combined]overlay=shortest=1:format=auto,format=yuv420p[out]',
].join(';');
const args=['-hide_banner','-loglevel','error','-y','-f','image2','-loop','1','-framerate','30','-i',path.join(assets,`first-drop-v2/${item.id}.material-base.webp`),'-stream_loop','-1','-i',path.join(assets,`material-loops/${item.slug}.mp4`),'-f','image2','-loop','1','-framerate','30','-i',path.join(assets,`first-drop-v2/${item.id}.material.webp`),'-f','lavfi','-i',`color=c=0x101c28:s=${size}x${size}:r=30`,'-filter_complex',filter,'-map','[out]','-t','8','-an','-c:v','libx264','-crf','18','-preset','medium','-threads','2','-movflags','+faststart',output];
await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error)));});
console.log(`Authored ${path.relative(root,output)}`);
