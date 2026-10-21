// Asset authoring: isolate colored inlays for the 22 supplied-loop materials.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const items=JSON.parse(await fs.readFile(path.join(root,'content/rewards/material-loops.json'),'utf8'));
const folder=path.join(root,'public/assets/rewards/first-drop-v2');
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
for(const item of items) {
 // The sniper already has an authored panel mask; retain that precise mask.
 if(item.id==='first-drop-ion-rift-15') continue;
 const {data:art,info}=await sharp(path.join(folder,`${item.id}.webp`)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const energy=Buffer.alloc(info.width*info.height);
 for(let i=0;i<energy.length;i++) {
  const r=art[i*4]/255,g=art[i*4+1]/255,b=art[i*4+2]/255;
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),sat=(hi-lo)/Math.max(hi,.001);
  const bias=item.channel==='green'?g-Math.min(r,b):item.channel==='red'?r-Math.min(g,b):Math.max(r,b)-g;
  energy[i]=Math.round(255*smooth(.14,.44,sat)*smooth(.015,.16,bias)*smooth(.09,.35,hi));
 }
 const nearby=await sharp(energy,{raw:{width:info.width,height:info.height,channels:1}}).blur(2).greyscale().raw().toBuffer();
 const output=Buffer.alloc(energy.length*3);
 for(let i=0;i<energy.length;i++) {
  const r=art[i*4]/255,g=art[i*4+1]/255,b=art[i*4+2]/255,alpha=art[i*4+3]/255;
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),sat=(hi-lo)/Math.max(hi,.001);
  const metal=smooth(.18,.5,lo)*(1-smooth(.08,.3,sat));
  const material=Math.max(energy[i]/255,nearby[i]/255*.8)*(1-metal)*alpha;
  output[i*3]=Math.round(material*255);output[i*3+1]=0;output[i*3+2]=0;
 }
 await fs.writeFile(path.join(folder,`${item.id}.material.webp`),await sharp(output,{raw:{width:info.width,height:info.height,channels:3}}).webp({lossless:true,effort:6}).toBuffer());
 console.log(`${item.id}: isolated ${item.channel} material`);
}
