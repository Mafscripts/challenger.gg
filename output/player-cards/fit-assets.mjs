import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(process.argv[2] || 'output/player-cards/atlas-manifest.json','utf8'));
const shapes=[['desktop-fit',2160,160],['desktop-fit-wide',3200,160],['desktop-fit-compact',1080,200]];
for(const [dir]of shapes)await mkdir(`public/images/player-cards/${dir}`,{recursive:true});
for(const item of manifest){
 const meta=await sharp(item.path).metadata();
 const rowH=Math.floor(meta.height/4),top=rowH+3,height=rowH-6;
 const strip=await sharp(item.path).extract({left:0,top,width:meta.width,height}).png().toBuffer();
 if(process.argv.includes('--mobile'))await sharp(strip).resize(1080,300,{fit:'cover',position:'right'}).webp({quality:87,effort:6}).toFile(`public/images/player-cards/${item.id}.webp`);
 for(const[dir,width,outH]of shapes){
  const ambient=await sharp(strip).extract({left:0,top:0,width:Math.floor(meta.width*.55),height}).resize(width,outH,{fit:'fill'}).blur(.6).png().toBuffer();
  let fg=await sharp(strip).resize({height:Math.round(outH*.92)}).png().toBuffer();let fm=await sharp(fg).metadata();
  if(fm.width>width){fg=await sharp(fg).extract({left:fm.width-width,top:0,width,height:fm.height}).png().toBuffer();fm=await sharp(fg).metadata();}
  const mask=Buffer.from(`<svg width="${fm.width}" height="${fm.height}"><defs><linearGradient id="x"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".24" stop-color="white"/><stop offset="1" stop-color="white"/></linearGradient><linearGradient id="y" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".05" stop-color="white"/><stop offset=".95" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><mask id="m"><rect width="100%" height="100%" fill="url(#y)"/></mask></defs><rect width="100%" height="100%" fill="url(#x)" mask="url(#m)"/></svg>`);
  const feathered=await sharp(fg).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
  await sharp(ambient).composite([{input:feathered,left:width-fm.width,top:Math.floor((outH-fm.height)/2)}]).webp({quality:87,effort:6}).toFile(`public/images/player-cards/${dir}/${item.id}.webp`);
 }
 console.log(item.id,': row 2160x160, wide 3200x160, compact 1080x200');
}
