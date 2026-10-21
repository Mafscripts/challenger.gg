// Author a portable video example using the same supplied loop and coverage mask.
// This is a media asset, not an application/browser test.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ffmpeg=process.argv[2];if(!ffmpeg)throw new Error('Pass the FFmpeg executable.');
const assets=path.join(root,'public/assets/rewards');
const output=path.join(assets,'material-loops/ion-rift-overload-preview.mp4');
await fs.mkdir(path.dirname(output),{recursive:true});
const ramp='clip((val/255-0.08)/0.54,0,1)';
const mask=`250*pow(${ramp},2)*(3-2*${ramp})`;
const filter=[
 '[0:v]format=rgba[art]',
 '[3:v][art]overlay=shortest=1:format=auto[base]',
 `[2:v]format=gbrp,extractplanes=r,lut=y='${mask}'[mask]`,
 '[1:v]scale=768:768:flags=lanczos,format=rgba[movie]',
 '[movie][mask]alphamerge[motion]',
 '[base][motion]overlay=shortest=1:format=auto,scale=640:640:flags=lanczos,format=yuv420p[out]',
].join(';');
const args=['-hide_banner','-loglevel','error','-y','-f','image2','-loop','1','-framerate','30','-i',path.join(assets,'first-drop-v2/first-drop-ion-rift-15.webp'),'-stream_loop','-1','-i',path.join(assets,'material-loops/cosmic-vortex.mp4'),'-f','image2','-loop','1','-framerate','30','-i',path.join(assets,'first-drop-v2/first-drop-ion-rift-15.material.webp'),'-f','lavfi','-i','color=c=0x08111b:s=768x768:r=30','-filter_complex',filter,'-map','[out]','-t','3.0666667','-an','-c:v','libx264','-crf','21','-preset','medium','-threads','2','-movflags','+faststart',output];
await new Promise((resolve,reject)=>{const child=spawn(ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(error)));});
console.log(`Authored ${path.relative(root,output)}`);
