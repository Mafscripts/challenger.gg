const under = (path, route) => path === route || path.startsWith(`${route}/`);

export function nativeNavigationTab(pathname) {
  if (pathname === "/" || under(pathname, "/dashboard")) return "/dashboard";
  if (["/my-matches", "/match-room", "/ranked-match", "/xp-match", "/wagers-match", "/8s-match", "/tournament-match"].some(route => under(pathname, route))) return "/my-matches";
  if (["/ranked", "/xp", "/wagers", "/tournaments", "/streamer-tournaments", "/streamer-tournament", "/matchfinder", "/challenge-a-team", "/coed-switcheroo"].some(route => under(pathname, route))) return "/ranked";
  if (["/messages", "/find-players"].some(route => under(pathname, route))) return "/messages";
  if (under(pathname, "/settings")) return "/settings";
  return null;
}
