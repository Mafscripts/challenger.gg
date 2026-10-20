// The native WebView runs on localhost; it must never use the local dev API.
export function resolveApiBase(configured, native, hostname = "") {
  const value = String(configured || "").replace(/\/+$/, "");
  if (native) {
    const url = new URL(value || "https://www.topfragg.gg/api");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api") {
      throw new Error("The iPhone app requires an HTTPS API URL ending in /api.");
    }
    return url.href.replace(/\/+$/, "");
  }
  if (value && value !== "/api") return value;
  return ["localhost", "127.0.0.1"].includes(hostname) ? "http://localhost:4000/api" : "/api";
}

export const isNativeBuild = import.meta.env?.VITE_NATIVE_APP === "true";
export const apiBase = resolveApiBase(import.meta.env?.VITE_API_URL, isNativeBuild, typeof window === "undefined" ? "" : window.location.hostname);
export const websiteOrigin = isNativeBuild ? new URL(apiBase).origin : (typeof window === "undefined" ? "https://www.topfragg.gg" : window.location.origin);

export function currentPublicUrl() {
  return isNativeBuild ? new URL(`${window.location.pathname}${window.location.search}${window.location.hash}`, websiteOrigin).href : window.location.href;
}

export function validateMobileStartUrl(value, origin = websiteOrigin) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== origin || url.pathname !== "/api/mobile/oauth/start" || url.username || url.password || !url.searchParams.get("ticket")) {
    throw new Error("The account connection link is invalid. Please try again.");
  }
  return url.href;
}
