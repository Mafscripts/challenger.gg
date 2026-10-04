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

const announcementTitle = "TOPFRAGG — Latest Alpha Update";
const imageName = "email-verification-update.png";

const findAnnouncementsChannel = (guild) => guild.channels.cache.find((channel) => (
  channel.isTextBased()
  && (channel.name === "📢・announcements" || channel.name === "announcements")
));

const announcementEmbed = () => new EmbedBuilder()
  .setColor(TOPFRAGG_COLORS.cyan)
  .setTitle(announcementTitle)
  .setDescription([
    "We’ve rolled out another major round of **fixes, stability improvements, and security updates** across Topfragg.",
    "",
    "This update focuses heavily on **8’s, match reporting, admin tools, and account security**.",
  ].join("\n"))
  .addFields(
    {
      name: "🎮 8’s Lobby — Major Fixes",
      value: [
        "• Fixed players no longer seeing their match after joining an 8’s lobby.",
        "• Fixed score reporting and joining the next match.",
        "• Teams regenerate automatically when a full lobby has an invalid setup.",
        "• Reshuffle now uses the actual number of players in the lobby.",
        "• The 5th score vote immediately completes the match.",
        "• Every player can now find and return to the lobby under **My Matches**.",
        "• Admins can manually award the win to **Alpha** or **Bravo** when necessary.",
      ].join("\n"),
    },
    {
      name: "🏆 Matches, Scores & Admin Systems",
      value: [
        "Reporting and match resolution were improved across **Wagers, 8’s, Ranked, XP, and Tournaments**.",
        "Score reports, admin tickets, approvals, disputes, and duplicate reward protection have all been updated.",
        "Cancelled matches can no longer be completed accidentally, and XP admin actions now use the correct match system.",
        "The XP Match Room hides the score-report button after submission.",
      ].join("\n"),
    },
    {
      name: "🔗 Integrations",
      value: "Profile, social, Discord, and Twitch connections were checked and updated. The Discord webhook test now performs a real test and displays useful errors.",
    },
    {
      name: "🔐 Email Verification & Security",
      value: "Email verification is now mandatory and fully operational. New accounts must verify their email before receiving full access. Cloudflare protection and additional authentication safeguards further protect Topfragg.",
    },
  )
  .setImage("attachment://" + imageName)
  .setFooter({ text: "TOPFRAGG.GG — Compete. Win. Climb." })
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
      embeds: [announcementEmbed()],
      files: [attachment],
      allowedMentions: { parse: [] },
    });

    console.log("[Topfragg Discord] Alpha update announcement posted.");
  } catch (error) {
    console.error("[Topfragg Discord] Announcement failed:", error);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(config.token).catch((error) => {
  console.error("[Topfragg Discord] Login failed:", error);
  process.exitCode = 1;
});
