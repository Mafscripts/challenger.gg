# Marketplace collection reset

Migration `20261021060000_clear_marketplace_collection` withdraws the current collection once. It removes catalog items, player copies (including equipped copies and copies of older collections), legacy knife unlocks, matching profile showcase references and obsolete item notifications. Open trades/bids referring to those copies are cancelled. Active events lose their old cosmetic bonus selections.

Standalone standard tournament placement trophies and rank rewards are preserved. XP, match results, staff/verification badges, user-uploaded avatars, balances, purchase history and completed trade/event history are not reset. New collection items can be added normally after this migration.

## Deploy

Use the production database backup from before deployment. Stop the API process before applying migrations so in-flight purchases or reward grants cannot recreate an old copy. With the API stopped, run `npm run prisma:deploy`, then restart the API with the deployed version. This is a data-only migration; no frontend rebuild is required for this cleanup itself.

Do not run this against a different database. The migration takes the catalog present at deployment as the collection to withdraw. It commits the cleanup together and records removal counts in Admin Actions. If a database error interrupts it, the transaction rolls back.

The migration has been prepared in the repository; it has not been executed against the live database from this task. Existing browser tabs may need a refresh to discard their previously loaded inventory.
