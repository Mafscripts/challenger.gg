import { competitionTwitchRequiredMessage, hasCompetitionTwitch, requiresCompetitionTwitch } from "../src/lib/competitionTwitch.js";

// Read the OAuth identity from User, never a submitted Twitch URL or roster field.
// This applies to the full playing roster, regardless of platform or staff status.
export async function competitionTwitchError(db, matchType, userIds) {
  if (!requiresCompetitionTwitch(matchType)) return null;
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, display_name: true, full_name: true, twitch_user_id: true },
  });
  const byId = new Map(users.map(user => [String(user.id), user]));
  const missingIds = ids.filter(id => !hasCompetitionTwitch(byId.get(id)));
  if (!missingIds.length) return null;
  const names = missingIds.slice(0, 3).map(id => {
    const user = byId.get(id);
    return user?.display_name || user?.full_name || user?.username || "A roster member";
  });
  const more = missingIds.length > 3 ? ` and ${missingIds.length - 3} more` : "";
  return {
    success: false,
    code: "TWITCH_CONNECTION_REQUIRED",
    error: `${names.join(", ")}${more} ${missingIds.length === 1 ? "needs" : "need"} a connected Twitch account. ${competitionTwitchRequiredMessage}`,
    missing_user_ids: missingIds,
    settings_url: "/settings#twitch",
  };
}
