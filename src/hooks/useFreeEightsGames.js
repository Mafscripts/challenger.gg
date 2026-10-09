import { useQuery } from "@tanstack/react-query";
export function useFreeEightsGames() {
  return useQuery({ queryKey: ["free-eights-games"], queryFn: async () => {
    const response = await fetch("/api/public/free-eights-games");
    if (!response.ok) throw new Error("Could not load Free 8s games");
    return response.json();
  }, staleTime: 30000, refetchOnWindowFocus: true });
}
