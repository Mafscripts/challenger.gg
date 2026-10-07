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

Free 8s player cards show their rank and ELO. After completion they also show
that match's ELO delta. Other match rooms retain their existing cards.

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

1. Open a Free 8s lobby: each new player shows Newb and 0 ELO.
2. Finish a full 4v4 using the existing score confirmation: equal teams receive
   +20 / −20, with losing players at 0 staying at 0. Refresh the room and verify
   updated ELO, rank and match delta.
3. Re-submit the same result: no second ELO change.
4. Cancel an unfinished Free 8s match: ELO stays unchanged.
5. Verify ranks at 200, 400, 600 and 800; dropping below a boundary lowers rank.
6. Complete Money 8s/Ranked/XP matches: Free 8s ELO is unchanged; those cards
   do not show Free 8s ranks.
7. Verify the cards on mobile, including a long player name.

Automated checks: `node --test server/free-eights-elo.test.js` (mock database;
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
