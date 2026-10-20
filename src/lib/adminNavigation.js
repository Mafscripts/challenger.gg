export const adminGroups = [
  { id: "overview", label: "Overview & support", tone: "cyan", sections: ["dashboard", "alerts", "tickets", "banAppeals"] },
  { id: "players", label: "Players & access", tone: "purple", sections: ["users", "roles", "verifyRank"] },
  { id: "competition", label: "Competition", tone: "gold", sections: ["live8s", "eightsGames", "ranked", "challenges", "tournaments", "tournamentMatches", "progression", "wagers"] },
  { id: "economy", label: "Economy & rewards", tone: "green", sections: ["wallets", "withdrawals", "marketplace", "inventory", "referrals", "freeTrials"] },
  { id: "records", label: "Activity & records", tone: "cyan", sections: ["audit"] },
];

const descriptions = {
  dashboard: "Your support queues, competitions and platform totals at a glance.",
  users: "Find players and manage their accounts and security.",
  roles: "Manage staff access and player roles.", alerts: "Review platform alerts and follow up on open issues.",
  tickets: "Read requests, reply to players and record the outcome.", banAppeals: "Review player appeals and moderation decisions.",
  wagers: "Review cash matches and their results.", live8s: "Follow active lobbies and open their match rooms.",
  challenges: "Manage team challenges and competition activity.", eightsGames: "Configure the games, maps and modes available in 8s.",
  ranked: "Review players, matches and ranked standings.", progression: "Manage progression resets and competition seasons.",
  verifyRank: "Review player screenshots and verify game ranks.", tournaments: "Create events, manage entries and configure rewards.",
  tournamentMatches: "Follow tournament matches and their results.", wallets: "Review balances, credits and wallet activity.",
  referrals: "Manage the referral program and its rewards.", freeTrials: "Configure the animated name trial for players.",
  withdrawals: "Review withdrawal requests and payment details.", marketplace: "Manage items, pricing and marketplace availability.",
  inventory: "Review items owned by players.", audit: "Search staff actions and platform activity.",
};

export function adminSectionInfo(id) {
  const group = adminGroups.find(entry => entry.sections.includes(id)) || adminGroups[0];
  return { group: group.label, tone: group.tone, description: descriptions[id] || descriptions.dashboard };
}

export function searchAdminSections(sections, query = "") {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return adminGroups.map(group => ({ ...group, sections: group.sections
    .map(id => sections.find(section => section.id === id)).filter(Boolean)
    .filter(section => words.every(word => `${section.label} ${group.label} ${descriptions[section.id] || ""}`.toLowerCase().includes(word))),
  })).filter(group => group.sections.length);
}
