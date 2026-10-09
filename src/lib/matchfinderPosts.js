export const MATCHFINDER_POST_LIFETIME_MS = 30 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function matchfinderPostExpiresAt(post) {
  const placedAt = new Date(post?.created_date || "").getTime();
  return Number.isFinite(placedAt) ? placedAt + MATCHFINDER_POST_LIFETIME_MS : NaN;
}

export function isMatchfinderPostVisible(post, now = Date.now()) {
  return post?.status === "open"
    && post.posted_to_matchfinder !== false
    && matchfinderPostExpiresAt(post) > now;
}

export function roundedMatchfinderPostedAt(value) {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp)
    ? new Date(Math.round(timestamp / FIVE_MINUTES_MS) * FIVE_MINUTES_MS)
    : null;
}

export function formatMatchfinderPostedAt(value) {
  return roundedMatchfinderPostedAt(value)?.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }) || "—";
}
