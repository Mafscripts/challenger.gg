export const isNavigationLayout = (value) => value === "topbar" || value === "sidebar";
export const navigationLayoutKey = (userId) => `topfragg:navigation-layout:${encodeURIComponent(userId)}`;

export function preferredNavigationLayout(user, storage) {
  if (!user?.id) return "topbar";
  if (isNavigationLayout(user.navigation_layout)) return user.navigation_layout;
  try {
    const cached = storage?.getItem(navigationLayoutKey(user.id));
    return isNavigationLayout(cached) ? cached : "topbar";
  } catch { return "topbar"; }
}
