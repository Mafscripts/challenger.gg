import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const emptyRows = [];
export const leaderboardQueryOptions = {
  staleTime: 15_000,
  gcTime: 5 * 60_000,
  refetchOnMount: "always",
  refetchOnWindowFocus: false,
};

export default function useCompetitionLeaderboard(mode, gameId) {
  const { user } = useAuth();
  const enabled = Boolean(user?.id);
  const userOrder = mode === "wagers" ? "-total_wager_earnings" : "-created_date";
  const users = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["leaderboard-users", user?.id, userOrder],
    queryFn: () => base44.entities.User.filter({}, userOrder, 500),
    enabled,
  });
  const standings = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["competition-standings", user?.id, mode, mode === "eights" ? gameId : "all"],
    queryFn: async () => {
      if (mode === "ranked") return base44.entities.RankedStats.filterFresh({}, "-elo", 500);
      const name = mode === "eights" ? "getFreeEightsStandings" : mode === "money8s" ? "getMoneyEightsStandings" : "getXPStandings";
      const response = await base44.functions.invoke(name, mode === "eights" ? { game_id: gameId } : {});
      if (response.data?.success === false) throw new Error(response.data.error || "Standings could not be loaded.");
      return response.data?.rows || [];
    },
    enabled: enabled && mode !== "wagers",
  });
  // These decorate rows and summary cards; they must not block the standings.
  const extraXP = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["competition-standings", user?.id, "xp", "all"],
    queryFn: async () => (await base44.functions.invoke("getXPStandings", {})).data?.rows || [],
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
