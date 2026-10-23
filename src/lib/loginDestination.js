export function loginDestination(requested, origin) {
  if (typeof requested !== "string" || !requested) return "/";
  try {
    const destination = new URL(requested, origin);
    const authPage = /^\/(login|logout|register|verify-email|forgot-password|reset-password|change-password)\/?$/.test(destination.pathname);
    if (destination.origin !== origin || destination.pathname.startsWith("//") || authPage) return "/";
    const path = /^\/dashboard\/?$/.test(destination.pathname) ? "/" : destination.pathname;
    return `${path}${destination.search}${destination.hash}`;
  } catch { return "/"; }
}
