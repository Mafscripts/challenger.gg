import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Check, CheckCircle2, Clock3, History, Lock, Package, Plus, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import useRouteSection from "@/hooks/useRouteSection";
import CompetitionHero from "@/components/competition/CompetitionHero";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import UserBadges from "@/components/ui/UserBadges";
import RarityBadge from "@/components/ui/RarityBadge";
import PageLoader from "@/components/ui/PageLoader";
import LeaderboardPagination from "@/components/ui/LeaderboardPagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import "@/styles/trading.css";

const invoke = async (name, payload = {}) => {
  const { data } = await base44.functions.invoke(name, payload);
  if (!data?.success) throw new Error(data?.error || "Trading could not be loaded. Try again.");
  return data;
};
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "—";
const button = "site-hover trading-button";
const sections = [{ key: "incoming", name: "Incoming", detail: "Offers waiting for you", icon: ArrowDownLeft }, { key: "outgoing", name: "Outgoing", detail: "Offers you have sent", icon: ArrowUpRight }, { key: "history", name: "History", detail: "Your completed & closed trades", icon: History }];

function ItemImage({ item }) {
  const [failed, setFailed] = useState(false);
  return item.item_image && !failed ? <img src={item.item_image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Package size={24} />;
}
function ItemPanel({ title, tone, items: rawItems = [], credits = 0 }) {
  const items = Array.isArray(rawItems) ? rawItems.filter((item) => item && typeof item === "object") : [];
  return <div className="trading-item-panel" data-tone={tone}><h3>{tone === "receive" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}{title}<span>{items.length} {items.length === 1 ? "item" : "items"}</span></h3><div className="trading-item-list">{items.map((item, index) => <div className="trading-item" data-rarity={item.item_rarity} key={`${item.inventory_id || item.item_id}:${index}`}><span className="trading-item-image"><ItemImage item={item} /></span><div><strong>{item.item_name || "Item"}</strong><RarityBadge rarity={item.item_rarity} /></div>{item.item_id && <Link to={`/item/${encodeURIComponent(item.item_id)}`} aria-label={`View ${item.item_name || "item"}`} className="site-hover trading-item-detail"><ArrowUpRight size={14} /></Link>}</div>)}{Number(credits) > 0 && <p className="trading-legacy-credits">{Number(credits).toLocaleString()} credits · Previous offer</p>}{!items.length && !Number(credits) && <p className="trading-muted">No items listed.</p>}</div></div>;
}
function InventoryPicker({ title, subtitle, query, selected, onToggle }) {
  return <section className="trading-picker"><header><div><h3>{title}</h3><p>{subtitle}</p></div><strong>{selected.length}/10</strong></header>{query.isPending ? <p className="trading-picker-message" role="status">Loading inventory…</p> : query.isError ? <div className="trading-picker-message" role="alert"><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()} className={button}>Try again</button></div> : !query.data?.items.length ? <p className="trading-picker-message">No items available for this trade.</p> : <div className="trading-picker-grid">{query.data.items.map((item) => {
    const checked = selected.includes(item.inventory_id), disabled = !item.tradable || (!checked && selected.length >= 10);
    return <label key={item.inventory_id} className="trading-pick-item" data-selected={checked || undefined} data-disabled={disabled || undefined} title={item.restriction || item.item_name} data-rarity={item.item_rarity}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(item.inventory_id)} /><span className="trading-pick-image"><ItemImage item={item} /></span><strong>{item.item_name}</strong><RarityBadge rarity={item.item_rarity} />{!item.tradable && <small><Lock size={10} />{item.restriction}</small>}</label>;
  })}</div>}{query.data?.has_more && <p className="trading-muted">Showing your 500 most recent inventory items.</p>}</section>;
}

