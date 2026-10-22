# MW4 launch

New competition creation defaults to `mw4`. Modes are Hardpoint (`hp`), Hijacked (`hijacked`) and Search & Destroy (`snd`). Each mode uses exactly the same twelve maps in `src/lib/mw4.js`:

Silkworm, Reactor U92, Rooftops, Mumbai, Lithium, Munition, Cachette, Nautical, Lotus, Sentry, Coal, Transit 213.

Images are local WebP assets in `public/assets/maps/mw4/`. Library and all other excluded maps are absent. Stale saved MW4 configurations are replaced on load when their pools differ from the launch pool. Tournament MW4 pools also use this canonical selection.

Ranked, XP (including team XP), Free 8s, Money 8s and tournaments create game-tagged records and read standings scoped to their game. Missing game IDs on historical records mean BO7; existing match snapshots retain their original maps. Historical scores are not reset or transferred. Existing BO7 monthly prize accounting remains BO7.

Free 8s continues through the existing Discord voice/results integration. MW4 game names and voice cleanup are covered by the Discord tests. Actual production Discord permissions and connectivity require a live check after deployment.

## Deployment

Deploy the frontend build and updated API together, then restart the existing Discord bot with the updated shared modules. These changes use existing JSON metadata fields and require no schema migration. No production deployment or live match was performed during local validation.

## Validation

`npm run build`

`node --test --test-timeout=15000 server/mw4-launch.test.js server/xp-matches.test.js server/xp-formats.test.js server/free-eights-games.test.js server/tournament-bracket.test.js server/ranked-voice.test.js server/free-eights-elo.test.js server/match-presets.test.js`

`node --test --test-timeout=15000 discord/free-eights-results.test.js discord/free-eights-voice.test.js`
