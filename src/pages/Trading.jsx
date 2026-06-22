import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Clock, Package, RefreshCw, Send, X } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const formatDate = (value) => value ? new Date(value).toLocaleString() : "N/A";

export default function Trading() {
  const [tab, setTab] = useState("incoming");
  const [user, setUser] = useState(null);
  const [offers, setOffers] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrades();
  }, []);

  const loadTrades = async () => {
    try {
      const me = await base44.auth.me().catch(() => null);
      setUser(me);
      if (!me?.id) {
        setOffers([]);
        return;
      }

      const [incoming, outgoing] = await Promise.all([
        base44.entities.TradeOffer.filter({ recipient_id: me.id }, "-created_date", 100).catch(() => []),
        base44.entities.TradeOffer.filter({ sender_id: me.id }, "-created_date", 100).catch(() => []),
      ]);
      const combined = [...incoming, ...outgoing].filter((offer, index, list) => list.findIndex((item) => item.id === offer.id) === index);
      setOffers(combined);
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => ({
    incoming: offers.filter((offer) => offer.recipient_id === user?.id && offer.status === "pending"),
    outgoing: offers.filter((offer) => offer.sender_id === user?.id && offer.status === "pending"),
    history: offers.filter((offer) => offer.status !== "pending"),
  }), [offers, user]);

  const updateOfferStatus = async (offer, status) => {
    setBusyId(`${offer.id}:${status}`);
    try {
      await base44.entities.TradeOffer.update(offer.id, {
        status,
        response_date: new Date().toISOString(),
      });
      toast({ title: `Trade ${status}` });
      loadTrades();
    } catch (error) {
      toast({ title: "Trade update failed", description: error.message || "Could not update offer.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Trading</h1>
            <p className="text-vapor text-sm mt-1">Send and receive trade offers.</p>
          </div>
          <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider">
            <Send className="w-3.5 h-3.5" /> New Trade
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          {[
            { key: "incoming", label: "Incoming", count: grouped.incoming.length },
            { key: "outgoing", label: "Outgoing", count: grouped.outgoing.length },
            { key: "history", label: "History", count: grouped.history.length },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === item.key ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground"
              }`}
            >
              {item.label}
              {item.count > 0 && <span className="w-5 h-5 rounded-full bg-orange flex items-center justify-center text-[10px] font-bold text-white">{item.count}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">Loading trades...</div>
        ) : !user ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">Login required to view trades.</div>
        ) : (
          <TradeList
            tab={tab}
            offers={grouped[tab]}
            userId={user.id}
            busyId={busyId}
            onStatus={updateOfferStatus}
          />
        )}
      </div>
    </div>
  );
}

function TradeList({ tab, offers, userId, busyId, onStatus }) {
  if (offers.length === 0) {
    return <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">No {tab} trade offers.</div>;
  }

  return (
    <div className="space-y-4">
      {offers.map((offer, index) => {
        const incoming = offer.recipient_id === userId;
        const partnerName = incoming ? offer.sender_name : offer.recipient_name;
        const receiveItems = incoming ? offer.sender_items : offer.recipient_items;
        const giveItems = incoming ? offer.recipient_items : offer.sender_items;
        const receiveCredits = incoming ? offer.sender_credits_offered : offer.recipient_credits_offered;
        const giveCredits = incoming ? offer.recipient_credits_offered : offer.sender_credits_offered;

        return (
          <motion.div
            key={offer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass rounded-xl border border-white/5 p-6"
          >
            <div className="flex items-center justify-between mb-4 gap-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan" />
                <span className="font-semibold text-sm">
                  Trade {incoming ? "from" : "to"} <Link to={`/profile/${partnerName || ""}`} className="text-cyan hover:underline">{partnerName || "Unknown trader"}</Link>
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-vapor">
                <Clock className="w-3 h-3" />
                <span>{formatDate(offer.created_date)}</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <ItemPanel title="You Receive" tone="green" items={receiveItems || []} credits={receiveCredits || 0} />
              <ItemPanel title="You Give" tone="red" items={giveItems || []} credits={giveCredits || 0} />
            </div>

            {tab === "incoming" && (
              <div className="flex gap-3">
                <button onClick={() => onStatus(offer, "accepted")} disabled={busyId === `${offer.id}:accepted`} className="flex-1 py-2 bg-green/10 text-green font-bold text-xs rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider disabled:opacity-50">
                  <Check className="w-3.5 h-3.5 inline mr-1" /> Accept
                </button>
                <button onClick={() => onStatus(offer, "declined")} disabled={busyId === `${offer.id}:declined`} className="flex-1 py-2 bg-red-500/10 text-red-400 font-bold text-xs rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-wider disabled:opacity-50">
                  <X className="w-3.5 h-3.5 inline mr-1" /> Decline
                </button>
              </div>
            )}

            {tab === "outgoing" && (
              <button onClick={() => onStatus(offer, "cancelled")} disabled={busyId === `${offer.id}:cancelled`} className="w-full py-2 bg-secondary text-vapor font-bold text-xs rounded-lg border border-white/5 hover:bg-white/10 transition-all uppercase tracking-wider disabled:opacity-50">
                Cancel Offer
              </button>
            )}

            {tab === "history" && (
              <span className={`text-xs font-bold uppercase ${offer.status === "accepted" ? "text-green" : "text-red-400"}`}>{offer.status}</span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function ItemPanel({ title, tone, items, credits }) {
  const color = tone === "green" ? "text-green border-green/10 bg-green/5" : "text-red-400 border-red-500/10 bg-red-500/5";

  return (
    <div className={`p-4 rounded-lg border ${color}`}>
      <p className="text-xs font-mono font-bold mb-2 uppercase tracking-wider">{title}</p>
      <div className="space-y-2">
        {items.length === 0 && credits === 0 && <p className="text-sm text-vapor">No items listed.</p>}
        {items.map((item, index) => (
          <div key={`${item.inventory_id || item.item_id || item.item_name}:${index}`} className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-vapor" />
            <span className="text-sm">{item.item_name}</span>
            <RarityBadge rarity={item.item_rarity || "common"} />
          </div>
        ))}
        {credits > 0 && (
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-vapor" />
            <span className="text-sm">{Number(credits).toLocaleString()} credits</span>
          </div>
        )}
      </div>
    </div>
  );
}
