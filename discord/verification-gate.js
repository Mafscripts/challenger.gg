import { EmbedBuilder } from "discord.js";
import { categorySpecs } from "./config.js";

// Keep the old ID only so existing messages can explain the new entry flow.
export const VERIFICATION_BUTTON_ID = "topfragg:verification:accept-rules";
export const VERIFICATION_MARKER = "Topfragg setup:v3:onboarding";

export async function retireVerificationMessages(messages, botId, card) {
  const managed = [...messages.values()].filter((message) => message.author.id === botId
    && message.embeds.some((embed) => /Topfragg setup:v[123]:verification|Topfragg setup:v3:onboarding/.test(embed.footer?.text || "")
      || /YOUR ARENA STARTS HERE|Automatic verification|Verify your Topfragg identity/.test(embed.title || "")));
  const keep = managed.find((message) => message.embeds.some((embed) => embed.footer?.text === VERIFICATION_MARKER)) || managed[0];
  if (!keep) return;
  await keep.edit(card);
  for (const message of managed) {
    if (message.id !== keep.id) await message.delete();
  }
}

export function verificationCard({ rulesChannel, logoUrl } = {}) {
  const embed = new EmbedBuilder().setColor(0xff6c00)
    .setTitle("⚡ TOPFRAGG — WELCOME TO THE ARENA")
    .setDescription("**Discord Onboarding is our only entry flow.**\n\nFollow the Server Guide and complete any rules screening shown by Discord. No separate verification button or Verified Player role is required.")
    .addFields(
      { name: "📜 Community rules", value: `Read ${rulesChannel || "the rules channel"} and follow staff instructions.` },
      { name: "🏆 Ready for 8s?", value: "Sign up at https://topfragg.gg if you haven’t already, then connect your Discord account." },
      { name: "🎮 Find your squad", value: "Introduce yourself in general and choose your player roles in looking-for-team." },
    ).setFooter({ text: VERIFICATION_MARKER });
  if (logoUrl) embed.setThumbnail(logoUrl);
  return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
}

// Migrate only configured public channels. Staff, caster and private team access
// remains unchanged; Discord's native screening enforces acceptance, not a role.
export async function activateVerificationGate(guild) {
  await guild.channels.fetch();
  const specs = categorySpecs.flatMap((category) => category.channels);
  const find = (key) => {
    const spec = specs.find((item) => item.key === key);
    return guild.channels.cache.find((channel) => channel.name === spec.name || spec.legacyNames?.includes(channel.name));
  };
  const rules = find("rules"), welcome = find("welcome"), verification = find("verification");
  const me = await guild.members.fetchMe();
  for (const spec of specs) {
    if (!["chat", "read-only", "voice"].includes(spec.mode)) continue;
    const channel = find(spec.key);
    if (!channel) continue;
    const permissions = { ViewChannel: true, ReadMessageHistory: true };
    if (spec.mode === "voice") Object.assign(permissions, { Connect: true, Speak: true });
    else Object.assign(permissions, { SendMessages: spec.mode === "chat" });
    // Explicit bot access prevents an old everyone deny from locking it out.
    await channel.permissionOverwrites.edit(me, {
      ViewChannel: true, ReadMessageHistory: true, SendMessages: true,
    }, { reason: "Topfragg bot access during Onboarding migration" });
    await channel.permissionOverwrites.edit(guild.roles.everyone, permissions, { reason: "Discord Onboarding replaces separate bot verification" });
  }
  const logoUrl = guild.iconURL({ extension: "png", size: 256 });
  if (verification?.isTextBased()) {
    const messages = await verification.messages.fetch({ limit: 50 });
    const card = verificationCard({ rulesChannel: rules ? `${rules}` : undefined, logoUrl });
    await retireVerificationMessages(messages, guild.client.user.id, card);
    // Do not create another verification message if an admin removed it.
    await verification.setTopic("Discord Onboarding is the only entry flow. No separate bot verification is required.");
  }
  if (welcome?.isTextBased()) {
    const messages = await welcome.messages.fetch({ limit: 50 });
    const existing = messages.find((message) => message.author.id === guild.client.user.id && message.embeds.some((embed) => /Welcome to Topfragg/.test(embed.title || "")));
    if (existing) {
      const embed = EmbedBuilder.from(existing.embeds[0]);
      embed.setFields(
        { name: "📜 Read the rules", value: rules ? `${rules}` : "Follow the community rules.", inline: true },
        { name: "✅ Complete Onboarding", value: "Follow Discord’s Server Guide and any native rules screening. No extra bot verification.", inline: true },
        { name: "🏆 Play 8s", value: "Sign up at https://topfragg.gg and connect your Discord account.", inline: true },
      );
      await existing.edit({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  }
  console.log("[Topfragg Onboarding] Public community channels no longer require the Verified Player role.");
}
