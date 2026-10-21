// Authors a material mask; never changes the item illustration or database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'public/assets/rewards/first-drop-v2');
const id = 'first-drop-ion-rift-15';
// Panel boundaries are in the coordinates of the padded 768px poster.
// They allow dark nebula cavities to animate while excluding the silver frame.
const panels = `<svg width="768" height="768" xmlns="http://www.w3.org/2000/svg"><g fill="white">
<path d="M101 489 Q130 464 167 466 L179 475 Q155 516 110 549 L101 532Z"/>
<path d="M448 307 Q549 262 681 213 L696 219 Q603 270 466 323Z"/>
<path d="M453 334 L533 301 L554 300 L544 310 L463 343Z"/>
<path d="M383 284 L415 263 L426 270 L415 290 L391 302Z"/>
<ellipse cx="380" cy="383" rx="25" ry="28"/>
</g></svg>`;
const { data: art, info } = await sharp(path.join(folder, `${id}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const panelMask = await sharp(Buffer.from(panels)).resize(info.width, info.height).ensureAlpha().raw().toBuffer();
const output = Buffer.alloc(info.width * info.height * 3);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t); };
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const offset = (y*info.width+x)*4, index = (y*info.width+x)*3;
    const r=art[offset]/255, g=art[offset+1]/255, b=art[offset+2]/255, alpha=art[offset+3]/255;
    const hi=Math.max(r,g,b), lo=Math.min(r,g,b), saturation=(hi-lo)/Math.max(hi,.001);
    const energy=smooth(.16,.5,saturation)*smooth(.025,.18,Math.max(r,b)-g)*smooth(.12,.4,hi);
    const panel=panelMask[offset+3]/255;
    const cavity=panel*(1-smooth(.12,.35,lo));
    const material=Math.max(energy*.9, cavity*.92)*alpha;
    const distance=Math.hypot((x-380)/25,(y-383)/28);
    output[index]=Math.round(material*255);
    output[index+1]=Math.round((1-smooth(.25,1.1,distance))*material*255);
    output[index+2]=Math.round(smooth(.55,.9,hi)*energy*alpha*255);
  }
}
await fs.writeFile(path.join(folder, `${id}.material.webp`), await sharp(output,{ raw:{width:info.width,height:info.height,channels:3} }).webp({lossless:true,effort:6}).toBuffer());
console.log(`Authored ${id}.material.webp: material / reactor / luminous fissures`);
