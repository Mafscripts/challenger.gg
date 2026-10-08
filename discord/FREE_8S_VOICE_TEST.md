# Free 8s Discord voice test

This implementation applies to `match_type: "8s"` (Free 8s) only. Money 8s,
wagers, XP, ELO and tournament queues keep their existing behavior.

## Existing integration reused

- `server/routes/discord.js`: authenticated Discord OAuth `identify` flow and
  existing Verified Player role synchronization.
- `User.discord_user_id` and `discord_connected_at`: OAuth identity. The existing
  unique database index enforces one Discord account per Topfragg account.
- `discord/bot.js`: the existing bot, token, guild, Discord client and process.
- `Wager`, `WagerParticipant` and the existing team randomizer: authoritative
  roster and teams; the bot never generates teams or starts matches.
- `DiscordEventDispatch.metadata`: durable channel IDs and voice snapshots.
  No new database model or migration is required if existing migrations are applied.

The existing webhook function sends outbound Discord alerts from authenticated
backend requests and validates Discord webhook URLs. There is no inbound Discord
event webhook in this repository. That integration remains unchanged. Voice
presence uses the existing bot's Gateway connection and database polling, with no
new webhook, bot, bot secret or public event receiver.

## Configure and enable

In the existing Topfragg guild, create:

1. A regular voice channel named **8s Waiting Room**. Linked players must be able
   to view and connect to it. Copy its channel ID.
2. An existing category such as **ACTIVE 8s** for temporary voices. Copy its ID.
   Each match gets `<full-match-id> • Team A` and `<full-match-id> • Team B`.
   Names are display labels only; ownership and cleanup always use stored IDs.
3. Optionally, additional existing categories for overflow. Discord allows at most
   50 children in a category, so an otherwise empty category holds 25 match pairs.
   Other channels reduce that capacity. A match's pair stays in the same category;
   full categories leave players waiting and report capacity without blocking the match.

Add these variables to both the backend and existing bot environments:

```dotenv
DISCORD_FREE_8S_VOICE_ENABLED="true"
DISCORD_FREE_8S_WAITING_ROOM_ID="<waiting-voice-channel-id>"
DISCORD_FREE_8S_VOICE_CATEGORY_ID="<dedicated-category-id>"
DISCORD_FREE_8S_VOICE_OVERFLOW_CATEGORY_IDS="<optional-category-id>,<optional-second-category-id>"
```

