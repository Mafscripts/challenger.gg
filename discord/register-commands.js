import "dotenv/config";
import { REST, Routes } from "discord.js";
import { discordEnvironment } from "./config.js";
import { registerCommunityCommands } from "./register-community-commands.js";

try {
  const config = discordEnvironment();
  const rest = new REST({ version: "10" }).setToken(config.token);
  const bot = await rest.get(Routes.user("@me"));
  if (bot.id !== config.clientId) throw new Error("DISCORD_CLIENT_ID does not match the configured bot token.");
  const names = await registerCommunityCommands({ rest, applicationId: config.clientId, guildId: config.guildId });
  process.stdout.write(`Registered Topfragg commands: ${names.map((name) => `/${name}`).join(", ")}\n`);
} catch (error) {
  process.stderr.write(`Discord command registration failed: ${error.message}\n`);
  process.exitCode = 1;
}
