import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REST, Routes, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { discordEnvironment, TOPFRAGG_COLORS } from "./config.js";
import { withAnimatedBrand } from "./brand-banner.js";

const marker = "Topfragg • Free 8s guide v1";
const videoName = "how-to-join-free-8s-desktop-1440p.mp4";
const website = "https://www.topfragg.gg";
export function freeEightsGuidePayload() {
  return withAnimatedBrand({
    embeds: [new EmbedBuilder().setColor(TOPFRAGG_COLORS.cyan).setTitle("🎮 HOW TO PLAY FREE 8s")
      .setDescription([
        "**New to Topfragg? Start with the attached video.**",
        "It shows you exactly what to do on our website, from setting up your account to joining your first Free 8s match.",
        "",
        "**1. Connect Discord** in Account Settings and join the Topfragg server.",
        "**2. Add your full Activision ID**, including the #numbers where applicable.",
        "**3. Set your game rank** in Account Settings.",
        "**4. Open Free 8s → Matchfinder**, choose your game and accept an available match.",
        "**5. Open the matchroom and click Join 8s Waiting Room.** Join that match's room with your linked Discord account and stay connected.",
        "",
        "🎙️ **Teams and voice are automatic:** once the lobby is full and everyone is in its Waiting Room, teams are assigned and the bot moves players into their team voice channels.",
        "",
        "📌 Watch the video before your first match, then follow the maps, rules and instructions shown in your matchroom.",
      ].join("\n")).setFooter({ text: marker })],
    files: [{ attachment: fileURLToPath(new URL(`../public/tutorials/free-8s/${videoName}`, import.meta.url)), name: videoName }],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Watch on our website").setStyle(ButtonStyle.Link).setURL(`${website}/tutorials/free-8s/`),
      new ButtonBuilder().setLabel("Topfragg.gg").setStyle(ButtonStyle.Link).setURL(website),
    )],
    allowedMentions: { parse: [] },
  });
}

async function publish() {
  const config = discordEnvironment();
  const rest = new REST({ version: "10", timeout: 30_000, retries: 0 }).setToken(config.token);
  const payload = freeEightsGuidePayload();
  // Prepare both media files before creating anything in the server.
  const files = await Promise.all(payload.files.map(async file => ({ name: file.name, data: await readFile(file.attachment) })));
  const [bot, channels, roles] = await Promise.all([
    rest.get(Routes.user("@me")), rest.get(Routes.guildChannels(config.guildId)), rest.get(Routes.guildRoles(config.guildId)),
  ]);
  const category = channels.find(channel => channel.type === ChannelType.GuildCategory && /^(?:🏆\s*)?competition$/i.test(channel.name));
  if (!category) throw new Error("COMPETITION category was not found.");
  let channel = channels.find(channel => channel.type === ChannelType.GuildText && channel.name === "how-to-play-8");
  if (channel && channel.parent_id !== category.id) throw new Error("An existing how-to-play-8 channel is outside COMPETITION; review it before moving anything.");
  if (!channel) {
    const overwrites = structuredClone(category.permission_overwrites || []);
    const updateOverwrite = (id, type, allow, deny = 0n) => {
      const previous = overwrites.find(row => row.id === id);
      const value = { id, type, allow: ((BigInt(previous?.allow || 0) | allow) & ~deny).toString(), deny: ((BigInt(previous?.deny || 0) | deny) & ~allow).toString() };
      if (previous) Object.assign(previous, value); else overwrites.push(value);
    };
    const readable = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
    updateOverwrite(config.guildId, 0, readable, PermissionFlagsBits.SendMessages);
    const publishing = readable | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks | PermissionFlagsBits.AttachFiles;
    updateOverwrite(bot.id, 1, publishing);
    for (const role of roles.filter(role => /^(CEO|Admin|Super Admin|Moderator)$/i.test(role.name))) updateOverwrite(role.id, 0, publishing);
    channel = await rest.post(Routes.guildChannels(config.guildId), { body: {
      name: "how-to-play-8", type: ChannelType.GuildText, parent_id: category.id,
      topic: "Watch the official Topfragg Free 8s tutorial: account setup, joining a match, Waiting Room and automatic team voice.",
      permission_overwrites: overwrites,
    }, reason: "Requested official Free 8s how-to-play channel" });
  }
  const messages = await rest.get(Routes.channelMessages(channel.id), { query: new URLSearchParams({ limit: "30" }) });
  const previous = messages.find(message => message.author.id === bot.id && message.embeds.some(embed => embed.footer?.text === marker));
  if (previous) return console.log(`Guide already posted: https://discord.com/channels/${config.guildId}/${channel.id}/${previous.id}`);
  const message = await rest.post(Routes.channelMessages(channel.id), { body: {
    embeds: payload.embeds.map(embed => embed.toJSON()), components: payload.components.map(row => row.toJSON()),
    allowed_mentions: { parse: [] }, attachments: files.map((file, id) => ({ id, filename: file.name })),
  }, files });
  console.log(`Posted as ${bot.username}: https://discord.com/channels/${config.guildId}/${channel.id}/${message.id}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--preview", "--send"].includes(arg)) || args.includes("--preview") && args.includes("--send")) {
    console.error("Choose --preview (default) or --send."); process.exitCode = 1;
  } else if (args.includes("--send")) await publish().catch(error => { console.error(error.message); process.exitCode = 1; });
  else {
    const payload = freeEightsGuidePayload();
    console.log(payload.embeds[0].toJSON().description);
    console.log(`Destination: COMPETITION / how-to-play-8. Attachments: ${payload.files.map(file => file.name).join(", ")}. Nothing sent.`);
  }
}
