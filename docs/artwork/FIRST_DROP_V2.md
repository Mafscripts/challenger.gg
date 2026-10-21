# First Drop v2: individual artwork and material animation

All 22 catalog items now have an individual image, not one shared image per bonus family. Fifteen new raster designs were generated with the built-in image_gen tool; seven previous designs are each retained for exactly one item. There are 22 distinct PNG sources and 22 distinct optimized image/animation pairs.

The XP family is a carbine, compact pulse-SMG and long precision sniper. The blade family is a dagger, karambit and katana. The Ranked family is a crystal crown, falcon crest and singularity crown. Treasury pieces are a vault medallion, fractured geode and octagonal sigil. Cash weapons are a sidearm, energy revolver and twin-barrel hand cannon. Fee emblems are a winged crest, cobra, dragon eye, wolf, eclipse and orbital halo. The tournament reward keeps its crystal star trophy.

## Animation design

The illustration silhouette and the card remain stationary. Motion is restricted to thin traces inside the colored energy channels. The original illustration renders unmodified underneath. Broad shine sweeps, translucent color washes, filled facets, dark-armor overlays and radial glare have been removed from all 22 current images and the seven legacy images. Each item has its own palette, timing, source image and animation configuration.

- Arc cascade: branching electrical paths change shape while sparks run along them.
- Void tide: two fine dashed currents move through the existing luminous material, without painting over dark surfaces.
- Reactor orbit: nested broken orbital rings rotate around the inner energy core.
- Singularity: counter-rotating orbital traces and a fine dashed plasma curve follow the colored core.
- Prism fracture: fine crystal-fracture outlines pulse in sequence while electrical lines travel through them.
- Frost runes: segmented ice branches travel through the crystal inlays.
- Venom / serpent current: two fine offset liquid-energy strands flow in different rhythms.
- Iris awakening: a thin segmented iris outline changes aperture within the eye relic.
- Solar eclipse: a thin corona outline pulses while segmented plasma arcs orbit its center.
- Inferno surge: warm/cold electrical arcs travel through the colored weapon chamber; no radial wash is applied.

Animation uses native SVG vector paths, gradients, color cycles and particle paths. It does not animate expensive turbulence or blur filters. Masks are static. The common image renderer pauses outside the viewport, on hidden tabs, and for reduced-motion users; at most six visible item effects run simultaneously. Hovering an item prioritizes its animation. Detail views and the selected reward have higher priority. The scrolling reveal strip uses still posters.

## Files

- Final individual SVGs / still WebP posters: `public/assets/rewards/first-drop-v2/`.
- New transparent raster masters: `output/imagegen/first-drop-v2/`.
- Seven retained masters: `output/imagegen/first-drop/`.
- Exact generation prompts: `docs/artwork/first-drop-v2-prompts.json` (new designs) and `first-drop-prompts.json` (retained designs).
- Individual source/effect map: `content/rewards/first-drop-art-v2.json`.
- Current catalog: `content/rewards/first-drop.json`.
- Reproducible asset authoring: `scripts/create-unique-reward-art.mjs`.

## Preview

`public/first-drop-v2-preview.html` is a standalone gallery of all 22 individual items and their effects. It can be opened locally; after deployment it is available at `/first-drop-v2-preview.html`. It uses the same six-effect visibility budget, hover priority, reduced-motion handling and pause control. It performs no database operations.

## Deployment

The new migration is `20261021090000_unique_reward_artwork`. It updates only the First Drop visuals and the default descriptions where needed, including copies already earned and their reveal snapshots. Item IDs, owners, bonus values, expiration, fees, progression and reward settings stay intact. Administrator-provided custom artwork and custom descriptions are preserved. Previous migration files are unchanged.

Apply normal database migrations, deploy the assets and build/restart the application. Versioned file paths bypass the previous image cache. View the results in Marketplace, Admin → Reward Items & Seasons, Inventory for owned items, or the admin card-animation preview. No database migrations, application build, browser checks or tests were executed for this change.

## Shine removal revision

This composition-only revision keeps all catalog paths, owners and bonuses unchanged and needs no new database migration. The shared image renderer and standalone gallery request SVGs with `?v=crisp-3` to bypass previously cached animations. Static WebP posters remain unchanged. Only the asset-authoring scripts were run; no application build, tests, browser checks or database operations were performed.
