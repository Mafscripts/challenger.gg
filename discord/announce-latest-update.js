import "dotenv/config";
import { Client, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";
import { discordEnvironment, TOPFRAGG_COLORS } from "./config.js";

// Preview is the default. Posting requires an explicit --send after approval.
const announcement = {
  title: "📢 TOPFRAGG — Latest Updates",
  description: "New ranks, smarter Free 8s teams, Discord voice testing and a smoother match experience. Here's what's new!",
  fields: [
    {
      name: "🏆 Your own Free 8s ladder",
      value: "Start at **0 ELO** and climb: **Newb → Advanced → Amateur → Challenger → Topfragger**. Wins earn ELO, losses cost ELO, and opponent strength affects the change. This ladder is exclusive to **Free 8s**.",
    },
    {
      name: "💎 Screenshot ranks on your profile",
      value: "Upload a rank screenshot from your profile to receive a **Diamond, Crimson, Iridescent or Top 250** pill when the emblem is recognized. After **5 unsuccessful checks**, your submission goes to **admin review**.",
    },
    {
      name: "👑 Your Topfragg rank takes priority",
      value: "In Free 8s player cards, your approved screenshot rank is shown below **600 ELO**. At **600 ELO**, **Challenger** takes over; at **800 ELO**, **Topfragger** takes over. No screenshot rank? Your Free 8s rank is shown. Your screenshot rank stays on your main profile, including **Top 250**.",
    },
    {
      name: "⚖️ Smarter Free 8s team balancing",
      value: "Team generation and reshuffles now use ranks and Free 8s ELO to spread players more evenly. For example, **4 Newbs, 2 Diamonds, 1 Crimson and 1 Iridescent** become **2 Newbs + 1 Diamond on each team**, with Crimson and Iridescent on opposite sides. **Money 8s keeps its existing team generation.**",
    },
    {
      name: "🎙️ Discord voice — Free 8s test",
      value: "**Connect Discord before joining Free 8s**, then join the **8s Waiting Room** yourself. When teams are ready, the bot moves players already connected there into their team's private voice channel. Each match has its own channels, with automatic cleanup when the match ends. This feature remains in testing.",
    },
    {
      name: "⚡ Loading & match chat improvements",
      value: "Fixed the Free 8s / Money 8s page-loading issue and improved Free 8s loading. Match chat updates more smoothly, and your messages appear immediately while being sent. Discord voice-status updates also cause less page movement.",
    },
    {
      name: "🛠️ Cancelled matches & My Matches",
      value: "Improved cancellation handling so cancelled rooms return you to the correct lobby and disappear from **My Matches** promptly. Stale updates can no longer restore a cancelled match.",
    },
  ],
  footer: "TOPFRAGG.GG — Compete. Win. Climb.",
};

const embed = new EmbedBuilder()
  .setColor(TOPFRAGG_COLORS.cyan)
  .setTitle(announcement.title)
  .setDescription(announcement.description)
  .addFields(announcement.fields)
  .setFooter({ text: announcement.footer });

const args = process.argv.slice(2);
if (args.some((arg) => !["--preview", "--send"].includes(arg)) || args.includes("--preview") && args.includes("--send")) {
  console.error("Choose --preview (default) or --send.");
  process.exitCode = 1;
} else if (!args.includes("--send")) {
  // No login, guild lookup, or message send occurs during a preview.
  embed.toJSON();
  console.log([
    `**${announcement.title}**`, announcement.description,
    ...announcement.fields.map((field) => `**${field.name}**\n${field.value}`),
    announcement.footer,
  ].join("\n\n"));
} else {
  const config = discordEnvironment();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, async () => {
    try {
      const guild = await client.guilds.fetch(config.guildId);
      const channels = await guild.channels.fetch();
      const channel = channels.find((row) => row?.isTextBased() && ["📢・announcements", "announcements"].includes(row.name));
      if (!channel) throw new Error("Announcements channel was not found.");
      await channel.send({ embeds: [embed.setTimestamp()], allowedMentions: { parse: [] } });
      console.log("[Topfragg Discord] Latest update announcement posted.");
    } catch (error) {
      console.error("[Topfragg Discord] Announcement failed:", error.message);
      process.exitCode = 1;
    } finally {
      client.destroy();
    }
  });
  client.login(config.token).catch((error) => {
    console.error("[Topfragg Discord] Login failed:", error.message);
    process.exitCode = 1;
    client.destroy();
  });
}
