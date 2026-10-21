import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Clock3, Gavel, Plus, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import useRouteSection from "@/hooks/useRouteSection";
import { InventoryPicker, ItemPanel } from "./TradingItems";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LeaderboardPagination from "@/components/ui/LeaderboardPagination";
import { toast } from "@/components/ui/use-toast";

const button = "site-hover trading-button";
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "—";
const invoke = async (name, payload = {}) => {
  const { data } = await base44.functions.invoke(name, payload);
  if (!data?.success) throw new Error(data?.error || "Trading could not be loaded. Try again.");
  return data;
};
const ownInventory = (user) => ({ queryKey: ["trade-inventory", user.id, user.id], queryFn: () => invoke("getTradeInventory"), staleTime: 0, retry: false });
const toggle = (setter, id) => setter((items) => items.includes(id) ? items.filter((entry) => entry !== id) : items.length < 10 ? [...items, id] : items);

function ListingComposer({ user, onClose, onCreated }) {
  const [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [selected, setSelected] = useState([]), [review, setReview] = useState(false);
  const query = useQuery(ownInventory(user));
  const items = (query.data?.items || []).filter((item) => selected.includes(item.inventory_id));
  const valid = title.trim().length >= 3 && selected.length > 0 && items.length === selected.length && items.every((item) => item.tradable);
  const create = useMutation({ mutationFn: () => invoke("createTradeListing", { title, description, inventory_ids: selected }), onSuccess: onCreated });
  return <Dialog open onOpenChange={(open) => { if (!open && !create.isPending) onClose(); }}><DialogContent className="trading-composer"><DialogHeader><p className="trading-eyebrow"><Gavel size={13} />Let players compete for your items</p><DialogTitle>{review ? "Review your public listing" : "Open your items for bids"}</DialogTitle><DialogDescription>List 1–10 tradable items for 72 hours. Bids are public, and you decide which item offer to accept.</DialogDescription></DialogHeader>
    {review ? <><div className="trading-listing-review"><h3>{title}</h3>{description && <p>{description}</p>}</div><ItemPanel title="Your listed items" tone="give" items={items} /><p className="trading-muted">These items form one bundle. Accepting a bid exchanges the whole bundle for the bidder's offered items. No items move when you publish.</p></> : <><label className="trading-listing-field">Listing title<input maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you offering?" /></label><label className="trading-listing-field">What would you like in return? <span>Optional · Public</span><textarea maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the items or rarity you are looking for…" /></label><InventoryPicker title="Items to list" subtitle="Choose the items players can bid on" query={query} selected={selected} onToggle={(id) => toggle(setSelected, id)} /></>}
    {create.isError && <p className="trading-error" role="alert">{create.error.message}</p>}
    <div className="trading-dialog-actions"><button type="button" className={button} disabled={create.isPending} onClick={() => review ? setReview(false) : onClose()}>{review ? "Edit listing" : "Cancel"}</button><button type="button" className={`${button} trading-primary`} disabled={!valid || create.isPending} onClick={() => review ? create.mutate() : setReview(true)}><Gavel size={14} />{create.isPending ? "Publishing…" : review ? "Publish listing" : "Review listing"}</button></div>
  </DialogContent></Dialog>;
}

function ListingDetail({ user, listingId, onClose, onChanged }) {
  const [page, setPage] = useState(1), [bidMode, setBidMode] = useState(false), [selected, setSelected] = useState([]);
  const [reviewBid, setReviewBid] = useState(false), [accepting, setAccepting] = useState(null), [closeConfirm, setCloseConfirm] = useState(false);
  const query = useQuery({ queryKey: ["trade-listing", user.id, listingId, page], queryFn: () => invoke("getTradeListing", { listing_id: listingId, page }), staleTime: 0, retry: false });
  const own = useQuery({ ...ownInventory(user), enabled: bidMode });
  const listing = query.data?.listing, isOwner = listing?.seller_id === user.id, isOpen = listing?.status === "open";
  const ownBid = query.data?.own_bid;
  const items = (own.data?.items || []).filter((item) => selected.includes(item.inventory_id));
  const validBid = selected.length > 0 && items.length === selected.length && items.every((item) => item.tradable);
  const finish = () => { onChanged(); void query.refetch(); };
  const mutation = useMutation({ mutationFn: ({ fn, payload }) => invoke(fn, payload), onSuccess: (result) => {
    setBidMode(false); setReviewBid(false); setAccepting(null); setCloseConfirm(false); finish();
    toast({ title: result.offer?.status === "accepted" ? "Trade completed" : result.listing ? "Listing closed" : result.offer?.status === "cancelled" ? "Bid withdrawn" : result.offer?.status === "declined" ? "Bid declined" : "Bid placed", description: result.offer?.status === "accepted" ? "The items have been exchanged. All other bids on this listing are closed." : "Your trading overview has been updated." });
  }, onError: finish });
  const act = (fn, payload) => mutation.mutate({ fn, payload });
  const editBid = () => { mutation.reset(); setSelected(ownBid?.sender_items?.map((item) => item.inventory_id) || []); setReviewBid(false); setBidMode(true); };
  useEffect(() => {
    const last = Math.max(1, Math.ceil((query.data?.total || 0) / 20));
    if (query.data && page > last) setPage(last);
  }, [query.data, page]);
  return <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}><DialogContent className="trading-composer trading-listing-dialog"><DialogHeader><p className="trading-eyebrow"><Gavel size={13} />Public item bidding</p><DialogTitle>{accepting ? "Accept this bid?" : closeConfirm ? "Close this listing?" : bidMode ? reviewBid ? "Review your public bid" : ownBid ? "Update your bid" : "Build your bid" : listing?.title || "Item listing"}</DialogTitle><DialogDescription>{accepting ? "Confirm the exchange. The listed bundle goes to this bidder, and all other bids close." : closeConfirm ? "All pending bids will close. Everyone keeps their items." : "Compare the offered items. The owner chooses their preferred exchange; there is no automatic highest bid."}</DialogDescription></DialogHeader>
    {query.isPending ? <p className="trading-picker-message" role="status">Loading listing…</p> : query.isError ? <div className="trading-error" role="alert"><p>{query.error.message}</p><button type="button" className={button} onClick={() => query.refetch()}>Try again</button></div> : <>
      {accepting ? <div className="trading-picker-columns"><ItemPanel title="You give" tone="give" items={listing.items} /><ItemPanel title="You receive" tone="receive" items={accepting.sender_items} /></div> : closeConfirm ? <ItemPanel title="Your listed items" tone="give" items={listing.items} /> : bidMode ? <><ItemPanel title="You receive if accepted" tone="receive" items={listing.items} />{reviewBid ? <><ItemPanel title="Your bid · You give" tone="give" items={items} /><p className="trading-muted">Your bid and player name will be visible to other players. The owner can accept before the listing expires. You can withdraw or replace your bid while it is pending.</p></> : <InventoryPicker title="Your bid" subtitle="Choose 1–10 items to offer in exchange" query={own} selected={selected} onToggle={(id) => toggle(setSelected, id)} />}</> : <>
        <div className="trading-listing-meta"><Link to={`/profile/${encodeURIComponent(listing.seller?.username || listing.seller_id)}`}>Listed by {listing.seller?.name || listing.seller_name}</Link><span className="trading-status" data-status={listing.status}>{listing.status}</span><span><Clock3 size={12} />{isOpen ? "Closes" : "End date"} {date(listing.expires_date)}</span></div>
        {listing.description && <p className="trading-listing-description">{listing.description}</p>}<ItemPanel title="Listed items · One bundle" tone="give" items={listing.items} />
        {isOpen && <div className="trading-listing-tools">{isOwner ? <button type="button" className={`${button} trading-danger`} disabled={mutation.isPending} onClick={() => { mutation.reset(); setCloseConfirm(true); }}><X size={13} />Close listing</button> : <><button type="button" className={`${button} trading-primary`} disabled={mutation.isPending} onClick={editBid}><Gavel size={14} />{ownBid ? "Update your bid" : "Place a bid"}</button>{ownBid && <button type="button" className={`${button} trading-danger`} disabled={mutation.isPending} onClick={() => act("respondItemTrade", { offer_id: ownBid.id, action: "cancel" })}>Withdraw bid</button>}</>}<button type="button" className={button} disabled={query.isFetching || mutation.isPending} onClick={() => query.refetch()}><RefreshCw size={13} />Refresh bids</button></div>}
        <div className="trading-bids-heading"><h3><Gavel size={16} />{isOpen ? "Competing bids" : "Bidding closed"}</h3><span>{isOpen ? `${query.data.total} active bids` : "No more bids can be accepted"}</span></div>
        {isOpen && !query.data.bids.length && <p className="trading-picker-message">No active bids yet.{!isOwner && " Be the first to make an offer."}</p>}
        {isOpen && <div className="trading-bids">{query.data.bids.map((bid) => <article key={bid.id} className="trading-public-bid" data-own={bid.sender_id === user.id || undefined}><header><Link to={`/profile/${encodeURIComponent(bid.sender?.username || bid.sender_id)}`}>{bid.sender?.name || bid.sender_name}{bid.sender_id === user.id && <span>Your bid</span>}</Link><small>{date(bid.created_date)}</small></header><ItemPanel title="Offered items" tone="receive" items={bid.sender_items} />{isOwner && <footer><button type="button" className={`${button} trading-danger`} disabled={mutation.isPending} onClick={() => act("respondItemTrade", { offer_id: bid.id, action: "decline" })}>Decline</button><button type="button" className={`${button} trading-primary`} disabled={mutation.isPending} onClick={() => { mutation.reset(); setAccepting(bid); }}><Check size={14} />Review & accept</button></footer>}</article>)}</div>}
        {isOpen && query.data.total > 20 && <LeaderboardPagination page={page} pageCount={Math.max(1, Math.ceil(query.data.total / 20))} total={query.data.total} pageSize={20} itemLabel="bids" onPageChange={setPage} />}
      </>}
      {(accepting || closeConfirm || bidMode) && <div className="trading-dialog-actions"><button type="button" className={button} disabled={mutation.isPending} onClick={() => { mutation.reset(); if (reviewBid) setReviewBid(false); else { setBidMode(false); setAccepting(null); setCloseConfirm(false); } }}><ArrowLeft size={13} />{reviewBid ? "Edit bid" : "Go back"}</button><button type="button" className={`${button} ${closeConfirm ? "trading-danger" : "trading-primary"}`} disabled={mutation.isPending || (bidMode && (!validBid || !isOpen))} onClick={() => accepting ? act("respondItemTrade", { offer_id: accepting.id, action: "accept" }) : closeConfirm ? act("cancelTradeListing", { listing_id: listingId }) : reviewBid ? act("placeTradeBid", { listing_id: listingId, inventory_ids: selected }) : setReviewBid(true)}>{mutation.isPending ? "Saving…" : accepting ? "Confirm exchange" : closeConfirm ? "Close listing" : reviewBid ? ownBid ? "Replace my bid" : "Submit bid" : "Review bid"}<ArrowRight size={13} /></button></div>}
    </>}
    {mutation.isError && <p className="trading-error" role="alert">{mutation.error.message}</p>}
  </DialogContent></Dialog>;
}

export default function TradeBidding({ user, onChanged }) {
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useRouteSection("scope", "browse", ["browse", "mine"]);
  const [paging, setPaging] = useState({ scope, page: 1 }), [creating, setCreating] = useState(false);
  const page = paging.scope === scope ? paging.page : 1;
  const listingId = params.get("listing");
  const query = useQuery({ queryKey: ["trade-listings", user.id, scope, page], queryFn: () => invoke("getTradeListings", { scope, page }), staleTime: 10000, retry: false, refetchOnWindowFocus: false });
  useEffect(() => {
    const last = Math.max(1, Math.ceil((query.data?.total || 0) / 20));
    if (query.data && page > last) setPaging({ scope, page: last });
  }, [query.data, scope, page]);
  const openListing = (id) => setParams((previous) => { const next = new URLSearchParams(previous); next.set("listing", id); return next; });
  const closeListing = () => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("listing"); return next; }, { replace: true });
  return <section className="trading-bidding"><div className="trading-bidding-toolbar"><div><button type="button" className={button} aria-pressed={scope === "browse"} onClick={() => setScope("browse")}>Open listings</button><button type="button" className={button} aria-pressed={scope === "mine"} onClick={() => setScope("mine")}>My listings</button></div><div><button type="button" className={button} disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw size={14} />Refresh</button><button type="button" className={`${button} trading-primary`} onClick={() => setCreating(true)}><Plus size={14} />List items for bids</button></div></div>
    {query.isPending ? <p className="trading-empty" role="status">Loading item listings…</p> : query.isError ? <div className="trading-empty" role="alert"><h2>Could not load listings</h2><p>{query.error.message}</p><button type="button" className={button} onClick={() => query.refetch()}>Try again</button></div> : !query.data.listings.length ? <div className="trading-empty"><Gavel size={34} /><h2>{scope === "mine" ? "Let players bid on your collection" : "Be the first to open the bidding"}</h2><p>Choose your items, publish a listing and compare what other players offer in return.</p><button type="button" className={`${button} trading-primary`} onClick={() => setCreating(true)}><Plus size={14} />Create a listing</button></div> : <><div className="trading-listing-grid">{query.data.listings.map((listing) => <article key={listing.id} className="trading-offer trading-listing-card"><header><div><p className="trading-eyebrow">{listing.seller_id === user.id ? "Your listing" : listing.seller?.name || listing.seller_name}</p><h2>{listing.title}</h2></div><span className="trading-status" data-status={listing.status}>{listing.status}</span></header>{listing.description && <p className="trading-listing-description trading-listing-preview">{listing.description}</p>}<ItemPanel title="Up for bids" tone="give" items={listing.items} /><footer><p><Gavel size={13} />{listing.bid_count} active bids<small><Clock3 size={11} />{date(listing.expires_date)}</small></p><button type="button" className={`${button} trading-primary`} onClick={() => openListing(listing.id)}>{listing.seller_id === user.id ? "Compare bids" : "View & bid"}<ArrowRight size={14} /></button></footer></article>)}</div><LeaderboardPagination page={page} pageCount={Math.max(1, Math.ceil(query.data.total / 20))} total={query.data.total} pageSize={20} itemLabel="listings" onPageChange={(next) => setPaging({ scope, page: next })} /></>}
    {creating && <ListingComposer user={user} onClose={() => setCreating(false)} onCreated={(result) => { setCreating(false); onChanged(); openListing(result.listing.id); toast({ title: "Listing published", description: "Other players can now bid with their items." }); }} />}
    {listingId && !creating && <ListingDetail key={listingId} user={user} listingId={listingId} onClose={closeListing} onChanged={onChanged} />}
  </section>;
}
