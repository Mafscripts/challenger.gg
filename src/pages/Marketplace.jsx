import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Lock, Search, ShoppingBag, Sparkles } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import CreditsStore from "@/components/marketplace/CreditsStore";
import BuyWithCreditsButton from "@/components/marketplace/BuyWithCreditsButton";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

export const toMarketItem = (item) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  price: Number(item.price_credits ?? item.price ?? 0),
  cashPrice: Number(item.price_cash || 0),
  creditPrice: Number(item.price_credits ?? item.price ?? 0),
  rarity: item.rarity || "common",
  category: item.category || "cosmetic",
  img: item.image_url || "",
  limited: item.is_limited,
  unlockType: item.unlock_type || (item.is_premium_only ? "premium" : "marketplace"),
  unlockRequirement: item.unlock_requirement || "",
  premiumOnly: item.is_premium_only || item.unlock_type === "premium",
  isFeatured: item.is_featured === true,
  showInMarketplace: item.show_in_marketplace !== false,
  active: item.is_active !== false && item.is_available !== false,
  stock: item.stock_quantity === undefined || item.stock_quantity === null || item.stock_quantity === "" ? null : Number(item.stock_quantity),
});

const categoryLabel = (value) => String(value || "cosmetic").replace(/_/g, " ");
const marketplaceManagers = ["ceo", "super_admin", "admin"];

export const dedupeById = (rows = []) => {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row?.id) return true;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
};

export const unlockRequirementText = (item) => {
  const requirement = item.unlockRequirement || "";
  switch (item.unlockType) {
    case "ranked":
      return requirement ? `Reach ${requirement} ELO` : "Reach the required ranked ELO";
    case "tournament":
      return requirement ? `Win ${requirement} tournament${Number(requirement) === 1 ? "" : "s"}` : "Win the required tournament";
    case "wager":
      return requirement ? `Win ${requirement} wager${Number(requirement) === 1 ? "" : "s"}` : "Win the required wagers";
    case "eights":
      return requirement ? `Win ${requirement} 8s match${Number(requirement) === 1 ? "" : "es"}` : "Win the required 8s matches";
    case "premium":
      return "Premium subscription required";
    default:
      return "";
  }
};

export const getItemAccess = (item, user, ownedItemIds = new Set()) => {
  if (ownedItemIds.has(item.id)) return { buyable: false, locked: false, owned: true, label: "Owned" };
  if (item.stock === 0) return { buyable: false, locked: true, owned: false, label: "Out of Stock" };
  if (item.unlockType === "marketplace") return { buyable: true, locked: false, owned: false, label: "" };
  if (item.unlockType === "premium" && user?.is_premium) return { buyable: true, locked: false, owned: false, label: "" };
  return { buyable: false, locked: true, owned: false, label: unlockRequirementText(item) || "Locked" };
};

const premiumEffectClass = (item) => {
  if (item.premiumOnly || item.rarity === "exclusive") return "animate-exclusive-glow exclusive-shimmer";
  if (["epic", "legendary", "mythic"].includes(item.rarity)) return "animate-mythic-glow mythic-shimmer";
  return "";
};

