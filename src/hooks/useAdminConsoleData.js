import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { canAccessAdminPanel, canManageRoles, canManageWallets, effectiveRoleForUser } from "@/lib/roles";

const entities = {
  users: "User", adminAlerts: "AdminAlert", tickets: "Ticket", disputes: "Dispute",
  wagers: "Wager", rankedMatches: "RankedMatch", rankedStats: "RankedStats",
  tournaments: "Tournament", tournamentMatches: "TournamentMatch",
  tournamentParticipants: "TournamentParticipant", wallets: "Wallet",
  withdrawals: "WithdrawalRequest", marketplace: "MarketplaceItem",
  inventory: "UserInventory", adminActions: "AdminAction", systemLogs: "SystemLog",
  messages: "Message",
};
const overviewKeys = ["userCount", "adminAlerts", "ticketCounts", "wagers", "rankedMatches", "tournaments", "withdrawals", "walletSummary"];
const sectionKeys = {
  dashboard: [...overviewKeys, "tournamentMatches", "marketplace", "inventory", "auditCounts"],
  users: ["wallets"], roles: [], alerts: ["adminAlerts", "tickets"],
  tickets: [], wagers: ["wagers"],
  challenges: [], live8s: [], eightsGames: [], ranked: ["users", "rankedMatches", "rankedStats"],
  verifyRank: ["users"],
  tournaments: ["tournaments", "tournamentMatches", "tournamentParticipants", "users", "marketplace"],
  tournamentMatches: ["tournamentMatches"], wallets: [],
  referrals: ["referralProgram"], freeTrials: ["animatedNameFreeTrial", "users"],
  withdrawals: ["withdrawals", "users"], marketplace: ["marketplace"],
  inventory: ["inventory", "users"], audit: [],
};
const queryKeys = [...Object.keys(entities), "userCount", "ticketCounts", "auditCounts", "walletSummary", "referralProgram", "animatedNameFreeTrial"];
const combineQueries = (results) => ({
  data: Object.fromEntries(results.flatMap((result, index) => result.data === undefined ? [] : [[queryKeys[index], result.data]])),
  status: Object.fromEntries(results.map((result, index) => [queryKeys[index], {
    ready: result.data !== undefined, pending: result.isPending, error: result.error,
    fetching: result.isFetching,
  }])),
});

async function loadRows(key) {
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
      return await base44.entities[entities[key]].filterFresh({}, "-created_date", 500);
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

export function useAdminConsoleData(user, activeTab, userFilters = {}) {
  const queryClient = useQueryClient();
  const role = effectiveRoleForUser(user);
  const allowed = Boolean(user?.id) && canAccessAdminPanel(role);
  const scope = `${user?.id}:${role}`;
  const directoryTab = ["users", "roles"].includes(activeTab);
  const sharedOnly = activeTab === "users" && Boolean(userFilters.sharedOnly);
  const [overviewScope, setOverviewScope] = useState(null);
  const overviewReady = overviewScope === scope;
  const required = sectionKeys[activeTab] || sectionKeys.dashboard;
  // Give the opened section priority before starting unrelated overview reads.
  const enabledKeys = new Set([...required, ...(overviewReady ? overviewKeys : [])]);
  const [directorySearches, setDirectorySearches] = useState({});
  const searchScope = `${scope}:${activeTab}`;
  const userSearch = directorySearches[searchScope] || "";
  useEffect(() => {
    const timer = setTimeout(() => setDirectorySearches((current) => ({ ...current, [searchScope]: String(userFilters.search || "").trim() })), 300);
    return () => clearTimeout(timer);
  }, [userFilters.search, searchScope]);
  const userDirectory = useInfiniteQuery({
    queryKey: ["admin-console", user?.id, role, "userDirectory", activeTab, userSearch, sharedOnly],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const response = await base44.functions.invoke("getAdminUsers", { cursor: pageParam, search: userSearch, shared_only: sharedOnly, include_security: activeTab !== "roles" });
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
      queryKey: ["admin-console", user?.id, role, key],
      queryFn: () => key === "referralProgram" && !canManageRoles(role) ? null : loadRows(key),
      enabled: allowed && enabledKeys.has(key),
      staleTime: 30000,
      refetchOnWindowFocus: false,
    })),
    combine: combineQueries,
  });
  const sectionLoading = allowed && required.some((key) => !queries.status[key].ready && queries.status[key].pending);
  const data = useMemo(() => directoryTab ? { ...queries.data, users: directoryRows } : queries.data,
    [directoryTab, queries.data, directoryRows]);

  useEffect(() => {
    if (allowed && !sectionLoading) setOverviewScope(scope);
  }, [allowed, sectionLoading, scope]);

  useEffect(() => {
    if (!allowed || !overviewReady || !canManageWallets(role)) return;
    let active = true;
    // Keep lifecycle updates, but never make opening the console wait for them.
    base44.functions.invoke("syncTournamentLifecycle", {}).then((response) => {
      if (!active || !response.data?.synced?.length) return;
      void queryClient.invalidateQueries({
        queryKey: ["admin-console", user.id, role],
        predicate: (query) => ["tournaments", "tournamentMatches", "tournamentParticipants"].includes(query.queryKey[3]),
      });
    }).catch((error) => console.warn("Tournament lifecycle sync failed:", error));
    return () => { active = false; };
  }, [allowed, overviewReady, user?.id, role, queryClient]);

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
    },
    sectionLoading,
    sectionError: required.find((key) => !queries.status[key].ready && queries.status[key].error),
    refreshing: [...enabledKeys].some((key) => queries.status[key]?.fetching) || (directoryTab && userDirectory.isFetching),
    refresh: () => queryClient.invalidateQueries({ queryKey: ["admin-console", user?.id, role] }),
  };
}
