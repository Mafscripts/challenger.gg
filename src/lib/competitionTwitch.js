export const competitionTwitchRequiredMessage = "Connect your Twitch account in Settings > Connected accounts > Twitch before entering Cash Matches, Tournaments or Money 8s. Required for every player on every platform, including console.";

export const hasCompetitionTwitch = (user) => Boolean(String(user?.twitch_user_id || "").trim());

export const requiresCompetitionTwitch = (matchType) => ["wager", "wagers", "money8s", "tournament"].includes(String(matchType || "").toLowerCase());
