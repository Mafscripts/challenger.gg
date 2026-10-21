import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function usePlayTeams(userId, enabled = true) {
  return useQuery({
    queryKey: ["play-teams", userId],
    queryFn: async () => {
      const result = await base44.profile.teamPage();
      return (result.teams || []).map((team) => ({ ...team, members: result.membersByTeam?.[team.id] || [] }));
    },
    enabled: Boolean(userId && enabled),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
