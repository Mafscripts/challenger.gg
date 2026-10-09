import jwt from "jsonwebtoken";

export const issueEightsDiscordToken = (guildId) => jwt.sign(
  { scope: "eights-discord", guild_id: String(guildId) }, process.env.JWT_SECRET || "dev-secret-change-me",
  { expiresIn: "5m", audience: "eights-live", issuer: "topfragg" },
);

export function isEightsDiscordToken(payload) {
  return payload.scope === "eights-discord" && /^\d{17,20}$/.test(payload.guild_id)
    && payload.guild_id === process.env.DISCORD_GUILD_ID?.trim();
}
