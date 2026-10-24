import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { canAccessAdminPanel, canManageRoles, canManageWallets, effectiveRoleForUser } from "@/lib/roles";
import { notifyAdminChanged } from "@/lib/adminWorkspace";

const entities = {
  users: "User", adminAlerts: "AdminAlert", tickets: "Ticket", disputes: "Dispute",
  wagers: "Wager", rankedMatches: "RankedMatch", rankedStats: "RankedStats",
  tournaments: "Tournament", tournamentMatches: "TournamentMatch",
  tournamentParticipants: "TournamentParticipant", wallets: "Wallet",
  withdrawals: "WithdrawalRequest", marketplace: "MarketplaceItem",
  inventory: "UserInventory", adminActions: "AdminAction", systemLogs: "SystemLog",
  messages: "Message",
};
const overviewKeys = ["dashboardOverview"];
const sectionKeys = {
  dashboard: overviewKeys,
  users: [], roles: [], alerts: ["adminAlerts", "tickets"],
  websiteUpdates: [], tickets: [], banAppeals: [], matches: [], wagers: [],
  challenges: [], live8s: [], eightsGames: [], ranked: [],
  verifyRank: [], progression: [],
  tournaments: ["tournaments", "tournamentMatches", "marketplace"],
  tournamentMatches: [], wallets: [],
  referrals: ["referralProgram"], freeTrials: ["animatedNameFreeTrial", "userCount"],
  withdrawals: [], marketplace: ["marketplace"],
  inventory: [], rewards: [], audit: [],
};
const queryKeys = [...Object.keys(entities), "dashboardOverview", "userCount", "ticketCounts", "auditCounts", "walletSummary", "referralProgram", "animatedNameFreeTrial"];
const combineQueries = (results) => ({
  data: Object.fromEntries(results.flatMap((result, index) => result.data === undefined ? [] : [[queryKeys[index], result.data]])),
  status: Object.fromEntries(results.map((result, index) => [queryKeys[index], {
    ready: result.data !== undefined, pending: result.isPending, error: result.error,
    fetching: result.isFetching,
  }])),
});

async function loadRows(key, tournamentRosterId) {
  if (key === "dashboardOverview") {
    const response = await base44.functions.invoke("getAdminDashboard", {});
    if (!response.data?.success) throw new Error(response.data?.error || "Could not load dashboard totals");
    return response.data;
  }
  if (key === "walletSummary") {
    try {
      const response = await base44.functions.invoke("getAdminWalletSummary", {});
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load wallet totals");
      return response.data;
    } catch (error) {
      if (error.status === 403) return null;
      throw error;
    }
  }
  if (key === "auditCounts") {
    const response = await base44.functions.invoke("getAdminAuditCounts", {});
    if (!response.data?.success) throw new Error(response.data?.error || "Could not load audit counts");
    return response.data;
  }
  if (key === "userCount") {
    const response = await base44.functions.invoke("getAdminUserCount", {});
    if (!response.data?.success) throw new Error(response.data?.error || "Could not load user count");
    return response.data;
  }
  if (key === "ticketCounts") {
    const response = await base44.functions.invoke("getAdminTicketCounts", {});
    if (!response.data?.success) throw new Error(response.data?.error || "Could not load ticket counts");
    return response.data;
  }
  if (entities[key]) {
    try {
      const filter = key === "tournamentParticipants" ? { tournament_id: tournamentRosterId } : {};
      return await base44.entities[entities[key]].filterFresh(filter, "-created_date", 500);
    } catch (error) {
      // Some lists are intentionally unavailable to moderators.
      if (error.status === 403) return [];
      throw error;
    }
  }
  if (key === "referralProgram") {
    const response = await base44.functions.invoke("getReferralProgram", {});
    if (!response.data?.success) throw new Error(response.data?.error || "Could not load referral settings");
    return { ...response.data.program, rewarded_users: response.data.rewarded_users };
  }
  const response = await base44.functions.invoke("getAnimatedNameFreeTrialStatus", {});
  if (!response.data?.trial) throw new Error("Could not load free trial settings");
  return response.data.trial;
}

