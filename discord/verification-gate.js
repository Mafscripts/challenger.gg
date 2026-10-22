import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { categorySpecs } from "./config.js";

export const VERIFICATION_BUTTON_ID = "topfragg:verification:accept-rules";
export const VERIFICATION_MARKER = "Topfragg setup:v2:verification";

export function verificationCard({ rulesChannel, logoUrl } = {}) {
  const embed = new EmbedBuilder().setColor(0xff6c00)
    .setTitle("⚡ TOPFRAGG — YOUR ARENA STARTS HERE")
    .setDescription("**Read the rules. Verify. Join the action.**\n\nUnlock community chat, find your squad and jump into voice. No website account or admin approval needed.")
    .addFields(
      { name: "📜 1. Read the rules", value: `Read ${rulesChannel || "the rules channel"}. Admins have the final say on moderation.` },
      { name: "✅ 2. Accept & verify", value: "By clicking below, you confirm you have read and agree to follow the community rules. You receive **Verified Player** immediately." },
      { name: "🎮 3. Squad up", value: "Head to general and introduce yourself. Choose your EU/NA and game roles in looking-for-team." },
    ).setFooter({ text: VERIFICATION_MARKER });
  if (logoUrl) embed.setThumbnail(logoUrl);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFICATION_BUTTON_ID).setLabel("Accept Rules & Verify").setEmoji("✅").setStyle(ButtonStyle.Success),
  )], allowedMentions: { parse: [] } };
}

// Run only inside the updated main bot: its button handler must be online before
// changing access. Preserve all existing role/member overrides and staff areas.
export async function activateVerificationGate(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const role = guild.roles.cache.find((item) => item.name === "Verified Player" && !item.managed);
  if (!role?.editable) throw new Error("Verification needs an editable Verified Player role below the bot.");
  const specs = categorySpecs.flatMap((category) => category.channels);
  const find = (key) => {
    const spec = specs.find((item) => item.key === key);
    return guild.channels.cache.find((channel) => channel.name === spec.name || spec.legacyNames?.includes(channel.name));
  };
  const verification = find("verification"), rules = find("rules"), welcome = find("welcome"), general = find("general");
  if (!verification?.isTextBased() || !rules || !welcome) throw new Error("Welcome, rules and verification channels are required.");
  const me = await guild.members.fetchMe();
  const targets = specs.filter((spec) => spec.mode.startsWith("verified-")).map((spec) => find(spec.key)).filter(Boolean);
  // Only manage configured gated channels. Custom public channels (including
  // onboarding tasks such as new-members) must retain the admin's permissions.
  const legacyVoice = guild.channels.cache.find((channel) => channel.name === "General" && channel.type === ChannelType.GuildVoice);
  if (legacyVoice && !targets.some((channel) => channel.id === legacyVoice.id)) targets.push(legacyVoice);
  const counter = guild.channels.cache.find((channel) => /^👥・members[-:]/u.test(channel.name));
  if (counter && !targets.some((channel) => channel.id === counter.id)) targets.push(counter);
  for (const channel of [...targets, welcome, rules, verification, ...(general ? [general] : [])]) {
    if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) throw new Error(`Cannot configure verification access in ${channel.name}`);
  }
  if (!verification.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory])) throw new Error("The bot cannot publish the verification card.");
  // Ensure the entry path is visible before hiding any community channel.
  for (const channel of [welcome, rules, verification]) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false }, { reason: "Topfragg verification entry" });
  }
  if (general) {
    await general.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: true, ReadMessageHistory: true, SendMessages: true,
    }, { reason: "Keep general available for Discord Community Onboarding" });
  }
  const card = verificationCard({ rulesChannel: `${rules}`, logoUrl: guild.iconURL({ extension: "png", size: 256 }) });
  const messages = await verification.messages.fetch({ limit: 50 });
  const existing = messages.find((message) => message.author.id === guild.client.user.id && message.embeds.some((embed) => embed.footer?.text === VERIFICATION_MARKER || /Automatic verification|Verify your Topfragg identity/.test(embed.title || "")));
  if (existing) await existing.edit(card); else await verification.send(card);
  const welcomeMessages = await welcome.messages.fetch({ limit: 50 });
  const welcomeCard = welcomeMessages.find((message) => message.author.id === guild.client.user.id && message.embeds.some((embed) => /Welcome to Topfragg/.test(embed.title || "")));
  if (welcomeCard) {
    const embed = EmbedBuilder.from(welcomeCard.embeds[0]);
    embed.setFields(
      { name: "📜 1. Read the rules", value: `${rules}`, inline: true },
      { name: "✅ 2. Accept & verify", value: `Click **Accept Rules & Verify** in ${verification}.`, inline: true },
      { name: "🎮 3. Enter the arena", value: "Community chat and voice unlock immediately. Find your squad and choose your player roles.", inline: true },
    );
    const logo = guild.iconURL({ extension: "png", size: 256 });
    if (logo) embed.setThumbnail(logo);
    await welcomeCard.edit({ embeds: [embed], allowedMentions: { parse: [] } });
  }
  for (const channel of targets) {
    await channel.permissionOverwrites.edit(role, { ViewChannel: true, ReadMessageHistory: true }, { reason: "Verified Topfragg community access" });
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, { reason: "Accept community rules before accessing Topfragg" });
  }
  await verification.setTopic("Read the rules and click Accept Rules & Verify to unlock the community.");
  console.log(`[Topfragg Verification] Rules gate active on ${targets.length} channels; existing member roles preserved.`);
}
