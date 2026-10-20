import { competitionStreamRequiredMessage, hasCompetitionStream, requiresCompetitionStream } from "../src/lib/competitionStreaming.js";

// Read saved channel links or the Twitch OAuth identity from User, never from
// the entry request. This applies to the entire roster on every platform.
export async function competitionStreamError(db, matchType, userIds) {
  if (!requiresCompetitionStream(matchType)) return null;
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, display_name: true, full_name: true, twitch_user_id: true, twitch_login: true, metadata: true },
  });
  const byId = new Map(users.map(user => [String(user.id), user]));
  const missingIds = ids.filter(id => !hasCompetitionStream(byId.get(id)));
  if (!missingIds.length) return null;
  const names = missingIds.slice(0, 3).map(id => {
    const user = byId.get(id);
    return user?.display_name || user?.full_name || user?.username || "A roster member";
  });
  const more = missingIds.length > 3 ? ` and ${missingIds.length - 3} more` : "";
  return {
    success: false,
    code: "STREAM_CHANNEL_REQUIRED",
    error: `${names.join(", ")}${more} ${missingIds.length === 1 ? "needs" : "need"} a Twitch, YouTube or Kick channel. ${competitionStreamRequiredMessage}`,
    missing_user_ids: missingIds,
    settings_url: "/settings#streaming",
  };
}
