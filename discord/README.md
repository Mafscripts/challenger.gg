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
