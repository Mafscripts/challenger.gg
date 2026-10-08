import { topfraggDiscordInviteUrl } from "../src/lib/discordCommunity.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const VERIFIED_ROLE_NAME = "Verified Player";

const discordConfig = () => ({
  token: String(process.env.DISCORD_TOKEN || "").trim(),
  guildId: String(process.env.DISCORD_GUILD_ID || "").trim(),
});

const configurationError = () => {
  const error = new Error("Discord integration is not configured");
  error.status = 503;
  error.code = "DISCORD_NOT_CONFIGURED";
  return error;
};

async function discordBotRequest(path, options = {}) {
  const { token } = discordConfig();
  if (!token) throw configurationError();
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bot ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (response.ok) {
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  const body = await response.text();
  const error = new Error(`Discord API request failed (${response.status})`);
  error.status = response.status === 404 ? 404 : 502;
  error.code = "DISCORD_API_ERROR";
  error.discordStatus = response.status;
  error.discordBody = body;
  throw error;
}

async function verifiedRole() {
  const { guildId } = discordConfig();
  if (!guildId) throw configurationError();
  const roles = await discordBotRequest(`/guilds/${encodeURIComponent(guildId)}/roles`);
  const role = roles.find((item) => item.name === VERIFIED_ROLE_NAME);
  if (!role) {
    const error = new Error(`Discord role "${VERIFIED_ROLE_NAME}" was not found`);
    error.status = 503;
    error.code = "DISCORD_ROLE_NOT_FOUND";
    throw error;
  }
  return role;
}

export const discordAvatarUrl = (discordUser) => {
  if (!discordUser?.id || !discordUser.avatar) return null;
  const extension = String(discordUser.avatar).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${extension}?size=256`;
};

export const discordInviteUrl = () => topfraggDiscordInviteUrl;

// This fresh lookup uses the existing bot and the authenticated account's OAuth ID.
// A previous successful link or role assignment cannot prove current membership.
export const discordGuildMembership = async (discordUserId) => {
  const { guildId } = discordConfig();
  if (!/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(String(discordUserId || ""))) throw configurationError();
  try {
    await discordBotRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}`, { signal: AbortSignal.timeout(8000) });
    return { inGuild: true };
  } catch (error) {
    let discordCode;
    try { discordCode = JSON.parse(error.discordBody || "{}").code; } catch { /* Non-JSON upstream errors stay unavailable. */ }
    if (error.discordStatus === 404 && discordCode === 10007) return { inGuild: false };
    throw error;
  }
};

export const syncDiscordVerifiedRole = async (discordUserId) => {
  const { guildId } = discordConfig();
  if (!guildId) throw configurationError();
  const encodedGuildId = encodeURIComponent(guildId);
  const encodedUserId = encodeURIComponent(discordUserId);

  if (!(await discordGuildMembership(discordUserId)).inGuild) return { connected: true, inGuild: false, roleAssigned: false };

  const role = await verifiedRole();
  await discordBotRequest(
    `/guilds/${encodedGuildId}/members/${encodedUserId}/roles/${encodeURIComponent(role.id)}`,
    { method: "PUT" },
  );
  return { connected: true, inGuild: true, roleAssigned: true, roleId: role.id };
};

export const removeDiscordVerifiedRole = async (discordUserId) => {
  const { guildId } = discordConfig();
  if (!guildId || !discordUserId) return { removed: false };
  const role = await verifiedRole();
  try {
    await discordBotRequest(
      `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}/roles/${encodeURIComponent(role.id)}`,
      { method: "DELETE" },
    );
    return { removed: true };
  } catch (error) {
    if (error.discordStatus === 404) return { removed: false };
    throw error;
  }
};
