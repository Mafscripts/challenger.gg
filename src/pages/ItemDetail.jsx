import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Coins, Lock, RefreshCw, ShoppingBag } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import BuyWithCreditsButton from "@/components/marketplace/BuyWithCreditsButton";
import { base44 } from "@/api/base44Client";
import { useMarketplaceAccount, useMarketplaceCatalog } from "@/hooks/useMarketplace";
import { MarketplaceImage, dedupeById, getItemAccess, toMarketItem } from "@/pages/Marketplace";
import PageLoader from "@/components/ui/PageLoader";

const rarityDescriptions = {
  common: "A solid entry-level cosmetic for everyday operators.",
  rare: "A distinctive design that stands out in any lobby.",
  epic: "A premium cosmetic with vibrant effects and detailed textures.",
  legendary: "A masterfully crafted cosmetic representing competitive excellence.",
  mythic: "An ultra-rare mythic item with collection prestige.",
  exclusive: "An exclusive limited-edition cosmetic reserved for dedicated competitors.",
};

const categoryLabel = (value) => String(value || "cosmetic").replace(/_/g, " ");

export default function ItemDetail() {
  const { id } = useParams();
  const { user: currentUser, isLoadingAuth, ownedItemIds, ownershipPending, ownershipError, refreshOwnership } = useMarketplaceAccount();
  const catalog = useMarketplaceCatalog();
  const detail = useQuery({
    queryKey: ["marketplace-item", currentUser?.id, id],
    queryFn: () => base44.entities.MarketplaceItem.getFresh(id, { timeoutMs: 15000 }),
    initialData: () => catalog.data?.find((row) => row.id === id),
    initialDataUpdatedAt: () => catalog.dataUpdatedAt,
    enabled: Boolean(currentUser?.id && id),
    staleTime: 60000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const item = detail.data ? toMarketItem(detail.data) : null;
  const loading = isLoadingAuth || Boolean(currentUser && detail.isPending);
  const loadItem = () => {
    if (!currentUser || detail.isFetching) return;
    void detail.refetch();
    void catalog.refetch();
    void refreshOwnership();
  };

  const relatedItems = useMemo(() => (
    dedupeById((catalog.data || []).map(toMarketItem).filter((candidate) => candidate.active && candidate.showInMarketplace && candidate.id !== id)).slice(0, 3)
  ), [catalog.data, id]);

  if (loading) {
    return <PageLoader label="Loading item" />;
  }

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <ShoppingBag className="w-12 h-12 text-vapor/30 mx-auto mb-3" />
          <h1 className="text-xl font-bold mb-2">{detail.isError ? "Could not load this item" : "Item Not Found"}</h1>
          {detail.isError && <button type="button" onClick={loadItem} disabled={detail.isFetching} className="block mx-auto mb-3 text-cyan">Try again</button>}
          <Link to="/marketplace" className="text-cyan hover:underline">Back to Marketplace</Link>
        </div>
      </div>
    );
  }

  const access = getItemAccess(item, currentUser, ownedItemIds, { pending: ownershipPending, error: ownershipError });

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <Link to="/marketplace" className="inline-flex items-center gap-2 text-vapor hover:text-foreground text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Marketplace
        </Link>

        <div className="grid lg:grid-cols-2 gap-10">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`relative glass rounded-2xl border overflow-hidden aspect-square group ${
              item.unlockType !== "competition_reward" && (item.rarity === "mythic" || item.rarity === "epic" || item.rarity === "legendary" || item.premiumOnly)
                ? "border-fuchsia-400/30 animate-mythic-glow mythic-shimmer"
                : "border-white/5"
            }`}
          >
            <MarketplaceImage priority={3} item={item} className={`w-full h-full object-contain ${item.unlockType === "competition_reward" ? "" : "group-hover:scale-105 transition-transform duration-700"}`} />
            <div className="absolute top-4 left-4">
              <RarityBadge rarity={item.rarity} />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <RarityBadge rarity={item.rarity} className="mb-4" />
            <h1 className="text-3xl font-black tracking-tight mb-2">{item.name}</h1>
            <p className="text-sm text-vapor capitalize mb-1">{categoryLabel(item.category)}</p>
            <p className="text-vapor leading-relaxed mb-8 mt-4">
              {item.description || rarityDescriptions[item.rarity] || rarityDescriptions.common}
            </p>

            {access.pending ? <div className="glass rounded-xl border border-white/5 p-5 mb-6 text-sm text-vapor" role="status">{access.label}{ownershipError && <button type="button" onClick={() => refreshOwnership()} className="block mt-2 text-cyan">Try again</button>}</div> : access.owned ? (
              <>
                <div className="glass rounded-xl border border-green/20 p-5 mb-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-green/10 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-6 h-6 text-green" />
                  </div>
                  <div>
                    <p className="font-bold text-sm mb-0.5">Owned</p>
                    <p className="text-xs text-vapor">This item is already in your inventory.</p>
                  </div>
                </div>
                <button disabled className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-green/10 text-green font-bold text-sm rounded-lg uppercase tracking-wider cursor-not-allowed mb-8">
                  Owned
                </button>
              </>
            ) : access.locked ? (
              <>
                <div className="glass rounded-xl border border-white/5 p-5 mb-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-orange/10 flex items-center justify-center shrink-0">
                    <Lock className="w-6 h-6 text-orange" />
                  </div>
                  <div>
                    <p className="font-bold text-sm mb-0.5">{item.stock === 0 ? "Out of Stock" : "Locked Item"}</p>
                    <p className="text-xs text-vapor">{access.label || "This item is not currently purchasable."}</p>
                  </div>
                </div>
                <button disabled className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-secondary text-vapor font-bold text-sm rounded-lg uppercase tracking-wider cursor-not-allowed mb-8">
                  <Lock className="w-4 h-4" /> Unavailable
                </button>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-3 mb-6">
                  <span className="text-4xl font-black font-mono text-cyan">{item.creditPrice} Credits</span>
                  {item.cashPrice > 0 && <span className="text-vapor text-sm">Cash value ${item.cashPrice.toFixed(2)}</span>}
                  <span className="text-lg font-bold font-mono text-cyan flex items-center gap-1">
                    <Coins className="w-4 h-4" />
                  </span>
                </div>
                <div className="flex gap-3 mb-8">
                  <div className="flex-1">
                    <BuyWithCreditsButton item={item} onPurchased={refreshOwnership} />
                  </div>
                  <button onClick={loadItem} className="px-6 py-4 border border-white/10 font-bold text-sm rounded-lg hover:bg-white/5 transition-all uppercase tracking-wider">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>

        {relatedItems.length > 0 && (
          <div className="mt-16">
            <h2 className="text-xl font-bold mb-6">Related Items</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              {relatedItems.map((related) => (
                <Link key={related.id} to={`/item/${related.id}`}>
                  <motion.div whileHover={{ y: -4, transition: { duration: 0.1, ease: "easeOut" } }} className="glass rounded-xl border border-white/5 overflow-hidden cursor-pointer">
                    <div className="aspect-square bg-secondary overflow-hidden">
                      <MarketplaceImage item={related} className={`w-full h-full object-contain ${related.unlockType === "competition_reward" ? "" : "hover:scale-105 transition-transform duration-500"}`} />
                    </div>
                    <div className="p-4">
                      <RarityBadge rarity={related.rarity} className="mb-2" />
                      <h4 className="font-semibold text-sm mb-1">{related.name}</h4>
                      <span className="text-cyan font-mono font-bold text-sm">{related.creditPrice} Credits</span>
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
