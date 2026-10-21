import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Lock, Package } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
const button = "site-hover trading-button";

export function ItemImage({ item }) {
  const [failed, setFailed] = useState(false);
  return item.item_image && !failed ? <img src={item.item_image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <Package size={24} />;
}
export function ItemPanel({ title, tone, items: rawItems = [], credits = 0 }) {
  const items = Array.isArray(rawItems) ? rawItems.filter((item) => item && typeof item === "object") : [];
  return <div className="trading-item-panel" data-tone={tone}><h3>{tone === "receive" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}{title}<span>{items.length} {items.length === 1 ? "item" : "items"}</span></h3><div className="trading-item-list">{items.map((item, index) => <div className="trading-item" data-rarity={item.item_rarity} key={`${item.inventory_id || item.item_id}:${index}`}><span className="trading-item-image"><ItemImage item={item} /></span><div><strong>{item.item_name || "Item"}</strong><RarityBadge rarity={item.item_rarity} /></div>{item.item_id && <Link to={`/item/${encodeURIComponent(item.item_id)}`} aria-label={`View ${item.item_name || "item"}`} className="site-hover trading-item-detail"><ArrowUpRight size={14} /></Link>}</div>)}{Number(credits) > 0 && <p className="trading-legacy-credits">{Number(credits).toLocaleString()} credits · Previous offer</p>}{!items.length && !Number(credits) && <p className="trading-muted">No items listed.</p>}</div></div>;
}
export function InventoryPicker({ title, subtitle, query, selected, onToggle }) {
  return <section className="trading-picker"><header><div><h3>{title}</h3><p>{subtitle}</p></div><strong>{selected.length}/10</strong></header>{query.isPending ? <p className="trading-picker-message" role="status">Loading inventory…</p> : query.isError ? <div className="trading-picker-message" role="alert"><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()} className={button}>Try again</button></div> : !query.data?.items.length ? <p className="trading-picker-message">No items available for this trade.</p> : <div className="trading-picker-grid">{query.data.items.map((item) => {
    const checked = selected.includes(item.inventory_id), disabled = !item.tradable || (!checked && selected.length >= 10);
    return <label key={item.inventory_id} className="trading-pick-item" data-selected={checked || undefined} data-disabled={disabled || undefined} title={item.restriction || item.item_name} data-rarity={item.item_rarity}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(item.inventory_id)} /><span className="trading-pick-image"><ItemImage item={item} /></span><strong>{item.item_name}</strong><RarityBadge rarity={item.item_rarity} />{!item.tradable && <small><Lock size={10} />{item.restriction}</small>}</label>;
  })}</div>}{query.data?.has_more && <p className="trading-muted">Showing your 500 most recent inventory items.</p>}</section>;
}
