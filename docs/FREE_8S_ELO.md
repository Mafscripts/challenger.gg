# Free 8s ELO

Only matches with `match_type: "8s"` award this ELO. Money 8s, Ranked,
XP matches and tournaments keep their existing behavior.

| Rank | ELO |
| --- | --- |
| Newb | 0–199 |
| Advanced | 200–399 |
| Amateur | 400–599 |
| Challenger | 600–799 |
| Topfragger | 800+ |

Everyone starts at 0. Historical matches are not scored retroactively. ELO
does not reset with monthly standings. A confirmed result awards each winner
ELO and deducts ELO from each loser, with a floor of 0. The change uses both
teams' average ELO, K=40 and expectation scale 400. Equal teams change by 20;
an upset earns more. Ranks follow the current ELO and can go down.

The existing `EightsStats` table stores `free_eights_elo` in a dedicated column,
so Money 8s/legacy JSON rating updates cannot overwrite it. Match metadata stores
`free_eights_elo_changes` and `free_eights_elo_applied_at`. Confirming the Free 8s
result and its ELO happens in one PostgreSQL transaction under an advisory lock.
Repeated completion does not award ELO again. Cancelled matches award nothing.
EightsStats is writable only through server actions.

Free 8s player cards show one rank pill and their Free 8s ELO. Below 600 ELO,
an approved screenshot rank (Diamond, Crimson, Iridescent or Top 250) supplies
the pill. Without a screenshot rank the normal Free 8s rank is shown. At 600
ELO Challenger takes priority; at 800 ELO Topfragger takes priority. Falling
below 600 restores the screenshot pill if one is linked. The main profile
always keeps its screenshot rank, including Top 250. After completion cards
also show that match's ELO delta. Other match rooms retain their existing cards.

## Free 8s standings

The standings on `/ranked/8s` rank players by `free_eights_elo`, highest first.
The column is labeled **8s ELO**; XP and the legacy `rating` are not used or shown.
Equal ELO is ordered by total wins, fewer losses, then user ID for a stable order.
Records show total wins and losses. Previous-month players remain on the ELO ladder
because Free 8s ELO does not reset each month. The database sorts by the dedicated
ELO column before applying the player limit.

The monthly prize continues to follow its separate monthly-wins rules. The prize
card explicitly describes that race rather than implying ELO position #1 earns it.

Checks: `node --test server/free-eights-standings.test.js`.

## Balanced Free 8s teams

The Free 8s reshuffle countdown before a full lobby starts is **one minute**.
Generation, reshuffles, timer recovery and admin resets all use 60 seconds.
Money 8s keeps its five-minute countdown. Existing stored deadlines are not
rewritten by this update; new generation or an intentional admin reset uses
the new duration. Discord voice assignment runs when teams are generated and
does not wait for this countdown to finish.

On initial generation and every player/admin reshuffle, the backend loads the
eight stored participants' account screenshot ranks and latest dedicated Free
8s ELO in two batched queries. Participant or frontend skill values never
determine teams. It evaluates all 35 unique 4v4 splits, first minimizing uneven
counts of the displayed ranks, then minimizing the total strength difference.
Equally good splits are selected randomly. Four Newbs, two Diamonds, one
Crimson and one Iridescent therefore produce two Newbs and one Diamond on
each side, with Crimson and Iridescent on opposite sides.

For this first balancing version, screenshot strength is Diamond=200,
Crimson=350, Iridescent=450, Top 250=550, with up to 24 extra strength points
from current Free 8s ELO below 600. These are provisional balancing weights,
not awarded ELO or measured skill. Players without a screenshot, or at/above
Challenger, use their actual Free 8s ELO as strength. Results still award ELO
using the existing formula above; no starting ELO is granted for screenshots.

The selected split and its strength/rank audit are stored under
`Wager.metadata.free_eights_team_balance`. Participant metadata stores an ELO
and screenshot snapshot for immediate card rendering; the authenticated stats
endpoint loads current account data for the roster. Existing team fields,
captains, maps, locking and Discord assignment continue to use the selected
roster. Money 8s retains random generation. Existing generated matches are
not reassigned on a poll. There is no additional migration or configuration
for the rank priority and balancing update.

## Deployment

Apply the migration before starting the updated backend. No new environment
variables or Discord changes are needed.

```sh
cd /var/www/topfragg.gg
git pull origin codex/gray-ui-rework
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart all
pm2 status
```

## Manual checks

1. Open a Free 8s lobby: a new player without a screenshot rank shows Newb
   and 0 ELO. An approved screenshot rank supplies the pill below Challenger.
2. Finish a full 4v4 using the existing score confirmation: equal teams receive
   +20 / −20, with losing players at 0 staying at 0. Refresh the room and verify
   updated ELO, rank and match delta.
3. Re-submit the same result: no second ELO change.
4. Cancel an unfinished Free 8s match: ELO stays unchanged.
5. Verify ranks at 200, 400, 600 and 800; dropping below a boundary lowers rank.
6. Complete Money 8s/Ranked/XP matches: Free 8s ELO is unchanged; those cards
   do not show Free 8s ranks.
7. Verify the cards on mobile, including a long player name.
8. With an approved Top 250 profile, verify Top 250 at 599 ELO, Challenger at
   600 and Topfragger at 800 on Free 8s cards; the main profile stays Top 250.
9. Generate and reshuffle the mixed roster above: both sides should have two
   Newbs and one Diamond, with Crimson/Iridescent separated. Reopen the room:
   already generated teams must stay the same. Check Money 8s separately.

Automated checks: `node --test server/free-eights-elo.test.js server/free-eights-teams.test.js server/free-eights-reads.test.js` (mock database;
production PostgreSQL transaction/lock behavior should also be checked on staging).

## Changed files

- `src/lib/freeEightsRanks.js`: rank thresholds and ELO calculation.
- `src/components/competition/FreeEightsRankBadge.jsx`: Free 8s rank badge.
- `src/components/match/MatchTeamTable.jsx`: optional Free 8s card display.
- `src/pages/EightsMatchRoom.jsx`: load ELO and refresh after completion.
- `server/free-eights-elo.js`: atomic, idempotent match/ELO completion.
- `server/free-eights-elo.test.js`: ELO, isolation, duplicate and API checks.
- `server/routes/functions.js`: connect the confirmed Free 8s result to ELO.
- `server/routes/entities.js`: block direct client stat mutations.
- `server/entity.js`: filter EightsStats by user in the database.
- `prisma/schema.prisma`: dedicated Free 8s ELO column.
- `prisma/migrations/20261007103000_free_eights_elo/migration.sql`: add column.
- `base44/entities/EightsStats.jsonc`: document the ELO field.
- `base44/entities/Wager.jsonc`: document the result audit fields.
- `docs/FREE_8S_ELO.md`: flow, deployment and testing instructions.
