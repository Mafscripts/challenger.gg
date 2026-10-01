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

- `/ping`
- `/verify`
- `/tournaments`
- `/support reason:<message>`
- `/setup-status` (server managers only)

## 5. Website verification

A signed-in player can open **Settings > Discord** and choose **Connect Discord**. Discord asks the player to approve the identity connection and then returns them to Topfragg.

After a successful connection:

- the immutable Discord user ID is linked to exactly one Topfragg account;
- the website shows the connected Discord account;
- the bot assigns the **Verified Player** role when the member is in the Topfragg server;
- `/verify` checks the same linked user ID and can synchronize the role again;
- disconnecting removes the link and attempts to remove the role.

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
- **Verified Player**: assigned after a player connects Discord through Topfragg. It also unlocks the verified-only community and competition channels.
- **Premium**: assigned while the linked Topfragg account has active Premium access.
- **Team Captain**: assigned while the linked player is captain of an active Topfragg team.
- **Tournament Participant**: assigned while the linked player is registered in an active tournament.
- **EU, NA, 2v2, S&D**: optional self-service roles from the team-finder card.

The visible member list is grouped by these roles. Automatic roles synchronize while **topfragg-discord** is running; staff roles remain under your direct control.

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
