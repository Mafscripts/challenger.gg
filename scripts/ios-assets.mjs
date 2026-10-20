import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Use the site's existing vector mark for deterministic, opaque Apple assets.
const mark = await fs.readFile(new URL("../public/topfragg-mark.svg", import.meta.url));
const logo = await sharp(mark).resize(704, 704).png().toBuffer();
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#08111b" } })
  .composite([{ input: logo, gravity: "centre" }]).removeAlpha().png()
  .toFile(fileURLToPath(new URL("../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", import.meta.url)));
const splash = await sharp(mark).resize(300, 300).png().toBuffer();
const image = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: "#08111b" } })
  .composite([{ input: splash, gravity: "centre" }]).removeAlpha().png().toBuffer();
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await fs.writeFile(new URL(`../ios/App/App/Assets.xcassets/Splash.imageset/${name}`, import.meta.url), image);
}
console.log("TopFragg iOS icon and launch images generated.");
