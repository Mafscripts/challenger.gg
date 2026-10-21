# Item materials from the supplied GIFs

The earlier procedural Ion Rift pilot has been replaced. All 22 current First Drop items now use a different actual animation supplied by the user, converted to video and sampled inside a material mask. The original item artwork and silver/black frame remain in the foreground as a full-resolution still image.

## Composition

`content/rewards/material-loops.json` ties each exact current SVG image URL to a supplied file, creator credit, material mask and video. Administrator-provided custom artwork and the seven legacy SVG URLs are not replaced.

The former fractal-noise shader has been removed. The shader now samples the real video pixels, preserving their motion, colors and black areas. Only the material mask allows them to appear in the item. It does not add a shine sweep, white sheen or uniform color wash. Pointer movement adds a small texture offset without moving the object silhouette.

Twenty-one new masks isolate the existing colored inlays with chroma selection, local neighborhood coverage and protection for low-saturation metal highlights. Ion Rift Overload retains its manually bounded chamber, scope, stock and reactor mask. The complete object and surrounding transparency stay in the original image underneath.

The sniper uses the supplied blue/purple cosmic vortex. Other assignments include green ribbons, lava fractures, crimson plasma, a dark red/black flowing material, star fields, aurora and iridescent meshes. Full mapping and creator credits are recorded in [SUPPLIED_MATERIAL_LOOPS.md](SUPPLIED_MATERIAL_LOOPS.md). Source files are preserved in the user's Downloads folder; they are not copied into the repository.

## Performance and fallback

- The 22 originals total approximately 185.7 MiB; the 22 optimized video textures total approximately 16.4 MiB. This is the total collection size, not the initial page download.
- Videos are silent H.264 Main/yuv420p MP4, 480 square pixels, up to 30fps, with fast-start metadata. The supplied frame composition and creator/title metadata are preserved. Selected materials use render-time zoom for their original borders/small central subject.
- The shared artwork observer allows at most two current material renderers at a time. Only those selected surfaces create WebGL contexts and fetch masks/videos. Hovered and detail items get priority. The remaining cards show their static posters.
- The renderer independently limits playback, decoding and drawing to two surfaces with one shared 30fps scheduler. Video-frame callbacks avoid re-uploading an unchanged decoded frame where supported.
- Video URLs are not assigned until a renderer is selected to play. Offscreen/hidden-tab/reduced-motion/unmount paths release the video source, context, textures, buffers, observers and listeners. Losing playback priority pauses the video and shows the still poster.
- Canvas resolution is capped at 640px on fine-pointer and 384px on coarse-pointer devices, with device pixel ratio capped at 1.25. This affects only moving material; the original frame stays at full image resolution.
- Missing files, blocked autoplay, video decode failure, unavailable WebGL, shader/link failure, module failure or context loss fall back to the original still image.
- No new application dependency, database operation or external media service is involved. FFmpeg is an authoring-only tool and is not shipped with the website.

## Files and authoring

- Runtime module: `public/assets/rewards/dark-matter-material.js`.
- React adapter: `src/components/rewards/DarkMatterArtwork.jsx` and the shared `RewardArtwork`.
- Videos and preview metadata: `public/assets/rewards/material-loops/`.
- Masks: `public/assets/rewards/first-drop-v2/*.material.webp`.
- Convert supplied GIFs: `node scripts/encode-reward-material-loops.mjs <ffmpeg executable> <supplied GIF folder>`.
- Recreate the manually bounded sniper mask: `node scripts/create-dark-matter-mask.mjs`.
- Recreate the remaining masks: `node scripts/create-reward-material-masks.mjs`.
- Author a portable precomposited sniper example: `node scripts/create-material-video-preview.mjs <ffmpeg executable>`.

## Preview and deployment

After deployment `/dark-matter-preview.html` offers an original/live comparison for any of the 22 items, plus a link to its real source animation. `/first-drop-v2-preview.html` shows the complete collection with the same two-animation budget and the same renderer as the application. Serve these over HTTP; local-file module imports may be blocked.

`public/assets/rewards/material-loops/ion-rift-overload-preview.mp4` is a standalone, precomposited media example. It does not run the application or demonstrate browser/GPU performance.

Deploy the updated application, public module, masks, videos and preview pages together. No new database migration, item IDs, owners or reward/bonus changes are needed. Cache revision `v=2` refreshes the module and masks from the earlier prototype.

The source loops were inspected at multiple frames; media conversion, mask authoring and standalone video authoring were executed. No application build, tests, syntax check, migration or browser/GPU visual check was run. Runtime appearance and performance on target browsers remain unverified.
