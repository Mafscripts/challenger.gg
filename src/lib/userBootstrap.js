import { base44 } from "@/api/base44Client";

let bootstrapPromise = null;

const cleanUsername = (value, fallback = "player") => {
  const cleaned = String(value || fallback)
    .split("@")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  const username = cleaned || String(fallback || "player").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "player";
  return username.length >= 3 ? username : `${username}___`.slice(0, 3);
};

const displayNameFor = (user, fallbackEmail) => (
  user?.display_name ||
  user?.full_name ||
  user?.username ||
  cleanUsername(user?.email || fallbackEmail, "user")
);

export async function bootstrapCurrentUser(options = {}) {
  const authUser = options.user || await base44.auth.me().catch(() => null);
  if (!authUser?.id) return null;

  const sessionKey = `bootstrap:${authUser.id}`;
  if (!options.force && typeof window !== "undefined" && window.sessionStorage.getItem(sessionKey)) {
    return authUser;
  }

  if (!options.force && bootstrapPromise) {
    return bootstrapPromise;
  }

  const displayName = options.display_name || displayNameFor(authUser, options.email);
  const username = cleanUsername(options.username || authUser.username || authUser.email || options.email || authUser.id);
  const handle = cleanUsername(options.handle || username).toLowerCase();

  const payload = {
    username,
    handle,
    display_name: displayName,
    region: options.region || authUser.region || "na",
  };

  bootstrapPromise = base44.functions.invoke("completeRegistration", payload)
    .then((response) => response.data?.user || response.data)
    .then(async () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(sessionKey, "1");
      }
      return base44.auth.me({ force: true }).catch(() => authUser);
    })
    .finally(() => {
      bootstrapPromise = null;
    });

  return bootstrapPromise;
}
