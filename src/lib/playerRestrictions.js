// Explicit account flags take precedence over older stored badge entries.
export function consoleRestrictedFor(user) {
  const value = user?.console_restricted ?? user?.metadata?.console_restricted;
  if (value !== undefined && value !== null) {
    return typeof value === "string" ? ["true", "1", "yes", "on"].includes(value.toLowerCase()) : Boolean(value);
  }
  const badges = user?.badges || user?.metadata?.badges;
  return Array.isArray(badges) && badges.some((badge) => badge?.type === "console_restricted");
}
