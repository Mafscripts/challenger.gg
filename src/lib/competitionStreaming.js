export const competitionStreamRequiredMessage = "Every player must stream all maps in Cash Matches, Tournaments and Money 8s on Twitch, YouTube or Kick, on every platform, including console. Add your own channel in Settings > Connected accounts > Streaming channels before entering.";

export const competitionStreamRule = "Every player must stream every map from start to finish on Twitch, YouTube or Kick in Cash Matches, Tournaments and Money 8s. This includes console and verified players. Add your own channel in Settings before entering; a channel link alone does not fulfil the requirement to stream.";

// Accept channels, not videos, clips, login pages or lookalike domains.
// These are saved channel links; they do not claim OAuth ownership or live status.
export function streamChannelUrl(provider, value) {
  if (!["twitch", "youtube", "kick"].includes(provider) || typeof value !== "string") return "";
  const text = value.trim();
  if (!text || text.length > 200 || /\s/.test(text)) return "";
  let path;
  const hasDomain = /^(?:www\.|m\.)?(?:twitch\.tv|youtube\.com|kick\.com)(?:\/|$)/i.test(text);
  if (/^[a-z][a-z\d+.-]*:/i.test(text) || hasDomain || text.includes("/")) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return ""; }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return "";
    const domain = { twitch: "twitch.tv", youtube: "youtube.com", kick: "kick.com" }[provider];
    if (![domain, `www.${domain}`, `m.${domain}`].includes(url.hostname.toLowerCase())) return "";
    try { path = decodeURI(url.pathname).replace(/^\/+|\/+$/g, ""); } catch { return ""; }
  } else {
    path = text;
  }
  if (provider === "youtube") {
    if (/^@[\p{L}\p{N}_.-]{3,30}(?:\/(?:live|streams|videos))?$/u.test(path)) return `https://www.youtube.com/${path.split("/")[0]}`;
    if (/^channel\/UC[A-Za-z\d_-]{22}(?:\/(?:live|streams|videos))?$/.test(path)) return `https://www.youtube.com/${path.split("/").slice(0, 2).join("/")}`;
    if (/^(?:c|user)\/[A-Za-z\d_.-]{1,100}(?:\/(?:live|streams|videos))?$/.test(path)) return `https://www.youtube.com/${path.split("/").slice(0, 2).join("/")}`;
    // Bare handles are accepted in the settings fields.
    return !hasDomain && !text.includes(":") && /^[\p{L}\p{N}_.-]{3,30}$/u.test(text) ? `https://www.youtube.com/@${text}` : "";
  }
  const handle = path.replace(/^@/, "");
  const reserved = ["directory", "search", "settings", "login", "signup", "subscriptions", "videos", "clips", "download", "browse", "following", "categories", "category", "dashboard", "account", "moderator", "wallet", "messages", "jobs", "terms", "privacy", "p", "help"];
  if (!/^[A-Za-z\d_]{1,50}$/.test(handle) || reserved.includes(handle.toLowerCase())) return "";
  return `https://${provider === "twitch" ? "twitch.tv" : "kick.com"}/${handle}`;
}

export function competitionStreamChannels(user) {
  if (!user) return [];
  const values = { ...(user.metadata || {}), ...user };
  return ["twitch", "youtube", "kick"].flatMap(provider => {
    const saved = streamChannelUrl(provider, values[provider]);
    const identity = values.stream_connections?.[provider];
    const verified = identity?.id ? streamChannelUrl(provider, identity.url) : "";
    const connected = provider === "twitch" && user.twitch_user_id ? streamChannelUrl("twitch", user.twitch_login) : "";
    return verified || saved || connected ? [{ provider, url: verified || connected || saved }] : [];
  });
}

export const hasCompetitionStream = (user) => Boolean(String(user?.twitch_user_id || "").trim()) || competitionStreamChannels(user).length > 0;

export const requiresCompetitionStream = (matchType) => ["wager", "wagers", "money8s", "tournament"].includes(String(matchType || "").toLowerCase());
