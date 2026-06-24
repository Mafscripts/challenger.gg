import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Package } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import { base44 } from "@/api/base44Client";

const categoryLabels = {
  weapon_skin: "Weapon Skins",
  knife: "Knife Skins",
  gloves: "Gloves",
  agent: "Avatars",
  sticker: "Stickers",
  patch: "Badges",
  music_kit: "Music Kits",
  cosmetic: "Cosmetics",
};

const premiumEffectClass = (item) => {
  const rarity = String(item?.rarity || "").toLowerCase();
  if (rarity === "exclusive") return "animate-exclusive-glow exclusive-shimmer border-cyan/30 glow-cyan";
  if (["epic", "legendary", "mythic"].includes(rarity)) return "animate-mythic-glow mythic-shimmer";
  return "";
};

const rarityBorderClass = (item) => {
  const rarity = String(item?.rarity || "").toLowerCase();
  if (rarity === "exclusive") return "border-cyan/30";
  if (rarity === "mythic") return "border-fuchsia-400/30";
  if (rarity === "legendary") return "border-yellow-400/20";
  if (rarity === "epic") return "border-purple-400/20";
  return item?.equipped ? "border-cyan/20" : "border-white/5 hover:border-white/10";
};

export default function Inventory() {
  const [filter, setFilter] = useState("All");
  const [showEquipped, setShowEquipped] = useState(false);
  const [ownedItems, setOwnedItems] = useState([]);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;

      const inventory = await base44.entities.UserInventory.filter({ user_id: user.id }, "-acquired_date", 100);
      setOwnedItems(inventory.map(item => ({
        id: item.id,
        name: item.item_name,
        rarity: item.item_rarity,
        category: categoryLabels[item.item_category] || item.item_category,
        equipped: item.is_equipped,
        img: item.item_image,
      })));
    } catch (error) {
      console.error("Failed to load inventory:", error);
    }
  };

  const filtered = ownedItems.filter(i => {
    if (filter !== "All" && i.category !== filter) return false;
    if (showEquipped && !i.equipped) return false;
    return true;
  });

  const categories = ["All", ...new Set(ownedItems.map(i => i.category))];

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Inventory</h1>
            <p className="text-vapor text-sm mt-1">{ownedItems.length} items owned</p>
          </div>
          <div className="flex gap-3">
            <Link to="/marketplace" className="inline-flex items-center gap-2 px-4 py-2 bg-cyan/10 text-cyan text-xs font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all">
              Browse Marketplace
            </Link>
            <Link to="/trading" className="inline-flex items-center gap-2 px-4 py-2 bg-orange/10 text-orange text-xs font-bold rounded-lg border border-orange/20 hover:bg-orange/20 transition-all">
              Trade Items
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                filter === c ? "bg-cyan/10 text-cyan border border-cyan/20" : "bg-secondary text-vapor"
              }`}
            >{c}</button>
          ))}
          <button
            onClick={() => setShowEquipped(!showEquipped)}
            className={`ml-auto px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              showEquipped ? "bg-green/10 text-green border border-green/20" : "bg-secondary text-vapor"
            }`}
          >
            <CheckCircle2 className="w-3 h-3 inline mr-1" /> Equipped Only
          </button>
        </div>

        {/* Items Grid */}
        {filtered.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 py-16 text-center">
            <p className="text-sm text-vapor">No inventory items found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((item) => (
            <motion.div
              key={item.id}
              whileHover={{ y: -4 }}
              className={`relative glass rounded-xl border overflow-hidden transition-all cursor-pointer group ${premiumEffectClass(item)} ${rarityBorderClass(item)}`}
            >
              <div className="aspect-square relative overflow-hidden bg-secondary">
                {item.img ? (
                  <img src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-vapor/30" />
                  </div>
                )}
                <div className="absolute top-2 left-2 flex flex-col gap-1">
                  <RarityBadge rarity={item.rarity} />
                  {item.equipped && (
                    <span className="px-2 py-0.5 rounded bg-cyan/20 text-cyan text-[10px] font-mono font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Equipped
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3">
                <h4 className="font-semibold text-xs mb-1 truncate">{item.name}</h4>
                <p className="text-[10px] text-vapor">{item.category}</p>
              </div>
            </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
