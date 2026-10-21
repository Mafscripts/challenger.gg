export const competitionPresentation = {
  marketplace: { title: "Marketplace", eyebrow: "The TopFragg collection", icon: "Sparkles", motto: "Your style. Your collection.", facts: [["Sparkles", "Cosmetics & collectibles"], ["Trophy", "Earned rewards"], ["Crown", "Premium exclusives"]] },
  leaderboards: { title: "Leaderboards", eyebrow: "The players setting the pace", icon: "Trophy", motto: "Earn your place. Make your mark.", facts: [["Medal", "Competition standings"], ["Globe2", "Regional rankings"], ["UserRound", "Player profiles"]] },
  recruitment: { title: "Find teammates", eyebrow: "Build your next squad", icon: "Users", motto: "Better together. Built to compete.", facts: [["UserRound", "Find your duo"], ["ShieldCheck", "Build your roster"], ["MessageSquare", "Meet the community"]] },
  premium: { title: "Premium", eyebrow: "TopFragg membership", icon: "Crown", motto: "Your name. Your signal.", facts: [["Sparkles", "Animated name effects"], ["Crown", "Premium identity"], ["ShieldCheck", "Priority support"]] },
  notifications: { title: "Notifications", eyebrow: "Your latest activity", icon: "Bell", motto: "Stay one step ahead.", facts: [["Bell", "Match updates"], ["Trophy", "Competition alerts"], ["Clock", "24-hour inbox"]] },
  messages: { title: "Messages", eyebrow: "Your private inbox", icon: "MessageSquare", motto: "Keep your squad connected.", facts: [["MessageSquare", "Player conversations"], ["Trophy", "Tournament invites"], ["ShieldCheck", "Report & block"]] },
  notifications: { title: "Notifications", eyebrow: "Your latest activity", icon: "Bell", motto: "Stay one step ahead.", facts: [["Bell", "Match updates"], ["Trophy", "Competition alerts"], ["Clock", "24-hour inbox"]] },
  messages: { title: "Messages", eyebrow: "Your private inbox", icon: "MessageSquare", motto: "Keep your squad connected.", facts: [["MessageSquare", "Player conversations"], ["Trophy", "Tournament invites"], ["ShieldCheck", "Report & block"]] },
  support: { title: "Support Center", eyebrow: "TopFragg player support", icon: "ShieldCheck", motto: "We've got your back.", facts: [["Inbox", "Private tickets"], ["MessageSquare", "Staff conversations"], ["ShieldCheck", "Account & match help"]] },
  matches: { title: "My Matches", eyebrow: "Your match center", icon: "Swords", motto: "Your next move starts here.", facts: [["Gamepad2", "All competitions"], ["Swords", "Active matches"], ["History", "Recent results"]] },
  wallet: { title: "Topfragg Wallet", eyebrow: "Your TopFragg wallet", icon: "Wallet", motto: "Every match accounted for.", facts: [["Wallet", "Balance overview"], ["History", "Transaction history"], ["ShieldCheck", "Account activity"]] },
  support: { title: "Support Center", eyebrow: "TopFragg player support", icon: "ShieldCheck", motto: "We've got your back.", facts: [["Inbox", "Private tickets"], ["MessageSquare", "Staff conversations"], ["ShieldCheck", "Account & match help"]] },
  matches: { title: "My Matches", eyebrow: "Your match center", icon: "Swords", motto: "Your next move starts here.", facts: [["Gamepad2", "All competitions"], ["Swords", "Active matches"], ["History", "Recent results"]] },
  wallet: { title: "Topfragg Wallet", eyebrow: "Your TopFragg wallet", icon: "Wallet", motto: "Every match accounted for.", facts: [["Wallet", "Balance overview"], ["History", "Transaction history"], ["ShieldCheck", "Account activity"]] },
  rules: { title: "Rules & Regulations", eyebrow: "The TopFragg rulebook", icon: "BookOpen", motto: "Play fair. Win with pride.", facts: [["Gamepad2", "PC & console"], ["Radio", "Twitch · YouTube · Kick"], ["ShieldCheck", "Fair play first"]] },
  settings: { title: "Settings", eyebrow: "Your TopFragg account", icon: "Settings2", motto: "Your identity. Your arena.", facts: [["UserRound", "Player profile"], ["Radio", "Streaming accounts"], ["KeyRound", "Account security"]] },
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
