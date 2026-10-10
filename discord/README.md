# Topfragg Discord Bot

This folder contains the private Topfragg Discord bot and an idempotent server setup command. The setup only creates or updates Topfragg-managed resources; it does not delete unrelated roles or channels.

## 1. Configure the secret locally

Open the repository's `.env` file and add:

```env
DISCORD_TOKEN="paste-the-private-bot-token-here"
DISCORD_CLIENT_ID="1555247113070317600"
DISCORD_GUILD_ID="1555246540027596972"
DISCORD_CLIENT_SECRET="paste-the-private-oauth-client-secret-here"
DISCORD_OAUTH_REDIRECT_URI="https://topfragg.gg/api/discord/callback"
DISCORD_OAUTH_STATE_SECRET="use-a-long-random-secret-here"
TOPFRAGG_PUBLIC_URL="https://topfragg.gg"
```

Never paste `DISCORD_TOKEN`, `DISCORD_CLIENT_SECRET` or `DISCORD_OAUTH_STATE_SECRET` into chat, screenshots, source files or Git. The `.env` file is ignored by Git.

In the Discord Developer Portal, add this exact redirect under **OAuth2 > Redirects**:

```text
https://topfragg.gg/api/discord/callback
```

The OAuth flow only requests the `identify` scope. Topfragg stores the Discord user ID and public profile details, but never stores a Discord OAuth access token.

## 2. Prepare Discord

- The setup creates and assigns **Topfragg Bot Access** with only the required channel, role and message permissions.
- **Administrator** is only needed temporarily while running the initial server setup. Disable it after **Topfragg Bot Access** has been assigned.

## 3. Create the server structure

```powershell
npm run discord:setup
```

This creates the roles, categories, text channels, voice channels, welcome/rules embeds and guild slash commands. It is safe to run again after changing `discord/config.js`.

## 4. Start the bot

```powershell
npm run discord:start
```

Keep this process running for slash commands and support tickets. In production it should run as a separate persistent process next to the API.

Available commands:

- `/help` — private command guide, including admin commands for server managers
- `/rules` — server and competition rules
- `/8s` — Free 8s lobby link and connection instructions
- `/streams` — live stream channel and tournament coverage
- `/autobots` — post “🤖🚗 Autobots, roll out! 😂🤣🔥” in the current channel
- `/retard username:@player` — random lighthearted gaming joke, visible in the current channel
- `/ping`
- `/verify`
- `/tournaments`
- `/support reason:<message>`
- `/setup-status` (server managers only)
- `/announce`, `/poll`, `/poll-end` (server managers only; see below)
- `/giveaway start` and `/giveaway end` (server managers only)

### Announcements and polls

```text
/announce channel:#general everyone:true
/poll channel:#general hours:24 multiple:false everyone:false
/poll-end message:<Discord message link or ID>
```

`/announce` opens a form for a title and message. `/poll` opens a form for a
question, 2–10 answers (one per line, up to 55 characters each) and an optional
introduction. Polls use Discord's native voting interface. Duration defaults to
24 hours and supports 1–768 hours. The current channel is used when `channel`
is omitted; polls require a regular text channel.

Forms produce a **private preview** with **Publish** and **Cancel** buttons.
Nothing is posted until the creator confirms. `/poll-end` also asks for private
confirmation and can only end polls published by this bot. Previews expire after
10 minutes or a bot restart. Admin permissions are checked again at publication,
and repeated confirm clicks cannot publish the same preview twice. If Discord
does not confirm a send, inspect the destination before starting another draft.

These commands require **Manage Server** (or Administrator). Mentions are
disabled by default, including mentions typed in a message. `everyone:true`
explicitly enables an `@everyone` notification; both the admin and bot need
**Mention Everyone** in that channel. The bot also needs **View Channel**, **Send
Messages**, and **Create Polls** for polls; **Read Message History** is needed to
fetch an existing poll for `/poll-end`. Its managed access role includes these
permissions for new setups; existing servers can enable them directly in Discord.

The existing bot automatically registers the community commands at startup,
upserting each by name so unrelated slash commands are preserved. After pushing
the changes, update production and restart the existing process:

```bash
cd /var/www/topfragg.gg &&
git pull origin codex/gray-ui-rework &&
pm2 restart topfragg-discord --update-env &&
pm2 status
```

