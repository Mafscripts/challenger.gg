import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Coins, Lock, RefreshCw, ShoppingBag } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import BuyWithCreditsButton from "@/components/marketplace/BuyWithCreditsButton";
import { base44 } from "@/api/base44Client";
import { MarketplaceImage, dedupeById, getItemAccess, toMarketItem } from "@/pages/Marketplace";

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
  const [item, setItem] = useState(null);
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [ownedItemIds, setOwnedItemIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItem();
  }, [id]);

  const loadItem = async () => {
    try {
      setLoading(true);
      const user = await base44.auth.me().catch(() => null);
      if (user) {
        await base44.functions.invoke("syncMarketplaceUnlocks", {}).catch((error) => {
          console.warn("Marketplace unlock sync failed:", error);
        });
      }
      const syncedUser = user ? await base44.auth.me({ force: true }).catch(() => user) : null;
      const [itemRow, rows, inventory] = await Promise.all([
        base44.entities.MarketplaceItem.get(id),
        base44.entities.MarketplaceItem.filter({}, "-created_date", 12),
        syncedUser ? base44.entities.UserInventory.filter({ user_id: syncedUser.id }, "-acquired_date", 500).catch(() => []) : Promise.resolve([]),
      ]);
      setCurrentUser(syncedUser);
      setOwnedItemIds(new Set((inventory || []).map((entry) => entry.item_id).filter(Boolean)));
      setItem(toMarketItem(itemRow));
      setItems(dedupeById((rows || []).map(toMarketItem).filter((candidate) => candidate.active && candidate.showInMarketplace)));
    } catch (error) {
      console.error("Failed to load item:", error);
      setItem(null);
    } finally {
      setLoading(false);
    }
  };

  const relatedItems = useMemo(() => (
    items.filter((candidate) => candidate.id !== item?.id).slice(0, 3)
  ), [items, item?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-vapor">Loading item...</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <ShoppingBag className="w-12 h-12 text-vapor/30 mx-auto mb-3" />
          <h1 className="text-xl font-bold mb-2">Item Not Found</h1>
          <Link to="/marketplace" className="text-cyan hover:underline">Back to Marketplace</Link>
        </div>
      </div>
    );
  }

  const access = getItemAccess(item, currentUser, ownedItemIds);

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
              item.rarity === "mythic" || item.rarity === "epic" || item.rarity === "legendary" || item.premiumOnly
                ? "border-fuchsia-400/30 animate-mythic-glow mythic-shimmer"
                : "border-white/5"
            }`}
          >
            <MarketplaceImage item={item} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
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

            {access.owned ? (
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
                    <BuyWithCreditsButton item={item} onPurchased={() => setOwnedItemIds((prev) => new Set([...prev, item.id]))} />
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
                  <motion.div whileHover={{ y: -4 }} className="glass rounded-xl border border-white/5 overflow-hidden cursor-pointer">
                    <div className="aspect-square bg-secondary overflow-hidden">
                      <MarketplaceImage item={related} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
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
