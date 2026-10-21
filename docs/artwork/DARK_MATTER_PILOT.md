# Item materials from the supplied GIFs

The earlier procedural Ion Rift pilot has been replaced. All 22 current First Drop items now use a different actual animation supplied by the user, converted to video and sampled inside a material mask. The current renderer merges the complete object from a lossless source illustration and opaque material regions. Its fallback is a separate still with the new material already applied, rather than the previous cosmic illustration.

## Composition

`content/rewards/material-loops.json` ties each exact current SVG image URL to a supplied file, creator credit, material mask and video. Administrator-provided custom artwork and the seven legacy SVG URLs are not replaced.

The former fractal-noise shader has been removed. The shader now samples the real video pixels, preserving their motion, colors and black areas. Only the material mask allows them to appear in the item. It does not add a shine sweep, white sheen or uniform color wash. Pointer movement adds a small texture offset without moving the object silhouette.

All 22 masks now use complete inlay regions, bounded-hole repair and connected structural chrome protection instead of a soft per-pixel chroma wash. Thin isolated baked lightning threads near material fields are included in the replaced region. `content/rewards/material-regions.json` supplies authored panel boundaries for the sniper, geode and orbital halo. The geode center and halo core are continuous regions, with separate orbital bands and a guard for outer metal rims. These changes address the old white scars/dark speckles showing through the new material.

The renderer uses an opaque material merge inside each region, preserving source alpha for the complete silhouette. Once a frame is ready the still image is hidden, avoiding a second illustration beneath the live canvas. When paused/offscreen, the matching new-material poster is shown. Original illustrative chrome, fixture and silhouette details outside the replaced regions remain.

The sniper uses the supplied blue/purple cosmic vortex. Other assignments include green ribbons, lava fractures, crimson plasma, a dark red/black flowing material, star fields, aurora and iridescent meshes. Full mapping and creator credits are recorded in [SUPPLIED_MATERIAL_LOOPS.md](SUPPLIED_MATERIAL_LOOPS.md). Source files are preserved in the user's Downloads folder; they are not copied into the repository.

## Performance and fallback

- The 22 source GIFs total approximately 185.7 MiB. The quality revision uses approximately 75.2 MiB of video textures across the entire collection, compared with the earlier 16.4 MiB export. Higher fidelity increases media size; only two selected visible animations load/play rather than downloading the collection on initial page load.
- Videos are silent H.264 Main/yuv420p MP4, retain their native 470–540px source resolution, and use CRF 17/slow encoding at up to 30fps with fast-start metadata. They are no longer reduced to a 480px square or encoded at CRF 24. The supplied frame composition and creator/title metadata are preserved. Selected materials use render-time zoom for their original borders/small central subject.
- The shared artwork observer allows at most two current material renderers at a time. Only those selected surfaces create WebGL contexts and fetch masks/videos. Hovered and detail items get priority. The remaining cards show their static posters.
- The renderer independently limits playback, decoding and drawing to two surfaces with one shared 30fps scheduler. Video-frame callbacks avoid re-uploading an unchanged decoded frame where supported.
- Video URLs are not assigned until a renderer is selected to play. Offscreen/hidden-tab/reduced-motion/unmount paths release the video source, context, textures, buffers, observers and listeners. Losing playback priority pauses the video and shows the still poster.
- Source illustrations and matching new-material stills are authored directly from the original PNG masters as 1152px lossless WebP assets; the former stills used a 704px illustration in a 768px lossy image. Canvas resolution is capped at 1536px on fine-pointer and 768px on coarse-pointer devices, with device pixel ratio capped at 2. This removes the previous additional 640/384px rendering bottleneck.
- Each item has its own `playback_rate` from 0.4 to 0.85 of source speed. Fast galaxy, plasma and short ribbon loops are slowed most. Playback does not use blur, frame blending or invented detail. The supplied GIFs' native resolution and palette/dither remain the upper limit of their material detail.
- Missing files, blocked autoplay, video decode failure, unavailable WebGL, shader/link failure, module failure or context loss fall back to the original still image.
- No new application dependency, database operation or external media service is involved. FFmpeg is an authoring-only tool and is not shipped with the website.

## Files and authoring

- Runtime module: `public/assets/rewards/dark-matter-material.js`.
- React adapter: `src/components/rewards/DarkMatterArtwork.jsx` and the shared `RewardArtwork`.
- Videos and preview metadata: `public/assets/rewards/material-loops/`.
- Masks: `public/assets/rewards/first-drop-v2/*.material.webp`.
- Convert supplied GIFs: `node scripts/encode-reward-material-loops.mjs <ffmpeg executable> <supplied GIF folder>`.
- Recreate all current masks, lossless source images and new-material stills: `node scripts/refine-reward-material-art.mjs <supplied GIF folder>`. An optional item ID limits authoring to one item. Earlier `create-dark-matter-mask.mjs` and `create-reward-material-masks.mjs` scripts describe prior prototypes; running them overwrites the current masks and requires running the refinement author afterwards.
- Author a portable precomposited example: `node scripts/create-material-video-preview.mjs <ffmpeg executable> [item ID]`. The default is the sniper; clips for the reported geode and halo are also supplied.

## Preview and deployment

After deployment `/dark-matter-preview.html` offers an original/live comparison for any of the 22 items, plus a link to its real source animation. `/first-drop-v2-preview.html` shows the complete collection with the same two-animation budget and the same renderer as the application. Serve these over HTTP; local-file module imports may be blocked.

`public/assets/rewards/material-loops/ion-rift-overload-preview.mp4` is a standalone, precomposited media example. It does not run the application or demonstrate browser/GPU performance.

Deploy the updated application, public module, masks, videos and preview pages together. No new database migration, item IDs, owners or reward/bonus changes are needed. Cache revision `v=3` refreshes the module, mask, video and preview manifest. New base/poster filenames avoid reusing the former stills.

The source loops were inspected at multiple frames. The 22 generated stills were inspected as a collection, with enlarged inspections of the reported problem items; material masks were iterated to protect chrome and remove old inlay scars. Media conversion, mask/still authoring and standalone video authoring were executed. No application build, tests, syntax check, migration or browser/GPU check was run. Runtime appearance and performance on target browsers remain unverified.
