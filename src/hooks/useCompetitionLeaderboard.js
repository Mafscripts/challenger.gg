import { PRIMARY_GAME_ID } from "@/lib/mw4";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const emptyRows = [];
export const leaderboardQueryOptions = {
  staleTime: 15_000,
  gcTime: 5 * 60_000,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
};

export async function loadLeaderboardPlayers(order) {
  const response = await base44.functions.invoke("getLeaderboardPlayers", { order });
  if (!response.data?.success) throw new Error(response.data?.error || "Players could not be loaded.");
  return response.data.rows || [];
}

export function useLeaderboardAvatars(userIds, enabled = true) {
  const { user } = useAuth();
  const ids = [...new Set(userIds.filter(Boolean))].sort();
  return useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["leaderboard-avatars", user?.id, ids.join("|")],
    queryFn: async () => {
      const response = await base44.functions.invoke("getLeaderboardAvatars", { user_ids: ids });
      if (!response.data?.success) throw new Error(response.data?.error || "Player photos could not be loaded.");
      return response.data.avatars || {};
    },
    enabled: Boolean(user?.id && ids.length && enabled),
  }).data || {};
}

export default function useCompetitionLeaderboard(mode, gameId = PRIMARY_GAME_ID) {
  const { user } = useAuth();
  const enabled = Boolean(user?.id);
  const userOrder = mode === "wagers" ? "-total_wager_earnings" : "-created_date";
  const users = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["leaderboard-users", user?.id, userOrder],
    queryFn: () => loadLeaderboardPlayers(userOrder),
    enabled,
  });
  const standings = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["competition-standings", user?.id, mode, gameId],
    queryFn: async () => {
      if (mode === "ranked") return (await base44.functions.invoke("getRankedStandings", { game_id: gameId })).data?.rows || [];
      const name = mode === "eights" ? "getFreeEightsStandings" : mode === "money8s" ? "getMoneyEightsStandings" : "getXPStandings";
      const response = await base44.functions.invoke(name, { game_id: gameId });
      if (response.data?.success === false) throw new Error(response.data.error || "Standings could not be loaded.");
      return response.data?.rows || [];
    },
    enabled: enabled && mode !== "wagers",
  });
  // These decorate rows and summary cards; they must not block the standings.
  const extraXP = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["competition-standings", user?.id, "xp", gameId],
    queryFn: async () => (await base44.functions.invoke("getXPStandings", { game_id: gameId })).data?.rows || [],
    enabled: enabled && ["money8s", "wagers"].includes(mode),
  });
  const tournaments = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["leaderboard-upcoming-tournaments", user?.id],
    queryFn: async () => (await base44.entities.Tournament.filter({}, "start_date", 100))
      .filter(row => ["open", "registration"].includes(row.status)),
    enabled: enabled && ["ranked", "xp", "wagers"].includes(mode),
  });
  return {
    users: users.data || emptyRows,
    xpRows: (mode === "xp" ? standings.data : extraXP.data) || emptyRows,
    rankedRows: mode === "ranked" ? standings.data || emptyRows : emptyRows,
    eightsRows: mode === "eights" ? standings.data || emptyRows : emptyRows,
    moneyRows: mode === "money8s" ? standings.data || emptyRows : emptyRows,
    tournaments: tournaments.data || emptyRows,
    extraXPPending: ["money8s", "wagers"].includes(mode) && !extraXP.data,
    loading: users.isPending || (mode !== "wagers" && standings.isPending),
    error: users.error || (mode !== "wagers" && standings.error),
    retry: () => { void users.refetch(); if (mode !== "wagers") void standings.refetch(); },
  };
}