If command registration needs to be retried after deployment, run
`npm run discord:commands`. It only registers commands and does not start another
bot or rebuild the server layout. No website build or database migration is
needed for these commands. Try `/help`, then create a poll and cancel its preview
before publishing your first announcement.

### Fun commands

```text
/autobots
/retard username:@player
```

`/autobots` replies publicly with **🤖🚗 Autobots, roll out! 😂🤣🔥** and needs
no arguments. Everyone can use it; each caller has a 30-second cooldown.

Pick a Discord user in the `username` field. The bot replies publicly with one
of 50 English gaming jokes about aim, movement, callouts or respawning. The
chosen player's mention is displayed without sending a notification. Everyone
can use this command, with a 30-second cooldown per caller. `/help` includes it.

## 5. Website verification

A signed-in player can open **Settings > Discord** and choose **Connect Discord**. Discord asks the player to approve the identity connection and then returns them to Topfragg.

After a successful connection:

- the immutable Discord user ID is linked to exactly one Topfragg account;
- the website shows the connected Discord account;
- the bot assigns the **Verified Player** role when the member is in the Topfragg server;
- `/verify` restores the community role without requiring a website account;
- disconnecting removes the website link and leaves the community role in place.

Modern Discord usernames normally do not include a `#1234` discriminator. Players do not type a username manually; OAuth identifies the correct account.

Before restarting production after deploying this feature, apply the Prisma migration and regenerate the client:

```powershell
npm run prisma:deploy
npm run prisma:generate
```

## 6. Tournament Discord automation

While the `topfragg-discord` process is online, it checks the Topfragg database once per minute and automatically:

- posts each current tournament once in **🏆・tournaments**, with its prize pool, format, start time and a join button;
- sends direct-message reminders to Discord-linked registered players at roughly 24 hours and one hour before their tournament starts;
- posts confirmed tournament match results once in **📊・match-results**.

The `DiscordEventDispatch` database table prevents duplicate announcements when the bot restarts. Apply the Prisma migration and restart **topfragg-discord** after deployment for the automation to start.

### Free 8s match results

The same bot also checks completed **Free 8s** matches once per minute and posts
their confirmed result in the existing **📊・match-results** channel. Each English
embed shows the winning team (Alpha or Bravo), final score, both four-player
rosters, completion time, unique match ID and a **View match** button. It reads
the existing `Wager` / `WagerParticipant` records; Money 8s, cancelled matches,
unconfirmed score reports and other queues do not produce these posts.

The first run catches up on completed matches from the **last seven days**.
Offline periods are caught up within that same window. Pagination includes all
eligible matches rather than just the newest 100. Individual failures are logged
and retried on the next check without stopping voice or tournament automation.

Results reuse `DiscordEventDispatch` with a separate, guild-and-match-specific
key. PostgreSQL advisory locks prevent competing workers from posting the same
result. A durable pending record, Discord nonce and recovery of the exact bot
message from channel history handle interrupted sends or receipt writes. Sent
results remain logged across restarts; later metadata changes do not repost them.
Pending recovery uses the originally stored channel ID and bot ID. If that
channel is unavailable, the bot logs a failure rather than rerouting a possibly
already posted result. Existing published results are not edited automatically.

No additional migration, token, environment variable or Discord channel is
required. The existing bot needs **View Channel**, **Send Messages**, **Embed
Links** and **Read Message History** in `match-results`. Deploy the code and
restart the existing `topfragg-discord` process; no website build is required for
this bot-only change.

Manual check: complete a Free 8s match with matching confirmed scores; within
about a minute, check the winner, score, eight names and match link. Repeat with
Bravo winning, then restart the bot and verify there is no duplicate. Cancel a
different lobby and verify it produces no result post. Logs use the prefix
`[Topfragg Free 8s Results]` and include the match ID on send attempts, successful
posts, recovery and failures.

## 7. Team finder and player roles

The **🔎・looking-for-team** card gives verified players two self-service options:

- toggle the **EU**, **NA**, **2v2** and **S&D** notification roles;
- submit a structured Looking For Team post with mode, region, platform/rank and availability.

Run `npm run discord:setup` after deployment to create the roles and publish the card.

## 8. Live matches, invite DMs and anti-spam

