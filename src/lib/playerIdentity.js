// Public identity is separate from account URLs and social handles.
export function playerDisplayName(player, fallback = "Player") {
  const sources = [player?.user, player?.profile, player].filter(value => value && typeof value === "object");
  for (const field of ["display_name", "full_name", "name", "user_name", "username"]) {
    for (const source of sources) {
      const value = source[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

export function profilePresentationPatch(detail = {}) {
  const fields = { avatarUrl: "avatar_url", displayName: "display_name", username: "username", displayNameColor: "display_name_color", playerCardTheme: "player_card_theme", playerCardMotion: "player_card_motion" };
  return Object.fromEntries(Object.entries(fields).filter(([key]) => detail[key] !== undefined).map(([key, field]) => [field, detail[key]]));
}
