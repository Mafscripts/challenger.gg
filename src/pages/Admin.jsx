import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Award,
  BadgeDollarSign,
  BellRing,
  Boxes,
  CheckCheck,
  ClipboardList,
  Crown,
  CreditCard,
  Edit3,
  Gavel,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Loader2,
  Medal,
  MessageSquare,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  Shield,
  ShoppingBag,
  Save,
  Swords,
  Trash2,
  Ticket,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import RoleBadge from "@/components/ui/RoleBadge";
import UserBadges from "@/components/ui/UserBadges";
import { canAccessAdminPanel, canManageRoles, canManageWallets, getRoleConfig } from "@/lib/roles";

const roleOptions = ["ceo", "super_admin", "admin", "moderator", "user"];
const marketplaceCategories = ["cosmetic", "badge", "frame", "calling_card", "trophy", "knife", "ranked_reward", "weapon_skin", "gloves", "agent", "sticker", "patch", "music_kit"];
const tournamentRewardCategories = new Set(["knife", "weapon_skin", "trophy"]);
const defaultTournamentSndMaps = ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Colossus"];
const defaultTournamentHpMaps = ["Sake", "Colossus", "Den", "Scar", "Gridlock", "Hacienda"];
const defaultTournamentOverloadMaps = ["Scar", "Gridlock", "Den", "Exposure"];
const defaultTournamentSndMapsText = defaultTournamentSndMaps.join("\n");
const defaultTournamentHpMapsText = defaultTournamentHpMaps.join("\n");
const defaultTournamentOverloadMapsText = defaultTournamentOverloadMaps.join("\n");
const tournamentGameModeOptions = [
  { value: "bo1_snd", label: "BO1 SND - 1 and done" },
  { value: "snd", label: "BO3 Search & Destroy" },
  { value: "hp", label: "BO3 Hardpoint" },
  { value: "overload", label: "BO3 Overload" },
  { value: "snd_hp_snd", label: "BO3 SND / HP / SND" },
  { value: "bo3_hp_overload_snd", label: "BO3 HP / Overload / SND" },
  { value: "bo5_hp_overload_snd_hp_snd", label: "BO5 HP / Overload / SND / HP / SND" },
];
const tournamentTeamSizeOptions = Array.from({ length: 8 }, (_, index) => `${index + 1}v${index + 1}`);
const userBadgeOptions = [
  { value: "none", label: "No special badge", types: [] },
  { value: "verified_player", label: "Verified player", types: ["verified_player"] },
  { value: "streamer", label: "Streamer", types: ["streamer"] },
  { value: "verified_streamer", label: "Verified + streamer", types: ["verified_player", "streamer"] },
];
const marketplaceRarities = ["common", "rare", "epic", "legendary", "mythic", "exclusive"];
const marketplaceUnlockTypes = [
  { value: "marketplace", label: "Direct marketplace purchase" },
  { value: "ranked", label: "Ranked unlock" },
  { value: "tournament", label: "Tournament unlock" },
  { value: "wager", label: "Wager unlock" },
  { value: "eights", label: "8s unlock" },
  { value: "premium", label: "Premium only" },
];
const marketplaceRequirementPlaceholder = {
  marketplace: "No requirement needed",
  ranked: "ELO amount, e.g. 1500",
  tournament: "Tournament wins, e.g. 1",
  wager: "Wager wins, e.g. 10",
  eights: "8s wins, e.g. 25",
  premium: "Premium subscription required",
};
const defaultMarketplaceForm = {
  name: "",
  description: "",
  image_url: "",
  category: "cosmetic",
  rarity: "common",
  price_credits: "0",
  price_cash: "0",
  stock_quantity: "",
  unlock_type: "marketplace",
  unlock_requirement: "",
  is_limited: false,
  is_featured: false,
  show_in_marketplace: true,
  is_premium_only: false,
  is_tradeable: true,
  is_active: true,
};
const defaultTournamentForm = {
  name: "",
  image_url: "",
  game_mode: "snd_hp_snd",
  team_size: "2v2",
  entry_fee: "0",
  entry_type: "free",
  prize_pool: "0",
  first_place_prize: "0",
  second_place_prize: "0",
  snd_maps: defaultTournamentSndMapsText,
  hp_maps: defaultTournamentHpMapsText,
  overload_maps: defaultTournamentOverloadMapsText,
  max_teams: "8",
  bracket_type: "single_elimination",
  status: "open",
  registration_end: "",
  start_date: "",
  is_premium_only: false,
  invite_only: false,
  invited_user_ids: [],
  reward_item_ids: [],
  elimination_reward_item_ids: [],
  placement_trophy_item_ids: { 1: [], 2: [], 3: [] },
};
const tournamentStatusOptions = ["draft", "open", "registration", "closed", "live", "in_progress", "completed", "cancelled"];
const defaultWalletAdjustmentForm = {
  user_id: "",
  type: "credits",
  amount: "",
  reason: "",
};

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles", icon: KeyRound },
  { id: "alerts", label: "Alerts", icon: BellRing },
  { id: "tickets", label: "Tickets", icon: Ticket },
  { id: "disputes", label: "Disputes", icon: Gavel },
  { id: "wagers", label: "Wagers", icon: BadgeDollarSign },
  { id: "ranked", label: "Ranked Matches", icon: Swords },
  { id: "tournaments", label: "Tournaments", icon: Trophy },
  { id: "tournamentMatches", label: "Tournament Matches", icon: ClipboardList },
  { id: "wallets", label: "Wallets", icon: Wallet },
  { id: "withdrawals", label: "Withdrawals", icon: Landmark },
  { id: "marketplace", label: "Marketplace", icon: ShoppingBag },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "audit", label: "Audit Logs", icon: ScrollText },
];

const initialData = {
  users: [],
  adminAlerts: [],
  tickets: [],
  disputes: [],
  wagers: [],
  rankedMatches: [],
  tournaments: [],
  tournamentMatches: [],
  wallets: [],
  withdrawals: [],
  marketplace: [],
  inventory: [],
  adminActions: [],
  bans: [],
  systemLogs: [],
  messages: [],
};

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value) => value ? new Date(value).toLocaleString() : "N/A";
const statusText = (value) => String(value || "unknown").replace(/_/g, " ");
const userName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "Unknown";
const closedAdminAlertStatuses = new Set(["acknowledged", "resolved", "closed"]);
const isOpenAdminAlert = (alert) => !closedAdminAlertStatuses.has(alert?.status || "open");
const adminAlertActionUrl = (alert, ticket) => {
  if (ticket?.action_url) return ticket.action_url;
  if (alert?.action_url) return alert.action_url;
  const id = alert?.match_id || alert?.related_entity_id;
  if (!id) return "/admin";
  const matchType = String(alert?.match_type || "").toLowerCase();
  if (matchType === "tournament") return `/tournament-match/${id}`;
  if (matchType === "wager") return `/wagers-match/${id}`;
  if (matchType === "ranked") return `/ranked-match/${id}`;
  if (matchType === "8s" || matchType === "eights") return `/8s-match/${id}`;
  if (matchType === "xp") return `/xp-match/${id}`;
  return "/admin";
};
const rolePowerFor = (role) => getRoleConfig(role || "user").power;
const effectiveRoleFor = (user) => (
  [user?.role, user?.admin_role, user?.is_admin ? "admin" : null]
    .filter(Boolean)
    .reduce((best, role) => (rolePowerFor(role) > rolePowerFor(best) ? role : best), "user")
);
const canAddWalletAdjustment = (role) => ["ceo", "super_admin"].includes(role || "user");
const canAdjustUserWallet = (actorRole, targetRole) => canAddWalletAdjustment(actorRole) && (actorRole === "ceo" || targetRole !== "ceo");
const canGrantUserPremium = (actorRole, targetRole) => (
  actorRole === "ceo"
  || (actorRole === "super_admin" && targetRole !== "ceo")
  || (actorRole === "admin" && !["ceo", "super_admin"].includes(targetRole || "user"))
);
const hasActivePremium = (user) => {
  if (!user?.is_premium) return false;
  if (!user.premium_expires) return true;
  const expiresAt = new Date(user.premium_expires).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};
const ipHistoryText = (user) => (user?.ip_history || []).slice(-3).map((entry) => entry.ip).join(", ") || user?.last_login_ip || user?.registration_ip || "N/A";
const marketplacePlacementText = (item) => [
  item.is_featured === true ? "Featured" : null,
  item.show_in_marketplace !== false ? "Grid" : null,
].filter(Boolean).join(", ") || "Hidden";
const marketplaceCategoryText = (value) => String(value || "cosmetic").replace(/_/g, " ");
const tournamentItemIds = (tournament, idsKey, itemsKey) => {
  const selectedIds = Array.isArray(tournament?.[idsKey]) ? tournament[idsKey] : [];
  const snapshotIds = Array.isArray(tournament?.[itemsKey]) ? tournament[itemsKey].map((item) => item?.id || item?.item_id) : [];
  return [...new Set([...selectedIds, ...snapshotIds].filter(Boolean))];
};
const tournamentRewardIds = (tournament) => tournamentItemIds(tournament, "reward_item_ids", "reward_items");
const tournamentEliminationRewardIds = (tournament) => tournamentItemIds(tournament, "elimination_reward_item_ids", "elimination_reward_items");
const tournamentPlacementTrophyIds = (tournament, placement) => {
  const selectedIds = Array.isArray(tournament?.placement_trophy_item_ids?.[placement])
    ? tournament.placement_trophy_item_ids[placement]
    : [];
  const snapshotIds = Array.isArray(tournament?.placement_trophy_items?.[placement])
    ? tournament.placement_trophy_items[placement].map((item) => item?.id || item?.item_id)
    : [];
  return [...new Set([...selectedIds, ...snapshotIds].filter(Boolean))];
};
const tournamentRewardSummary = (tournament, marketplace = [], idsKey = "reward_item_ids", itemsKey = "reward_items") => {
  const byId = Object.fromEntries(marketplace.map((item) => [item.id, item]));
  const snapshots = Array.isArray(tournament?.[itemsKey]) ? tournament[itemsKey] : [];
  const rewards = tournamentItemIds(tournament, idsKey, itemsKey).map((id) => byId[id] || snapshots.find((item) => item?.id === id || item?.item_id === id)).filter(Boolean);
  return rewards.map((item) => item.name).slice(0, 3).join(", ") + (rewards.length > 3 ? ` +${rewards.length - 3}` : "") || "None";
};
const tournamentPlacementTrophySummary = (tournament, marketplace = [], placement) => {
  const byId = Object.fromEntries(marketplace.map((item) => [item.id, item]));
  const snapshots = Array.isArray(tournament?.placement_trophy_items?.[placement]) ? tournament.placement_trophy_items[placement] : [];
  const items = tournamentPlacementTrophyIds(tournament, placement)
    .map((id) => byId[id] || snapshots.find((item) => item?.id === id || item?.item_id === id))
    .filter(Boolean);
  return items.map((item) => item.name).join(", ") || "None";
};
const tournamentPlacementPrizeValue = (tournament, placement) => {
  const distribution = tournament?.prize_distribution || {};
  const amountKey = placement === 2 ? "second_amount" : "first_amount";
  const legacyKey = placement === 2 ? "second" : "first";
  const amount = Number(distribution[amountKey]);
  if (Number.isFinite(amount)) return String(amount);
  const legacy = Number(distribution[legacyKey]);
  return Number.isFinite(legacy) && legacy > 100 ? String(legacy) : "";
};
const tournamentPrizeSummary = (tournament) => {
  const first = Number(tournamentPlacementPrizeValue(tournament, 1) || 0);
  const second = Number(tournamentPlacementPrizeValue(tournament, 2) || 0);
  if (first > 0 || second > 0) return `#1 ${formatMoney(first)} | #2 ${formatMoney(second)}`;
  return formatMoney(tournament?.prize_pool);
};
const parseMapList = (value, fallback = []) => {
  const rows = String(value || "")
    .split(/[\n,]+/)
    .map((row) => row.trim())
    .filter(Boolean);
  return [...new Set(rows.length > 0 ? rows : fallback)];
};
const mapListText = (value, fallback = []) => (
  Array.isArray(value) && value.length > 0 ? value.join("\n") : fallback.join("\n")
);
const userBadgeTypes = (user) => {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  const types = new Set(badges.map((badge) => badge?.type).filter(Boolean));
  if (user?.verified_player || user?.is_verified_player) types.add("verified_player");
  if (user?.streamer_badge || user?.is_streamer) types.add("streamer");
  return [...types].filter((type) => ["verified_player", "streamer"].includes(type));
};
const userBadgePreset = (user) => {
  const types = userBadgeTypes(user);
  if (types.includes("verified_player") && types.includes("streamer")) return "verified_streamer";
  if (types.includes("verified_player")) return "verified_player";
  if (types.includes("streamer")) return "streamer";
  return "none";
};
const compactListText = (rows, formatter, empty = "None") => (
  (rows || []).slice(0, 3).map(formatter).filter(Boolean).join(" | ") || empty
);
const ticketProofUrls = (ticket) => [
  ...(ticket.submitted_proof || []),
  ...(ticket.proof_urls || []),
  ...(ticket.evidence_urls || []),
  ...(ticket.additional_proof || []),
].filter(Boolean);
const reportText = (report) => (
  report && Object.keys(report).length
    ? Object.entries(report)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .slice(0, 6)
      .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
      .join(" | ")
    : "No result report"
);

