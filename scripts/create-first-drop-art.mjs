// Creates lightweight self-animated SVG items from the imagegen raster masters.
// Does not connect to the database or run application checks.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public/assets/rewards/first-drop");
const masters = path.join(root, "output/imagegen/first-drop");
await fs.mkdir(masters, { recursive: true });
const assets = [
  { id: "ion-rift", color: "#af7bff", channel: "-1 -1 2", speed: 2.8 },
  { id: "frost-crown", color: "#8ee9ff", channel: "-1 -1 2", speed: 3.8 },
  { id: "venom-edge", color: "#4dff95", channel: "-1 2 -1", speed: 2.7 },
  { id: "emerald-vault", color: "#5dffc4", channel: "-1 2 -1", speed: 4.2 },
  { id: "crimson-ghost", color: "#ff527d", channel: "2 -1 -1", speed: 3.1 },
  { id: "sovereign-aegis", color: "#ce9dff", channel: "-1 -1 2", speed: 4.4 },
  { id: "prism-champion", color: "#b7cdff", channel: "-1 -1 2", speed: 4.6 },
];
for (const asset of assets) {
  const master = path.join(masters, `${asset.id}.png`), incoming = path.join(target, `${asset.id}.png`);
  try { await fs.access(master); } catch { await fs.rename(incoming, master); }
  const poster = await sharp(master).resize(704, 704, { fit: "contain", background: "#00000000" }).extend({ top: 32, bottom: 32, left: 32, right: 32, background: "#00000000" }).webp({ quality: 88, alphaQuality: 95, effort: 6 }).toBuffer();
  await fs.writeFile(path.join(target, `${asset.id}.webp`), poster);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768" role="img" aria-label="${asset.id.replaceAll("-", " ")} animated collectible">
<title>${asset.id.replaceAll("-", " ")} — internal energy flow</title>
<style>@media(prefers-reduced-motion:reduce){.energy-motion{display:none}}</style>
<defs>
 <image id="art" width="768" height="768" href="data:image/webp;base64,${poster.toString("base64")}"/>
 <filter id="channels" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
  <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${asset.channel} 0 -0.1" result="glow"/>
  <feComposite in="glow" in2="SourceGraphic" operator="in"/>
 </filter>
 <mask id="inside" maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="768" style="mask-type:alpha"><use href="#art" filter="url(#channels)"/></mask>
 <pattern id="filaments" width="240" height="240" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
  <path d="M0 8 H240 M0 113 H240" stroke="${asset.color}" stroke-width="2" stroke-dasharray="18 42 5 70" opacity=".65"/><path d="M0 14 H240" stroke="${asset.color}" stroke-width="1" stroke-dasharray="5 85" opacity=".6"/>
  <animateTransform attributeName="patternTransform" type="translate" from="0 -240" to="0 0" dur="${asset.speed * 1.5}s" repeatCount="indefinite" additive="sum"/>
 </pattern>
</defs>
<use href="#art"/>
<g class="energy-motion" mask="url(#inside)">
 <rect width="768" height="768" fill="url(#filaments)" opacity=".5"/>
</g>
</svg>`;
  await fs.writeFile(path.join(target, `${asset.id}.svg`), svg);
  console.log(`${asset.id}: ${Math.round(poster.length / 1024)} KB poster, ${Math.round(Buffer.byteLength(svg) / 1024)} KB animated item`);
}
const promptPath = path.join(root, "docs/artwork/first-drop-prompts.json");
const prompts = JSON.parse((await fs.readFile(promptPath, "utf8")).replace(/^\uFEFF/, ""));
await fs.writeFile(promptPath, JSON.stringify(prompts.map(({ id, prompt }) => ({ id, prompt })), null, 2) + "\n");
