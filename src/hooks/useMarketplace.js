import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const emptyInventory = new Set();

export function useMarketplaceCatalog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["marketplace-catalog", user?.id],
    queryFn: () => base44.entities.MarketplaceItem.filterFresh({}, "-created_date", 200, { timeoutMs: 15000 }),
    enabled: Boolean(user?.id),
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useMarketplaceAccount() {
  const { user, isLoadingAuth } = useAuth();
  // Ownership sync is independent of the catalog: browsing never waits for it.
  // Share it between the marketplace and item pages instead of syncing on every navigation.
  const inventory = useQuery({
    queryKey: ["marketplace-owned-items", user?.id],
    queryFn: async () => {
      await base44.functions.invoke("syncMarketplaceUnlocks", {}).catch((error) => {
        console.warn("Marketplace unlock sync failed:", error);
      });
      const rows = await base44.entities.UserInventory.filterFresh({ user_id: user.id }, "-acquired_date", 500, { timeoutMs: 15000 });
      return new Set(rows.map((entry) => entry.item_id).filter(Boolean));
    },
    enabled: Boolean(user?.id),
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return {
    user,
    isLoadingAuth,
    ownedItemIds: inventory.data || emptyInventory,
    ownershipPending: isLoadingAuth || Boolean(user && inventory.isPending),
    ownershipError: inventory.isError,
    refreshOwnership: inventory.refetch,
  };
}