function TradeComposer({ user, preselected, onClose, onSent }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [partner, setPartner] = useState(null);
  const [giveIds, setGiveIds] = useState([]), [receiveIds, setReceiveIds] = useState([]);
  const [review, setReview] = useState(false), [error, setError] = useState("");
  const appliedPrefill = useRef(false);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const candidates = useQuery({ queryKey: ["trade-players", user.id, debounced], queryFn: () => invoke("searchMessageRecipients", { query: debounced }), enabled: debounced.length >= 2 && !partner, staleTime: 15000, retry: false });
  const own = useQuery({ queryKey: ["trade-inventory", user.id, user.id], queryFn: () => invoke("getTradeInventory"), staleTime: 0, retry: false });
  const theirs = useQuery({ queryKey: ["trade-inventory", user.id, partner?.id], queryFn: () => invoke("getTradeInventory", { user_id: partner.id }), enabled: Boolean(partner), staleTime: 0, retry: false });
  useEffect(() => {
    if (!preselected || !own.data || appliedPrefill.current) return;
    appliedPrefill.current = true;
    const item = own.data.items.find((entry) => entry.inventory_id === preselected);
    if (item?.tradable) setGiveIds([preselected]); else setError(item?.restriction || "This inventory item is no longer available. Choose another item.");
  }, [preselected, own.data]);
  const toggle = (setter, id) => { setError(""); setter((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 10 ? [...ids, id] : ids); };
  const giveItems = (own.data?.items || []).filter((item) => giveIds.includes(item.inventory_id));
  const receiveItems = (theirs.data?.items || []).filter((item) => receiveIds.includes(item.inventory_id));
  const valid = partner && giveIds.length > 0 && receiveIds.length > 0 && giveItems.length === giveIds.length && receiveItems.length === receiveIds.length && [...giveItems, ...receiveItems].every((item) => item.tradable);
  const send = useMutation({ mutationFn: () => invoke("createItemTrade", { recipient_id: partner.id, sender_inventory_ids: giveIds, recipient_inventory_ids: receiveIds }), onSuccess: onSent, onError: (err) => setError(err.message) });
  return <Dialog open onOpenChange={(open) => { if (!open && !send.isPending) onClose(); }}><DialogContent className="trading-composer"><DialogHeader><p className="trading-eyebrow"><ArrowLeftRight size={13} />Player-to-player exchange</p><DialogTitle>{review ? "Review your offer" : "Build your next trade"}</DialogTitle><DialogDescription>{review ? "Check both sides. Items exchange only after the other player accepts." : "Choose another player, then select 1–10 tradable items on each side."}</DialogDescription></DialogHeader>
    {!review ? <>
      <div className="trading-partner-search">{partner ? <div className="trading-selected-partner"><span className="trading-avatar"><PlayerAvatarImage user={partner} src={partner.avatar_url} /></span><span><small>Trading with</small><strong>{partner.name}</strong></span><UserBadges user={partner} size="xs" iconOnly /><button type="button" onClick={() => { setPartner(null); setReceiveIds([]); setError(""); }} aria-label="Choose another player" className={button}><X size={15} /></button></div> : <><label className="trading-search"><Search size={16} /><span className="sr-only">Find a player to trade with</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a player by name…" /></label>{debounced.length >= 2 && <div className="trading-player-results">{candidates.isPending ? <p role="status">Finding players…</p> : candidates.isError ? <p role="alert">{candidates.error.message}</p> : !candidates.data?.users.length ? <p>No players found.</p> : candidates.data.users.map((entry) => <button type="button" key={entry.id} onClick={() => { setPartner(entry); setReceiveIds([]); setError(""); }} className="site-hover"><span className="trading-avatar"><PlayerAvatarImage user={entry} src={entry.avatar_url} /></span><strong>{entry.name}</strong><UserBadges user={entry} size="xs" iconOnly /><Plus size={15} /></button>)}</div>}</> }</div>
      <div className="trading-picker-columns"><InventoryPicker title="Your offer" subtitle="Select the items you want to give" query={own} selected={giveIds} onToggle={(id) => toggle(setGiveIds, id)} />{partner ? <InventoryPicker title={`${partner.name}'s items`} subtitle="Select the items you would like to receive" query={theirs} selected={receiveIds} onToggle={(id) => toggle(setReceiveIds, id)} /> : <div className="trading-choose-partner"><ArrowLeftRight size={30} /><h3>Who are you trading with?</h3><p>Find a player to see their tradable items.</p></div>}</div>
    </> : <><div className="trading-review-partner">Offer to <strong>{partner.name}</strong><span>Expires after 72 hours</span></div><div className="trading-picker-columns"><ItemPanel title="You give" tone="give" items={giveItems} /><ItemPanel title="You receive" tone="receive" items={receiveItems} /></div></>}
    {error && <p className="trading-error" role="alert">{error}</p>}
    <div className="trading-dialog-actions"><button type="button" disabled={send.isPending} onClick={() => review ? setReview(false) : onClose()} className={button}>{review ? <ArrowLeft size={14} /> : null}{review ? "Edit offer" : "Cancel"}</button><button type="button" disabled={!valid || send.isPending} onClick={() => { setError(""); if (review) send.mutate(); else setReview(true); }} className={`${button} trading-primary`}>{send.isPending ? "Sending…" : review ? "Send offer" : "Review offer"}<ArrowRight size={14} /></button></div>
  </DialogContent></Dialog>;
}

export default function Trading() {
  const { user, isLoadingAuth } = useAuth();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useRouteSection("tab", "incoming", ["incoming", "outgoing", "history"]);
  const [paging, setPaging] = useState({ tab, page: 1 });
  const page = paging.tab === tab ? paging.page : 1;
  const [compose, setCompose] = useState(() => Boolean(params.get("offer_item")));
  const [confirm, setConfirm] = useState(null);
  const query = useQuery({ queryKey: ["item-trades", user?.id, tab, page, params.get("offer")], queryFn: () => invoke("getTradingOverview", { tab, page }), enabled: Boolean(user?.id), staleTime: 10000, retry: false });
  const counts = query.data?.counts;
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil((query.data?.counts?.[tab] || 0) / 50));
    if (query.data && page > lastPage) setPaging({ tab, page: lastPage });
  }, [query.data, tab, page]);
  const refresh = () => cache.invalidateQueries({ queryKey: ["item-trades", user?.id] });
  const closeComposer = () => { setCompose(false); if (params.has("offer_item")) setParams((previous) => { const next = new URLSearchParams(previous); next.delete("offer_item"); return next; }, { replace: true }); };
  const changed = () => { void refresh(); void cache.invalidateQueries({ queryKey: ["trade-inventory"] }); window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } })); };
  const action = useMutation({ mutationFn: (payload) => invoke("respondItemTrade", payload), onSuccess: (result) => { setConfirm(null); changed(); toast({ title: result.offer.status === "accepted" ? "Trade completed" : "Offer closed", description: result.offer.status === "accepted" ? "Your new items are now in your inventory." : "Your inventory has not changed." }); }, onError: (err) => { void refresh(); toast({ title: "Trade could not be completed", description: err.message, variant: "destructive" }); } });
  const offers = query.data?.offers || [];
  const total = counts?.[tab] || 0;
  if (isLoadingAuth) return <PageLoader label="Loading trades" />;
  return <div className="trading-page competition-surface page-shell min-h-screen" data-competition="trading"><div className="page-container">
    <CompetitionHero mode="trading" title="Trading" eyebrow="Your collection. Your next exchange."
      description="Found a piece you want? Build an offer with items from your inventory, review both sides and trade directly with another player."
      className="trading-hero mb-6" metadata={<><ShieldCheck size={14} />Item-for-item exchanges</>}
      action={<div className="competition-actions"><button type="button" disabled={!user} onClick={() => setCompose(true)} className="competition-action-pill"><Plus size={15} />New offer</button><Link to="/inventory" className="competition-action-pill"><Package size={15} />My inventory</Link><button type="button" disabled={query.isFetching || !user} onClick={refresh} className="competition-action-pill" aria-label="Refresh trades"><RefreshCw size={15} /></button></div>}
    />
    <nav className="trading-sections" aria-label="Your trade offers">{sections.map(({ key, name, detail, icon: Icon }) => <button type="button" key={key} onClick={() => setTab(key)} data-section={key} aria-current={tab === key ? "page" : undefined} className="site-hover"><span className="trading-section-icon"><Icon size={21} /></span><span><strong>{name}</strong><small>{detail}</small></span><b>{counts?.[key] ?? "—"}</b></button>)}</nav>
    <div className="trading-info"><ShieldCheck size={18} /><p><strong>Both players choose. Both players agree.</strong> Review the items before accepting. Offers expire after 72 hours; unavailable items cannot be exchanged.</p></div>
    {!user ? <div className="trading-empty"><Package size={32} /><h2>Sign in to start trading.</h2><p>Your inventory and trade offers will appear here.</p></div> : query.isPending ? <p className="trading-empty" role="status">Loading your trade offers…</p> : query.isError ? <div className="trading-empty" role="alert"><h2>Could not load your trades.</h2><p>{query.error.message}</p><button type="button" onClick={refresh} className={button}>Try again</button></div> : !offers.length ? <div className="trading-empty"><ArrowLeftRight size={34} /><p className="trading-eyebrow">Your next exchange starts here</p><h2>{tab === "incoming" ? "No offers waiting for you." : tab === "outgoing" ? "Make the first move." : "Your trading story starts here."}</h2><p>{tab === "incoming" ? "Players can offer items for pieces in your tradable inventory. You decide whether to accept." : tab === "outgoing" ? "Find a player and build an offer from your actual inventory." : "Accepted, declined, cancelled and expired offers stay here for reference."}</p><div><button type="button" onClick={() => setCompose(true)} className={`${button} trading-primary`}><Plus size={14} />Create an offer</button><Link to="/inventory" className={button}>View inventory<ArrowUpRight size={14} /></Link></div></div> : <>
      <div className="trading-offers">{offers.map((offer) => {
        const incoming = offer.recipient_id === user.id, partner = incoming ? offer.sender : offer.recipient;
        const name = partner?.name || (incoming ? offer.sender_name : offer.recipient_name) || "Player";
        const canAccept = offer.version === 1 && !Number(offer.sender_credits_offered) && !Number(offer.recipient_credits_offered);
        return <article key={offer.id} className="trading-offer" data-status={offer.status} data-highlighted={params.get("offer") === offer.id || undefined}>
          <header><Link to={`/profile/${encodeURIComponent(partner?.username || partner?.id || (incoming ? offer.sender_id : offer.recipient_id))}`} className="trading-partner"><span className="trading-avatar"><PlayerAvatarImage user={partner} src={partner?.avatar_url} /></span><span><small>{incoming ? "Offer from" : "Offer to"}</small><strong>{name}</strong></span></Link><UserBadges user={partner} size="xs" iconOnly /><span className="trading-status" data-status={offer.status}>{offer.status === "accepted" ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{offer.status}</span></header>
          <div className="trading-picker-columns"><ItemPanel title="You give" tone="give" items={incoming ? offer.recipient_items : offer.sender_items} credits={incoming ? offer.recipient_credits_offered : offer.sender_credits_offered} /><ItemPanel title="You receive" tone="receive" items={incoming ? offer.sender_items : offer.recipient_items} credits={incoming ? offer.sender_credits_offered : offer.recipient_credits_offered} /></div>
          <footer><p><Clock3 size={12} />{offer.status === "pending" ? `Expires ${date(offer.expires_date)}` : `Updated ${date(offer.response_date || offer.updated_date)}`}<small>Created {date(offer.created_date)}</small></p><div>{offer.status === "pending" && (incoming ? <><button type="button" disabled={action.isPending} onClick={() => action.mutate({ offer_id: offer.id, action: "decline" })} className={`${button} trading-danger`}><X size={14} />Decline</button>{canAccept && <button type="button" disabled={action.isPending} onClick={() => setConfirm(offer)} className={`${button} trading-primary`}><Check size={14} />Review & accept</button>}</> : <button type="button" disabled={action.isPending} onClick={() => action.mutate({ offer_id: offer.id, action: "cancel" })} className={`${button} trading-danger`}>Cancel offer</button>)}{offer.status === "accepted" && <Link to="/inventory" className={button}>View inventory<ArrowUpRight size={14} /></Link>}</div></footer>
          {offer.status === "pending" && !canAccept && <p className="trading-muted">This older offer cannot be accepted. Close it and create a new item offer.</p>}{offer.expiry_reason && <p className="trading-muted">{offer.expiry_reason}</p>}
        </article>;
      })}</div><LeaderboardPagination page={page} pageCount={Math.max(1, Math.ceil(total / 50))} total={total} itemLabel="offers" onPageChange={(next) => setPaging({ tab, page: next })} />
    </>}
    {compose && user && <TradeComposer user={user} preselected={params.get("offer_item")} onClose={closeComposer} onSent={() => { setCompose(false); setPaging({ tab: "outgoing", page: 1 }); setParams((previous) => { const next = new URLSearchParams(previous); next.delete("offer_item"); next.set("tab", "outgoing"); return next; }); changed(); toast({ title: "Trade offer sent", description: "The other player will receive a notification and can review both sides." }); }} />}
    {confirm && <Dialog open onOpenChange={(open) => { if (!open && !action.isPending) setConfirm(null); }}><DialogContent className="trading-composer trading-confirm"><DialogHeader><DialogTitle>Accept this item exchange?</DialogTitle><DialogDescription>These items will change owner as soon as you confirm.</DialogDescription></DialogHeader><div className="trading-picker-columns"><ItemPanel title="You give" tone="give" items={confirm.recipient_items} /><ItemPanel title="You receive" tone="receive" items={confirm.sender_items} /></div><div className="trading-dialog-actions"><button type="button" disabled={action.isPending} onClick={() => setConfirm(null)} className={button}>Go back</button><button type="button" disabled={action.isPending} onClick={() => action.mutate({ offer_id: confirm.id, action: "accept" })} className={`${button} trading-primary`}><Check size={15} />{action.isPending ? "Exchanging…" : "Confirm exchange"}</button></div></DialogContent></Dialog>}
  </div></div>;
}
