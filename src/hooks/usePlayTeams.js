import { useQuery } from "@tanstack/react-query";
import { loadPlayTeams } from "@/lib/playTeams";
import { base44 } from "@/api/base44Client";

export default function usePlayTeams(userId, enabled = true) {
  return useQuery({
    queryKey: ["play-teams", userId],
    queryFn: () => loadPlayTeams(base44),
    enabled: Boolean(userId && enabled),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}
