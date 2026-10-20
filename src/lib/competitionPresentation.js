export const competitionPresentation = {
  ranked: { title: "Ranked", eyebrow: "Ranked competition", icon: "Swords", motto: "Climb the ladder.", facts: [["Medal", "ELO standings"], ["Users", "1v1 to 4v4"], ["ShieldCheck", "Competitive rules"]] },
  eights: { title: "Free 8s", eyebrow: "Free entry. Real competition.", icon: "Users", motto: "Find your squad.", facts: [["Gamepad2", "2v2 · 3v3 · 4v4"], ["Users", "Balanced teams"], ["Radio", "Discord voice"]] },
  money8s: { title: "Money 8s", eyebrow: "Money 8s competition", icon: "DollarSign", motto: "Play for the pot.", facts: [["Users", "8-player pot"], ["DollarSign", "Wallet-backed entry"], ["Radio", "Streaming required"]] },
  xp: { title: "XP Matches", eyebrow: "Your next level starts here", icon: "Zap", motto: "Earn your place.", facts: [["Sparkles", "XP standings"], ["Users", "1v1 to 4v4"], ["Medal", "TP ranks"]] },
  challenge: { title: "Challenge a Team", eyebrow: "Your squad. Your challenge.", icon: "Crosshair", motto: "Bring your team.", facts: [["Swords", "1v1 to 4v4"], ["Users", "Teams & solo challengers"], ["Sparkles", "Free entry · Team XP"]] },
  wagers: { title: "Cash Matches", eyebrow: "Cash competition", icon: "DollarSign", motto: "Make every map count.", facts: [["DollarSign", "Wallet-backed matches"], ["Users", "Team competition"], ["Radio", "Streaming required"]] },
  tournaments: { title: "Tournaments", eyebrow: "The TopFragg tournament center", icon: "Trophy", motto: "Chase the trophy.", facts: [["Trophy", "Official events"], ["Users", "Registered rosters"], ["Radio", "Streaming required"]] },
  matchfinder: { title: "Matchfinder", eyebrow: "Find your next competition", icon: "Search", motto: "Your next match awaits.", facts: [["Swords", "Open competitions"], ["Gamepad2", "Choose your mode"], ["ShieldCheck", "Check match settings"]] },
  streamer: { title: "Streamer Switcheroos", eyebrow: "Community competition", icon: "Radio", motto: "Bring your community.", facts: [["Radio", "Streamer-hosted events"], ["Shuffle", "Random teams"], ["Trophy", "Live brackets"]] },
  party: { title: "Co-ed & Switcheroo", eyebrow: "TopFragg community nights", icon: "Shuffle", motto: "Let the wheel decide.", facts: [["Users", "Your players & teams"], ["Shuffle", "Live team draws"], ["Radio", "Private Discord voice"]] },
};

export function competitionTheme(mode) {
  return competitionPresentation[mode] || competitionPresentation.ranked;
}
