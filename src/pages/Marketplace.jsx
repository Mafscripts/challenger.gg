import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCircle2, Coins, Crown, Image as ImageIcon, Lock, Medal, Package, RefreshCw, Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Swords, Trophy } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import CreditsStore from "@/components/marketplace/CreditsStore";
import BuyWithCreditsButton from "@/components/marketplace/BuyWithCreditsButton";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import CompetitionHero from "@/components/competition/CompetitionHero";
import "@/styles/marketplace.css";
import PageLoader from "@/components/ui/PageLoader";

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

const isRemovedInvitationalTrophy = (item) => {
  const text = `${item?.category || ""} ${item?.name || ""} ${item?.description || ""} ${item?.unlock_key || ""}`.toLowerCase();
  const isTrophy = item?.category === "trophy" || text.includes("trophy");
  return isTrophy && (text.includes("invit") || text.includes("champion"));
};

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

const categoryIcon = (category) => /trophy/.test(category) ? Trophy : /badge/.test(category) ? Medal
  : /frame|card|banner/.test(category) ? ImageIcon : /knife|weapon|blade/.test(category) ? Swords : Package;

export function MarketplaceImage({ item, className = "" }) {
  const [failed, setFailed] = useState(false);
  if (!item.img || failed) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-secondary ${className}`}>
        <ShoppingBag className="w-12 h-12 text-vapor/30" />
      </div>
    );
  }
  return <img src={item.img} alt={item.name} loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
}

export default function Marketplace() {
  const [items, setItems] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [category, setCategory] = useState("All");
  const [rarity, setRarity] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ownedItemIds, setOwnedItemIds] = useState(new Set());

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
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
      setItems(dedupeById((rows || []).filter((item) => !isRemovedInvitationalTrophy(item)).map(toMarketItem).filter((item) => (
        item.active && !["8s", "eights", "xp"].includes(String(item.unlockType || "").toLowerCase())
      ))));
    } catch (error) {
      console.error("Failed to load marketplace:", error);
      toast({ title: "Marketplace unavailable", description: "Could not load marketplace items.", variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const marketplaceItems = useMemo(() => dedupeById(items.filter((item) => item.showInMarketplace)), [items]);
  const featuredItems = useMemo(() => dedupeById(items.filter((item) => item.isFeatured)).slice(0, 4), [items]);
  const visibleItemsCount = dedupeById([...featuredItems, ...marketplaceItems]).length;

  const categories = useMemo(() => ["All", ...new Set(marketplaceItems.map((item) => item.category))], [marketplaceItems]);
  const rarities = useMemo(() => ["All", ...new Set(marketplaceItems.map((item) => item.rarity))], [marketplaceItems]);

  const filtered = marketplaceItems.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    if (rarity !== "All" && item.rarity !== rarity) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const canManageMarketplace = marketplaceManagers.includes(currentUser?.role) || marketplaceManagers.includes(currentUser?.admin_role) || currentUser?.is_admin;

  if (loading) {
    return <PageLoader label="Loading marketplace" />;
  }

  const clearFilters = () => { setCategory("All"); setRarity("All"); setSearch(""); };
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "auto" });
  return (
    <div className="marketplace-page competition-surface page-shell min-h-screen" data-competition="marketplace">
      <div className="page-container">
        <CompetitionHero mode="marketplace" title="Marketplace" eyebrow="The TopFragg collection"
          description="Make your profile your own. Discover cosmetics, collect standout pieces and showcase the rewards you earned."
          className="marketplace-hero mb-6" count={visibleItemsCount} countLabel="items"
          metadata={<><ShieldCheck size={14} />Your style. Your collection.</>}
          action={<div className="competition-actions"><Link to="/inventory" className="site-hover competition-action-pill marketplace-primary"><Package size={15} />My inventory<ArrowUpRight size={15} /></Link><button type="button" onClick={loadItems} disabled={refreshing} className="site-hover competition-action-pill"><RefreshCw size={14} />{refreshing ? "Refreshing…" : "Refresh"}</button></div>}
        />
        <nav className="marketplace-shortcuts" aria-label="Marketplace sections">
          {featuredItems.length > 0 && <button type="button" onClick={() => scrollTo("marketplace-featured")} className="site-hover" data-tone="purple"><Sparkles size={17} /><span>Featured pieces</span><ArrowRight size={14} /></button>}
          {marketplaceItems.length > 0 && <button type="button" onClick={() => scrollTo("marketplace-collection")} className="site-hover" data-tone="cyan"><ShoppingBag size={17} /><span>Explore the collection</span><ArrowRight size={14} /></button>}
          <button type="button" onClick={() => scrollTo("credits-store")} className="site-hover" data-tone="gold"><Coins size={17} /><span>Credits Store</span><ArrowRight size={14} /></button>
        </nav>

        <CreditsStore user={currentUser} />

        {visibleItemsCount === 0 ? (
          <div className="marketplace-empty"><ShoppingBag size={32} /><h2>The next collection starts here.</h2><p>No marketplace items are visible yet. Check back for new pieces.</p>
            {canManageMarketplace && <Link to="/admin" className="site-hover marketplace-button">Create items in Admin<ArrowUpRight size={14} /></Link>}
          </div>
        ) : <>
          {featuredItems.length > 0 && <section id="marketplace-featured" className="marketplace-section" aria-labelledby="marketplace-featured-title">
            <div className="marketplace-section-heading"><div><p className="marketplace-eyebrow"><Sparkles size={13} />The spotlight</p><h2 id="marketplace-featured-title">Featured pieces<span>.</span></h2><p>Standout designs from the TopFragg collection.</p></div><span className="marketplace-section-count">{featuredItems.length} featured</span></div>
            <div className="marketplace-item-grid">{featuredItems.map((item) => <ItemCard key={item.id} item={item} user={currentUser} ownedItemIds={ownedItemIds} onPurchased={(itemId) => setOwnedItemIds((prev) => new Set([...prev, itemId]))} featured />)}</div>
          </section>}

          {marketplaceItems.length > 0 && <section id="marketplace-collection" className="marketplace-section" aria-labelledby="marketplace-collection-title">
            <div className="marketplace-section-heading"><div><p className="marketplace-eyebrow"><ShoppingBag size={13} />Find your signature</p><h2 id="marketplace-collection-title">Explore the collection<span>.</span></h2><p>Browse by style, category and rarity.</p></div><span className="marketplace-section-count" role="status">{filtered.length} {filtered.length === 1 ? "item" : "items"}</span></div>
            <div className="marketplace-filters">
              <div className="marketplace-filter-top"><span><SlidersHorizontal size={15} />Make it your style</span><label className="marketplace-search"><Search size={15} /><span className="sr-only">Search marketplace items</span><input type="search" placeholder="Find your next collectible…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
              <div className="marketplace-filter-row"><span>Category</span><div role="group" aria-label="Filter items by category">{categories.map((value) => { const Icon = value === "All" ? ShoppingBag : categoryIcon(value); return <button type="button" key={value} onClick={() => setCategory(value)} aria-pressed={category === value} className="site-hover marketplace-filter"><Icon size={13} />{value === "All" ? "All items" : categoryLabel(value)}</button>; })}</div></div>
              <div className="marketplace-filter-row"><span>Rarity</span><div role="group" aria-label="Filter items by rarity">{rarities.map((value) => <button type="button" key={value} onClick={() => setRarity(value)} aria-pressed={rarity === value} data-rarity={value} className="site-hover marketplace-filter"><span className="marketplace-rarity-dot" />{value === "All" ? "All rarities" : value}</button>)}</div></div>
            </div>
            {filtered.length > 0 ? <div className="marketplace-item-grid">{filtered.map((item) => <ItemCard key={item.id} item={item} user={currentUser} ownedItemIds={ownedItemIds} onPurchased={(itemId) => setOwnedItemIds((prev) => new Set([...prev, itemId]))} />)}</div>
              : <div className="marketplace-empty"><Search size={30} /><h3>No pieces match your search.</h3><p>Try another name, category or rarity.</p><button type="button" onClick={clearFilters} className="site-hover marketplace-button">Clear filters<ArrowRight size={14} /></button></div>}
          </section>}
        </>}
      </div>
    </div>
  );
}

function ItemCard({ item, user, ownedItemIds, onPurchased, featured = false }) {
  const access = getItemAccess(item, user, ownedItemIds);
  const Icon = categoryIcon(item.category);
  return <article className="marketplace-card" data-rarity={item.rarity} data-featured={featured || undefined}>
    <Link to={`/item/${item.id}`} className="marketplace-item-link">
      <div className="marketplace-item-artwork">
        <MarketplaceImage item={item} className="marketplace-item-image" />
        <div className="marketplace-item-badges"><RarityBadge rarity={item.rarity} className="marketplace-rarity-badge" />{item.limited && <span className="marketplace-limited-badge">Limited</span>}{item.premiumOnly && <span className="marketplace-premium-badge"><Crown size={11} />Premium</span>}</div>
        {(access.locked || access.owned) && <span className="marketplace-access" data-owned={access.owned || undefined}>{access.owned ? <CheckCircle2 size={14} /> : <Lock size={14} />}{access.label}</span>}
      </div>
      <div className="marketplace-item-copy"><p><Icon size={12} />{categoryLabel(item.category)}</p><h3>{item.name}</h3><span className="marketplace-item-details">View details<ArrowUpRight size={13} /></span></div>
    </Link>
    <div className="marketplace-item-footer">
      {access.owned ? <Link to="/inventory" className="site-hover marketplace-owned-link"><CheckCircle2 size={14} />In your collection<ArrowRight size={13} /></Link>
        : access.locked ? <Link to={`/item/${item.id}`} className="site-hover marketplace-unlock-link"><Lock size={13} />Unlock details<ArrowRight size={13} /></Link>
        : <><div className="marketplace-item-price"><span><Coins size={14} /><strong>{item.creditPrice.toLocaleString()}</strong> Credits</span>{item.cashPrice > 0 && <small>${item.cashPrice.toFixed(2)}</small>}</div><BuyWithCreditsButton item={item} size="sm" onPurchased={() => onPurchased?.(item.id)} /></>}
    </div>
  </article>;
}
