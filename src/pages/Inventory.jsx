import RewardArtwork from "@/components/rewards/RewardArtwork";
import { rewardLabel } from "@/lib/competitionRewards";
import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Crown, Eye, Lock, Package, RefreshCw, Search, ShieldCheck, Shuffle, SlidersHorizontal, Sparkles } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import CompetitionHero from "@/components/competition/CompetitionHero";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import "@/styles/inventory.css";

const categoryLabels = {
  weapon_skin: "Weapon skins", knife: "Knife skins", gloves: "Gloves", agent: "Avatars",
  sticker: "Stickers", patch: "Badges", badge: "Badges", music_kit: "Music kits",
  cosmetic: "Cosmetics", frame: "Profile frames", calling_card: "Calling cards",
  trophy: "Trophies", ranked_reward: "Rank rewards",
};
const categoryLabel = (value) => categoryLabels[value] || String(value || "Cosmetics").replace(/_/g, " ");
const rarities = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "exclusive"];
const buttonClass = "site-hover inventory-button";
const acquisitionDate = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not recorded";

function ItemImage({ item, priority = 0 }) {
  const [failed, setFailed] = useState(false);
  return item.item_image && !failed
    ? <RewardArtwork priority={priority} src={item.item_image} alt={item.item_name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className="inventory-image-fallback"><Package size={40} aria-hidden="true" /></span>;
}

export default function Inventory() {
  const { user, isLoadingAuth } = useAuth();
  const [category, setCategory] = useState("All");
  const [rarity, setRarity] = useState("All");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const opener = useRef(null);
  const query = useQuery({
    queryKey: ["trade-inventory", user?.id, user?.id],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("getTradeInventory", {});
      if (!data?.success) throw new Error(data?.error || "Your inventory could not be loaded. Try again.");
      return data;
    },
    enabled: Boolean(user?.id), staleTime: 15000, retry: false, refetchOnWindowFocus: false,
  });
  const ownedItems = useMemo(() => (query.data?.items || []).filter((item) => item.collection?.visible !== false), [query.data]);
  const categories = ["All", ...new Set(ownedItems.map((item) => categoryLabel(item.item_category)))];
  const availableRarities = rarities.filter((value) => ownedItems.some((item) => item.item_rarity === value));
  const equipped = ownedItems.filter((item) => item.collection?.equipped).length;
  const tradable = ownedItems.filter((item) => item.tradable).length;
  const filtered = ownedItems.filter((item) => {
    if (category !== "All" && categoryLabel(item.item_category) !== category) return false;
    if (rarity !== "All" && item.item_rarity !== rarity) return false;
    if (status === "equipped" && !item.collection?.equipped) return false;
    if (status === "tradable" && !item.tradable) return false;
    if (status === "bound" && item.tradable) return false;
    return `${item.item_name} ${categoryLabel(item.item_category)} ${item.item_rarity}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  const selected = ownedItems.find((item) => item.inventory_id === selectedId);
  const hasFilters = category !== "All" || rarity !== "All" || status !== "all" || search.trim();
  const clearFilters = () => { setCategory("All"); setRarity("All"); setStatus("all"); setSearch(""); };
  const loading = isLoadingAuth || (Boolean(user) && query.isPending);

  return <div className="inventory-page competition-surface page-shell min-h-screen" data-competition="inventory"><div className="page-container">
    <CompetitionHero mode="inventory" className="inventory-hero"
      description="Your cosmetics, collectibles and earned rewards, all in one place. Open an item to explore its story and trading details."
      action={<div className="competition-actions"><Link to="/marketplace" className="site-hover competition-action-pill inventory-primary"><Sparkles size={15} />Browse Marketplace<ArrowRight size={14} /></Link><Link to="/trading" className="site-hover competition-action-pill"><Shuffle size={15} />Trade items</Link></div>}
      metadata={<span className="inventory-hero-note"><ShieldCheck size={14} />Your personal collection</span>} />

    <div className="inventory-summary" aria-label="Collection summary" aria-busy={loading}>
      {[{ label: "Items collected", count: ownedItems.length, icon: Package, tone: "cyan" }, { label: "Equipped", count: equipped, icon: CheckCircle2, tone: "green" }, { label: "Tradable items", count: tradable, icon: Shuffle, tone: "purple" }].map(({ label, count, icon: Icon, tone }) => <div key={label} data-tone={tone}><span><Icon size={20} /></span><div><p>{label}</p><strong>{loading || !query.data ? "—" : `${count}${query.data.has_more && tone === "cyan" ? "+" : ""}`}</strong></div></div>)}
    </div>

    <section className="inventory-filters" aria-label="Inventory filters">
      <div className="inventory-filter-top"><h2><SlidersHorizontal size={16} />Explore your collection</h2><label className="inventory-search"><Search size={16} /><input type="search" name="inventory-search" autoComplete="off" aria-label="Search your inventory" placeholder="Find an item…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <div className="inventory-filter-row"><span>Category</span><div>{categories.map((value) => <button type="button" key={value} className="site-hover inventory-filter" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div></div>
      {availableRarities.length > 0 && <div className="inventory-filter-row"><span>Rarity</span><div>{["All", ...availableRarities].map((value) => <button type="button" key={value} data-rarity={value} className="site-hover inventory-filter" aria-pressed={rarity === value} onClick={() => setRarity(value)}>{value !== "All" && <i aria-hidden="true" />}{value}</button>)}</div></div>}
      <div className="inventory-filter-row"><span>Status</span><div>{[{ key: "all", label: "All items" }, { key: "equipped", label: "Equipped" }, { key: "tradable", label: "Tradable" }, { key: "bound", label: "Not tradable" }].map(({ key, label }) => <button type="button" key={key} className="site-hover inventory-filter" aria-pressed={status === key} onClick={() => setStatus(key)}>{label}</button>)}</div></div>
    </section>

    <div className="inventory-results-heading"><p aria-live="polite">{loading ? "Loading your collection…" : query.data ? `${filtered.length} of ${ownedItems.length} items` : "Your items"}</p><div>{hasFilters && <button type="button" className={buttonClass} onClick={clearFilters}>Clear filters</button>}<button type="button" className={buttonClass} disabled={query.isFetching || !user} onClick={() => query.refetch()}><RefreshCw size={14} />{query.isFetching ? "Refreshing…" : "Refresh"}</button></div></div>
    {query.isError && <div className="inventory-error" role="alert"><p>{query.error.message}</p><button type="button" className={buttonClass} disabled={query.isFetching} onClick={() => query.refetch()}>Try again</button></div>}
    {loading ? <div className="inventory-empty" role="status"><Package size={32} /><h2>Loading your collection</h2><p>Your items will appear here shortly.</p></div>
      : !user ? <div className="inventory-empty"><Lock size={32} /><h2>Sign in to view your inventory</h2><p>Your collection is linked to your TopFragg account.</p><Link to="/login" className={buttonClass}>Sign in<ArrowRight size={14} /></Link></div>
      : !filtered.length && !query.isError ? <div className="inventory-empty"><Package size={32} /><h2>{hasFilters ? "No items match your filters" : "Your collection starts here"}</h2><p>{hasFilters ? "Try another category, rarity or search." : "Collected cosmetics and earned rewards will appear here."}</p>{hasFilters ? <button type="button" className={buttonClass} onClick={clearFilters}>Clear filters</button> : <Link to="/marketplace" className={buttonClass}>Explore Marketplace<ArrowRight size={14} /></Link>}</div>
      : <div className="inventory-grid">{filtered.map((item) => <article key={item.inventory_id} className="inventory-card" data-rarity={item.item_rarity}>
        <button type="button" className="inventory-item-open" aria-label={`View details for ${item.item_name}`} onClick={(event) => { opener.current = event.currentTarget; setSelectedId(item.inventory_id); }}>
          <div className="inventory-artwork"><ItemImage key={item.item_image} item={item} /><div className="inventory-item-badges"><RarityBadge rarity={item.item_rarity} />{item.collection?.premium_only && <span className="inventory-premium"><Crown size={10} />Premium</span>}</div>{item.collection?.equipped && <span className="inventory-equipped"><CheckCircle2 size={12} />Equipped</span>}</div>
          <div className="inventory-item-copy"><p>{categoryLabel(item.item_category)}</p>{item.collection?.reward && <p className="mt-2 text-xs font-bold text-purple-300">{rewardLabel(item.collection.reward)}</p>}<h3>{item.item_name}</h3><span><Eye size={13} />View item details<ArrowRight size={13} /></span></div>
        </button>
        <div className="inventory-item-footer">{item.tradable ? <Link to={`/trading?offer_item=${encodeURIComponent(item.inventory_id)}`} className="site-hover inventory-trade"><Shuffle size={13} />Offer this item<ArrowRight size={13} /></Link> : <p className="inventory-bound"><Lock size={12} />Not tradable<button type="button" className="site-hover" aria-label={`Why ${item.item_name} cannot be traded`} onClick={(event) => { opener.current = event.currentTarget; setSelectedId(item.inventory_id); }}>Why?<ArrowRight size={12} /></button></p>}</div>
      </article>)}</div>}
    {query.data?.has_more && <p className="inventory-limit">Showing your 500 most recently collected items. Counts and filters apply to these items.</p>}

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
      <DialogContent className="inventory-detail" data-rarity={selected?.item_rarity} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        {selected && <><div className="inventory-detail-artwork"><ItemImage priority={3} key={`${selected.inventory_id}:${selected.item_image}`} item={selected} /><RarityBadge rarity={selected.item_rarity} /></div><div className="inventory-detail-copy"><p className="inventory-detail-eyebrow"><Package size={13} />In your collection</p><DialogTitle>{selected.item_name}</DialogTitle><p className="inventory-detail-category">{categoryLabel(selected.item_category)}</p><DialogDescription className="inventory-detail-description">{selected.collection?.description || "No description has been added for this item yet."}</DialogDescription>
          {selected.collection?.reward && <p className="mb-4 rounded-lg border border-purple-400/25 bg-purple-400/10 p-3 text-sm font-bold text-purple-200">{rewardLabel(selected.collection.reward)}{selected.collection.reward_expires_at && <small className="mt-2 block text-xs font-normal">Active until {new Date(selected.collection.reward_expires_at).toLocaleDateString()}</small>}</p>}
          <dl><div><dt>Rarity</dt><dd className="inventory-detail-rarity">{selected.item_rarity || "Common"}</dd></div><div><dt>Status</dt><dd>{selected.collection?.equipped ? "Equipped" : "In inventory"}</dd></div><div><dt>Collected on</dt><dd>{acquisitionDate(selected.collection?.acquired_date)}</dd></div>{selected.collection?.premium_only && <div><dt>Membership</dt><dd><Crown size={12} />Premium item</dd></div>}</dl>
          <div className="inventory-detail-trading" data-tradable={selected.tradable}><p>{selected.tradable ? <Shuffle size={15} /> : <Lock size={15} />}<strong>{selected.tradable ? "Available for trading" : "Not tradable"}</strong></p><span>{selected.tradable ? "You can offer this copy in an item trade. Items exchange when the other player accepts." : selected.restriction || "This item stays with your account."}</span></div>
          <div className="inventory-detail-actions">{selected.tradable && <Link to={`/trading?offer_item=${encodeURIComponent(selected.inventory_id)}`} className={`${buttonClass} inventory-primary`}><Shuffle size={14} />Offer this item<ArrowRight size={14} /></Link>}{selected.collection?.catalog_available && selected.item_id && <Link to={`/item/${encodeURIComponent(selected.item_id)}`} className={buttonClass}>Collection page<ArrowRight size={14} /></Link>}</div>
        </div></>}
      </DialogContent>
    </Dialog>
  </div></div>;
}
