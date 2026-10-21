// Media authoring only: convert the user's supplied loops, never application data.
// Usage: node scripts/encode-reward-material-loops.mjs <ffmpeg.exe> <GIF folder>
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [ffmpeg,sourceFolder]=process.argv.slice(2);
if (!ffmpeg || !sourceFolder) throw new Error('Pass the FFmpeg executable and supplied GIF folder.');
const items=JSON.parse(await fs.readFile(path.join(root,'content/rewards/material-loops.json'),'utf8'));
const catalog=JSON.parse(await fs.readFile(path.join(root,'content/rewards/first-drop.json'),'utf8'));
const metadata=new Map(catalog.map(item=>[item.id,item.metadata]));
const output=path.join(root,'public/assets/rewards/material-loops');
await fs.mkdir(output,{recursive:true});
const entries=[];
for(const item of items) {
 const source=path.join(sourceFolder,item.source_file), target=path.join(output,`${item.slug}.mp4`);
 const meta=await sharp(source,{animated:true}).metadata();
 const duration=(meta.delay||[]).reduce((sum,delay)=>sum+delay,0)/1000;
 const args=['-hide_banner','-loglevel','error','-y','-ignore_loop','1','-i',source,'-t',String(duration),'-vf','fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p','-an','-c:v','libx264','-preset','slow','-crf','17','-profile:v','main','-level:v','3.0','-threads','2','-movflags','+faststart','-metadata',`artist=${item.creator}`,'-metadata',`title=${item.source_file}`,target];
 await new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';
  child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);
  child.on('close',code=>code===0?resolve():reject(new Error(`${item.slug}: ${error}`)));
 });
 const inputSize=(await fs.stat(source)).size, outputSize=(await fs.stat(target)).size;
 entries.push({...item,name:metadata.get(item.id)?.name || item.id,description:metadata.get(item.id)?.description || "",rarity:metadata.get(item.id)?.rarity || "",video:`/assets/rewards/material-loops/${item.slug}.mp4?v=3`,base:`/assets/rewards/first-drop-v2/${item.id}.material-base.webp`,original:`/assets/rewards/first-drop-v2/${item.id}.webp`,poster:`/assets/rewards/first-drop-v2/${item.id}.material-poster.webp`,mask:`/assets/rewards/first-drop-v2/${item.id}.material.webp?v=3`,duration_seconds:duration,source_bytes:inputSize,video_bytes:outputSize});
 console.log(`${item.slug}: ${(inputSize/1048576).toFixed(2)} MB GIF -> ${(outputSize/1024).toFixed(0)} KB MP4 (${duration}s)`);
}
await fs.writeFile(path.join(output,'items.json'),JSON.stringify(entries,null,2)+'\n');
const credits=['# Supplied animation sources','','The following animations were supplied by the user for use as item materials. The website uses converted versions of these actual loops, not a procedural recreation. The original files remain in the supplied source folder. Item artwork, IDs and reward bonuses are unchanged.','','| Item | Supplied file | Creator credit from supplied filename |','| --- | --- | --- |',...items.map(item=>`| ${item.id} | ${item.source_file} | ${item.creator} |`),'','Conversions preserve the complete source frames and keep creator/title metadata. Per-item texture zoom is applied at render time. Original creator marks remain in the source video.',''];
await fs.writeFile(path.join(root,'docs/artwork/SUPPLIED_MATERIAL_LOOPS.md'),credits.join('\n'));
console.log(`Total: ${(entries.reduce((n,e)=>n+e.source_bytes,0)/1048576).toFixed(1)} MB GIFs -> ${(entries.reduce((n,e)=>n+e.video_bytes,0)/1048576).toFixed(1)} MB video`);
