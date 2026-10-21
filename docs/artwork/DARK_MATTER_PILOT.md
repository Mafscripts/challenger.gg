# Ion Rift Overload: WebGL dark-matter pilot

The pilot replaces the SVG line animation for one exact artwork URL:
`/assets/rewards/first-drop-v2/first-drop-ion-rift-15.svg`.
Other items and administrator-provided custom artwork keep their current rendering.

## Material

The full-resolution original WebP stays visible as a normal image. A transparent WebGL canvas renders only the masked energy inlays. The mask has three channels: red for the material, green for the central reactor lens, blue for luminous fissure accents. It combines authored panel boundaries with chroma and brightness selection to protect the silver frame, black cutouts, transparency and surrounding background.

The fragment shader uses two separately advected fractal noise volumes with domain warping, purple/indigo/magenta cloud densities, thin intermittent electrical fissures, embedded twinkling particles and a breathing reactor lens. Pointer position offsets the two volumes in opposite directions for subtle parallax. Neither the illustration silhouette nor its metal geometry moves. There is no CSS animation or full-image shine/color wash.

## Integration and resource limits

- `RewardArtwork` selects `DarkMatterArtwork` only for the pilot image, including the Marketplace, item detail, Inventory, Trading, Admin and reward reveal wherever that renderer is used.
- Existing card geometry is retained with a picture containing the original image and canvas.
- The shared visibility and reduced-motion controls still apply. A reel with animation disabled uses only the poster.
- The shader module is dynamically imported only after the item becomes visible and animation is permitted. Textures and a context are created then, not on initial page load.
- One shared loop runs at at most 30fps and draws at most two WebGL surfaces per frame. Detail views and hovered items take priority.
- Canvas resolution is capped at 640px on a fine-pointer device and 384px on a coarse-pointer device, with device pixel ratio capped at 1.25. This cap affects only the material; the original metal stays at full image resolution.
- Leaving the viewport, hiding the tab, reduced motion, or unmounting releases the renderer, textures, shaders, buffers, observer, listeners and context. The original picture remains.
- Missing textures, context loss, unavailable WebGL, shader/link failure or module failure retain the original picture without breaking the page. No third-party service, extra package or database request is used.

## Authoring and preview

- Material renderer and shader: `public/assets/rewards/dark-matter-material.js`.
- Material mask: `public/assets/rewards/first-drop-v2/first-drop-ion-rift-15.material.webp`.
- Reproducible mask authoring: `node scripts/create-dark-matter-mask.mjs`.
- React adapter: `src/components/rewards/DarkMatterArtwork.jsx`.
- Side-by-side preview: `/dark-matter-preview.html` after deployment. The original and live material share the same illustration. The preview includes a pause button, viewport/tab/reduced-motion handling and the same renderer as the application. Serve it over HTTP; direct local-file module imports may be blocked by the browser.
- The 22-item gallery links to the live pilot preview. Its remaining thumbnails still use the existing SVG effects.

No new database migration or item bonus change is needed. Deploy the code, mask and public module together. The mask authoring script was executed; no application build, tests, syntax check, database migration or browser/visual check was run. The shader's runtime appearance and performance have not been verified on a GPU in this session.
