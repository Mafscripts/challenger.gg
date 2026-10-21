# Competition reward items

## Deployment

Apply `20261021070000_competition_reward_items` with the normal Prisma migration deployment, generate the Prisma client, build, and restart the API and frontend. The new tables and result-read indexes are required before enabling the feature. This change has not applied migrations, built the app, run tests, or deployed anything.

The migration creates settings and empty reward tables. It does not seed cards, grant items, reset ranks, or charge fees. Earlier pending migrations, including the explicitly requested marketplace collection cleanup, will also run during a normal migration deployment; see `MARKETPLACE_COLLECTION_RESET.md` for that cleanup's deployment instructions.

## Admin setup

Open **Admin → Reward Items & Seasons**. Create cards with a name, description, optional artwork, rarity, duration and eligible random pools. Artwork can be uploaded later. Each pool supports up to 100 active cards. Deactivate cards to remove them from future draws; earned copies retain their original artwork and effects.

Enable the system after configuring pools and fees. The default is disabled. Cash fees default to 10% standard, 5% Premium and a 0% floor; Premium can be configured as 0%. Fees apply to an individual winner's profit after returning their stake. Money 8s retains its existing pot rules. Fee items reduce the Cash Match fee by 1–6 percentage points, not dollars. For example, a 2-point item reduces 10% to 8%.

Available personal win effects: XP +5/+10/+15; Ranked ELO +5/+10/+15; Free 8s ELO +5/+10/+15; Money 8s or Cash Match winnings +$0.05/+$0.10/+$0.15; and +1 credit per tournament championship. Effects apply only to the owner on wins. The strongest copy per effect type applies; duplicate cards do not stack, and personal XP bonuses do not boost team XP. Cards are bound, not tradable. Duration 0 means permanent; other durations start when awarded. Bonuses require the original grant and its matching owned inventory copy.

## Seasons

There are six fixed UTC seasons each year: Jan–Feb, Mar–Apr, May–Jun, Jul–Aug, Sep–Oct, Nov–Dec. The separate Season view measures confirmed results within the period: net personal XP/ELO changes, or positive net winnings for cash ladders. XP has global and Solo/Duos/Teams player boards; Free 8s has a board per game. Stable ties use wins, then player/team ID. The #1 eligible player with at least one win receives one uniformly random card per ladder from that mode's active pool. Empty pools produce no item prize.

Challenge a Team is the exception: the #1 team gets two calendar months of Premium for its participating roster, extending existing active paid time. Tournaments have match drops instead of season-end item prizes. Global/career XP, ELO, team XP, records and rank remain intact; the new seasonal result window starts from zero without destructive resets.

The first enabled season includes confirmed results from that calendar season. A worker checks once per minute and closes seasons five minutes after their end. Database locks and unique grant keys prevent duplicate awards across processes or restarts. Closed seasons keep a standings snapshot. Manual progression resets remain separate admin actions.

## Tournament drops and special events

Schedule a tournament drop for a specific upcoming match, or leave Match ID blank to choose a match randomly within the selected tournament. One eligible winning player is picked randomly, then one item is picked uniformly from the configured pool. Alternatively, set an automatic per-match percentage (0% by default). Saved draw decisions prevent repeat draws; a manually scheduled match does not get a second automatic draw. Automatic draws start when enabled and do not backfill disabled periods. Championship credit bonuses use the items owned at championship completion.

For an event such as Christmas Wins, choose its dates, competition, win target and allowed cards. Each qualifying individual receives one random card once per event. Free 8s event wins count across games. Only matches completed in the event window count. Event processing allows five minutes for completion snapshots to settle.

## Reveal

Players receive a notification and an unobtrusive reward button. Opening the cards starts a 6.5-second strip animation that slows toward the chosen item, followed by finite confetti/fireworks and a short synthesized sound. All eligible pool cards can be previewed. Admin also has a Preview card animation button using active card artwork; this grants no items or bonuses. The server already saved the item, so skipping, closing or reopening never changes the draw. Sound is optional and remembered; reduced-motion users get the result immediately. Celebration work runs only during the reveal, with no background particle loop.

## Validation sources

`server/competition-rewards.test.js` covers UTC boundaries, pool/effect validation, season isolation, individual reward ownership, duplicate grant retries, immutable outcomes and bonus stacking/expiry. `server/wager-payout.test.js` covers exact cents, personal fees/bonuses, payout retries and transaction rollback. These tests were added but not executed, as requested.
