import "dotenv/config";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
} from "discord.js";
import { discordEnvironment, TOPFRAGG_COLORS } from "./config.js";

const config = discordEnvironment();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const imageName = "mobile-optimization-update.png";

const findAnnouncementsChannel = (guild) => guild.channels.cache.find((channel) => (
  channel.isTextBased()
  && (channel.name === "📢・announcements" || channel.name === "announcements")
));

const buildEmbed = () => new EmbedBuilder()
  .setColor(TOPFRAGG_COLORS.cyan)
  .setTitle("📱 UPDATE FOR MOBILE USERS!")
  .setDescription([
    "We’ve just rolled out a new **mobile optimization update**!",
    "",
    "TopFragg should now feel faster, smoother, and much easier to use on mobile devices.",
  ].join("\n"))
  .addFields(
    { name: "⚡ Better touchscreen responsiveness", value: "Tap targets, dropdowns, and mobile controls are now easier to use." },
    { name: "🚀 Improved mobile performance", value: "Faster interactions with a smoother overall experience." },
    { name: "🎨 Updated mobile UI", value: "Cleaner navigation and a more polished mobile layout." },
    { name: "🧭 Smoother navigation", value: "Menus are easier to open, close, and use with touch." },
  )
  .setImage("attachment://" + imageName)
  .setFooter({ text: "More improvements are coming! — TopFragg Team" })
  .setTimestamp();

client.once(Events.ClientReady, async () => {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    const channel = findAnnouncementsChannel(guild);
    if (!channel) throw new Error("Announcements channel was not found.");

    const attachment = new AttachmentBuilder(
      fileURLToPath(new URL("../public/assets/" + imageName, import.meta.url)),
      { name: imageName },
    );

    await channel.send({
      embeds: [buildEmbed()],
      files: [attachment],
      allowedMentions: { parse: [] },
    });
    console.log("[Topfragg Discord] Mobile update announcement posted.");
  } catch (error) {
    console.error("[Topfragg Discord] Mobile announcement failed:", error);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(config.token).catch((error) => {
  console.error("[Topfragg Discord] Login failed:", error);
  process.exitCode = 1;
});
