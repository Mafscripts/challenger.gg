# Topfragg Discord Bot

This folder contains the private Topfragg Discord bot and an idempotent server setup command. The setup only creates or updates Topfragg-managed resources; it does not delete unrelated roles or channels.

## 1. Configure the secret locally

Open the repository's `.env` file and add:

```env
DISCORD_TOKEN="paste-the-private-bot-token-here"
DISCORD_CLIENT_ID="1555247113070317600"
DISCORD_GUILD_ID="1555246540027596972"
TOPFRAGG_PUBLIC_URL="https://topfragg.gg"
```

Never paste `DISCORD_TOKEN` into chat, screenshots, source files or Git. The `.env` file is ignored by Git.

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

Website-driven role synchronization and tournament announcements can be added after the initial server structure is approved.
