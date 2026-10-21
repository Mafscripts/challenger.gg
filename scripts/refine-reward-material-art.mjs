// Re-author complete material regions, lossless source art and matching stills.
// Asset creation only; no application or database operations.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const items=JSON.parse(await fs.readFile(path.join(root,'content/rewards/material-loops.json'),'utf8'));
const artConfigs=JSON.parse(await fs.readFile(path.join(root,'content/rewards/first-drop-art-v2.json'),'utf8'));
const regions=JSON.parse(await fs.readFile(path.join(root,'content/rewards/material-regions.json'),'utf8'));
const folder=path.join(root,'public/assets/rewards/first-drop-v2');
const sourceFolder=process.argv[2];if(!sourceFolder)throw new Error('Pass the supplied GIF folder.');
const W=768,H=768,S=1152;
async function writeAsset(filename,data){
 for(let attempt=0;;attempt++){
  try{return await fs.writeFile(filename,data);}catch(error){
   if(attempt>=3||!['EBUSY','EPERM','UNKNOWN'].includes(error.code))throw error;
   await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
  }
 }
}
// Binary closing reconnects thin white veins before bounded holes are filled.
function boxMorph(input,radius,erode=false) {
 const integral=new Uint32Array((W+1)*(H+1));
 for(let y=0;y<H;y++){let sum=0;for(let x=0;x<W;x++){sum+=input[y*W+x];integral[(y+1)*(W+1)+x+1]=integral[y*(W+1)+x+1]+sum;}}
 const out=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const x0=Math.max(0,x-radius),y0=Math.max(0,y-radius),x1=Math.min(W,x+radius+1),y1=Math.min(H,y+radius+1);
  const sum=integral[y1*(W+1)+x1]-integral[y0*(W+1)+x1]-integral[y1*(W+1)+x0]+integral[y0*(W+1)+x0];
  out[y*W+x]=Number(erode?sum===(x1-x0)*(y1-y0):sum>0);
 }
 return out;
}
function fillInlayHoles(mask,art) {
 const visited=new Uint8Array(W*H),queue=new Int32Array(W*H);
 for(let start=0;start<mask.length;start++){
  if(mask[start]||visited[start])continue;
  let read=0,count=1,border=false;queue[0]=start;visited[start]=1;
  while(read<count){
   const i=queue[read++],x=i%W,y=Math.floor(i/W);
   if(x===0||y===0||x===W-1||y===H-1)border=true;
   for(const n of [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1])if(n>=0&&!visited[n]&&!mask[n]){visited[n]=1;queue[count++]=n;}
  }
  if(!border&&count<=4096)for(let j=0;j<count;j++){const i=queue[j];if(art[i*4+3]>100)mask[i]=1;}
 }
}
function protectMetal(art) {
 const neutral=new Uint8Array(W*H),brightness=new Float32Array(W*H);
 for(let i=0;i<neutral.length;i++){
  const r=art[i*4]/255,g=art[i*4+1]/255,b=art[i*4+2]/255,hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  brightness[i]=hi;
  neutral[i]=Number(art[i*4+3]>80&&hi>.04&&(hi-lo)/Math.max(hi,.001)<.3);
 }
 const seeds=boxMorph(boxMorph(neutral,2,true),2),metal=new Uint8Array(W*H),visited=new Uint8Array(W*H),queue=new Int32Array(W*H);
 for(let start=0;start<neutral.length;start++){
  if(!neutral[start]||visited[start])continue;
  let read=0,count=1,hasStructure=false,darkest=1;queue[0]=start;visited[start]=1;
  while(read<count){
   const i=queue[read++],x=i%W,y=Math.floor(i/W);hasStructure ||= Boolean(seeds[i]);darkest=Math.min(darkest,brightness[i]);
   for(const n of [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1])if(n>=0&&!visited[n]&&neutral[n]){visited[n]=1;queue[count++]=n;}
  }
  // Chrome has structural width and a continuous light-to-shadow gradient.
  // Isolated bright lightning threads do not and belong to the replaced inlay.
  if(hasStructure&&darkest<.35)for(let j=0;j<count;j++)metal[queue[j]]=1;
 }
 return {metal,neutral};
}
for(const item of items){
 if(process.argv[3]&&item.id!==process.argv[3])continue;
 const config=artConfigs.find(row=>row.id===item.id);
 const master=path.join(root,'output/imagegen',config.source_collection,`${config.master}.png`);
 const art=await sharp(master).resize(704,704,{fit:'contain',background:'#00000000'}).extend({top:32,bottom:32,left:32,right:32,background:'#00000000'}).ensureAlpha().raw().toBuffer();
 const binary=new Uint8Array(W*H);
 for(let i=0;i<binary.length;i++){
  const r=art[i*4]/255,g=art[i*4+1]/255,b=art[i*4+2]/255,hi=Math.max(r,g,b),lo=Math.min(r,g,b),sat=(hi-lo)/Math.max(hi,.001);
  const bias=item.channel==='green'?g-Math.min(r,b):item.channel==='red'?r-Math.min(g,b):Math.max(r,b)-g;
  binary[i]=Number(art[i*4+3]>40&&sat>.17&&bias>.025&&hi>.09);
 }
 let coverage=boxMorph(boxMorph(binary,2),2,true);fillInlayHoles(coverage,art);
 const {metal,neutral}=protectMetal(art),nearColor=boxMorph(binary,6);
 for(let i=0;i<coverage.length;i++){
  if(metal[i])coverage[i]=0;
  else if(neutral[i]&&nearColor[i])coverage[i]=1;
 }
 if(regions[item.id]){
  const silhouette=new Uint8Array(W*H);for(let i=0;i<silhouette.length;i++)silhouette[i]=Number(art[i*4+3]>40);
  const innerSilhouette=boxMorph(silhouette,4,true);
  const panel=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><g fill="white">${regions[item.id]}</g></svg>`)).ensureAlpha().raw().toBuffer();
  for(let i=0;i<coverage.length;i++)if(panel[i*4+3]>127&&!(metal[i]&&!innerSilhouette[i]))coverage[i]=1;
 }
 // Softness is limited to the antialiased silhouette, never the material interior.
 const matte=Buffer.alloc(W*H*3);
 for(let i=0;i<coverage.length;i++){const value=art[i*4+3]>20?coverage[i]*255:0;matte[i*3]=value;}
 await writeAsset(path.join(folder,`${item.id}.material.webp`),await sharp(matte,{raw:{width:W,height:H,channels:3}}).webp({lossless:true,effort:6}).toBuffer());
 const high=await sharp(master).resize(1056,1056,{fit:'contain',background:'#00000000'}).extend({top:48,bottom:48,left:48,right:48,background:'#00000000'}).ensureAlpha().raw().toBuffer();
 for(let i=0;i<S*S;i++)if(high[i*4+3]===0)high.fill(0,i*4,i*4+3);
 await writeAsset(path.join(folder,`${item.id}.material-base.webp`),await sharp(high,{raw:{width:S,height:S,channels:4}}).webp({lossless:true,effort:6}).toBuffer());
 const size=Math.round(S*Math.max(1,item.zoom)),crop=Math.floor((size-S)/2);
 const motion=await sharp(path.join(sourceFolder,item.source_file),{page:0,pages:1}).resize(size,size,{fit:'fill'}).extract({left:crop,top:crop,width:S,height:S}).ensureAlpha().raw().toBuffer();
 const maskHigh=await sharp(matte,{raw:{width:W,height:H,channels:3}}).extractChannel(0).resize(S,S,{kernel:'lanczos3'}).raw().toBuffer();
 const still=Buffer.from(high);
 for(let i=0;i<S*S;i++){
  const amount=maskHigh[i]/255;
  for(let c=0;c<3;c++)still[i*4+c]=high[i*4+3]===0?0:Math.round(high[i*4+c]*(1-amount)+motion[i*4+c]*amount);
 }
 await writeAsset(path.join(folder,`${item.id}.material-poster.webp`),await sharp(still,{raw:{width:S,height:S,channels:4}}).webp({lossless:true,effort:6}).toBuffer());
 console.log(`${item.id}: solid inlays, 1152px lossless art and new-material still`);
}