export function useAdminConsoleData(user, activeTab, userFilters = {}, options = {}) {
  const queryClient = useQueryClient();
  const role = effectiveRoleForUser(user);
  const allowed = Boolean(user?.id) && canAccessAdminPanel(role);
  const scope = `${user?.id}:${role}`;
  const directoryTab = ["users", "roles", "ranked"].includes(activeTab);
  const sharedOnly = activeTab === "users" && Boolean(userFilters.sharedOnly);
  const userFilter = activeTab === "users" && ["banned", "suspended", "premium", "new"].includes(userFilters.filter) ? userFilters.filter : "all";
  const tournamentRosterId = options.tournamentRosterId || null;
  const required = sectionKeys[activeTab] || sectionKeys.dashboard;
  const enabledKeys = new Set(required);
  // Closed panels do not need platform-wide totals, rosters or player lists.
  if (options.overviewOpen) enabledKeys.add("dashboardOverview");
  if (activeTab === "tournaments") {
    if (options.tournamentInviteOnly || tournamentRosterId) enabledKeys.add("users");
    if (tournamentRosterId) enabledKeys.add("tournamentParticipants");
  }
  const [directorySearches, setDirectorySearches] = useState({});
  const searchScope = `${scope}:${activeTab}`;
  const userSearch = directorySearches[searchScope] || "";
  useEffect(() => {
    const timer = setTimeout(() => setDirectorySearches((current) => ({ ...current, [searchScope]: String(userFilters.search || "").trim() })), 300);
    return () => clearTimeout(timer);
  }, [userFilters.search, searchScope]);
  const userDirectory = useInfiniteQuery({
    queryKey: ["admin-console", user?.id, role, "userDirectory", activeTab, userSearch, sharedOnly, userFilter],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const response = await base44.functions.invoke("getAdminUsers", { cursor: pageParam, search: userSearch, filter: userFilter, shared_only: sharedOnly, include_security: activeTab === "users", include_wallets: activeTab === "users", include_ranked: activeTab === "ranked" });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load users");
      return response.data;
    },
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: allowed && directoryTab,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
  const directoryRows = useMemo(() => [...new Map((userDirectory.data?.pages || [])
    .flatMap((page) => page.rows).map((row) => [row.id, row])).values()], [userDirectory.data]);
  const queries = useQueries({
    queries: queryKeys.map((key) => ({
      queryKey: ["admin-console", user?.id, role, key, ...(key === "tournamentParticipants" ? [tournamentRosterId] : [])],
      queryFn: () => key === "referralProgram" && !canManageRoles(role) ? null : loadRows(key, tournamentRosterId),
      enabled: allowed && enabledKeys.has(key),
      staleTime: 30000,
      refetchInterval: key === "dashboardOverview" && activeTab === "dashboard" ? 60_000
        : key === "marketplace" && activeTab === "marketplace" ? 10_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    })),
    combine: combineQueries,
  });
  const sectionLoading = allowed && required.some((key) => !queries.status[key].ready && queries.status[key].pending);
  const data = useMemo(() => directoryTab ? { ...queries.data, users: directoryRows } : queries.data,
    [directoryTab, queries.data, directoryRows]);

  useQuery({
    queryKey: ["admin-console", user?.id, role, "tournamentLifecycle"],
    queryFn: async () => {
      const response = await base44.functions.invoke("syncTournamentLifecycle", {});
      if (response.data?.synced?.length) {
        void queryClient.invalidateQueries({
          queryKey: ["admin-console", user.id, role],
          predicate: (query) => ["dashboardOverview", "tournaments", "tournamentMatches", "tournamentParticipants"].includes(query.queryKey[3]),
        });
      }
      return response.data;
    },
    enabled: allowed && canManageWallets(role) && !sectionLoading
      && ["dashboard", "tournaments", "tournamentMatches"].includes(activeTab),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    ...queries,
    data,
    userDirectory: { ...userDirectory, rows: directoryRows, total: userDirectory.data?.pages[0]?.total ?? 0,
      searchPending: userSearch !== String(userFilters.search || "").trim() },
    updateUser: (updated) => {
      if (!updated?.id) return;
      queryClient.setQueriesData({ queryKey: ["admin-console", user?.id, role, "userDirectory"] }, (current) => current && ({
        ...current, pages: current.pages.map((page) => ({ ...page,
          rows: page.rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row),
        })),
      }));
      void queryClient.invalidateQueries({ queryKey: ["admin-console", user?.id, role],
        predicate: query => ["dashboardOverview", "auditLog", "auditCounts", "workspaceSearch", "users"].includes(query.queryKey[3]),
      }, { cancelRefetch: false });
      notifyAdminChanged({ playerIds: [updated.id], skipAdminConsole: true });
    },
    sectionLoading,
    sectionError: required.find((key) => !queries.status[key].ready && queries.status[key].error),
    refreshing: [...enabledKeys].some((key) => queries.status[key]?.fetching) || (directoryTab && userDirectory.isFetching),
    refresh: (options = {}) => queryClient.invalidateQueries({ queryKey: ["admin-console", user?.id, role],
      predicate: query => query.queryKey[3] !== "tournamentLifecycle" && !(options.skipSupport && query.queryKey[3] === "ticketQueue"),
    }, { cancelRefetch: false }),
  };
}
