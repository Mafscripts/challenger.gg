import crypto from "node:crypto";

export const streamAccountProviders = ["youtube", "kick"];
const definitions = {
  youtube: { label: "YouTube", authorization: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/youtube.readonly" },
  kick: { label: "Kick", authorization: "https://id.kick.com/oauth/authorize", token: "https://id.kick.com/oauth/token", scope: "channel:read" },
};
const fail = (message, code = "STREAM_ACCOUNT_ERROR", status = 400) => { throw Object.assign(new Error(message), { code, status }); };
export const streamAccountDefinition = provider => definitions[provider];

export function streamAccountConfig(provider, env = process.env) {
  const definition = definitions[provider];
  if (!definition) fail("Unknown streaming provider", "UNKNOWN_PROVIDER", 404);
  const prefix = provider.toUpperCase();
  let origin;
  try { origin = new URL(env.TOPFRAGG_PUBLIC_URL || env.APP_URL || "https://topfragg.gg").origin; } catch { fail("Set a valid public website URL", "STREAM_OAUTH_NOT_CONFIGURED", 503); }
  const clientId = String(env[`${prefix}_CLIENT_ID`] || "").trim();
  const clientSecret = String(env[`${prefix}_CLIENT_SECRET`] || "").trim();
  const stateSecret = String(env.STREAM_OAUTH_STATE_SECRET || env.JWT_SECRET || "").trim();
  const redirectUri = String(env[`${prefix}_OAUTH_REDIRECT_URI`] || `${origin}/api/stream-accounts/${provider}/callback`).trim();
  let redirect;
  try { redirect = new URL(redirectUri); } catch { fail("Invalid streaming callback URL", "STREAM_OAUTH_NOT_CONFIGURED", 503); }
  if (redirect.origin !== origin || !["http:", "https:"].includes(redirect.protocol) || redirect.username || redirect.password) fail("Streaming callback must use the website origin", "STREAM_OAUTH_NOT_CONFIGURED", 503);
  if (!clientId || !clientSecret || !stateSecret) fail(`${definition.label} account connection is not configured. Contact TopFragg support.`, "STREAM_OAUTH_NOT_CONFIGURED", 503);
  return { ...definition, provider, clientId, clientSecret, stateSecret, redirectUri, origin };
}

// The state and PKCE verifier live in an encrypted, browser-bound HttpOnly
// cookie. Only the random state and its SHA-256 challenge go to the provider.
export function createStreamAuthorization(config, userId, now = Date.now()) {
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(config.stateSecret).digest(), iv);
  cipher.setAAD(Buffer.from(config.provider));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ provider: config.provider, userId, state, verifier, expiresAt: now + 600000 }), "utf8"), cipher.final()]);
  const cookie = [iv, encrypted, cipher.getAuthTag()].map(value => value.toString("base64url")).join(".");
  const url = new URL(config.authorization);
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: config.scope, state,
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
    ...(config.provider === "youtube" ? { access_type: "online", prompt: "select_account consent" } : {}),
  }).toString();
  return { cookie, authorizationUrl: url.toString() };
}

export function readStreamAuthorization(config, cookie, state, now = Date.now()) {
  try {
    if (typeof cookie !== "string" || cookie.length > 4096 || typeof state !== "string" || state.length > 128) return null;
    const parts = cookie.split(".");
    if (parts.length !== 3) return null;
    const [iv, encrypted, tag] = parts.map(value => Buffer.from(value, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(config.stateSecret).digest(), iv);
    decipher.setAAD(Buffer.from(config.provider)); decipher.setAuthTag(tag);
    const value = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
    const received = Buffer.from(state), expected = Buffer.from(value.state);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected) || value.provider !== config.provider || !value.userId || !value.verifier || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null;
    return value;
  } catch { return null; }
}

const jsonRequest = async (fetcher, url, options) => {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail("The streaming provider could not complete the connection. Please try again.", "PROVIDER_UNAVAILABLE", 502);
  return body;
};
const safeImage = value => typeof value === "string" && value.startsWith("https://") ? value : "";

export async function exchangeStreamIdentity(config, code, verifier, fetcher = fetch) {
  if (typeof code !== "string" || !code || code.length > 4096) fail("Invalid authorization code");
  const token = await jsonRequest(fetcher, config.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code, code_verifier: verifier }),
  });
  if (!token.access_token || typeof token.access_token !== "string") fail("The streaming provider did not authorize this connection.", "PROVIDER_UNAVAILABLE", 502);
  const headers = { Authorization: `Bearer ${token.access_token}` };
  if (config.provider === "youtube") {
    const body = await jsonRequest(fetcher, "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50", { headers });
    const channel = body.items?.find(item => /^UC[A-Za-z\d_-]{22}$/.test(item.id || ""));
    if (!channel) fail("No YouTube channel found. Create a YouTube channel and reconnect.", "NO_CHANNEL");
    return { id: channel.id, display_name: String(channel.snippet?.title || "YouTube channel").slice(0, 200), url: `https://www.youtube.com/channel/${channel.id}`, avatar_url: safeImage(channel.snippet?.thumbnails?.default?.url) };
  }
  const body = await jsonRequest(fetcher, "https://api.kick.com/public/v1/channels", { headers });
  const channel = body.data?.[0];
  const id = String(channel?.broadcaster_user_id || "");
  if (!/^\d+$/.test(id) || !/^[A-Za-z\d_]{1,50}$/.test(channel?.slug || "")) fail("No Kick channel found. Check your Kick account and reconnect.", "NO_CHANNEL");
  return { id, display_name: channel.slug, url: `https://kick.com/${channel.slug}`, avatar_url: "" };
}

export async function saveStreamIdentity(db, userId, provider, identity, now = new Date()) {
  if (!definitions[provider]) fail("Unknown streaming provider");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stream-account:${provider}:${identity.id}`}))`;
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current || current.is_banned) fail("This TopFragg account cannot connect streaming accounts.", "ACCOUNT_UNAVAILABLE", 403);
    const existing = await tx.user.findFirst({ where: { id: { not: userId }, metadata: { path: ["stream_connections", provider, "id"], equals: identity.id } }, select: { id: true } });
    if (existing) fail("This streaming account is already connected to another TopFragg account.", "ALREADY_LINKED", 409);
    const connection = { ...identity, connected_at: now.toISOString() };
    await tx.user.update({ where: { id: userId }, data: { metadata: { ...current.metadata, [provider]: identity.url, stream_connections: { ...current.metadata?.stream_connections, [provider]: connection } } } });
    return connection;
  });
}

export async function disconnectStreamIdentity(db, userId, provider) {
  if (!definitions[provider]) fail("Unknown streaming provider");
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) fail("Account unavailable", "ACCOUNT_UNAVAILABLE", 404);
    const metadata = { ...current.metadata }, connections = { ...metadata.stream_connections };
    const previous = connections[provider];
    delete connections[provider]; metadata.stream_connections = connections;
    if (previous?.url && metadata[provider] === previous.url) metadata[provider] = "";
    await tx.user.update({ where: { id: userId }, data: { metadata } });
  });
}
