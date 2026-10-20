export const settingGroups = [
  {
    id: "account", label: "Account & security", description: "Your identity, style & sign-in", icon: "UserRound", tone: "cyan",
    items: [
      { label: "Profile & username", description: "Change your name and account details", icon: "UserRound", target: "settings-account", keywords: "name display handle identity email" },
      { label: "Custom name color", description: "Choose how your name looks", icon: "Palette", target: "settings-name-color", keywords: "appearance animated premium style" },
      { label: "Game rank", description: "Manage your screenshot rank", icon: "Award", target: "settings-rank", keywords: "verification screenshot skill activision" },
      { label: "Password", description: "Update your sign-in password", icon: "KeyRound", target: "settings-password", keywords: "login security change reset" },
      { label: "Delete account", description: "Permanently remove your account", icon: "ShieldCheck", target: "settings-delete-account", keywords: "delete removal privacy data erase close" },
    ],
  },
  {
    id: "connections", label: "Connections", description: "Your channels, games & community", icon: "Link2", tone: "green",
    items: [
      { label: "Gaming IDs", description: "Set your Activision ID and platform", icon: "Gamepad2", target: "settings-gaming", keywords: "call of duty console pc playstation xbox" },
      { label: "Streaming accounts", description: "Connect Twitch, YouTube or Kick", icon: "Radio", target: "settings-streaming", keywords: "stream live channel link broadcast" },
      { label: "Channel links & socials", description: "Edit your public profile links", icon: "AtSign", target: "settings-socials", keywords: "twitter x twitch youtube kick website social" },
      { label: "Stream overlay", description: "Customize your streaming overlay", icon: "MonitorPlay", target: "settings-overlay", keywords: "obs browser source live stats" },
      { label: "Discord", description: "Connect your community account", icon: "MessageCircle", target: "settings-discord", keywords: "voice waiting room server chat" },
    ],
  },
  {
    id: "wallet", label: "Wallet & rewards", description: "Credits, team payments & invites", icon: "WalletCards", tone: "gold",
    items: [
      { label: "Credits", description: "Manage your TopFragg credits", icon: "Coins", target: "settings-credits", keywords: "balance wallet money buy purchase" },
      { label: "Team payments", description: "Manage who can pay for your entries", icon: "ShieldCheck", target: "settings-payments", keywords: "permission captain fees tournament cash" },
      { label: "Referrals", description: "Share your invite link and earn rewards", icon: "Gift", target: "settings-referrals", keywords: "friends code bonus reward invite" },
    ],
  },
  {
    id: "appearance", label: "Appearance", description: "Make the website feel like yours", icon: "PanelLeft", tone: "purple",
    items: [{ label: "Navigation layout", description: "Choose the topbar or sidebar", icon: "PanelLeft", target: "settings-navigation", keywords: "menu layout appearance navigation" }],
  },
];

const aliases = {
  streaming: "settings-streaming", "gaming-ids": "settings-gaming", credits: "settings-credits", discord: "settings-discord",
  twitch: "settings-streaming", "settings-twitch": "settings-streaming", password: "settings-password",
  account: "settings-account", connections: "settings-streaming", appearance: "settings-navigation",
};

export function settingTarget(hash = "", search = "") {
  const rawTarget = hash.replace(/^#/, ""), target = aliases[rawTarget] || rawTarget;
  if (settingGroups.some(group => group.items.some(item => item.target === target))) return target;
  const params = new URLSearchParams(search);
  if (params.has("discord") || params.get("connect") === "discord") return "settings-discord";
  if (params.has("twitch") || params.has("stream_provider")) return "settings-streaming";
  return "settings-account";
}

export function searchSettings(query) {
  const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return settingGroups.flatMap(group => group.items
    .filter(item => words.every(word => `${group.label} ${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(word)))
    .map(item => ({ ...item, group: group.label, tone: group.tone })));
}
