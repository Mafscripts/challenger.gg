export const topfraggDiscordInviteUrl = "https://discord.gg/JwSgTHcHXe";

export const isFreeEightsDiscordServerRequired = (result) => [
  "FREE_EIGHTS_DISCORD_SERVER_REQUIRED", "FREE_EIGHTS_DISCORD_MEMBERSHIP_UNAVAILABLE",
].includes(result?.code || result?.data?.code);
