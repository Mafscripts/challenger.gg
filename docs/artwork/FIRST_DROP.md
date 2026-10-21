# First Drop artwork and deployment

**Superseded by [First Drop v2](FIRST_DROP_V2.md): all 22 items now have distinct artwork and upgraded material animations. This document records the initial shared-family version.**

Seven original AI-generated designs make 22 earnable reward variants for the first deployment. The existing random reward system selects them from the relevant mode's pool. Artwork is a collectible representation; bonus rules are explicit in each item's description.

| Design | Type | Individual bonus | Variants |
| --- | --- | --- | --- |
| Ion Rift | Energy rifle | +5 / +10 / +15 XP on XP Match wins | Spark, Surge, Overload |
| Frost Crown | Crystal crown badge | +5 / +10 / +15 Ranked ELO on wins | Shard, Ascendant, Sovereign |
| Venom Edge | Plasma knife | +5 / +10 / +15 Free 8s ELO on wins | Pulse, Venom, Apex |
| Emerald Vault | Crystal medallion | +$0.05 / +$0.10 / +$0.15 Money 8s winnings | Core, Prism, Sovereign |
| Crimson Ghost | Energy sidearm | +$0.05 / +$0.10 / +$0.15 Cash Match winnings | Ember, Inferno, Overdrive |
| Sovereign Aegis | Winged shield badge | 1–6 percentage-point personal Cash Match fee reduction | 01–06 |
| Prism Champion | Iridescent star trophy | +1 credit per tournament championship win | Founders Star |

The strongest owned bonus per type applies; duplicate items do not stack. Bonuses use the existing permanent duration default (0 days), editable for future drops in Admin. Challenge a Team remains the two-month Premium prize, without a new item effect.

## Actual image animation

The image itself is an animated, self-contained SVG. Its generated WebP artwork is embedded in the file. A static color mask isolates the item's colored energy channels; light streams, narrow moving filaments and a slow core pulse stay inside those channels. The weapon, badge outline and card do not rotate, scale or move. There is no JavaScript inside an SVG, no external resource fetch from the SVG, and no full-page particle effect.

The shared RewardArtwork renderer uses static WebP posters while images are outside the viewport, the tab is hidden, or reduced motion is requested. Rolling reveal cards use posters; the winning item animates. Shared observers avoid one browser visibility listener per card. Both image variants retain transparency and show the complete object. Optimized posters are approximately 57–158 KB; animated assets are approximately 79–212 KB each.

## Saved files and prompts

- Final animated images and posters: `public/assets/rewards/first-drop/`.
- Original transparent PNG masters: `output/imagegen/first-drop/`.
- Exact final generation prompts: `docs/artwork/first-drop-prompts.json`.
- Complete catalog definitions: `content/rewards/first-drop.json`.
- Reproducible asset compositor: `scripts/create-first-drop-art.mjs` (uses the existing Sharp dependency).

All seven raster masters were generated using the built-in image_gen tool. Native SVG animation was then composed over the generated art. No CLI image-generation fallback or external image API was used. The core prompt asks for original obsidian/platinum sci-fi collectibles, transparent backgrounds, luminous internal channels, whole-object composition, and no text, logos or card frames; each prompt adds its specific weapon, badge, token or trophy design.

## Deployment

Deploy the asset/code changes and apply `20261021080000_first_drop_collection` after the existing reward-system migration. Normal Prisma migration deployment will also apply any earlier pending migrations; the earlier requested collection cleanup precedes this starter collection. This migration adds catalog templates only and preserves their future admin edits through stable IDs. It does not give existing users items or enable the reward system.

Open Admin → Reward Items & Seasons to adjust bonuses/pools, try Preview card animation, and enable prizes when ready. The reward-system switch and fee settings keep their previous values. No database migration, application build, browser check, or tests were executed for this artwork change.