- **🔴・live-now** receives one automatic card when a tournament match becomes `in_progress` or `live` on Topfragg.
- A Discord-linked player receives a private Discord notification when they get a pending Topfragg team invite, with a direct link to the Teams page.
- Public player channels have a basic anti-spam layer: five messages per eight seconds, duplicate-message removal and common Discord gift/token-scam filtering. Staff are excluded from the automatic chat filter.

For anti-spam, enable **Message Content Intent** in Discord Developer Portal → **Bot** → **Privileged Gateway Intents**, then restart **topfragg-discord**. Without that switch, Discord does not provide public message text to the bot.

## 9. Role system

Discord roles now have a clear purpose:

- **CEO, Admin, Tournament Admin, Moderator, Support, Caster, Streamer**: staff-managed roles. Assign these manually in Discord.
- **Verified Player**: assigned automatically to every human member on joining, without a website account, button or rules acceptance. `/verify` can restore it. Public community and competition channels are visible to everyone; this community role also permits actions such as giveaway entries. Account-linked competition features still use the separate website connection.
- **Premium**: assigned while the linked Topfragg account has active Premium access.
- **Team Captain**: assigned while the linked player is captain of an active Topfragg team.
- **Tournament Participant**: assigned while the linked player is registered in an active tournament.
- **EU, NA, 2v2, S&D**: optional self-service roles from the team-finder card.

The visible member list is grouped by these roles. Automatic roles synchronize while **topfragg-discord** is running; staff roles remain under your direct control.

The bot grants **Verified Player** immediately on `GuildMemberAdd`. At startup
and once per minute it also checks all server members, including joins missed
while offline, and retries failed assignments. Bot accounts are excluded. Enable
**Server Members Intent** in the Developer Portal and give the existing bot
**Manage Roles**, with its highest role above **Verified Player**. The role must
already exist; automatic verification does not create or change server roles.
Disconnecting a website account does not revoke this community role.

Deploy the bot and API changes and restart the existing `topfragg-discord` and
API processes. Existing human members receive the role on the first sync. The
updated welcome and verification cards are included in `discord:setup`; that
command also reapplies the wider managed server layout. No migration is needed.

## 10. Ticket shortcuts, first tournament DM and giveaways

- **🎫・create-ticket** has separate buttons for account help, tournament/match issues and payment/prize questions. Each opens a private ticket with the right subject automatically.
- A linked Discord player receives a one-time private welcome when they register for their first Topfragg tournament.
- **🎁・giveaways** supports verified-player-only entries. Staff can run:

```text
/giveaway start title:<name> prize:<reward> minutes:<5-10080> winners:<1-10>
/giveaway end id:<giveaway-id>
```

The bot ends expired giveaways automatically, prevents duplicate entries and announces the randomly selected winners in the giveaway channel.

## 11. Twitch live alerts

Players can open **Settings → Twitch live alerts** and select **Connect Twitch**. The connection stores the Twitch channel identity, not a Twitch password or a reusable player token.

To enable it on production, create a Twitch application in the Twitch Developer Console and add this OAuth redirect URL:

```text
https://topfragg.gg/api/twitch/callback
```

Then add these values to the server `.env` file:

```env
TWITCH_CLIENT_ID="your-twitch-application-client-id"
TWITCH_CLIENT_SECRET="your-twitch-application-client-secret"
TWITCH_OAUTH_REDIRECT_URI="https://topfragg.gg/api/twitch/callback"
TWITCH_OAUTH_STATE_SECRET="a-separate-long-random-secret"
```

When a connected player with both a linked Discord account and the manual **Streamer** Discord role goes live, the bot posts one stream card in **🔴・live-now** with a Twitch button. The Streamer role prevents every linked account from auto-posting.

## 12. Mention chat, Groq AI and website guide

Tag **@Topfragg Bot** in **general** or **off-topic** for website help, greetings
or sharp gaming roasts. Without a Groq key it uses authored English/Dutch replies
and keyword matching. With a Groq key it generates conversational replies and
fresh gaming roasts, using the reviewed website guide as context. Missing keys,
timeouts, API errors and limits fall back to the preset replies. No extra package,
website build or database migration is needed.
Old `DISCORD_AI_ENABLED`, `DISCORD_AI_MODEL` and `OPENAI_API_KEY` values are unused.