Reuse `DISCORD_GUILD_ID`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_OAUTH_REDIRECT_URI`, `TOPFRAGG_PUBLIC_URL` and
the existing OAuth state secret / `JWT_SECRET`. The new channels belong to that
same guild. Use the same OAuth callback already registered with Discord.

Restart the backend and existing Discord bot after deployment; deploy the website
build. Do not start another bot integration. No provisioning script is run by this
change, and no live channels are changed until the existing bot runs this code.

The default in `.env.example` is `DISCORD_FREE_8S_VOICE_ENABLED="false"`.
**Discord linking is mandatory for Free 8s regardless of that switch.** Turning
the switch off stops assignments and cleans up managed channels while the bot
continues running. Keep the old channel/category IDs until cleanup finishes.
New full Free 8s lobbies also wait for a fresh bot snapshot showing all eight
players in the Waiting Room before generating teams/maps or starting the timer.
With voice disabled, unconfigured or offline, those lobbies remain waiting.

## Permissions and intents

The bot needs **View Audit Log** at the guild level for safe interrupted-creation
recovery. It needs **View Channel**, **Connect**, **Move Members**, **Manage Channels**
and **Manage Roles** (to manage channel permission overwrites) in the test category
and every overflow category and relevant voice. Its existing Verified Player role sync also needs Manage
Roles, with the bot role above the Verified Player role. Players need View Channel,
Connect and Speak in the waiting room. Team channels explicitly grant these to
their team's linked identities and deny View Channel/Connect to `@everyone`.
Discord administrators retain Discord's normal permission bypass.

Give the bot Manage Roles through its server role, not through a per-channel
overwrite. Discord permits setting the Manage Roles bit in channel overwrites
only for administrators. Free 8s therefore inherits this permission and does
not explicitly set it in either team channel's overwrites. This avoids error
50013 during creation/reshuffles without requiring Administrator.

`GuildVoiceStates` has been added to the existing client's intents. It is a
standard intent and does not need a new privileged-intent toggle. Keep the existing
Guild Members privileged-intent setting used by the current bot. The bot does not
join voice or transmit audio.

## Player and match flow

1. An unlinked player sees **Connect Discord to join Free 8s** in Free 8s, its
   creation modal and the standalone Matchfinder's Free 8s category. The backend
   also refuses both creation and joining without a valid stored OAuth identity.
2. The existing authenticated OAuth endpoint signs the initiating Topfragg user
   and an allowlisted return path. A short-lived HttpOnly browser cookie binds the
   callback to that browser. The backend obtains the Discord ID from Discord,
   verifies ownership and stores the existing identity fields. It never accepts a
   frontend-supplied Discord ID. Duplicate links are rejected by both the ownership
   check and the existing database uniqueness constraint.
3. Successful OAuth returns to Free 8s, the Free 8s Matchfinder category, or the
   originating Free 8s match room. Normal Settings connections still return to
   Settings. Changing/removing an identity is blocked during an active Free 8s
   membership; finish or leave the lobby first.
4. Linked players join normally and follow **Open 8s Waiting Room**. They connect
   to voice themselves. The website does not connect them automatically.
   A player can be enrolled in only **one unfinished Free 8s** at a time. Both
   creation and accepting a different Free 8s lobby are blocked by the backend,
   including from standalone Matchfinder or concurrent browser tabs. PostgreSQL
   account locks serialize the check and enrollment in a short database-only
   transaction; creation of the lobby and its host membership is atomic. The
   active check uses stored participant records and captain IDs, including
   legacy captains missing a membership row. All nonterminal statuses remain
   blocking, including pending score reports, awaiting completion and disputes.
   Only completed/cancelled/expired/closed matches release the slot. Reopening
   the current lobby does not create another membership. Existing memberships
   are preserved; no other queue's enrollment policy is changed.
5. With eight players on the website, maps, teams and the one-minute countdown
   remain pending until the existing bot has observed **all eight** in the
   configured Waiting Room. The server checks the exact roster/signature, guild,
   Waiting Room and category, with a snapshot younger than twenty seconds.
   Frontend readiness claims cannot release this gate; seven waiting players,
   players in other/team channels, stale snapshots or an offline bot keep it
   pending. A lobby sync then uses the existing generator to create Alpha/Bravo
   and the maps and start the countdown. An admin timer reset cannot start a
   still-pending lobby. The bot checks the exact canonical
   eight-player 4v4 roster and creates private Team A/Team B voice channels. Alpha
   is A; Bravo is B. Once both channels are ready, it moves connected waiting-room
   players to their assigned team. Existing live/generated matches are preserved.
6. The room shows every participant's status: unlinked, not in the waiting room,
   waiting-room ready, team-voice ready, move failed or status unavailable. It polls
   every two seconds and treats snapshots older than twenty seconds or from a
   changed roster/configuration as unavailable. Only players in that room or staff
   can read its status; Discord IDs are not included in the response.
   The website now polls every **two seconds**, with immediate checks after
   roster changes or returning to the tab, and never overlaps its requests.
   A short request failure retains the last snapshot only while it is still
   recent. Brief missing/stale updates show neutral **Updating…** for up to
   fifteen seconds; old status is not displayed as confirmed readiness. A
   sustained outage or explicit configuration/Discord error remains visible.
   Snapshot age is calculated server-side to avoid client clock skew.
7. After generation, the existing countdown proceeds; players are not required
   to return to the Waiting Room after the bot has moved them to team voice.
   Offline players and people in unrelated voice channels are not moved. Late
   waiting-room arrivals are retried. Existing reshuffles preserve maps, update
   permissions and move players between this match's team voices.
8. The bot polls the database every five seconds and reacts to voice events. On
   completed/cancelled/expired/closed/deleted matches, partial rosters or disabling
   the test, it returns that match's occupants of its team voices to the waiting room and deletes
   those voices. It does not move someone who already left for another channel.
   Failed return moves retain the occupied channel for retry. Cleanup runs even if
   no one has the website open. There is no new match expiry timer; an existing
   status change to `expired` is handled when observed.

Each bot sweep fetches the guild channel inventory once for all matches, uses
the live channel cache and reserves category capacity across concurrent local
workers. Intermediate provisioning/move saves preserve the previous presence
timestamp and snapshot; only the final complete roster observation updates
`checked_at`. Voice events during a running sweep queue a follow-up rather than
being dropped. A disconnected Gateway cannot refresh cached voice readiness.
These improvements leave the server's twenty-second map-readiness gate intact.

After a confirmed completed result (win/loss), **both teams** still connected to
their managed team voices return automatically to the shared Waiting Room,
normally on the next five-second bot sweep. Users who already left voice or
moved elsewhere are not force-connected or moved from unrelated channels.
Cleanup remains idempotent and only deletes this match's stored channel IDs.

Manual gate test: join a new Free 8s website lobby with eight linked accounts,
but put only seven in the Waiting Room. Verify no maps, generated teams, timer
or temporary team voices appear, including after refresh and an admin reset.
Connect the eighth player; within the bot/website polling cycle, verify maps and
teams appear, the one-minute timer starts and all eight move to the correct
team voices. Confirm a final score and verify both teams return and their
temporary channels disappear. Money 8s keeps its existing behavior.

## Concurrent matches and ownership

The existing unique `Wager.id` is the match identity. No new match or database table
is created. `DiscordEventDispatch` stores two types of internal records:

- `free8s-voice:<match-id>`: `match_id`, `channels.host` (Team A ID),
  `channels.challenger` (Team B ID), guild/category/waiting-room IDs,
  `discord_channels_created_at`, `discord_channels_cleaned_at`, readiness,
  and pending creation operations.
- `free8s-channel:<channel-id>`: immutable match/side/guild/category ownership,
  the unique creation operation, recorded match members and deletion timestamp.

PostgreSQL advisory locks serialize work for each match across bot processes;
up to three matches reconcile at once. IDs and pending operations commit before
moving players, independently of the lock transaction so a timeout cannot erase
Discord resource ownership. The bot database pool needs at least four connections
(three lock transactions plus durable state writes); keep the existing default
pool or increase an explicitly lower `connection_limit`.
An atomic worker-token check prevents a worker whose lock expired from overwriting
state claimed by a newer worker after a slow Discord request returns.

Before creating either side, the bot persists a unique operation. If Discord's
response is lost, it recovers the exact ID from the stored ownership record or a
bot-authored audit entry with that unique operation reason. It never adopts,
searches for ownership, or deletes channels by name. An ambiguous operation with
no confirmed audit entry stays pending for investigation rather than issuing a
duplicate creation. Discord retains audit entries for 45 days; keep View Audit Log
available and investigate pending-creation logs promptly.

Both stored IDs are checked against ownership before any match action. Cleanup
uses only that match's stored IDs, returns only its recorded members, and waits
if an unrelated occupant is present. Unknown/deleted channels are treated as
already removed. Each deletion is saved immediately, and cleanup completion is
timestamped only after both channels/pending operations are gone. Repeated events
and restarts cannot make one match delete another match's resources. A partial pair
from a category capacity race is cleaned before trying another configured category.

Bot state is blocked from generic entity writes and non-admin generic reads.
All Discord actions and secrets stay server-side. Existing webhook behavior is unchanged.

## Logs

Backend/bot stdout uses `[Topfragg Free 8s Discord]` with structured event data for
link checks, queue joins, eight players found, generated teams, presence changes,
channel preparation/creation, move attempts/success/failure and cleanup/deletion.
Errors retain Discord error codes without logging tokens, OAuth codes or secrets.

## Manual checklist

- With an unlinked account, verify Free 8s creation and join actions require Connect
  Discord in both Matchfinders; direct API join/create attempts must also fail.
- Complete OAuth and verify return to the originating Free 8s view. Try cancelling
  consent and linking a Discord account already owned by another Topfragg account.
- Use eight linked test players. Put six in the waiting room, leave one offline and
  put one in an unrelated voice. Check that two private channels appear and the six
  ready players move according to the website's generated teams. Check outsiders
  cannot view/connect and missing players have clear status. The match still starts.
- Have the offline player join the waiting room late; verify their correct move.
  Trigger an existing team reshuffle and verify voice placement and access change.
- Temporarily remove Move Members permission; verify a visible failure and bot log,
  then restore it and verify retry. Test missing Manage Channels/Manage Roles too.
- Complete/cancel the match with browser tabs closed. Verify return to waiting and
  deletion. Repeat cleanup/restart the bot and verify no duplicate channels/errors.
  Test a player leaving before roster lock and an `expired` status on a test record.
- Run at least 20 concurrent matches. Verify 40 distinct voices with the correct
  full match IDs, teams, permissions and stored ownership. Finish one match and
  confirm only its pair disappears and only its players return to the waiting room.
- Repeatedly trigger sync/restart while teams are generated. Rename a managed
  channel and create a lookalike manually; cleanup must use its recorded ID and
  leave the lookalike alone. Simulate an interrupted creation and verify audit
  recovery without another pair. Test missing View Audit Log permission too.
- With overflow configured, test more than 25 matches (or prefill ACTIVE 8s).
  Check each pair stays together in one category. Fill all categories and verify
  a visible capacity message, no player moves and normal matchmaking continuation.
- Make a cleanup move fail: occupied voice must remain for retry. Restore permission
  and verify deletion. Disconnect a player manually; cleanup must not reconnect them.
- Stop the bot: website readiness must become unavailable within twenty seconds.
  Disable the voice switch with the bot running: managed channels should clean up.
- Confirm Money 8s, XP/ELO, wagers and tournaments retain their prior linking and
  matchmaking behavior.

## Automated verification

```text
node --test server/free-eights-discord.test.js discord/free-eights-voice.test.js server/wager-acceptance.test.js
npm run build
```

The tests mock Discord/database calls; they make no live Discord changes. A real
guild test with eight linked accounts is still required to validate permissions
and actual Gateway/API behavior.

## Files changed for this implementation

| File | Purpose |
| --- | --- |
| `.env.example` | Free 8s voice test settings and optional overflow categories |
| `discord/bot.js` | Existing bot voice intent, polling and voice events |
| `discord/free-eights-voice.js` | Match-scoped provisioning, ownership, moves and cleanup |
| `discord/free-eights-voice.test.js` | Concurrent matches, retry, recovery and isolation tests |
| `discord/FREE_8S_VOICE_TEST.md` | Setup, behavior and manual checks |
| `server/free-eights-discord.js` | Free 8s link gate, configuration and public voice status |
| `server/free-eights-discord.test.js` | Authentication, OAuth, link gate and authorization tests |
| `server/routes/discord.js` | Existing OAuth return/cookie protection and readiness endpoints |
| `server/routes/entities.js` | Protect internal Discord state from client mutation/access |
| `server/routes/functions.js` | Free 8s create/join link checks and matchmaking logs |
| `src/api/base44Client.js` | Existing Discord API client methods |
| `src/components/competition/FreeEightsDiscord.jsx` | Connect, waiting-room and readiness UI |
| `src/components/match/CreateLobbyModal.jsx` | Free 8s creation link requirement |
| `src/components/settings/DiscordSection.jsx` | Cookie-bound existing OAuth initiation |
| `src/pages/EightsMatchRoom.jsx` | Free 8s participant voice readiness |
| `src/pages/Matchfinder.jsx` | Free 8s connect action and waiting-room guidance |
| `src/pages/RankedEights.jsx` | Dedicated Free 8s lobby connect action and guidance |

Discord references:
[Member moves](https://github.com/discord/discord-api-docs/blob/main/developers/resources/guild.mdx),
[permissions](https://github.com/discord/discord-api-docs/blob/main/developers/topics/permissions.mdx),
[OAuth security](https://discord.com/developers/docs/topics/oauth2),
[audit logs and recovery](https://docs.discord.com/developers/resources/audit-log),
[category channel limits](https://docs.discord.com/developers/resources/channel).
