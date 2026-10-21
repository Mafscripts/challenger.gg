export const hasFreeEightsDiscordLink = (user) => /^\d{17,20}$/.test(String(user?.discord_user_id || "")) && Boolean(user?.discord_connected_at);
export const isFreeEightsDiscordRequired = (result) => result?.code === "FREE_EIGHTS_DISCORD_REQUIRED"
  || result?.data?.code === "FREE_EIGHTS_DISCORD_REQUIRED"
  || (result?.error || result?.message) === "Connect Discord to join Free 8s";
