// Asset authoring only. No database, build or application checks are invoked.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public/assets/rewards/first-drop-v2");
const configs = JSON.parse(await fs.readFile(path.join(root, "content/rewards/first-drop-art-v2.json"), "utf8"));
await fs.mkdir(target, { recursive: true });
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
const colorCycle = (colors, duration, attribute = "stop-color", begin = 0) => `<animate attributeName="${attribute}" values="${[...colors, colors[0]].join(";")}" dur="${duration}s" begin="-${begin}s" repeatCount="indefinite"/>`;
const pulse = (duration, begin = 0, low = .04, high = .8) => `<animate attributeName="opacity" values="${low};${high};${low}" dur="${duration}s" begin="-${begin}s" repeatCount="indefinite"/>`;
function electricity(config) {
  return Array.from({ length: 6 }, (_, i) => {
    const y = 150 + i * 85, offset = config.seed * 11 % 70;
    const d = `M-30 ${y} L135 ${y-24} L190 ${y+45} L252 ${y-35} L329 ${y+10} L425 ${y-48} L490 ${y+34} L585 ${y-12} L810 ${y+offset}`;
    const bend = `M-30 ${y} L135 ${y+19} L190 ${y-22} L252 ${y+33} L329 ${y-31} L425 ${y+22} L490 ${y-27} L585 ${y+18} L810 ${y+offset}`;
    return `<g opacity=".85"><path d="${d}" fill="none" stroke="${config.colors[i%3]}" stroke-width="${i%2+2}" stroke-linejoin="round" stroke-dasharray="50 125 14 230">
      <animate attributeName="d" values="${d};${bend};${d}" dur="${3.5+i*.28}s" repeatCount="indefinite"/>
      <animate attributeName="stroke-dashoffset" from="0" to="-419" dur="${2.8+i*.31}s" repeatCount="indefinite"/>
      ${colorCycle(config.colors, 9+i, "stroke", i)}
    </path><circle r="${2+i%2}" fill="#ffffff" opacity=".85"><animateMotion path="${d}" dur="${4+i*.4}s" begin="-${i*.6}s" repeatCount="indefinite"/></circle></g>`;
  }).join("");
}
function facets(config) {
  return Array.from({ length: 12 }, (_, i) => {
    const a = i/12*Math.PI*2, b=(i+1)/12*Math.PI*2;
    const x=384+Math.cos(a)*520, y=384+Math.sin(a)*520, nx=384+Math.cos(b)*520, ny=384+Math.sin(b)*520;
    return `<path d="M384 360 L${x.toFixed(1)} ${y.toFixed(1)} L${nx.toFixed(1)} ${ny.toFixed(1)}" fill="none" stroke="${config.colors[i%3]}" stroke-width="1.5" stroke-dasharray="18 95" opacity=".3">${pulse(6+i*.13,i*.43,.1,.55)}</path>`;
  }).join("");
}
function orbit(config, eclipse = false) {
  const rings = [115,205,295].map((r,i) => `<g transform="translate(384 360)"><g><ellipse rx="${r}" ry="${r*.53}" fill="none" stroke="${config.colors[i]}" stroke-width="${2.5-i*.5}" stroke-dasharray="${r*.8} ${r*.35} 5 ${r*.5}" opacity=".85"/>
    <circle cx="${r}" cy="0" r="${3-i*.5}" fill="${config.colors[i]}"/>
    <animateTransform attributeName="transform" type="rotate" from="${i*60}" to="${i*60+(i%2?-360:360)}" dur="${11+i*3}s" repeatCount="indefinite"/>
  </g></g>`).join("");
  const center = eclipse ? `<circle cx="384" cy="360" r="125" fill="none" stroke="url(#hue)" stroke-width="2" stroke-dasharray="16 36" opacity=".6">${pulse(8,0,.2,.65)}</circle>` : "";
  return center+rings;
}
function ice(config) {
  return Array.from({length:8},(_,i)=>{
    const x=100+i*82;
    return `<path d="M${x} 40 V720 M${x-20} 160 L${x} 190 L${x+25} 155 M${x-25} 330 L${x} 360 L${x+20} 320 M${x-20} 530 L${x} 560 L${x+25} 520" fill="none" stroke="${config.colors[i%3]}" stroke-width="2" stroke-dasharray="32 110" opacity=".7"><animate attributeName="stroke-dashoffset" from="0" to="-284" dur="${5+i*.3}s" repeatCount="indefinite"/></path>`;
  }).join("");
}
function serpent(config) {
  return [0,1].map((i)=>`<path d="M-200 500 C20 40 280 740 470 270 S860 760 1040 170" fill="none" stroke="${config.colors[i]}" stroke-width="${i?1.5:3}" stroke-linecap="round" stroke-dasharray="65 85 20 120" opacity=".7"><animate attributeName="stroke-dashoffset" from="${i*145}" to="${i*145-580}" dur="${i?8:11}s" repeatCount="indefinite"/></path>`).join("");
}
function effectMarkup(config) {
  switch(config.effect) {
    case "prism_fracture": return facets(config)+electricity(config);
    case "frost_runes": return ice(config)+facets(config);
    case "iris_awakening": return `<ellipse cx="384" cy="330" rx="190" ry="75" fill="none" stroke="url(#hue)" stroke-width="2" stroke-dasharray="12 24" opacity=".65"><animate attributeName="ry" values="25;92;70;25" dur="9s" repeatCount="indefinite"/></ellipse>`+orbit(config);
    case "singularity": return orbit(config)+`<g transform="translate(384 360)"><path d="M-320 0 C-140 -180 80 180 320 0 C100 -100 -100 100 -320 0" fill="none" stroke="url(#hue)" stroke-width="2.5" stroke-dasharray="35 60" opacity=".65"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite"/></path></g>`;
    case "solar_eclipse": return orbit(config,true)+facets(config);
    case "reactor_orbit": return orbit(config)+electricity(config);
    case "venom_flow": case "serpent_current": return serpent(config)+electricity(config);
    case "inferno_surge": return electricity(config);
    case "void_tide": return serpent(config);
    default: return electricity(config);
  }
}
function animatedItem(config, poster) {
  const c=config.colors;
  const channel = { blue: "-1 -1 2", green: "-1 2 -1", red: "2 -1 -1" }[config.channel];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768" role="img" aria-label="${escape(config.id)}">
<title>${escape(config.id)} — ${config.effect.replaceAll("_"," ")}</title>
<style>@media(prefers-reduced-motion:reduce){.material-motion{display:none}}</style>
<defs>
 <image id="art" width="768" height="768" href="data:image/webp;base64,${poster.toString("base64")}"/>
 <filter id="energy-channel" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${channel} 0 -0.08" result="isolated"/><feComposite in="isolated" in2="SourceGraphic" operator="in"/></filter>
 <mask id="energy" maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="768" style="mask-type:alpha"><use href="#art" filter="url(#energy-channel)"/></mask>
 <linearGradient id="hue" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="768" y2="768">
  ${c.map((color,i)=>`<stop offset="${i/2}" stop-color="${color}">${colorCycle([...c.slice(i),...c.slice(0,i)],13+i)}</stop>`).join("")}
  <animateTransform attributeName="gradientTransform" type="rotate" from="0 384 384" to="360 384 384" dur="31s" repeatCount="indefinite"/>
 </linearGradient>

</defs>
<use href="#art"/>
<!-- Keep the original illustration untouched; only narrow energy traces animate. -->
<g class="material-motion" mask="url(#energy)">
 ${effectMarkup(config)}
</g>
</svg>`;
}
for(const config of configs) {
 const source=path.join(root,"output/imagegen",config.source_collection,`${config.master}.png`);
 const poster=await sharp(source).resize(704,704,{fit:"contain",background:"#00000000"}).extend({top:32,bottom:32,left:32,right:32,background:"#00000000"}).webp({quality:88,alphaQuality:95,effort:6}).toBuffer();
 await fs.writeFile(path.join(target,`${config.id}.webp`),poster);
 await fs.writeFile(path.join(target,`${config.id}.svg`),animatedItem(config,poster));
 console.log(`${config.id}: ${config.effect}`);
}
