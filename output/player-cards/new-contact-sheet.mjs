import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
const items=JSON.parse(await readFile(process.argv[2] || 'output/player-cards/new-atlas-manifest.json','utf8'));
const layers=[];
for(const [i,item]of items.entries()){
 const banner=await sharp(`public/images/player-cards/desktop-fit/${item.id}.webp`).resize(1200,89).png().toBuffer();
 layers.push({input:banner,left:0,top:i*116+26});
 const label=Buffer.from(`<svg width="1200" height="26"><text x="12" y="18" font-family="Arial" font-size="14" fill="#d9e8f5">${item.id}</text></svg>`);
 layers.push({input:label,left:0,top:i*116});
}
await sharp({create:{width:1200,height:items.length*116,channels:3,background:'#08131e'}}).composite(layers).png().toFile(process.argv[3] || 'output/player-cards/new-15-cards.png');
