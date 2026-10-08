import { Routes } from "discord.js";
import { commandApiPayload, communityCommandSpecs } from "./community-command-specs.js";

// Upsert by name so existing ticket, tournament and giveaway commands survive.
export async function registerCommunityCommands({ rest, applicationId, guildId }) {
  const registered = [];
  for (const spec of communityCommandSpecs) {
    await rest.post(Routes.applicationGuildCommands(applicationId, guildId), { body: commandApiPayload(spec) });
    registered.push(spec.name);
  }
  return registered;
}