function StatCard({ icon: Icon, label, value, color = "text-cyan" }) {
  return (
    <div className="glass rounded-xl border border-white/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] text-vapor uppercase">{label}</span>
      </div>
      <p className={`text-xl font-black font-mono ${color}`}>{value}</p>
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div className="px-5 py-10 text-center">
      <Archive className="w-10 h-10 text-vapor/30 mx-auto mb-3" />
      <p className="text-sm text-vapor">{label}</p>
    </div>
  );
}

function StatusPill({ status }) {
  const value = String(status || "unknown");
  const color =
    ["completed", "resolved", "approved", "active", "open", "ready"].includes(value) ? "bg-green/10 text-green border-green/20" :
    ["pending", "in_progress", "under_review", "registration", "live"].includes(value) ? "bg-cyan/10 text-cyan border-cyan/20" :
    ["cancelled", "rejected", "disputed", "score_conflict", "banned"].includes(value) ? "bg-red-500/10 text-red-400 border-red-500/20" :
    "bg-secondary text-vapor border-white/5";

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${color}`}>
      {statusText(value)}
    </span>
  );
}

function TournamentRewardPicker({ title, description, selectedIds = [], items = [], onToggle }) {
  return (
    <div className="rounded-xl border border-white/5 bg-secondary/40 p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-[10px] text-vapor uppercase font-bold">{title}</span>
        <span className="text-[10px] text-cyan font-mono font-bold">{selectedIds.length} selected</span>
      </div>
      <p className="text-xs text-vapor mb-3">{description}</p>
      {items.length > 0 ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
          {items.map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-all ${
                  selected ? "border-cyan/40 bg-cyan/10" : "border-white/5 bg-background/40 hover:border-white/10"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(item.id)}
                  className="accent-cyan"
                />
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="h-9 w-9 rounded object-cover bg-background" />
                ) : (
                  <div className="h-9 w-9 rounded bg-background flex items-center justify-center">
                    <Trophy className="h-4 w-4 text-cyan" />
                  </div>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{item.name}</span>
                  <span className="block truncate text-[10px] text-vapor capitalize">{marketplaceCategoryText(item.category)} - {item.rarity || "common"}</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-vapor">Create active knife, gun skin, or trophy items in Marketplace first.</p>
      )}
    </div>
  );
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [data, setData] = useState(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [marketplaceForm, setMarketplaceForm] = useState(defaultMarketplaceForm);
  const [editingMarketplaceId, setEditingMarketplaceId] = useState(null);
  const [tournamentForm, setTournamentForm] = useState(defaultTournamentForm);
  const [tournamentInviteSearch, setTournamentInviteSearch] = useState("");
  const [editingTournamentId, setEditingTournamentId] = useState(null);
  const [ticketReplyDrafts, setTicketReplyDrafts] = useState({});
  const [ticketNoteDrafts, setTicketNoteDrafts] = useState({});
  const [ticketResolutionDrafts, setTicketResolutionDrafts] = useState({});
  const [walletAdjustmentOpen, setWalletAdjustmentOpen] = useState(false);
  const [walletAdjustmentForm, setWalletAdjustmentForm] = useState(defaultWalletAdjustmentForm);
  const currentRole = effectiveRoleFor(currentUser);

  useEffect(() => {
    loadAdminData();
  }, []);

  const safeList = async (entityName) => {
    try {
      return await base44.entities[entityName].filter({}, "-created_date", 500);
    } catch (error) {
      console.warn(`Failed to load ${entityName}:`, error);
      return [];
    }
  };

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const me = await base44.auth.me().catch(() => null);
      setCurrentUser(me);

      if (!canAccessAdminPanel(effectiveRoleFor(me))) {
        setData(initialData);
        return;
      }

      await base44.functions.invoke("syncTournamentLifecycle", {}).catch(() => null);

      const [
        users,
        adminAlerts,
        tickets,
        disputes,
        wagers,
        rankedMatches,
        tournaments,
        tournamentMatches,
        wallets,
        withdrawals,
        marketplace,
        inventory,
        adminActions,
        bans,
        systemLogs,
        messages,
      ] = await Promise.all([
        safeList("User"),
        safeList("AdminAlert"),
        safeList("Ticket"),
        safeList("Dispute"),
        safeList("Wager"),
        safeList("RankedMatch"),
        safeList("Tournament"),
        safeList("TournamentMatch"),
        safeList("Wallet"),
        safeList("WithdrawalRequest"),
        safeList("MarketplaceItem"),
        safeList("UserInventory"),
        safeList("AdminAction"),
        safeList("Ban"),
        safeList("SystemLog"),
        safeList("Message"),
      ]);

      setData({
        users,
        adminAlerts,
        tickets,
        disputes,
        wagers,
        rankedMatches,
        tournaments,
        tournamentMatches,
        wallets,
        withdrawals,
        marketplace,
        inventory,
        adminActions,
        bans,
        systemLogs,
        messages,
      });
    } catch (error) {
      console.error("Failed to load admin data:", error);
      toast({ title: "Error", description: "Failed to load admin data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => (
    data.users.filter((user) => {
      const haystack = `${userName(user)} ${user.email || ""} ${user.role || ""}`.toLowerCase();
      return haystack.includes(searchQuery.toLowerCase());
    })
  ), [data.users, searchQuery]);

  const walletByUserId = useMemo(() => (
    Object.fromEntries(data.wallets.map((wallet) => [wallet.user_id, wallet]))
  ), [data.wallets]);

  const ticketById = useMemo(() => (
    Object.fromEntries(data.tickets.map((ticket) => [ticket.id, ticket]))
  ), [data.tickets]);

  const adminAlertRows = useMemo(() => (
    [...data.adminAlerts].sort((a, b) => {
      const openDiff = Number(isOpenAdminAlert(b)) - Number(isOpenAdminAlert(a));
      if (openDiff) return openDiff;
      return new Date(b.created_date || 0) - new Date(a.created_date || 0);
    })
  ), [data.adminAlerts]);

  const walletAdjustmentUsers = useMemo(() => (
    data.users.filter((user) => canAdjustUserWallet(currentRole, user.role || "user"))
  ), [data.users, currentRole]);

  const tournamentRewardItems = useMemo(() => (
    data.marketplace
      .filter((item) => tournamentRewardCategories.has(item.category) && item.is_active !== false && item.is_available !== false)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
  ), [data.marketplace]);

  const tournamentTrophyItems = useMemo(() => (
    tournamentRewardItems.filter((item) => item.category === "trophy")
  ), [tournamentRewardItems]);

  const sharedIpCount = (targetUser) => {
    const ips = new Set([
      targetUser.registration_ip,
      targetUser.last_login_ip,
      ...((targetUser.ip_history || []).map((entry) => entry.ip)),
    ].filter(Boolean));
    if (ips.size === 0) return 0;
    return data.users.filter((user) => user.id !== targetUser.id && [
      user.registration_ip,
      user.last_login_ip,
      ...((user.ip_history || []).map((entry) => entry.ip)),
    ].some((ip) => ips.has(ip))).length;
  };

  const auditRows = useMemo(() => ([
    ...data.adminActions.map((row) => ({
      id: `admin:${row.id}`,
      type: "AdminAction",
      action: row.action_type,
      actor: row.admin_name,
      target: row.target_username || row.target_user_id,
      date: row.created_date,
      details: row.description,
    })),
    ...data.systemLogs.map((row) => ({
      id: `system:${row.id}`,
      type: "SystemLog",
      action: row.action,
      actor: row.user_name,
      target: row.entity_type,
      date: row.created_date,
      details: row.details ? JSON.stringify(row.details) : "",
    })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))), [data.adminActions, data.systemLogs]);

  const stats = useMemo(() => ({
    totalUsers: data.users.length,
    openTickets: data.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length,
    pendingDisputes: data.disputes.filter((dispute) => ["pending", "under_review"].includes(dispute.status)).length,
    activeWagers: data.wagers.filter((wager) => ["open", "in_progress", "ready", "score_conflict"].includes(wager.status)).length,
    activeRanked: data.rankedMatches.filter((match) => ["open", "in_progress", "score_conflict"].includes(match.status)).length,
    activeTournaments: data.tournaments.filter((tournament) => ["live", "in_progress", "registration", "open"].includes(tournament.status)).length,
    openAdminAlerts: data.adminAlerts.filter(isOpenAdminAlert).length,
    pendingWithdrawals: data.withdrawals.filter((withdrawal) => withdrawal.status === "pending").length,
    walletTotal: data.wallets.reduce((sum, wallet) => sum + Number(wallet.available_balance || 0), 0),
  }), [data]);

  const messagesForTicket = (ticket) => {
    const rows = [
      ...(ticket.messages || []),
      ...data.messages.filter((message) => message.ticket_id === ticket.id || message.conversation_id === ticket.id),
    ];
    const seen = new Set();
    return rows
      .filter((message) => {
        const key = message.id || `${message.created_date}:${message.sender_id}:${message.content}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  };

  const invokeTicketAction = async (ticket, action, payload = {}, label = "Ticket updated") => {
    setBusyId(`ticket:${ticket.id}:${action}`);
    try {
      const response = await base44.functions.invoke(action, {
        ticket_id: ticket.id,
        ...payload,
      });
      if (!response.data?.success) {
        toast({ title: "Ticket action failed", description: response.data?.error || "Could not update ticket", variant: "destructive" });
        return false;
      }
      toast({ title: label });
      loadAdminData();
      return true;
    } catch (error) {
      toast({ title: "Ticket action failed", description: error.message || "Could not update ticket", variant: "destructive" });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleJoinTicket = (ticket) => invokeTicketAction(ticket, "joinTicket", {}, "Ticket joined");

  const handleAcknowledgeAlert = async (alert) => {
    setBusyId(`alert:${alert.id}:acknowledge`);
    try {
      const updated = await base44.entities.AdminAlert.update(alert.id, {
        status: "acknowledged",
        acknowledged_by: currentUser?.id,
        acknowledged_by_name: userName(currentUser),
        acknowledged_date: new Date().toISOString(),
      });
      setData((prev) => ({
        ...prev,
        adminAlerts: prev.adminAlerts.map((row) => (row.id === alert.id ? { ...row, ...updated } : row)),
      }));
      toast({ title: "Alert acknowledged" });
    } catch (error) {
      toast({ title: "Alert update failed", description: error.message || "Could not acknowledge alert.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleReplyTicket = async (ticket, internal = false) => {
    const source = internal ? ticketNoteDrafts : ticketReplyDrafts;
    const message = (source[ticket.id] || "").trim();
    if (!message) {
      toast({ title: internal ? "Note required" : "Reply required", description: "Add text before sending.", variant: "destructive" });
      return;
    }
    const sent = await invokeTicketAction(ticket, "replyTicket", { message, internal }, internal ? "Internal note saved" : "Reply sent");
    if (sent) {
      if (internal) setTicketNoteDrafts((prev) => ({ ...prev, [ticket.id]: "" }));
      else setTicketReplyDrafts((prev) => ({ ...prev, [ticket.id]: "" }));
    }
  };

  const handleResolveTicket = (ticket, action) => invokeTicketAction(ticket, "resolveTicket", {
    action,
    resolution: ticketResolutionDrafts[ticket.id] || "Resolved by staff",
  }, action ? "Ticket resolved and match updated" : "Ticket resolved");

  const handleReopenTicket = (ticket) => invokeTicketAction(ticket, "reopenTicket", {}, "Ticket reopened");

  const handleSetRole = async (targetUser, role) => {
    if (!canManageRoles(currentRole)) {
      toast({ title: "Not allowed", description: "Super Admin or CEO is required to manage roles.", variant: "destructive" });
      return;
    }

    setBusyId(`${targetUser.id}:${role}`);
    try {
      const response = await base44.functions.invoke("updateUserRole", {
        user_id: targetUser.id,
        role,
      });
      if (response.data?.success) {
        toast({ title: "Role updated", description: `${userName(targetUser)} is now ${role}.` });
        loadAdminData();
      } else {
        toast({ title: "Role update failed", description: response.data?.error || "Could not update role.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Role update failed", description: error.message || "Could not update role.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSetUserBadges = async (
    targetUser,
    preset,
    forceStream = Boolean(targetUser.force_stream_required || targetUser.stream_override_required),
    monitorCamRequired = Boolean(targetUser.monitor_cam_required || targetUser.required_monitor_cam || targetUser.moni_cam_required),
  ) => {
    if (!canManageWallets(currentRole)) {
      toast({ title: "Not allowed", description: "Admin or higher is required to manage badges.", variant: "destructive" });
      return;
    }

    const option = userBadgeOptions.find((row) => row.value === preset) || userBadgeOptions[0];
    setBusyId(`${targetUser.id}:badges`);
    try {
      const response = await base44.functions.invoke("updateUserBadges", {
        user_id: targetUser.id,
        badge_types: option.types,
        force_stream_required: forceStream,
        monitor_cam_required: monitorCamRequired,
      });
      if (response.data?.success) {
        toast({ title: "Badges updated", description: `${userName(targetUser)} badges saved.` });
        setData((prev) => ({
          ...prev,
          users: prev.users.map((user) => (user.id === targetUser.id ? { ...user, ...response.data.user } : user)),
        }));
      } else {
        toast({ title: "Badge update failed", description: response.data?.error || "Could not update badges.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Badge update failed", description: error.message || "Could not update badges.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSetTemporaryPassword = async (targetUser) => {
    if (!canManageWallets(currentRole)) {
      toast({ title: "Not allowed", description: "Admin or higher is required to manage passwords.", variant: "destructive" });
      return;
    }
    const temporaryPassword = window.prompt(
      `Enter a temporary password for ${userName(targetUser)} (minimum 8 characters):`,
      "",
    );
    if (temporaryPassword === null) return;
    if (temporaryPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    const confirmation = window.prompt("Enter the same temporary password again:", "");
    if (confirmation === null) return;
    if (temporaryPassword !== confirmation) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setBusyId(`${targetUser.id}:password`);
    try {
      const response = await base44.functions.invoke("setUserTemporaryPassword", {
        user_id: targetUser.id,
        temporary_password: temporaryPassword,
      });
      if (!response.data?.success) {
        toast({ title: "Password update failed", description: response.data?.error || "Could not set temporary password.", variant: "destructive" });
        return;
      }
      toast({
        title: "Temporary password set",
        description: `${userName(targetUser)} must create a new password after logging in.`,
      });
      setData((prev) => ({
        ...prev,
        users: prev.users.map((row) => (row.id === targetUser.id ? { ...row, ...response.data.user } : row)),
      }));
    } catch (error) {
      toast({ title: "Password update failed", description: error.message || "Could not set temporary password.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleGrantPremium = async (targetUser) => {
    if (!canGrantUserPremium(currentRole, targetUser?.role || "user")) {
      toast({ title: "Not allowed", description: "Admin or higher is required to manage this player's Premium access.", variant: "destructive" });
      return;
    }

    const verb = hasActivePremium(targetUser) ? "extend" : "give";
    const confirmed = window.confirm(
      `${verb === "extend" ? "Extend" : "Give"} Premium for ${userName(targetUser)} by 30 days?`,
    );
    if (!confirmed) return;

    setBusyId(`${targetUser.id}:premium`);
    try {
      const response = await base44.functions.invoke("adminGrantPremium", {
        user_id: targetUser.id,
      });
      if (!response.data?.success) {
        toast({ title: "Premium update failed", description: response.data?.error || "Could not grant Premium.", variant: "destructive" });
        return;
      }

      const updatedUser = response.data.user;
      setData((prev) => ({
        ...prev,
        users: prev.users.map((user) => (user.id === targetUser.id ? { ...user, ...updatedUser } : user)),
      }));
      toast({
        title: hasActivePremium(targetUser) ? "Premium extended" : "Premium granted",
        description: `${userName(targetUser)} now has Premium until ${formatDate(updatedUser.premium_expires)}.`,
      });
    } catch (error) {
      toast({ title: "Premium update failed", description: error.message || "Could not grant Premium.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleModerateUser = async (targetUser, action, duration) => {
    if (!canAccessAdminPanel(currentRole)) {
      toast({ title: "Not allowed", description: "Moderator or higher is required.", variant: "destructive" });
      return;
    }
    const reason = typeof window !== "undefined" ? window.prompt(`Reason for ${action.replace(/_/g, " ")}:`, "") : "";
    if (reason === null) return;

    setBusyId(`${targetUser.id}:${action}`);
    try {
      const response = await base44.functions.invoke("moderateUser", {
        user_id: targetUser.id,
        action,
        duration,
        reason: reason || action.replace(/_/g, " "),
      });
      if (response.data?.success) {
        toast({ title: "Moderation action saved", description: `${action.replace(/_/g, " ")} applied to ${userName(targetUser)}.` });
        loadAdminData();
      } else {
        toast({ title: "Moderation failed", description: response.data?.error || "Could not apply moderation action.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Moderation failed", description: error.message || "Could not apply moderation action.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const openWalletAdjustment = (targetUser, type) => {
    if (!canAddWalletAdjustment(currentRole)) {
      toast({ title: "Not allowed", description: "CEO or Super Admin is required.", variant: "destructive" });
      return;
    }
    if (!canAdjustUserWallet(currentRole, targetUser?.role || "user")) {
      toast({ title: "Not allowed", description: "Super Admin cannot adjust CEO accounts.", variant: "destructive" });
      return;
    }
    setWalletAdjustmentForm({
      user_id: targetUser.id,
      type,
      amount: "",
      reason: "",
    });
    setWalletAdjustmentOpen(true);
  };

  const resetWalletAdjustment = () => {
    setWalletAdjustmentForm(defaultWalletAdjustmentForm);
    setWalletAdjustmentOpen(false);
  };

  const handleSubmitWalletAdjustment = async (event) => {
    event.preventDefault();

    if (!canAddWalletAdjustment(currentRole)) {
      toast({ title: "Not allowed", description: "CEO or Super Admin is required.", variant: "destructive" });
      return;
    }

    const targetUser = data.users.find((user) => user.id === walletAdjustmentForm.user_id);
    if (!targetUser) {
      toast({ title: "User required", description: "Select a user before adding funds.", variant: "destructive" });
      return;
    }
    if (!canAdjustUserWallet(currentRole, targetUser.role || "user")) {
      toast({ title: "Not allowed", description: "Super Admin cannot adjust CEO accounts.", variant: "destructive" });
      return;
    }

    const amount = Number(walletAdjustmentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Invalid amount", description: "Amount must be positive.", variant: "destructive" });
      return;
    }
    if (!walletAdjustmentForm.reason.trim()) {
      toast({ title: "Reason required", description: "Add a reason for the adjustment.", variant: "destructive" });
      return;
    }

    setBusyId("wallet-adjustment");
    try {
      const response = await base44.functions.invoke("adminAdjustWallet", {
        user_id: targetUser.id,
        type: walletAdjustmentForm.type,
        amount,
        reason: walletAdjustmentForm.reason.trim(),
      });

      if (response.data?.success) {
        const updatedUser = response.data.user;
        const updatedWallet = response.data.wallet;
        const action = response.data.action;
        setData((prev) => ({
          ...prev,
          users: updatedUser ? prev.users.map((user) => (user.id === updatedUser.id ? { ...user, ...updatedUser } : user)) : prev.users,
          wallets: updatedWallet
            ? prev.wallets.some((wallet) => wallet.id === updatedWallet.id)
              ? prev.wallets.map((wallet) => (wallet.id === updatedWallet.id ? updatedWallet : wallet))
              : [updatedWallet, ...prev.wallets]
            : prev.wallets,
          adminActions: action ? [action, ...prev.adminActions.filter((row) => row.id !== action.id)] : prev.adminActions,
        }));
        toast({
          title: `${walletAdjustmentForm.type === "money" ? "Money" : "Credits"} added`,
          description: `${walletAdjustmentForm.type === "money" ? formatMoney(amount) : `${amount.toLocaleString()} credits`} added to ${userName(targetUser)}.`,
        });
        resetWalletAdjustment();
      } else {
        toast({ title: "Adjustment failed", description: response.data?.error || "Could not add funds.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Adjustment failed", description: error.message || "Could not add funds.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleWithdrawal = async (withdrawal, status) => {
    if (!canManageWallets(currentRole)) {
      toast({ title: "Not allowed", description: "Admin or higher is required to process withdrawals.", variant: "destructive" });
      return;
    }

    setBusyId(`${withdrawal.id}:${status}`);
    try {
      const response = await base44.functions.invoke("processWithdrawal", {
        withdrawal_id: withdrawal.id,
        status,
        notes: `Processed from admin panel by ${userName(currentUser)}`,
      });

      if (response.data?.success) {
        toast({ title: `Withdrawal ${status}` });
        loadAdminData();
      } else {
        toast({ title: "Withdrawal failed", description: response.data?.error || "Could not process withdrawal.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Withdrawal failed", description: error.message || "Could not process withdrawal.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleGenerateBracket = async (tournament) => {
    setBusyId(`bracket:${tournament.id}`);
    try {
      const response = await base44.functions.invoke("generateTournamentBracket", { tournament_id: tournament.id });
      if (response.data?.success) {
        toast({ title: "Bracket generated", description: `${response.data.match_count} matches created.` });
        loadAdminData();
      } else {
        toast({ title: "Bracket failed", description: response.data?.error || "Could not generate bracket.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Bracket failed", description: error.message || "Could not generate bracket.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleModerateDispute = async (dispute, action) => {
    const notes = typeof window !== "undefined" ? window.prompt(`Notes for ${action.replace(/_/g, " ")}:`, "") : "";
    if (notes === null) return;
    setBusyId(`dispute:${dispute.id}:${action}`);
    try {
      const response = await base44.functions.invoke("moderateDispute", {
        dispute_id: dispute.id,
        action,
        notes,
      });
      if (response.data?.success) {
        toast({ title: "Dispute resolved", description: action.replace(/_/g, " ") });
        loadAdminData();
      } else {
        toast({ title: "Dispute action failed", description: response.data?.error || "Could not resolve dispute.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Dispute action failed", description: error.message || "Could not resolve dispute.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const tournamentPayload = () => {
    const entryType = tournamentForm.entry_type || (tournamentForm.is_premium_only ? "premium" : "free");
    const rewardItemIds = [...new Set((tournamentForm.reward_item_ids || []).filter(Boolean))];
    const eliminationRewardItemIds = [...new Set((tournamentForm.elimination_reward_item_ids || []).filter(Boolean))];
    const placementTrophyItemIds = {
      1: [...new Set((tournamentForm.placement_trophy_item_ids?.[1] || []).filter(Boolean))],
      2: [...new Set((tournamentForm.placement_trophy_item_ids?.[2] || []).filter(Boolean))],
      3: [...new Set((tournamentForm.placement_trophy_item_ids?.[3] || []).filter(Boolean))],
    };
    const marketplaceById = Object.fromEntries(data.marketplace.map((item) => [item.id, item]));
    const itemSnapshot = (ids) => ids.map((id) => marketplaceById[id]).filter(Boolean).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      rarity: item.rarity,
      image_url: item.image_url,
    }));
    const rewardItems = itemSnapshot(rewardItemIds);
    const eliminationRewardItems = itemSnapshot(eliminationRewardItemIds);
    const placementTrophyItems = {
      1: itemSnapshot(placementTrophyItemIds[1]),
      2: itemSnapshot(placementTrophyItemIds[2]),
      3: itemSnapshot(placementTrophyItemIds[3]),
    };
    const firstPlacePrize = Number(tournamentForm.first_place_prize || 0);
    const secondPlacePrize = Number(tournamentForm.second_place_prize || 0);
    const sndMaps = parseMapList(tournamentForm.snd_maps, defaultTournamentSndMaps);
    const hpMaps = parseMapList(tournamentForm.hp_maps, defaultTournamentHpMaps);
    const overloadMaps = parseMapList(tournamentForm.overload_maps, defaultTournamentOverloadMaps);
    return {
      name: tournamentForm.name.trim(),
      image_url: tournamentForm.image_url.trim(),
      game_mode: tournamentForm.game_mode,
      team_size: tournamentForm.team_size,
      entry_fee: Number(tournamentForm.entry_fee || 0),
      entry_type: entryType,
      prize_pool: Number(tournamentForm.prize_pool || 0),
      prize_distribution: {
        first_amount: Number.isFinite(firstPlacePrize) ? firstPlacePrize : 0,
        second_amount: Number.isFinite(secondPlacePrize) ? secondPlacePrize : 0,
      },
      map_pools: {
        snd: sndMaps,
        hp: hpMaps,
        overload: overloadMaps,
      },
      maps: sndMaps,
      max_teams: Number(tournamentForm.max_teams || 0),
      status: tournamentForm.status,
      format: tournamentForm.bracket_type,
      bracket_type: tournamentForm.bracket_type,
      registration_end: tournamentForm.registration_end ? new Date(tournamentForm.registration_end).toISOString() : undefined,
      start_date: tournamentForm.start_date ? new Date(tournamentForm.start_date).toISOString() : undefined,
      is_premium_only: entryType === "premium" || entryType === "credits_premium",
      invite_only: tournamentForm.invite_only || entryType === "invitational",
      invited_user_ids: tournamentForm.invite_only || entryType === "invitational"
        ? [...new Set(tournamentForm.invited_user_ids || [])]
        : [],
      reward_item_ids: rewardItemIds,
      reward_items: rewardItems,
      elimination_reward_item_ids: eliminationRewardItemIds,
      elimination_reward_items: eliminationRewardItems,
      placement_trophy_item_ids: placementTrophyItemIds,
      placement_trophy_items: placementTrophyItems,
    };
  };

  const handleSubmitTournament = async (event) => {
    event.preventDefault();

    if (!canManageWallets(currentRole)) {
      toast({ title: "Not allowed", description: "Admin or higher is required to create tournaments.", variant: "destructive" });
      return;
    }

    if (!tournamentForm.name.trim()) {
      toast({ title: "Tournament name required", description: "Add a name before creating the tournament.", variant: "destructive" });
      return;
    }

    setBusyId("tournament:create");
    try {
      const payload = tournamentPayload();
      const response = editingTournamentId
        ? await base44.functions.invoke("updateTournament", { tournament_id: editingTournamentId, patch: payload })
        : await base44.functions.invoke("createTournament", payload);
      if (!response.data?.success) {
        toast({ title: "Save failed", description: response.data?.error || "Could not save tournament.", variant: "destructive" });
        return;
      }
      toast({ title: editingTournamentId ? "Tournament updated" : "Tournament created", description: `${payload.name} is saved.` });
      setTournamentForm(defaultTournamentForm);
      setEditingTournamentId(null);
      loadAdminData();
    } catch (error) {
      toast({ title: "Create failed", description: error.message || "Could not create tournament.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleEditTournament = (tournament) => {
    setEditingTournamentId(tournament.id);
    setTournamentForm({
      ...defaultTournamentForm,
      name: tournament.name || "",
      image_url: tournament.image_url || tournament.banner_url || "",
      game_mode: tournament.game_mode || "snd",
      team_size: tournament.team_size || "2v2",
      entry_fee: String(tournament.entry_fee ?? 0),
      entry_type: tournament.entry_type || (tournament.is_premium_only ? "premium" : (Number(tournament.entry_fee || 0) > 0 ? "credits" : "free")),
      prize_pool: String(tournament.prize_pool ?? 0),
      first_place_prize: tournamentPlacementPrizeValue(tournament, 1),
      second_place_prize: tournamentPlacementPrizeValue(tournament, 2),
      snd_maps: mapListText(tournament.map_pools?.snd || tournament.snd_map_pool || tournament.snd_maps || tournament.maps, defaultTournamentSndMaps),
      hp_maps: mapListText(tournament.map_pools?.hp || tournament.hp_map_pool || tournament.hp_maps, defaultTournamentHpMaps),
      overload_maps: mapListText(tournament.map_pools?.overload || tournament.overload_map_pool || tournament.overload_maps, defaultTournamentOverloadMaps),
      max_teams: String(tournament.max_teams ?? 8),
      bracket_type: tournament.bracket_type || tournament.format || "single_elimination",
      status: tournament.status || "open",
      registration_end: tournament.registration_end ? new Date(tournament.registration_end).toISOString().slice(0, 16) : "",
      start_date: tournament.start_date ? new Date(tournament.start_date).toISOString().slice(0, 16) : "",
      is_premium_only: Boolean(tournament.is_premium_only),
      invite_only: tournament.invite_only === true || tournament.entry_type === "invitational",
      invited_user_ids: tournament.invited_user_ids || [],
      reward_item_ids: tournamentRewardIds(tournament),
      elimination_reward_item_ids: tournamentEliminationRewardIds(tournament),
      placement_trophy_item_ids: {
        1: tournamentPlacementTrophyIds(tournament, 1),
        2: tournamentPlacementTrophyIds(tournament, 2),
        3: tournamentPlacementTrophyIds(tournament, 3),
      },
    });
  };

  const resetTournamentForm = () => {
    setEditingTournamentId(null);
    setTournamentForm(defaultTournamentForm);
  };

  const toggleTournamentReward = (field, itemId) => {
    setTournamentForm((prev) => {
      const rewardIds = new Set(prev[field] || []);
      if (rewardIds.has(itemId)) rewardIds.delete(itemId);
      else rewardIds.add(itemId);
      return { ...prev, [field]: [...rewardIds] };
    });
  };

  const togglePlacementTrophyReward = (placement, itemId) => {
    setTournamentForm((prev) => {
      const rewardIds = new Set(prev.placement_trophy_item_ids?.[placement] || []);
      if (rewardIds.has(itemId)) rewardIds.delete(itemId);
      else rewardIds.add(itemId);
      return {
        ...prev,
        placement_trophy_item_ids: {
          1: placement === 1 ? [...rewardIds] : (prev.placement_trophy_item_ids?.[1] || []),
          2: placement === 2 ? [...rewardIds] : (prev.placement_trophy_item_ids?.[2] || []),
          3: placement === 3 ? [...rewardIds] : (prev.placement_trophy_item_ids?.[3] || []),
        },
      };
    });
  };

  const handleTournamentAction = async (tournament, action, payload = {}) => {
    const labels = {
      startTournament: "started",
      cancelTournament: "cancelled",
      closeTournamentRegistration: "registration closed",
      extendTournamentRegistration: "registration extended",
      deleteTournament: "deleted",
    };
    if (action === "deleteTournament" && typeof window !== "undefined" && !window.confirm(`Delete ${tournament.name}?`)) return;

    setBusyId(`${action}:${tournament.id}`);
    try {
      const response = await base44.functions.invoke(action, {
        tournament_id: tournament.id,
        ...payload,
      });
      if (response.data?.success) {
        toast({ title: `Tournament ${labels[action] || "updated"}`, description: tournament.name });
        if (editingTournamentId === tournament.id && action === "deleteTournament") resetTournamentForm();
        loadAdminData();
      } else {
        toast({ title: "Tournament action failed", description: response.data?.error || "Could not update tournament.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Tournament action failed", description: error.message || "Could not update tournament.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const manualTournamentStatusPatch = (tournament, status) => {
    const timestamp = new Date().toISOString();
    if (status === "open" || status === "registration") {
      return {
        status,
        registration_locked: false,
        cancelled_date: null,
        cancelled_by: null,
        cancelled_by_name: null,
        cancel_reason: null,
        completed_date: null,
        completed_by: null,
        completed_by_name: null,
        winner_id: null,
        winner_name: null,
        runner_up_id: null,
        runner_up_name: null,
        reopened_date: timestamp,
        reopened_by: currentUser?.id,
        reopened_by_name: userName(currentUser),
      };
    }
    if (status === "closed") {
      return {
        status,
        registration_locked: true,
        registration_closed_date: tournament.registration_closed_date || timestamp,
        registration_closed_by: currentUser?.id,
        registration_closed_by_name: userName(currentUser),
      };
    }
    if (status === "completed") {
      return {
        status,
        registration_locked: true,
        completed_date: tournament.completed_date || timestamp,
        completed_by: currentUser?.id,
        completed_by_name: userName(currentUser),
      };
    }
    return { status };
  };

  const handleSetTournamentStatus = async (tournament, status) => {
    if (tournament.status === status) return;
    const labels = {
      open: "reopened",
      registration: "set to registration",
      closed: "closed",
      completed: "completed",
      cancelled: "cancelled",
    };
    const needsConfirm = ["completed", "cancelled"].includes(status);
    if (needsConfirm && typeof window !== "undefined" && !window.confirm(`Set ${tournament.name} to ${statusText(status)}?`)) return;

    setBusyId(`status:${status}:${tournament.id}`);
    try {
      const response = await base44.functions.invoke("updateTournament", {
        tournament_id: tournament.id,
        patch: manualTournamentStatusPatch(tournament, status),
      });
      if (response.data?.success) {
        toast({ title: `Tournament ${labels[status] || "updated"}`, description: tournament.name });
        loadAdminData();
      } else {
        toast({ title: "Tournament status failed", description: response.data?.error || "Could not update tournament.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Tournament status failed", description: error.message || "Could not update tournament.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const marketplacePayload = () => {
    const unlockType = marketplaceForm.unlock_type || (marketplaceForm.is_premium_only ? "premium" : "marketplace");
    return {
      name: marketplaceForm.name.trim(),
      description: marketplaceForm.description.trim(),
      image_url: marketplaceForm.image_url.trim(),
      category: marketplaceForm.category,
      rarity: marketplaceForm.rarity,
      price_credits: Number(marketplaceForm.price_credits || 0),
      price_cash: Number(marketplaceForm.price_cash || 0),
      stock_quantity: marketplaceForm.stock_quantity === "" ? undefined : Number(marketplaceForm.stock_quantity),
      unlock_type: unlockType,
      unlock_requirement: marketplaceForm.unlock_requirement.trim(),
      is_limited: marketplaceForm.is_limited,
      is_featured: marketplaceForm.is_featured,
      show_in_marketplace: marketplaceForm.show_in_marketplace,
      is_premium_only: unlockType === "premium",
      is_tradeable: marketplaceForm.is_tradeable,
      is_available: marketplaceForm.is_active,
      is_active: marketplaceForm.is_active,
    };
  };

  const resetMarketplaceForm = () => {
    setMarketplaceForm(defaultMarketplaceForm);
    setEditingMarketplaceId(null);
  };

  const handleSubmitMarketplaceItem = async (event) => {
    event.preventDefault();

    if (!canManageWallets(currentRole)) {
      toast({ title: "Not allowed", description: "Admin or higher is required to manage marketplace items.", variant: "destructive" });
      return;
    }

    if (!marketplaceForm.name.trim()) {
      toast({ title: "Item name required", description: "Add a name before creating the marketplace item.", variant: "destructive" });
      return;
    }

    const busyKey = editingMarketplaceId ? `marketplace:update:${editingMarketplaceId}` : "marketplace:create";
    setBusyId(busyKey);
    try {
      const payload = marketplacePayload();
      const item = editingMarketplaceId
        ? await base44.entities.MarketplaceItem.update(editingMarketplaceId, { ...payload, updated_date: new Date().toISOString() })
        : await base44.entities.MarketplaceItem.create({ ...payload, created_date: new Date().toISOString() });
      await base44.entities.AdminAction.create({
        admin_id: currentUser.id,
        admin_name: userName(currentUser),
        admin_role: currentUser.role,
        action_type: editingMarketplaceId ? "marketplace_update" : "marketplace_create",
        description: `${editingMarketplaceId ? "Updated" : "Created"} marketplace item ${payload.name}`,
        details: { item_id: item?.id, ...payload },
      }).catch((error) => console.warn("Failed to write marketplace audit action:", error));
      toast({ title: editingMarketplaceId ? "Marketplace item updated" : "Marketplace item created", description: `${payload.name} is saved.` });
      resetMarketplaceForm();
      loadAdminData();
    } catch (error) {
      toast({ title: "Save failed", description: error.message || "Could not save marketplace item.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleEditMarketplaceItem = (item) => {
    setEditingMarketplaceId(item.id);
    setMarketplaceForm({
      ...defaultMarketplaceForm,
      name: item.name || "",
      description: item.description || "",
      image_url: item.image_url || "",
      category: item.category || "cosmetic",
      rarity: item.rarity || "common",
      price_credits: String(item.price_credits ?? 0),
      price_cash: String(item.price_cash ?? 0),
      stock_quantity: item.stock_quantity === undefined || item.stock_quantity === null ? "" : String(item.stock_quantity),
      unlock_type: item.unlock_type || (item.is_premium_only ? "premium" : "marketplace"),
      unlock_requirement: item.unlock_requirement || "",
      is_limited: Boolean(item.is_limited),
      is_featured: item.is_featured === true,
      show_in_marketplace: item.show_in_marketplace !== false,
      is_premium_only: Boolean(item.is_premium_only),
      is_tradeable: item.is_tradeable !== false,
      is_active: item.is_active !== false && item.is_available !== false,
    });
  };

  const handleToggleMarketplaceItem = async (item) => {
    const nextActive = !(item.is_active !== false && item.is_available !== false);
    setBusyId(`marketplace:toggle:${item.id}`);
    try {
      await base44.entities.MarketplaceItem.update(item.id, {
        is_active: nextActive,
        is_available: nextActive,
        updated_date: new Date().toISOString(),
      });
      toast({ title: nextActive ? "Item activated" : "Item deactivated", description: item.name });
      loadAdminData();
    } catch (error) {
      toast({ title: "Toggle failed", description: error.message || "Could not update item status.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteMarketplaceItem = async (item) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${item.name}? This cannot be undone.`)) return;
    setBusyId(`marketplace:delete:${item.id}`);
    try {
      await base44.entities.MarketplaceItem.delete(item.id);
      await base44.entities.AdminAction.create({
        admin_id: currentUser.id,
        admin_name: userName(currentUser),
        admin_role: currentUser.role,
        action_type: "marketplace_delete",
        description: `Deleted marketplace item ${item.name}`,
        details: { item_id: item.id, name: item.name },
      }).catch((error) => console.warn("Failed to write marketplace audit action:", error));
      if (editingMarketplaceId === item.id) resetMarketplaceForm();
      toast({ title: "Marketplace item deleted", description: item.name });
      loadAdminData();
    } catch (error) {
      toast({ title: "Delete failed", description: error.message || "Could not delete marketplace item.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading admin console...</p>
        </div>
      </div>
    );
  }

  if (!canAccessAdminPanel(currentRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-black mb-2">Admin Access Required</h1>
          <p className="text-sm text-vapor">This console is available to moderators and higher staff roles.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian py-6">
      <div className="max-w-[1800px] mx-auto px-4 lg:px-6">
        <div className="glass rounded-xl border border-white/5 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-cyan">Admin Console</h1>
              <p className="text-xs text-vapor mt-1">Users, roles, support, matches, economy, inventory, and audit logs.</p>
            </div>
            <div className="flex items-center gap-3">
              <RoleBadge role={currentRole} />
              <button onClick={loadAdminData} className="px-4 py-2 bg-secondary text-vapor text-xs font-bold rounded-lg hover:bg-white/10">
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4 mb-6">
          <StatCard icon={Users} label="Users" value={stats.totalUsers} />
          <StatCard icon={BellRing} label="Alerts" value={stats.openAdminAlerts} color="text-red-400" />
          <StatCard icon={Ticket} label="Open Tickets" value={stats.openTickets} color="text-orange" />
          <StatCard icon={Gavel} label="Disputes" value={stats.pendingDisputes} color="text-yellow-400" />
          <StatCard icon={BadgeDollarSign} label="Wagers" value={stats.activeWagers} color="text-green" />
          <StatCard icon={Swords} label="Ranked" value={stats.activeRanked} color="text-cyan" />
          <StatCard icon={Trophy} label="Tournaments" value={stats.activeTournaments} color="text-purple-400" />
          <StatCard icon={Landmark} label="Withdrawals" value={stats.pendingWithdrawals} color="text-red-400" />
          <StatCard icon={CreditCard} label="Wallet Total" value={formatMoney(stats.walletTotal)} color="text-green" />
        </div>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 whitespace-nowrap transition-all ${
                activeTab === tab.id ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="glass rounded-xl border border-white/5 overflow-hidden">
          {activeTab === "dashboard" && (
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">Operational Overview</h2>
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryPanel title="Support Queue" rows={[
                  ["Open alerts", stats.openAdminAlerts],
                  ["Open tickets", stats.openTickets],
                  ["Pending disputes", stats.pendingDisputes],
                ]} />
                <SummaryPanel title="Match Activity" rows={[
                  ["Active wagers", stats.activeWagers],
                  ["Active ranked", stats.activeRanked],
                  ["Tournament matches", data.tournamentMatches.length],
                ]} />
                <SummaryPanel title="Economy" rows={[
                  ["Wallet total", formatMoney(stats.walletTotal)],
                  ["Pending withdrawals", stats.pendingWithdrawals],
                  ["Marketplace items", data.marketplace.length],
                ]} />
                <SummaryPanel title="Inventory" rows={[
                  ["Owned items", data.inventory.length],
                  ["Audit actions", data.adminActions.length],
                  ["System logs", data.systemLogs.length],
                ]} />
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <div className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-bold">Users</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vapor" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search users..."
                    className="pl-10 pr-4 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                  />
                </div>
              </div>
              {walletAdjustmentOpen && canAddWalletAdjustment(currentRole) && (
                <form onSubmit={handleSubmitWalletAdjustment} className="mb-4 rounded-lg border border-white/5 bg-secondary/30 p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">User</span>
                      <select
                        value={walletAdjustmentForm.user_id}
                        onChange={(event) => setWalletAdjustmentForm((prev) => ({ ...prev, user_id: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        <option value="">Select user</option>
                        {walletAdjustmentUsers.map((user) => (
                          <option key={user.id} value={user.id}>{userName(user)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Type</span>
                      <select
                        value={walletAdjustmentForm.type}
                        onChange={(event) => setWalletAdjustmentForm((prev) => ({ ...prev, type: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        <option value="credits">Credits</option>
                        <option value="money">Money</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Amount</span>
                      <input
                        type="number"
                        min="0"
                        step={walletAdjustmentForm.type === "money" ? "0.01" : "1"}
                        value={walletAdjustmentForm.amount}
                        onChange={(event) => setWalletAdjustmentForm((prev) => ({ ...prev, amount: event.target.value }))}
                        placeholder="Amount"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Reason</span>
                      <input
                        value={walletAdjustmentForm.reason}
                        onChange={(event) => setWalletAdjustmentForm((prev) => ({ ...prev, reason: event.target.value }))}
                        placeholder="Reason"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetWalletAdjustment}
                      className="px-3 py-1.5 bg-secondary text-vapor text-xs font-bold rounded hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busyId === "wallet-adjustment"}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-cyan/10 text-cyan text-xs font-bold rounded border border-cyan/20 hover:bg-cyan/20 disabled:opacity-50"
                    >
                      {busyId === "wallet-adjustment" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Add
                    </button>
                  </div>
                </form>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-vapor uppercase">
                      <th className="text-left py-3 px-4">User</th>
                      <th className="text-left py-3 px-4">Role</th>
                      <th className="text-left py-3 px-4">Badges</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-left py-3 px-4">Wallet</th>
                      <th className="text-left py-3 px-4">IP History</th>
                      <th className="text-left py-3 px-4">Joined</th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-sm">{userName(user)}</p>
                          <p className="text-xs text-vapor">{user.email}</p>
                        </td>
                        <td className="py-3 px-4"><RoleBadge role={user.role || "user"} /></td>
                        <td className="py-3 px-4 min-w-[220px]">
                          <div className="space-y-2">
                            <UserBadges user={user} size="xs" />
                            {canManageWallets(currentRole) && (
                              <div className="flex flex-col gap-1.5">
                                <select
                                  value={userBadgePreset(user)}
                                  onChange={(event) => handleSetUserBadges(
                                    user,
                                    event.target.value,
                                    Boolean(user.force_stream_required || user.stream_override_required),
                                    Boolean(user.monitor_cam_required || user.required_monitor_cam || user.moni_cam_required),
                                  )}
                                  disabled={busyId === `${user.id}:badges`}
                                  className="w-full px-2 py-1.5 bg-secondary rounded text-xs border border-white/5 focus:border-cyan/30 focus:outline-none disabled:opacity-50"
                                >
                                  {userBadgeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                                <label className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-vapor">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(user.force_stream_required || user.stream_override_required)}
                                    onChange={(event) => handleSetUserBadges(
                                      user,
                                      userBadgePreset(user),
                                      event.target.checked,
                                      Boolean(user.monitor_cam_required || user.required_monitor_cam || user.moni_cam_required),
                                    )}
                                    disabled={busyId === `${user.id}:badges`}
                                    className="accent-orange"
                                  />
                                  Force stream
                                </label>
                                <label className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-vapor">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(user.monitor_cam_required || user.required_monitor_cam || user.moni_cam_required)}
                                    onChange={(event) => handleSetUserBadges(
                                      user,
                                      userBadgePreset(user),
                                      Boolean(user.force_stream_required || user.stream_override_required),
                                      event.target.checked,
                                    )}
                                    disabled={busyId === `${user.id}:badges`}
                                    className="accent-red-500"
                                  />
                                  Monitor cam
                                </label>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 min-w-[155px]">
                          <div className="flex flex-col items-start gap-1.5">
                            <StatusPill status={user.is_banned ? "banned" : "active"} />
                            {hasActivePremium(user) && (
                              <span className="inline-flex items-center gap-1 rounded-md border border-orange/25 bg-orange/10 px-2 py-1 text-[10px] font-bold text-orange">
                                <Crown className="h-3 w-3" /> Premium until {user.premium_expires ? new Date(user.premium_expires).toLocaleDateString() : "active"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm font-mono">{formatMoney(walletByUserId[user.id]?.available_balance ?? 0)}</td>
                        <td className="py-3 px-4 text-xs text-vapor max-w-[180px] truncate" title={ipHistoryText(user)}>
                          {ipHistoryText(user)}
                          {sharedIpCount(user) > 0 && <span className="ml-2 text-orange">Shared: {sharedIpCount(user)}</span>}
                        </td>
                        <td className="py-3 px-4 text-sm text-vapor">{formatDate(user.account_created_date)}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link to={`/profile/${user.username || user.id}`} className="text-xs text-cyan hover:underline">View</Link>
                            {canAdjustUserWallet(currentRole, user.role || "user") && (
                              <>
                                <button onClick={() => openWalletAdjustment(user, "credits")} className="text-xs text-green hover:underline">Add Credits</button>
                                <button onClick={() => openWalletAdjustment(user, "money")} className="text-xs text-cyan hover:underline">Add Money</button>
                              </>
                            )}
                            {canManageWallets(currentRole) && (
                              <>
                                {canGrantUserPremium(currentRole, user.role || "user") && (
                                  <button
                                    type="button"
                                    onClick={() => handleGrantPremium(user)}
                                    disabled={busyId === `${user.id}:premium`}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-orange hover:underline disabled:opacity-50"
                                  >
                                    {busyId === `${user.id}:premium`
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Crown className="h-3 w-3" />}
                                    {hasActivePremium(user) ? "Extend Premium +30d" : "Give Premium 30d"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleSetTemporaryPassword(user)}
                                  disabled={busyId === `${user.id}:password`}
                                  className="inline-flex items-center gap-1 text-xs text-pink-400 hover:underline disabled:opacity-50"
                                >
                                  {busyId === `${user.id}:password`
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <KeyRound className="h-3 w-3" />}
                                  Set Password
                                </button>
                              </>
                            )}
                            <button onClick={() => handleModerateUser(user, "warning")} className="text-xs text-yellow-400 hover:underline">Warn</button>
                            <button onClick={() => handleModerateUser(user, "suspension", "24h")} className="text-xs text-orange hover:underline">Suspend 24h</button>
                            <button onClick={() => handleModerateUser(user, "temporary_ban", "24h")} className="text-xs text-orange hover:underline">24h Ban</button>
                            <button onClick={() => handleModerateUser(user, "temporary_ban", "3d")} className="text-xs text-red-400 hover:underline">3d Ban</button>
                            <button onClick={() => handleModerateUser(user, "temporary_ban", "7d")} className="text-xs text-red-400 hover:underline">7d Ban</button>
                            <button onClick={() => handleModerateUser(user, "temporary_ban", "14d")} className="text-xs text-red-400 hover:underline">14d Ban</button>
                            <button onClick={() => handleModerateUser(user, "temporary_ban", "30d")} className="text-xs text-red-400 hover:underline">30d Ban</button>
                            <button onClick={() => handleModerateUser(user, "ban", "permanent")} className="text-xs text-red-400 hover:underline">Permanent Ban</button>
                            <button onClick={() => handleModerateUser(user, "email_ban")} className="text-xs text-red-400 hover:underline">Email Ban</button>
                            {user.is_banned && <button onClick={() => handleModerateUser(user, "remove_ban")} className="text-xs text-green hover:underline">Unban</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "roles" && (
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">Role Management</h2>
              <div className="space-y-3">
                {filteredUsers.map((user) => (
                  <div key={user.id} className="border border-white/5 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">{userName(user)}</p>
                      <p className="text-xs text-vapor">{user.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RoleBadge role={user.role || "user"} />
                      {roleOptions.map((role) => (
                        <button
                          key={role}
                          onClick={() => handleSetRole(user, role)}
                          disabled={
                            !canManageRoles(currentRole) ||
                            (rolePowerFor(currentRole) <= rolePowerFor(user.role) && currentRole !== "ceo") ||
                            (rolePowerFor(currentRole) <= rolePowerFor(role) && currentRole !== "ceo") ||
                            busyId === `${user.id}:${role}` ||
                            user.role === role
                          }
                          className="px-3 py-1.5 bg-secondary text-vapor text-[10px] font-bold rounded border border-white/5 hover:bg-white/10 disabled:opacity-40"
                        >
                          {busyId === `${user.id}:${role}` ? <Loader2 className="w-3 h-3 animate-spin" /> : role.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "alerts" && (
            <ListSection
              title="Admin Alerts"
              rows={adminAlertRows}
              empty="No admin alerts."
              render={(alert) => {
                const ticket = ticketById[alert.ticket_id];
                const isOpen = isOpenAdminAlert(alert);
                const actionUrl = adminAlertActionUrl(alert, ticket);
                return (
                  <div className={`px-5 py-4 ${isOpen ? "bg-red-500/[0.03]" : ""}`}>
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <StatusPill status={alert.status || "open"} />
                          <StatusPill status={alert.priority || "high"} />
                          {alert.match_type && <StatusPill status={alert.match_type} />}
                        </div>
                        <p className="font-semibold text-sm">{alert.subject || "Admin request"}</p>
                        <p className="text-xs text-vapor">From: {alert.username || alert.requested_by_name || "Unknown"} - {formatDate(alert.created_date)}</p>
                        {alert.message && <p className="text-sm text-foreground/80 mt-2 whitespace-pre-line">{alert.message}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Link
                          to={actionUrl}
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan/10 text-cyan text-xs font-bold rounded border border-cyan/20 hover:bg-cyan/20"
                        >
                          Open Room
                        </Link>
                        {ticket && (
                          <button
                            onClick={() => handleJoinTicket(ticket)}
                            disabled={busyId === `ticket:${ticket.id}:joinTicket`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange/10 text-orange text-xs font-bold rounded border border-orange/20 hover:bg-orange/20 disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> {busyId === `ticket:${ticket.id}:joinTicket` ? "Joining..." : "Join Ticket"}
                          </button>
                        )}
                        {isOpen && (
                          <button
                            onClick={() => handleAcknowledgeAlert(alert)}
                            disabled={busyId === `alert:${alert.id}:acknowledge`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary text-vapor text-xs font-bold rounded border border-white/5 hover:bg-white/10 disabled:opacity-50"
                          >
                            {busyId === `alert:${alert.id}:acknowledge` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                    <RowGrid compact columns={[
                      ["Ticket", ticket ? `#${String(ticket.id).slice(-8)}` : "N/A"],
                      ["Match", alert.related_entity_id ? `#${String(alert.related_entity_id).slice(-8)}` : ticket?.match_id ? `#${String(ticket.match_id).slice(-8)}` : "N/A"],
                      ["Teams", ticket?.team_a_name || ticket?.team_b_name ? `${ticket.team_a_name || "Team A"} vs ${ticket.team_b_name || "Team B"}` : "N/A"],
                      ["Assigned", ticket?.assigned_admin_name || "Unassigned"],
                      ["Acknowledged", alert.acknowledged_by_name || "No"],
                    ]} />
                  </div>
                );
              }}
            />
          )}

          {activeTab === "tickets" && (
            <ListSection
              title="Support Tickets"
              rows={data.tickets}
              empty="No support tickets."
              render={(ticket) => {
                const messages = messagesForTicket(ticket);
                const notes = ticket.internal_notes || [];
                const proofUrls = ticketProofUrls(ticket);
                const isResolved = ["resolved", "closed"].includes(ticket.status);
                return (
                  <div className="px-5 py-4 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <StatusPill status={ticket.status} />
                          <StatusPill status={ticket.priority} />
                          {ticket.requested_admin && <StatusPill status="admin request" />}
                        </div>
                        <p className="font-semibold text-sm">{ticket.subject}</p>
                        <p className="text-xs text-vapor">From: {ticket.username} - {ticket.category}</p>
                        <p className="text-sm text-foreground/80 mt-2 whitespace-pre-line">{ticket.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {!isResolved && (
                          <button
                            onClick={() => handleJoinTicket(ticket)}
                            disabled={busyId === `ticket:${ticket.id}:joinTicket`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan/10 text-cyan text-xs font-bold rounded hover:bg-cyan/20 disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" /> {busyId === `ticket:${ticket.id}:joinTicket` ? "Joining..." : "Join Ticket"}
                          </button>
                        )}
                        {isResolved && (
                          <button
                            onClick={() => handleReopenTicket(ticket)}
                            disabled={busyId === `ticket:${ticket.id}:reopenTicket`}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary text-vapor text-xs font-bold rounded hover:bg-white/10 disabled:opacity-50"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> {busyId === `ticket:${ticket.id}:reopenTicket` ? "Reopening..." : "Reopen"}
                          </button>
                        )}
                      </div>
                    </div>

                    <RowGrid compact columns={[
                      ["Assigned", ticket.assigned_admin_name || "Unassigned"],
                      ["Match", ticket.action_url ? <Link to={ticket.action_url} className="text-cyan hover:underline">Open room</Link> : "N/A"],
                      ["Match ID", ticket.match_id ? `#${String(ticket.match_id).slice(-8)}` : "N/A"],
                      ["Teams", ticket.team_a_name || ticket.team_b_name ? `${ticket.team_a_name || "Team A"} vs ${ticket.team_b_name || "Team B"}` : "N/A"],
                      ["Wager/Tournament", ticket.tournament_name || (ticket.wager_amount !== undefined ? formatMoney(ticket.wager_amount) : "N/A")],
                    ]} />

                    {(ticket.match_id || proofUrls.length > 0 || ticket.chat_logs?.length > 0 || ticket.result_report) && (
                      <div className="grid lg:grid-cols-4 gap-3 text-xs text-vapor">
                        <div className="rounded-lg bg-secondary/40 border border-white/5 p-3 lg:col-span-2">
                          <p className="uppercase text-[10px] mb-1">Proof</p>
                          {proofUrls.length > 0 ? (
                            <div className="space-y-1">
                              {proofUrls.slice(0, 4).map((url) => (
                                <a key={url} href={url} target="_blank" rel="noreferrer" className="block text-cyan truncate hover:underline">{url}</a>
                              ))}
                            </div>
                          ) : (
                            <p>No proof attached</p>
                          )}
                        </div>
                        <div className="rounded-lg bg-secondary/40 border border-white/5 p-3">
                          <p className="uppercase text-[10px] mb-1">Result Report</p>
                          <p>{reportText(ticket.result_report)}</p>
                        </div>
                        <div className="rounded-lg bg-secondary/40 border border-white/5 p-3">
                          <p className="uppercase text-[10px] mb-1">Chat Logs</p>
                          <p>{compactListText(ticket.chat_logs, (row) => `${row.sender_name || "Unknown"}: ${row.content || row.message || ""}`)}</p>
                        </div>
                      </div>
                    )}

                    <div className="grid lg:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-background/30 border border-white/5 p-3">
                        <p className="text-xs font-bold mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-cyan" /> Conversation</p>
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                          {messages.filter((message) => !message.internal).length === 0 ? (
                            <p className="text-xs text-vapor">No messages yet.</p>
                          ) : (
                            messages.filter((message) => !message.internal).map((message) => (
                              <div key={message.id || `${message.created_date}:${message.content}`} className="rounded-lg bg-secondary/50 border border-white/5 p-2">
                                <p className="text-[10px] text-vapor">{message.sender_name || "Unknown"} - {formatDate(message.created_date)}</p>
                                <p className="text-sm whitespace-pre-line">{message.content}</p>
                              </div>
                            ))
                          )}
                        </div>
                        {!isResolved && (
                          <div className="mt-3 flex flex-col gap-2">
                            <textarea
                              value={ticketReplyDrafts[ticket.id] || ""}
                              onChange={(event) => setTicketReplyDrafts((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                              placeholder="Reply to user/team"
                              className="w-full min-h-[72px] px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                            />
                            <button
                              onClick={() => handleReplyTicket(ticket)}
                              disabled={busyId === `ticket:${ticket.id}:replyTicket`}
                              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-cyan text-background text-xs font-bold rounded hover:shadow-lg hover:shadow-cyan/20 disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" /> {busyId === `ticket:${ticket.id}:replyTicket` ? "Sending..." : "Send Reply"}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg bg-background/30 border border-white/5 p-3">
                        <p className="text-xs font-bold mb-3">Internal Staff Notes</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {notes.length === 0 ? (
                            <p className="text-xs text-vapor">No staff notes.</p>
                          ) : (
                            notes.map((note) => (
                              <div key={note.id || `${note.created_date}:${note.content}`} className="rounded-lg bg-secondary/50 border border-white/5 p-2">
                                <p className="text-[10px] text-vapor">{note.sender_name || "Staff"} - {formatDate(note.created_date)}</p>
                                <p className="text-sm whitespace-pre-line">{note.content}</p>
                              </div>
                            ))
                          )}
                        </div>
                        {!isResolved && (
                          <div className="mt-3 flex flex-col gap-2">
                            <textarea
                              value={ticketNoteDrafts[ticket.id] || ""}
                              onChange={(event) => setTicketNoteDrafts((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                              placeholder="Internal note"
                              className="w-full min-h-[72px] px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                            />
                            <button
                              onClick={() => handleReplyTicket(ticket, true)}
                              disabled={busyId === `ticket:${ticket.id}:replyTicket`}
                              className="inline-flex items-center justify-center gap-2 px-3 py-2 bg-secondary text-vapor text-xs font-bold rounded border border-white/5 hover:bg-white/10 disabled:opacity-50"
                            >
                              <Save className="w-3.5 h-3.5" /> Save Internal Note
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {!isResolved && (
                      <div className="rounded-lg bg-secondary/30 border border-white/5 p-3">
                        <textarea
                          value={ticketResolutionDrafts[ticket.id] || ""}
                          onChange={(event) => setTicketResolutionDrafts((prev) => ({ ...prev, [ticket.id]: event.target.value }))}
                          placeholder="Resolution message"
                          className="w-full min-h-[64px] px-3 py-2 bg-background/60 rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none mb-3"
                        />
                        <div className="flex flex-wrap gap-2">
                          {ticket.match_id && [
                            ["approve_team_a", `Choose ${ticket.team_a_name || "Team A"}`],
                            ["approve_team_b", `Choose ${ticket.team_b_name || "Team B"}`],
                            ["force_replay", "Force Replay"],
                          ].map(([action, label]) => (
                            <button
                              key={action}
                              onClick={() => handleResolveTicket(ticket, action)}
                              disabled={busyId === `ticket:${ticket.id}:resolveTicket`}
                              className="px-3 py-1.5 bg-secondary text-vapor text-xs font-bold rounded border border-white/5 hover:bg-white/10 disabled:opacity-50"
                            >
                              {label}
                            </button>
                          ))}
                          <button
                            onClick={() => handleResolveTicket(ticket)}
                            disabled={busyId === `ticket:${ticket.id}:resolveTicket`}
                            className="px-3 py-1.5 bg-green/10 text-green text-xs font-bold rounded hover:bg-green/20 disabled:opacity-50"
                          >
                            {busyId === `ticket:${ticket.id}:resolveTicket` ? "Resolving..." : "Resolve"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          )}

          {activeTab === "disputes" && (
            <ListSection title="Disputes" rows={data.disputes} empty="No disputes." render={(dispute) => (
              <div className="px-5 py-4">
                <RowGrid compact columns={[
                  ["Reason", dispute.reason || dispute.description],
                  ["Status", <StatusPill status={dispute.status} />],
                  ["Priority", <StatusPill status={dispute.priority} />],
                  ["Reporter", dispute.reported_by_name || dispute.reported_by],
                  ["Match", dispute.match_id || dispute.wager_id ? `#${String(dispute.match_id || dispute.wager_id).slice(-8)}` : "N/A"],
                ]} />
                <div className="mt-3 grid lg:grid-cols-4 gap-3 text-xs text-vapor">
                  <div className="rounded-lg bg-secondary/40 border border-white/5 p-3">
                    <p className="uppercase text-[10px] mb-1">Team A</p>
                    <p>{dispute.wager_details?.host_name || dispute.wager_details?.team_a_name || "Team A"}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-white/5 p-3">
                    <p className="uppercase text-[10px] mb-1">Team B</p>
                    <p>{dispute.wager_details?.challenger_name || dispute.wager_details?.team_b_name || "Team B"}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-white/5 p-3 lg:col-span-2">
                    <p className="uppercase text-[10px] mb-1">Evidence</p>
                    <p>{(dispute.submitted_evidence || [...(dispute.evidence_urls || []), ...(dispute.screenshots || []), ...(dispute.videos || [])]).join(", ") || "No evidence attached"}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-white/5 p-3 lg:col-span-2">
                    <p className="uppercase text-[10px] mb-1">Chat Logs</p>
                    <p>{compactListText(dispute.chat_logs, (row) => `${row.sender_name || "Unknown"}: ${row.content || ""}`)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-white/5 p-3">
                    <p className="uppercase text-[10px] mb-1">Match Logs</p>
                    <p>{compactListText(dispute.match_logs, (row) => `${row.status || "status"} ${row.winner_name ? `winner ${row.winner_name}` : ""}`)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 border border-white/5 p-3">
                    <p className="uppercase text-[10px] mb-1">Match History</p>
                    <p>{compactListText(dispute.match_history, (row) => row.summary || row.result || row.status || row.id)}</p>
                  </div>
                </div>
                {dispute.status !== "resolved" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["approve_team_a", "Approve Team A"],
                      ["approve_team_b", "Approve Team B"],
                      ["force_replay", "Force Replay"],
                      ["reject_dispute", "Reject"],
                    ].map(([action, label]) => (
                      <button
                        key={action}
                        onClick={() => handleModerateDispute(dispute, action)}
                        disabled={busyId === `dispute:${dispute.id}:${action}`}
                        className="px-3 py-1.5 bg-secondary text-vapor text-xs font-bold rounded border border-white/5 hover:bg-white/10 disabled:opacity-50"
                      >
                        {busyId === `dispute:${dispute.id}:${action}` ? "Working..." : label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )} />
          )}

          {activeTab === "wagers" && (
            <ListSection title="Wagers" rows={data.wagers} empty="No wagers." render={(wager) => (
              <RowGrid columns={[
                ["Match", `${wager.team_size || ""} ${wager.game_mode_display || wager.game_mode || ""}`],
                ["Players", `${wager.host_name || "Host unavailable"} vs ${wager.challenger_name || "Opponent pending"}`],
                ["Status", <StatusPill status={wager.status} />],
                ["Entry", formatMoney(wager.entry_fee || wager.amount)],
                ["Room", <Link to={`/wagers-match/${wager.id}`} className="text-cyan hover:underline">Open</Link>],
              ]} />
            )} />
          )}

          {activeTab === "ranked" && (
            <ListSection title="Ranked Matches" rows={data.rankedMatches} empty="No ranked matches." render={(match) => (
              <RowGrid columns={[
                ["Match", `${match.team_size || ""} ${match.game_mode_display || match.game_mode || ""}`],
                ["Players", `${match.host_name || "Host unavailable"} vs ${match.challenger_name || "Opponent pending"}`],
                ["Status", <StatusPill status={match.status} />],
                ["Winner", match.winner_name || "N/A"],
                ["Room", <Link to={`/ranked-match/${match.id}`} className="text-cyan hover:underline">Open</Link>],
              ]} />
            )} />
          )}

          {activeTab === "tournaments" && (
            <div>
              {canManageWallets(currentRole) && (
                <form onSubmit={handleSubmitTournament} className="p-5 border-b border-white/5">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-lg font-bold">{editingTournamentId ? "Edit Tournament" : "Create Tournament"}</h2>
                      <p className="text-xs text-vapor">Admins, Super Admins, and CEO can add tournaments.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingTournamentId && (
                        <button
                          type="button"
                          onClick={resetTournamentForm}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-vapor text-xs font-bold rounded-lg hover:bg-white/10"
                        >
                          <X className="w-4 h-4" /> Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={busyId === "tournament:create"}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-cyan text-background text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-cyan/20 disabled:opacity-50"
                      >
                        {busyId === "tournament:create" ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTournamentId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {editingTournamentId ? "Save" : "Create"}
                      </button>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Tournament name</span>
                      <input
                        value={tournamentForm.name}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Tournament name"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Tournament image URL</span>
                      <input
                        value={tournamentForm.image_url}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, image_url: event.target.value }))}
                        placeholder="https://example.com/tournament.png"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Game mode</span>
                      <select
                        value={tournamentForm.game_mode}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, game_mode: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {tournamentGameModeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Team size</span>
                      <select
                        value={tournamentForm.team_size}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, team_size: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {tournamentTeamSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Status</span>
                      <select
                        value={tournamentForm.status}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, status: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {tournamentStatusOptions.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Entry fee</span>
                      <input
                        type="number"
                        min="0"
                        value={tournamentForm.entry_fee}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, entry_fee: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Entry type</span>
                      <select
                        value={tournamentForm.entry_type}
                        onChange={(event) => setTournamentForm((prev) => ({
                          ...prev,
                          entry_type: event.target.value,
                          is_premium_only: ["premium", "credits_premium"].includes(event.target.value),
                          invite_only: event.target.value === "invitational" ? true : prev.invite_only,
                        }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        <option value="free">Free</option>
                        <option value="invitational">Invitational</option>
                        <option value="credits">Credits</option>
                        <option value="premium">Premium Only</option>
                        <option value="credits_premium">Credits + Premium</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Prize pool</span>
                      <input
                        type="number"
                        min="0"
                        value={tournamentForm.prize_pool}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, prize_pool: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">#1 prize</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tournamentForm.first_place_prize}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, first_place_prize: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">#2 prize</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tournamentForm.second_place_prize}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, second_place_prize: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Max teams</span>
                      <input
                        type="number"
                        min="2"
                        value={tournamentForm.max_teams}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, max_teams: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Bracket format</span>
                      <select
                        value={tournamentForm.bracket_type}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, bracket_type: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        <option value="single_elimination">Single Elimination</option>
                        <option value="double_elimination">Double Elimination · Losers Bracket</option>
                      </select>
                      <span className="block text-[10px] leading-relaxed text-vapor/75">
                        Double elimination adds a Lower Bracket and Grand Final to every match room.
                      </span>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Start date</span>
                      <input
                        type="datetime-local"
                        value={tournamentForm.start_date}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, start_date: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Registration ends</span>
                      <input
                        type="datetime-local"
                        value={tournamentForm.registration_end}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, registration_end: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                  </div>
                  {tournamentForm.image_url && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-white/5 bg-secondary/40">
                      <div className="aspect-[5/1] max-h-40 bg-background">
                        <img src={tournamentForm.image_url} alt="" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">SND maps</span>
                      <textarea
                        value={tournamentForm.snd_maps}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, snd_maps: event.target.value }))}
                        rows={5}
                        className="w-full resize-y px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">HP maps</span>
                      <textarea
                        value={tournamentForm.hp_maps}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, hp_maps: event.target.value }))}
                        rows={5}
                        className="w-full resize-y px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Overload maps</span>
                      <textarea
                        value={tournamentForm.overload_maps}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, overload_maps: event.target.value }))}
                        rows={5}
                        className="w-full resize-y px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-xl border border-white/5 bg-secondary/40 p-4">
                      <div className="mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-vapor">Automatic placement trophies</p>
                        <p className="mt-1 text-xs text-vapor">Every roster member receives a permanent profile trophy when the tournament finishes.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="flex items-center gap-3 rounded-lg border border-yellow-400/15 bg-yellow-400/[0.04] px-3 py-3">
                          <Trophy className="h-5 w-5 text-yellow-400" />
                          <div><p className="text-xs font-black text-yellow-300">#1 Gold</p><p className="text-[10px] text-vapor">Tournament champion</p></div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-slate-300/15 bg-slate-300/[0.04] px-3 py-3">
                          <Medal className="h-5 w-5 text-slate-300" />
                          <div><p className="text-xs font-black text-slate-200">#2 Silver</p><p className="text-[10px] text-vapor">Final runner-up</p></div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-amber-600/20 bg-amber-600/[0.05] px-3 py-3">
                          <Award className="h-5 w-5 text-amber-600" />
                          <div><p className="text-xs font-black text-amber-500">#3 Bronze</p><p className="text-[10px] text-vapor">Semifinalist</p></div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan">Extra custom trophies by placement</p>
                        <p className="mt-1 text-xs text-vapor">Optional trophy items are awarded together with Gold, Silver, or Bronze.</p>
                      </div>
                      <div className="grid gap-3 xl:grid-cols-3">
                        {[1, 2, 3].map((placement) => (
                          <TournamentRewardPicker
                            key={placement}
                            title={`#${placement} extra trophies`}
                            description={placement === 3 ? "Granted to the semifinal loser roster(s)." : `Granted to every player finishing #${placement}.`}
                            selectedIds={tournamentForm.placement_trophy_item_ids?.[placement] || []}
                            items={tournamentTrophyItems}
                            onToggle={(itemId) => togglePlacementTrophyReward(placement, itemId)}
                          />
                        ))}
                      </div>
                    </div>
                    <TournamentRewardPicker
                      title="Champion reward items"
                      description="Optional bonus knife, gun skin, or trophy rewards granted to the winning roster."
                      selectedIds={tournamentForm.reward_item_ids || []}
                      items={tournamentRewardItems}
                      onToggle={(itemId) => toggleTournamentReward("reward_item_ids", itemId)}
                    />
                    <TournamentRewardPicker
                      title="Elimination unlock items"
                      description="Optional invitational rewards granted to registered rosters when they lose and are eliminated."
                      selectedIds={tournamentForm.elimination_reward_item_ids || []}
                      items={tournamentRewardItems}
                      onToggle={(itemId) => toggleTournamentReward("elimination_reward_item_ids", itemId)}
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 mt-4 text-xs text-vapor">
                    <input
                      type="checkbox"
                      checked={tournamentForm.is_premium_only}
                      onChange={(event) => setTournamentForm((prev) => ({ ...prev, is_premium_only: event.target.checked }))}
                      className="accent-cyan"
                    />
                    Premium only
                  </label>
                  <label className="ml-5 inline-flex items-center gap-2 mt-4 text-xs text-vapor">
                    <input
                      type="checkbox"
                      checked={tournamentForm.invite_only}
                      onChange={(event) => setTournamentForm((prev) => ({
                        ...prev,
                        invite_only: event.target.checked,
                        entry_type: event.target.checked && prev.entry_type === "free" ? "invitational" : prev.entry_type,
                      }))}
                      className="accent-cyan"
                    />
                    Invite only
                  </label>
                  {tournamentForm.invite_only && (
                    <div className="mt-4 rounded-xl border border-cyan/15 bg-cyan/[0.03] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-bold">Allowed players</p>
                          <p className="text-[10px] text-vapor">Only a selected player can register; their teammates do not need separate invitations.</p>
                        </div>
                        <input
                          value={tournamentInviteSearch}
                          onChange={(event) => setTournamentInviteSearch(event.target.value)}
                          placeholder="Search name or email"
                          className="w-full sm:w-64 px-3 py-2 bg-secondary rounded-lg text-xs border border-white/5 focus:border-cyan/30 focus:outline-none"
                        />
                      </div>
                      <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                        {data.users
                          .filter((candidate) => `${userName(candidate)} ${candidate.email || ""}`.toLowerCase().includes(tournamentInviteSearch.toLowerCase()))
                          .map((candidate) => {
                            const checked = (tournamentForm.invited_user_ids || []).includes(candidate.id);
                            return (
                              <label key={candidate.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${checked ? "border-cyan/30 bg-cyan/10" : "border-white/5 bg-secondary/40"}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setTournamentForm((prev) => ({
                                    ...prev,
                                    invited_user_ids: checked
                                      ? (prev.invited_user_ids || []).filter((id) => id !== candidate.id)
                                      : [...(prev.invited_user_ids || []), candidate.id],
                                  }))}
                                  className="accent-cyan"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">{userName(candidate)}</span>
                                  <span className="block truncate text-[10px] text-vapor">{candidate.email || candidate.role || "User"}</span>
                                </span>
                              </label>
                            );
                          })}
                      </div>
                      <p className="mt-3 text-[10px] font-semibold text-cyan">
                        {(tournamentForm.invited_user_ids || []).length} player(s) selected
                      </p>
                    </div>
                  )}
                </form>
              )}
              <ListSection title="Tournaments" rows={data.tournaments} empty="No tournaments." render={(tournament) => {
                const hasMatches = data.tournamentMatches.some((match) => match.tournament_id === tournament.id);
                return (
                  <RowGrid columns={[
                    ["Name", tournament.name],
                    ["Status", <StatusPill status={tournament.status} />],
                    ["Teams", `${tournament.registered_teams || 0}/${tournament.max_teams}`],
                    ["Format", (tournament.bracket_type || tournament.format) === "double_elimination" ? "Double Elimination · Lower Bracket" : "Single Elimination"],
                    ["Prize", tournamentPrizeSummary(tournament)],
                    ["Image", tournament.image_url ? (
                      <img src={tournament.image_url} alt="" className="h-10 w-16 rounded object-cover bg-background" />
                    ) : "None"],
                    ["Entry", `${(tournament.entry_type || (tournament.is_premium_only ? "premium" : "free")).replace(/_/g, " ")}${Number(tournament.entry_fee || 0) > 0 ? ` - ${tournament.entry_fee} credits` : ""}`],
                    ["Rewards", (
                      <div className="space-y-1">
                        <p><span className="text-yellow-400">#1 Gold</span><span className="text-vapor"> · Extra:</span> {tournamentPlacementTrophySummary(tournament, data.marketplace, 1)}</p>
                        <p><span className="text-slate-300">#2 Silver</span><span className="text-vapor"> · Extra:</span> {tournamentPlacementTrophySummary(tournament, data.marketplace, 2)}</p>
                        <p><span className="text-amber-600">#3 Bronze</span><span className="text-vapor"> · Extra:</span> {tournamentPlacementTrophySummary(tournament, data.marketplace, 3)}</p>
                        <p><span className="text-vapor">Champion bonus:</span> {tournamentRewardSummary(tournament, data.marketplace)}</p>
                        <p><span className="text-vapor">Eliminated:</span> {tournamentRewardSummary(tournament, data.marketplace, "elimination_reward_item_ids", "elimination_reward_items")}</p>
                      </div>
                    )],
                    ["Bracket", hasMatches ? ((tournament.bracket_type || tournament.format) === "double_elimination" ? "Winners + Lower + Grand Final" : "Generated") : (
                      <button onClick={() => handleGenerateBracket(tournament)} disabled={busyId === `bracket:${tournament.id}`} className="text-cyan hover:underline disabled:opacity-50">
                        {busyId === `bracket:${tournament.id}` ? "Generating..." : "Generate"}
                      </button>
                    )],
                    ["Actions", (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => handleEditTournament(tournament)} className="text-xs text-cyan hover:underline">Edit</button>
                        <button onClick={() => handleSetTournamentStatus(tournament, "open")} disabled={busyId === `status:open:${tournament.id}` || tournament.status === "open"} className="text-xs text-vapor hover:text-cyan disabled:opacity-50">Reopen</button>
                        <button onClick={() => handleSetTournamentStatus(tournament, "closed")} disabled={busyId === `status:closed:${tournament.id}` || tournament.status === "closed"} className="text-xs text-vapor hover:text-cyan disabled:opacity-50">Close</button>
                        <button onClick={() => handleSetTournamentStatus(tournament, "completed")} disabled={busyId === `status:completed:${tournament.id}` || tournament.status === "completed"} className="text-xs text-green hover:underline disabled:opacity-50">Complete</button>
                        <button onClick={() => handleTournamentAction(tournament, "closeTournamentRegistration")} disabled={busyId === `closeTournamentRegistration:${tournament.id}`} className="text-xs text-vapor hover:text-cyan disabled:opacity-50">Close Reg</button>
                        <button onClick={() => handleTournamentAction(tournament, "extendTournamentRegistration", { hours: 24 })} disabled={busyId === `extendTournamentRegistration:${tournament.id}`} className="text-xs text-vapor hover:text-cyan disabled:opacity-50">+24h</button>
                        <button onClick={() => handleTournamentAction(tournament, "startTournament")} disabled={busyId === `startTournament:${tournament.id}`} className="text-xs text-green hover:underline disabled:opacity-50">Start</button>
                        <button onClick={() => handleTournamentAction(tournament, "cancelTournament")} disabled={busyId === `cancelTournament:${tournament.id}`} className="text-xs text-orange hover:underline disabled:opacity-50">Cancel</button>
                        <button onClick={() => handleTournamentAction(tournament, "deleteTournament")} disabled={busyId === `deleteTournament:${tournament.id}`} className="text-xs text-red-400 hover:underline disabled:opacity-50">Delete</button>
                      </div>
                    )],
                  ]} />
                );
              }} />
            </div>
          )}

          {activeTab === "tournamentMatches" && (
            <ListSection title="Tournament Matches" rows={data.tournamentMatches} empty="No tournament matches." render={(match) => (
              <RowGrid columns={[
                ["Bracket", `${match.bracket || "winner"} R${match.round} M${match.match_number}`],
                ["Teams", `${match.team_a_name || "Open slot"} vs ${match.team_b_name || "Open slot"}`],
                ["Score", `${match.team_a_score || 0}-${match.team_b_score || 0}`],
                ["Status", <StatusPill status={match.status} />],
                ["Room", <Link to={`/tournament-match/${match.id}`} className="text-cyan hover:underline">Open</Link>],
              ]} />
            )} />
          )}

          {activeTab === "wallets" && (
            <ListSection title="Wallets" rows={data.wallets} empty="No wallets." render={(wallet) => (
              <RowGrid columns={[
                ["User", wallet.user_id],
                ["Available", formatMoney(wallet.available_balance)],
                ["Pending", formatMoney(wallet.pending_balance)],
                ["Escrow", formatMoney(wallet.escrow_balance)],
                ["Withdrawable", formatMoney(wallet.withdrawable_balance)],
                ["Earned", formatMoney(wallet.total_earnings)],
              ]} />
            )} />
          )}

          {activeTab === "withdrawals" && (
            <ListSection title="Withdrawals" rows={data.withdrawals} empty="No withdrawals." render={(withdrawal) => (
              <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <RowGrid compact columns={[
                  ["User", withdrawal.user_id],
                  ["Amount", formatMoney(withdrawal.amount)],
                  ["Method", withdrawal.payment_method],
                  ["Status", <StatusPill status={withdrawal.status} />],
                  ["Requested", formatDate(withdrawal.requested_date)],
                ]} />
                {withdrawal.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleWithdrawal(withdrawal, "approved")} className="px-3 py-1.5 bg-green/10 text-green text-xs font-bold rounded hover:bg-green/20">Approve</button>
                    <button onClick={() => handleWithdrawal(withdrawal, "rejected")} className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-bold rounded hover:bg-red-500/20">Reject</button>
                  </div>
                )}
              </div>
            )} />
          )}

          {activeTab === "marketplace" && (
            <div>
              {canManageWallets(currentRole) && (
                <form onSubmit={handleSubmitMarketplaceItem} className="p-5 border-b border-white/5">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-lg font-bold">{editingMarketplaceId ? "Edit Marketplace Item" : "Create Marketplace Item"}</h2>
                      <p className="text-xs text-vapor">Set how this item unlocks and whether it is currently visible in the marketplace.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingMarketplaceId && (
                        <button
                          type="button"
                          onClick={resetMarketplaceForm}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-vapor text-xs font-bold rounded-lg hover:bg-white/10"
                        >
                          <X className="w-4 h-4" /> Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={busyId === "marketplace:create" || busyId === `marketplace:update:${editingMarketplaceId}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-cyan text-background text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-cyan/20 disabled:opacity-50"
                      >
                        {busyId === "marketplace:create" || busyId === `marketplace:update:${editingMarketplaceId}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : editingMarketplaceId ? (
                          <Save className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        {editingMarketplaceId ? "Save" : "Create"}
                      </button>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Item name</span>
                      <input
                        value={marketplaceForm.name}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Item name"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Category</span>
                      <select
                        value={marketplaceForm.category}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, category: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {marketplaceCategories.map((category) => <option key={category} value={category}>{category.replace(/_/g, " ")}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Rarity</span>
                      <select
                        value={marketplaceForm.rarity}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, rarity: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {marketplaceRarities.map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Unlock method</span>
                      <select
                        value={marketplaceForm.unlock_type}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, unlock_type: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {marketplaceUnlockTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Credits price</span>
                      <input
                        type="number"
                        min="0"
                        value={marketplaceForm.price_credits}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, price_credits: event.target.value }))}
                        placeholder="Credits price, e.g. 2500"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Cash price</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={marketplaceForm.price_cash}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, price_cash: event.target.value }))}
                        placeholder="Cash price, e.g. 9.99"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Stock quantity</span>
                      <input
                        type="number"
                        min="0"
                        value={marketplaceForm.stock_quantity}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, stock_quantity: event.target.value }))}
                        placeholder="Stock quantity, blank for unlimited"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Unlock requirement</span>
                      <input
                        value={marketplaceForm.unlock_requirement}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, unlock_requirement: event.target.value }))}
                        placeholder={marketplaceRequirementPlaceholder[marketplaceForm.unlock_type] || "Unlock requirement"}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1 xl:col-span-2">
                      <span className="text-[10px] text-vapor uppercase">Image URL</span>
                      <input
                        value={marketplaceForm.image_url}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, image_url: event.target.value }))}
                        placeholder="Image URL"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                    <label className="space-y-1 xl:col-span-2">
                      <span className="text-[10px] text-vapor uppercase">Description</span>
                      <input
                        value={marketplaceForm.description}
                        onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Description"
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-vapor">
                    {[
                      ["is_featured", "Featured item"],
                      ["show_in_marketplace", "Show in marketplace grid"],
                      ["is_limited", "Limited"],
                      ["is_tradeable", "Tradeable"],
                      ["is_active", "Active"],
                    ].map(([field, label]) => (
                      <label key={field} className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={marketplaceForm[field]}
                          onChange={(event) => setMarketplaceForm((prev) => ({ ...prev, [field]: event.target.checked }))}
                          className="accent-cyan"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </form>
              )}
              <ListSection title="Marketplace" rows={data.marketplace} empty="No marketplace items." render={(item) => (
                <RowGrid columns={[
                  ["Item", item.name],
                  ["Category", item.category],
                  ["Rarity", item.rarity],
                  ["Credits", item.price_credits || 0],
                  ["Cash", formatMoney(item.price_cash)],
                  ["Unlock", (item.unlock_type || (item.is_premium_only ? "premium" : "marketplace")).replace(/_/g, " ")],
                  ["Placement", marketplacePlacementText(item)],
                  ["Status", <StatusPill status={item.is_active === false || item.is_available === false ? "cancelled" : "active"} />],
                  ["Actions", (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleEditMarketplaceItem(item)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-cyan/10 text-cyan text-[10px] font-bold rounded border border-cyan/20 hover:bg-cyan/20"
                      >
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={() => handleToggleMarketplaceItem(item)}
                        disabled={busyId === `marketplace:toggle:${item.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-vapor text-[10px] font-bold rounded border border-white/5 hover:bg-white/10 disabled:opacity-50"
                      >
                        {busyId === `marketplace:toggle:${item.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {item.is_active === false || item.is_available === false ? "Activate" : "Deactivate"}
                      </button>
                      <button
                        onClick={() => handleDeleteMarketplaceItem(item)}
                        disabled={busyId === `marketplace:delete:${item.id}`}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 text-[10px] font-bold rounded border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {busyId === `marketplace:delete:${item.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Delete
                      </button>
                    </div>
                  )],
                ]} />
              )} />
            </div>
          )}

          {activeTab === "inventory" && (
            <ListSection title="Inventory" rows={data.inventory} empty="No inventory rows." render={(item) => (
              <RowGrid columns={[
                ["Owner", item.user_id],
                ["Item", item.item_name],
                ["Category", item.item_category],
                ["Rarity", item.item_rarity],
                ["Method", item.purchase_method],
                ["Acquired", formatDate(item.acquired_date)],
              ]} />
            )} />
          )}

          {activeTab === "audit" && (
            <ListSection title="Audit Logs" rows={auditRows} empty="No audit logs." render={(row) => (
              <RowGrid columns={[
                ["Type", row.type],
                ["Action", row.action],
                ["Actor", row.actor],
                ["Target", row.target],
                ["Date", formatDate(row.date)],
                ["Details", row.details],
              ]} />
            )} />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({ title, rows }) {
  return (
    <div className="border border-white/5 rounded-lg p-4">
      <h3 className="font-bold text-sm mb-3">{title}</h3>
      <div className="space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <span className="text-vapor">{label}</span>
            <span className="font-bold text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSection({ title, rows, empty, render }) {
  return (
    <div>
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-xs text-vapor">{rows.length} rows</span>
      </div>
      <div className="divide-y divide-white/5">
        {rows.length === 0 ? <EmptyState label={empty} /> : rows.map((row) => (
          <div key={row.id}>{render(row)}</div>
        ))}
      </div>
    </div>
  );
}

function RowGrid({ columns, compact = false }) {
  return (
    <div className={`grid ${compact ? "lg:grid-cols-5" : "lg:grid-cols-6"} gap-3 w-full px-5 py-4`}>
      {columns.map(([label, value]) => (
        <div key={label} className={label === "Details" ? "lg:col-span-2" : ""}>
          <p className="text-[10px] text-vapor uppercase mb-1">{label}</p>
          <div className="text-sm break-words">{value ?? "N/A"}</div>
        </div>
      ))}
    </div>
  );
}