Create a key at [Groq API Keys](https://console.groq.com/keys). Keep the Groq account
on its **Free plan**; upgrading enables paid usage. The bot cannot determine your
billing plan, buy credits or change Groq billing. Free access has model/token and
request limits; see [Groq's current limits](https://console.groq.com/docs/rate-limits).
Put the key in the server's private `.env` file, never in chat or Git:

```env
DISCORD_CHAT_ENABLED="true"
GROQ_API_KEY="your-private-groq-key"
DISCORD_GROQ_ENABLED="true"
DISCORD_GROQ_MODEL="openai/gpt-oss-20b"
```

`DISCORD_GROQ_ENABLED=false` keeps the preset chat without contacting Groq.
`DISCORD_CHAT_ENABLED=false` disables all mention replies. The default model is
listed in Groq's Free plan; model availability and free limits may change.
Only the individual tagged message (up to 1500 characters, Discord mentions
removed) and the authored website guide are sent to Groq. No conversation
history, previous bot replies, Discord IDs or live account records are added.
The player can still include personal information in their own tagged message.
Groq processes that message under [its data policy](https://console.groq.com/docs/your-data).

The guide in `discord/website-knowledge.js` explains account registration,
password resets, email verification, Discord linking/unlinking and conflicts,
Twitch alerts, Gaming IDs, joining and creating Free 8s lobbies, voice rooms, game ranks, teams, tournament
registration, automatic Verified Player, settings, rules, support, wallet,
Premium, leaderboards and X. Each answer includes only its main destination link;
chat replies do not include Discord server invites. The guide distinguishes
the automatic Discord role from the account link required for Free 8s. The
instructions are reviewed against website source; update the guide whenever a
website flow changes. It does not learn changes automatically or read live
accounts, scores, balances or queue data. Groq is instructed to answer website
questions using the guide and admit missing information; generated text can
still be wrong. Preset replies use the reviewed steps directly. Prices and live
information link to the website, and disputes/payment problems go to staff.
AI output is limited to 1900 characters and one known main link. Discord invites
and unknown URLs are removed, and link previews are suppressed.

Examples:

```text
@Topfragg Bot how do I connect Discord?
@Topfragg Bot hoe koppel ik Twitch?
@Topfragg Bot how do I join Free 8s?
@Topfragg Bot how do i make an 8's lobby
@Topfragg Bot hoe maak ik een team?
@Topfragg Bot roast me
```

Only explicit text mentions trigger replies. Ordinary chat, DMs, other servers,
private tickets and bot/webhook messages are ignored. Existing anti-spam checks
run first. Replies cannot notify users, roles or everyone. A player gets at most
one reply per 15 seconds, with a server-wide limit of 20 per minute per process.
Duplicate events and failed sends are not retried. The last reply per player and
channel is remembered briefly for the preset jokes and is never sent to Groq;
raw user messages are not stored or logged by the bot. The remembered replies
expire after ten minutes or on restart and are capped at 200 player/channel
entries. Website help takes priority over jokes.

Groq requests have a 12-second timeout, at most two concurrent requests, six
requests per minute and 100 per UTC day per process. Excess messages use preset
replies. The local request counters reset on process restart; Groq's account
quotas do not. HTTP 429 honors Retry-After with at least a minute's pause; invalid
keys/models pause for five minutes. There are no automatic retries or alternate
providers. These local limits do not guarantee staying within token quotas;
Groq may return 429 sooner, which also triggers the preset fallback.

Commit and push, update the server and restart the existing bot:

```bash
cd /var/www/topfragg.gg &&
git pull --ff-only origin codex/gray-ui-rework &&
pm2 restart topfragg-discord --update-env &&
pm2 status
```

No website build is needed for the chat change. Keep **Message Content Intent**
enabled. With a key, look for `[Topfragg Chat] Groq AI enabled with website guide
and preset fallback` in the bot logs. Without it, the log reports preset mode.
After deployment, try the examples above with 15 seconds between
messages, and confirm that no response is sent in private tickets or ordinary
untagged chat.

Local validation (mocked Groq responses, no key or network needed):

```bash
node --test discord/groq-chat.test.js discord/mention-chat.test.js discord/community-commands.test.js
```

Free 8s questions accept `8s`, `8's`, `8’s`, `8 s` and `eights`. Questions about
creating/hosting a lobby get the creation flow, including **Create 8s lobby** and
**Open 8s Lobby**; play/join questions get the joining steps and waiting-room
requirement. Both include the Activision ID, rank and linked Discord prerequisites.