export function MarketplaceImage({ item, className = "" }) {
  const [failed, setFailed] = useState(false);
  if (!item.img || failed) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-secondary ${className}`}>
        <ShoppingBag className="w-12 h-12 text-vapor/30" />
      </div>
    );
  }
  return <img src={item.img} alt={item.name} onError={() => setFailed(true)} className={className} />;
}

export default function Marketplace() {
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [category, setCategory] = useState("All");
  const [rarity, setRarity] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [ownedItemIds, setOwnedItemIds] = useState(new Set());

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const user = await base44.auth.me().catch(() => null);
      if (user) {
        await base44.functions.invoke("syncMarketplaceUnlocks", {}).catch((error) => {
          console.warn("Marketplace unlock sync failed:", error);
        });
      }
      const syncedUser = user ? await base44.auth.me({ force: true }).catch(() => user) : null;
      const [rows, inventory] = await Promise.all([
        base44.entities.MarketplaceItem.filter({}, "-created_date", 200),
        syncedUser ? base44.entities.UserInventory.filter({ user_id: syncedUser.id }, "-acquired_date", 500).catch(() => []) : Promise.resolve([]),
      ]);
      setCurrentUser(syncedUser);
      setOwnedItemIds(new Set((inventory || []).map((entry) => entry.item_id).filter(Boolean)));
      setItems(dedupeById((rows || []).map(toMarketItem).filter((item) => item.active)));
    } catch (error) {
      console.error("Failed to load marketplace:", error);
      toast({ title: "Marketplace unavailable", description: "Could not load marketplace items.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const marketplaceItems = useMemo(() => dedupeById(items.filter((item) => item.showInMarketplace)), [items]);
  const featuredItems = useMemo(() => dedupeById(items.filter((item) => item.isFeatured)).slice(0, 4), [items]);
  const visibleItemsCount = featuredItems.length + marketplaceItems.length;

  const categories = useMemo(() => ["All", ...new Set(marketplaceItems.map((item) => item.category))], [marketplaceItems]);
  const rarities = useMemo(() => ["All", ...new Set(marketplaceItems.map((item) => item.rarity))], [marketplaceItems]);

  const filtered = marketplaceItems.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    if (rarity !== "All" && item.rarity !== rarity) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const canManageMarketplace = marketplaceManagers.includes(currentUser?.role) || marketplaceManagers.includes(currentUser?.admin_role) || currentUser?.is_admin;

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-2">Marketplace</h1>
            <p className="text-vapor text-sm">Database-backed cosmetics and collectibles</p>
          </div>
          <button onClick={loadItems} className="px-4 py-2 bg-secondary text-vapor text-xs font-bold rounded-lg hover:bg-white/10">
            Refresh
          </button>
        </div>

        <CreditsStore />

        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-vapor">Loading marketplace...</p>
          </div>
        ) : visibleItemsCount === 0 ? (
          <div className="glass rounded-xl border border-white/5 py-16 text-center">
            <ShoppingBag className="w-12 h-12 text-vapor/30 mx-auto mb-3" />
            <p className="text-sm text-vapor">No marketplace items are visible.</p>
            {canManageMarketplace && (
              <Link to="/admin" className="inline-flex items-center gap-2 mt-5 px-4 py-2 bg-cyan/10 text-cyan text-xs font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all">
                Create items in Admin
              </Link>
            )}
          </div>
        ) : (
          <>
            {featuredItems.length > 0 && (
              <div className="mb-10">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-yellow-400" /> Featured Items
                  </h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                  {featuredItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      user={currentUser}
                      ownedItemIds={ownedItemIds}
                      onPurchased={(itemId) => setOwnedItemIds((prev) => new Set([...prev, itemId]))}
                      featured
                    />
                  ))}
                </div>
              </div>
            )}

            {marketplaceItems.length > 0 && (
              <>
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vapor" />
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((item) => (
                      <button
                        key={item}
                        onClick={() => setCategory(item)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                          category === item ? "bg-cyan/10 text-cyan border border-cyan/20" : "bg-secondary text-vapor"
                        }`}
                      >
                        {item === "All" ? "All" : categoryLabel(item)}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rarities.map((item) => (
                      <button
                        key={item}
                        onClick={() => setRarity(item)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all capitalize ${
                          rarity === item ? "bg-purple-400/10 text-purple-400 border border-purple-400/20" : "bg-secondary text-vapor"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {filtered.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                    {filtered.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        user={currentUser}
                        ownedItemIds={ownedItemIds}
                        onPurchased={(itemId) => setOwnedItemIds((prev) => new Set([...prev, itemId]))}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="glass rounded-xl border border-white/5 py-10 text-center text-sm text-vapor">
                    No marketplace items match these filters.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item, user, ownedItemIds, onPurchased, featured = false }) {
  const access = getItemAccess(item, user, ownedItemIds);

  return (
    <Link to={`/item/${item.id}`}>
      <motion.div
        whileHover={{ y: featured ? -8 : -4, scale: featured ? 1.02 : 1, transition: { duration: 0.1, ease: "easeOut" } }}
        className={`relative glass rounded-xl border overflow-hidden transition-all group cursor-pointer ${premiumEffectClass(item)} ${
          item.rarity === "exclusive" ? "border-cyan/30 glow-cyan" :
          item.rarity === "mythic" ? "border-fuchsia-400/30" :
          item.rarity === "legendary" ? "border-yellow-400/20" :
          item.rarity === "epic" ? "border-purple-400/20" :
          "border-white/5 hover:border-white/10"
        }`}
      >
        <div className="aspect-square relative overflow-hidden bg-secondary">
          <MarketplaceImage item={item} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <RarityBadge rarity={item.rarity} />
            {item.limited && <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-mono font-bold">LIMITED</span>}
            {item.premiumOnly && <span className="px-2 py-0.5 rounded bg-yellow-400/20 text-yellow-400 text-[10px] font-mono font-bold flex items-center gap-1"><Crown className="w-2.5 h-2.5" /> PREMIUM</span>}
          </div>
          {(access.locked || access.owned) && (
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
              <Lock className={`w-7 h-7 mb-2 ${access.owned ? "text-green" : "text-orange"}`} />
              <span className={`text-xs font-mono font-bold text-center px-4 ${access.owned ? "text-green" : "text-orange"}`}>{access.label}</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <h4 className="font-semibold text-xs mb-1 truncate">{item.name}</h4>
          <p className="text-[10px] text-vapor capitalize mb-2">{categoryLabel(item.category)}</p>
          {access.owned ? (
            <span className="text-green font-mono font-bold text-[10px] flex items-center gap-1">Owned</span>
          ) : access.locked ? (
            <span className="text-vapor font-mono font-bold text-[10px] flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> {access.label}</span>
          ) : (
            <>
              <span className="text-green font-mono font-bold text-sm">{item.creditPrice} Credits</span>
              {item.cashPrice > 0 && <span className="ml-2 text-vapor font-mono text-[10px]">${item.cashPrice.toFixed(2)}</span>}
              <div className="mt-2"><BuyWithCreditsButton item={item} size="sm" onPurchased={() => onPurchased?.(item.id)} /></div>
            </>
          )}
        </div>
      </motion.div>
    </Link>
  );
}
