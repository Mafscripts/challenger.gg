export function matchPostedNotification(entity, match) {
  const xp = entity === "XPMatch" || match.match_type === "xp";
  const eights = entity === "Wager" && ["8s", "money8s"].includes(match.match_type);
  const label = entity === "RankedMatch" ? "Ranked match" : entity === "XPMatch" || match.match_type === "xp" ? "XP match"
    : match.match_type === "8s" ? "Free 8s lobby" : match.match_type === "money8s" ? "Money 8s lobby" : "Cash match";
  const path = entity === "RankedMatch" ? "/ranked-match/" : entity === "XPMatch" ? "/xp-match/" : eights ? "/8s-match/" : "/wagers-match/";
  const details = [match.team_size, match.game_mode_display || match.game_mode].filter(Boolean).join(" · ");
  return {
    type: "match", event: "match_posted", title: `${label} posted`,
    message: `Your ${label.toLowerCase()}${details ? ` (${details})` : ""} has been posted. ${xp ? "We will notify you when an opponent accepts. You can cancel your post in matchfinder." : "Open the lobby to follow your match."}`,
    action_url: xp ? "/xp#matchfinder" : `${path}${encodeURIComponent(match.id)}`,
    related_entity_id: match.id, related_entity_type: entity,
  };
}
