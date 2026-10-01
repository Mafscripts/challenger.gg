const TWITCH_IDENTITY_API = "https://id.twitch.tv/oauth2/token";
const TWITCH_HELIX_API = "https://api.twitch.tv/helix";

let appToken = null;
let appTokenExpiresAt = 0;

const twitchConfig = () => ({
  clientId: String(process.env.TWITCH_CLIENT_ID || "").trim(),
  clientSecret: String(process.env.TWITCH_CLIENT_SECRET || "").trim(),
});

const configurationError = () => {
  const error = new Error("Twitch integration is not configured");
  error.status = 503;
  error.code = "TWITCH_NOT_CONFIGURED";
  return error;
};

const appAccessToken = async () => {
  const { clientId, clientSecret } = twitchConfig();
  if (!clientId || !clientSecret) throw configurationError();
  if (appToken && appTokenExpiresAt > Date.now() + 60_000) return appToken;
  const response = await fetch(TWITCH_IDENTITY_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const error = new Error("Twitch app authorization failed");
    error.status = 502;
    error.code = "TWITCH_APP_AUTH_FAILED";
    throw error;
  }
  appToken = body.access_token;
  appTokenExpiresAt = Date.now() + (Number(body.expires_in || 3600) * 1000);
  return appToken;
};

export const twitchAppConfig = () => twitchConfig();

export const getLiveTwitchStreams = async (twitchUserIds) => {
  const ids = [...new Set((twitchUserIds || []).filter(Boolean).map(String))].slice(0, 100);
  if (!ids.length) return [];
  const { clientId } = twitchConfig();
  const token = await appAccessToken();
  const url = new URL(`${TWITCH_HELIX_API}/streams`);
  ids.forEach((id) => url.searchParams.append("user_id", id));
  const response = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Twitch live status could not be loaded");
    error.status = 502;
    error.code = "TWITCH_STREAM_STATUS_FAILED";
    throw error;
  }
  return Array.isArray(body.data) ? body.data : [];
};
