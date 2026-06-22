import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  BadgeDollarSign,
  Boxes,
  ClipboardList,
  CreditCard,
  Edit3,
  Gavel,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Loader2,
  Plus,
  ScrollText,
  Search,
  Shield,
  ShoppingBag,
  Save,
  Swords,
  Trash2,
  Ticket,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import RoleBadge from "@/components/ui/RoleBadge";
import { canAccessAdminPanel, canManageRoles, canManageWallets } from "@/lib/roles";

const roleOptions = ["ceo", "super_admin", "admin", "moderator", "user"];
const marketplaceCategories = ["cosmetic", "badge", "frame", "calling_card", "trophy", "knife", "ranked_reward", "weapon_skin", "gloves", "agent", "sticker", "patch", "music_kit"];
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
  game_mode: "snd",
  team_size: "2v2",
  entry_fee: "0",
  prize_pool: "0",
  max_teams: "8",
  status: "open",
  start_date: "",
  is_premium_only: false,
};

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles", icon: KeyRound },
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
  systemLogs: [],
};

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value) => value ? new Date(value).toLocaleString() : "N/A";
const statusText = (value) => String(value || "unknown").replace(/_/g, " ");
const userName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "Unknown";
const marketplacePlacementText = (item) => [
  item.is_featured === true ? "Featured" : null,
  item.show_in_marketplace !== false ? "Grid" : null,
].filter(Boolean).join(", ") || "Hidden";

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

      if (!canAccessAdminPanel(me?.role || "user")) {
        setData(initialData);
        return;
      }

      const [
        users,
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
        systemLogs,
      ] = await Promise.all([
        safeList("User"),
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
        safeList("SystemLog"),
      ]);

      setData({
        users,
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
        systemLogs,
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
    openTickets: data.tickets.filter((ticket) => ticket.status === "open").length,
    pendingDisputes: data.disputes.filter((dispute) => ["pending", "under_review"].includes(dispute.status)).length,
    activeWagers: data.wagers.filter((wager) => ["open", "in_progress", "ready", "score_conflict"].includes(wager.status)).length,
    activeRanked: data.rankedMatches.filter((match) => ["open", "in_progress", "score_conflict"].includes(match.status)).length,
    activeTournaments: data.tournaments.filter((tournament) => ["live", "in_progress", "registration", "open"].includes(tournament.status)).length,
    pendingWithdrawals: data.withdrawals.filter((withdrawal) => withdrawal.status === "pending").length,
    walletTotal: data.wallets.reduce((sum, wallet) => sum + Number(wallet.available_balance || 0), 0),
  }), [data]);

  const handleResolveTicket = async (ticketId) => {
    setBusyId(ticketId);
    try {
      await base44.entities.Ticket.update(ticketId, {
        status: "resolved",
        resolution: "Resolved by staff",
        resolved_date: new Date().toISOString(),
      });
      await base44.entities.AdminAction.create({
        admin_id: currentUser.id,
        admin_name: userName(currentUser),
        admin_role: currentUser.role,
        action_type: "moderation",
        description: `Resolved ticket ${ticketId}`,
        details: { ticket_id: ticketId },
      });
      toast({ title: "Ticket resolved" });
      loadAdminData();
    } catch (error) {
      toast({ title: "Resolve failed", description: error.message || "Could not resolve ticket", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleSetRole = async (targetUser, role) => {
    if (!canManageRoles(currentUser?.role || "user")) {
      toast({ title: "Not allowed", description: "Super Admin or CEO is required to manage roles.", variant: "destructive" });
      return;
    }

    setBusyId(`${targetUser.id}:${role}`);
    try {
      const staffRole = role !== "user" ? role : null;
      const existingBadges = (targetUser.badges || []).filter((badge) => !["ceo", "super_admin", "admin", "moderator"].includes(badge.type));
      await base44.entities.User.update(targetUser.id, {
        role,
        admin_role: staffRole,
        is_admin: Boolean(staffRole),
        badges: staffRole ? [...existingBadges, { name: role.replace("_", " "), type: role }] : existingBadges,
      });
      await base44.entities.AdminAction.create({
        admin_id: currentUser.id,
        admin_name: userName(currentUser),
        admin_role: currentUser.role,
        action_type: "role_change",
        target_user_id: targetUser.id,
        target_username: userName(targetUser),
        description: `Changed ${userName(targetUser)} role to ${role}`,
        details: { role },
      });
      toast({ title: "Role updated", description: `${userName(targetUser)} is now ${role}.` });
      loadAdminData();
    } catch (error) {
      toast({ title: "Role update failed", description: error.message || "Could not update role.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleWithdrawal = async (withdrawal, status) => {
    if (!canManageWallets(currentUser?.role || "user")) {
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

  const tournamentPayload = () => ({
    name: tournamentForm.name.trim(),
    game_mode: tournamentForm.game_mode,
    team_size: tournamentForm.team_size,
    entry_fee: Number(tournamentForm.entry_fee || 0),
    prize_pool: Number(tournamentForm.prize_pool || 0),
    max_teams: Number(tournamentForm.max_teams || 0),
    registered_teams: 0,
    status: tournamentForm.status,
    format: "single_elimination",
    bracket_type: "single_elimination",
    start_date: tournamentForm.start_date ? new Date(tournamentForm.start_date).toISOString() : undefined,
    created_by: currentUser?.id,
    created_by_name: userName(currentUser),
    created_date: new Date().toISOString(),
    is_premium_only: tournamentForm.is_premium_only,
  });

  const handleSubmitTournament = async (event) => {
    event.preventDefault();

    if (!canManageWallets(currentUser?.role || "user")) {
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
      const tournament = await base44.entities.Tournament.create(payload);
      await base44.entities.AdminAction.create({
        admin_id: currentUser.id,
        admin_name: userName(currentUser),
        admin_role: currentUser.role,
        action_type: "tournament_create",
        description: `Created tournament ${payload.name}`,
        details: { tournament_id: tournament?.id, ...payload },
      }).catch((error) => console.warn("Failed to write tournament audit action:", error));
      toast({ title: "Tournament created", description: `${payload.name} is saved.` });
      setTournamentForm(defaultTournamentForm);
      loadAdminData();
    } catch (error) {
      toast({ title: "Create failed", description: error.message || "Could not create tournament.", variant: "destructive" });
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

    if (!canManageWallets(currentUser?.role || "user")) {
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

  if (!canAccessAdminPanel(currentUser?.role || "user")) {
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
              <RoleBadge role={currentUser?.role || "user"} />
              <button onClick={loadAdminData} className="px-4 py-2 bg-secondary text-vapor text-xs font-bold rounded-lg hover:bg-white/10">
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
          <StatCard icon={Users} label="Users" value={stats.totalUsers} />
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
                  ["Open tickets", stats.openTickets],
                  ["Pending disputes", stats.pendingDisputes],
                  ["Admin alerts", data.tickets.filter((ticket) => ticket.priority === "high").length],
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
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-vapor uppercase">
                      <th className="text-left py-3 px-4">User</th>
                      <th className="text-left py-3 px-4">Role</th>
                      <th className="text-left py-3 px-4">Status</th>
                      <th className="text-left py-3 px-4">Wallet</th>
                      <th className="text-left py-3 px-4">Joined</th>
                      <th className="text-right py-3 px-4">Profile</th>
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
                        <td className="py-3 px-4"><StatusPill status={user.is_banned ? "banned" : "active"} /></td>
                        <td className="py-3 px-4 text-sm font-mono">{formatMoney(user.wallet_balance)}</td>
                        <td className="py-3 px-4 text-sm text-vapor">{formatDate(user.account_created_date)}</td>
                        <td className="py-3 px-4 text-right">
                          <Link to={`/profile/${user.username || user.id}`} className="text-xs text-cyan hover:underline">View</Link>
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
                          disabled={!canManageRoles(currentUser?.role || "user") || busyId === `${user.id}:${role}` || user.role === role}
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

          {activeTab === "tickets" && (
            <ListSection
              title="Support Tickets"
              rows={data.tickets}
              empty="No support tickets."
              render={(ticket) => (
                <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2"><StatusPill status={ticket.status} /><StatusPill status={ticket.priority} /></div>
                    <p className="font-semibold text-sm">{ticket.subject}</p>
                    <p className="text-xs text-vapor">From: {ticket.username} - {ticket.category}</p>
                    <p className="text-sm text-foreground/80 mt-2">{ticket.description}</p>
                  </div>
                  {ticket.status !== "resolved" && (
                    <button onClick={() => handleResolveTicket(ticket.id)} disabled={busyId === ticket.id} className="px-3 py-1.5 bg-green/10 text-green text-xs font-bold rounded hover:bg-green/20 disabled:opacity-50">
                      {busyId === ticket.id ? "Resolving..." : "Resolve"}
                    </button>
                  )}
                </div>
              )}
            />
          )}

          {activeTab === "disputes" && (
            <ListSection title="Disputes" rows={data.disputes} empty="No disputes." render={(dispute) => (
              <RowGrid columns={[
                ["Reason", dispute.reason || dispute.description],
                ["Status", <StatusPill status={dispute.status} />],
                ["Reporter", dispute.reported_by_name || dispute.reported_by],
                ["Wager", dispute.wager_id ? `#${dispute.wager_id.slice(-8)}` : "N/A"],
              ]} />
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
              {canManageWallets(currentUser?.role || "user") && (
                <form onSubmit={handleSubmitTournament} className="p-5 border-b border-white/5">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-lg font-bold">Create Tournament</h2>
                      <p className="text-xs text-vapor">Admins, Super Admins, and CEO can add tournaments.</p>
                    </div>
                    <button
                      type="submit"
                      disabled={busyId === "tournament:create"}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-cyan text-background text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-cyan/20 disabled:opacity-50"
                    >
                      {busyId === "tournament:create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Create
                    </button>
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
                      <span className="text-[10px] text-vapor uppercase">Game mode</span>
                      <select
                        value={tournamentForm.game_mode}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, game_mode: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        <option value="snd">Search & Destroy</option>
                        <option value="overload">Overload</option>
                        <option value="hp">Hardpoint</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Team size</span>
                      <select
                        value={tournamentForm.team_size}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, team_size: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {["1v1", "2v2", "3v3", "4v4"].map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-vapor uppercase">Status</span>
                      <select
                        value={tournamentForm.status}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, status: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        {["draft", "open", "registration", "live"].map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
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
                      <span className="text-[10px] text-vapor uppercase">Start date</span>
                      <input
                        type="datetime-local"
                        value={tournamentForm.start_date}
                        onChange={(event) => setTournamentForm((prev) => ({ ...prev, start_date: event.target.value }))}
                        className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                      />
                    </label>
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
                </form>
              )}
              <ListSection title="Tournaments" rows={data.tournaments} empty="No tournaments." render={(tournament) => {
                const hasMatches = data.tournamentMatches.some((match) => match.tournament_id === tournament.id);
                return (
                  <RowGrid columns={[
                    ["Name", tournament.name],
                    ["Status", <StatusPill status={tournament.status} />],
                    ["Teams", `${tournament.registered_teams || 0}/${tournament.max_teams}`],
                    ["Prize", formatMoney(tournament.prize_pool)],
                    ["Bracket", hasMatches ? "Generated" : (
                      <button onClick={() => handleGenerateBracket(tournament)} disabled={busyId === `bracket:${tournament.id}`} className="text-cyan hover:underline disabled:opacity-50">
                        {busyId === `bracket:${tournament.id}` ? "Generating..." : "Generate"}
                      </button>
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
              {canManageWallets(currentUser?.role || "user") && (
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
