import { Activity, BookOpen, Crosshair, DollarSign, Grid2X2, MessageSquare, Monitor, Package, Search, ShieldCheck, ShoppingBag, Swords, Trophy, Users, Zap } from "lucide-react";

export const challengeNavItem = { label: "Challenge a Team", path: "/challenge-a-team", icon: Crosshair, tone: "purple", isNew: true };

export const navGroups = [
  {
    label: "Tournaments",
    icon: Trophy,
    eyebrow: "Tournament center",
    tone: "red",
    items: [
      { label: "Tournaments", description: "Enter official competitions", path: "/tournaments", icon: Trophy, tone: "red" },
      { label: "Streamer Tournaments", description: "Community-hosted competition", path: "/streamer-tournaments", icon: Monitor, tone: "red" },
    ],
  },
  {
    label: "Cash Matches",
    icon: Zap,
    eyebrow: "Competitive stakes",
    tone: "green",
    items: [
      { label: "Cash Matches", description: "Post or accept a cash challenge", path: "/wagers", icon: Zap, tone: "green" },
      { label: "Cash Matches Leaderboard", description: "See the top cash match earners", path: "/leaderboards?tab=wagers", icon: Trophy, tone: "green" },
    ],
  },
  {
    label: "Matchfinder",
    icon: Search,
    eyebrow: "Find your next match",
    tone: "gold",
    items: [
      { label: "Matchfinder", description: "Browse every open competition", path: "/matchfinder", icon: Search, tone: "gold" },
      { label: "Leaderboards", description: "Compare the best competitors", path: "/leaderboards", icon: Trophy, tone: "gold" },
    ],
  },
  {
    label: "Teams",
    icon: Users,
    eyebrow: "Team competition",
    tone: "orange",
    items: [
      { label: "Teams", description: "Build and manage your roster", path: "/teams", icon: Users, tone: "orange" },
    ],
  },
];

const rankedNavGroup = {
  label: "Ranked",
  icon: Swords,
  eyebrow: "Ranked competition",
  tone: "cyan",
  items: [
    { label: "Ranked", description: "Queue for ranked matchmaking", path: "/ranked", icon: Swords, tone: "cyan" },
    { label: "Free 8s", description: "Join the free 8-player competitive queue", path: "/ranked/8s", icon: Users, tone: "cyan" },
    { label: "Money 8s", description: "Play 8s for a wallet-backed prize pool", path: "/ranked/8s?mode=money", icon: DollarSign, tone: "green" },
  ],
};

const xpNavGroup = {
  label: "XP",
  icon: Zap,
  eyebrow: "Posted XP challenges",
  tone: "cyan",
  items: [
    { label: "XP Matches", description: "Post or accept XP challenges", path: "/xp", icon: Zap, tone: "cyan" },
  ],
};

export const playNavGroup = {
  label: "Play",
  icon: Swords,
  eyebrow: "Choose your competition",
  tone: "cyan",
  items: [
    ...rankedNavGroup.items,
    ...xpNavGroup.items,
    { label: "Co-ed / Switcheroo", description: "Spin the wheel, build teams and join Discord voice", path: "/coed-switcheroo", icon: Users, tone: "purple", isNew: true },
  ],
};

export const mobileNavSections = [
  { label: "Team challenges", items: [challengeNavItem] },
  { label: "Play", items: playNavGroup.items },
  { label: "Cash Matches", items: navGroups[1].items },
  { label: "Matchfinder", items: navGroups[2].items },
  { label: "Tournaments", items: navGroups[0].items },
  { label: "Teams", items: navGroups[3].items },
];

// The sidebar keeps its own grouping. Topbar modes live together under Play.
export const topbarPlayNavGroup = {
  ...playNavGroup,
  items: [...playNavGroup.items, { ...challengeNavItem, description: "1v1 to 4v4 team challenges with a separate XP ladder" }],
};
const topbarMatchfinderGroup = { ...navGroups[2], playerSearch: true, items: [...navGroups[2].items,
  { label: "Find Players Chat", description: "Meet players and find your next squad", path: "/find-players", icon: MessageSquare, tone: "cyan" },
] };
const topbarTournamentGroup = { ...navGroups[0], items: [...navGroups[0].items,
  { label: "Topfragg League", description: "Modern Warfare 4 · Coming soon", path: "/league", icon: ShieldCheck, tone: "cyan" },
] };
const topbarMoreGroup = { label: "More", icon: Grid2X2, eyebrow: "Explore Topfragg", tone: "cyan", items: [
  { label: "Marketplace", description: "Browse the item market", path: "/marketplace", icon: ShoppingBag, tone: "cyan" },
  { label: "Inventory", description: "Your collected items", path: "/inventory", icon: Package, tone: "cyan" },
  { label: "Trading", description: "Trade with other players", path: "/trading", icon: Activity, tone: "cyan" },
  { label: "Rules", description: "Platform and competition rules", path: "/rules", icon: BookOpen, tone: "cyan" },
] };
export const topbarNavGroups = [topbarPlayNavGroup, navGroups[1], topbarMatchfinderGroup, topbarTournamentGroup, topbarMoreGroup];
export const topbarMobileSections = mobileNavSections
  .filter((section) => section.label !== "Team challenges")
  .map((section) => {
    const replacement = topbarNavGroups.find((group) => group.label === section.label);
    return replacement ? { ...section, items: replacement.items } : section;
  }).concat({ label: "More", items: topbarMoreGroup.items });

