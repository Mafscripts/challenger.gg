import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import RarityBadge from "@/components/ui/RarityBadge";
import { base44 } from "@/api/base44Client";
import { dedupeById, toMarketItem } from "@/pages/Marketplace";

export default function MarketplacePreview() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    base44.entities.MarketplaceItem.filter({}, "-created_date", 20)
      .then((rows) => {
        const marketplaceItems = dedupeById(
          (rows || []).map(toMarketItem).filter((item) => item.active && item.showInMarketplace)
        );
        setItems(marketplaceItems.slice(0, 4));
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/[0.02] to-transparent" />
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4"
        >
          <div>
            <span className="text-purple-400 text-xs font-mono font-semibold tracking-widest uppercase">The Vault</span>
            <h2 className="text-4xl lg:text-5xl font-black mt-3 tracking-tight">Marketplace</h2>
          </div>
          <Link to="/marketplace" className="inline-flex items-center gap-2 text-purple-400 font-semibold text-sm hover:gap-3 transition-all">
            Browse All Items <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {items.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-8 text-center text-vapor">No marketplace items are active yet.</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {items.map((item, index) => (
              <Link to={`/item/${item.id}`} key={item.id}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -8, transition: { duration: 0.1, ease: "easeOut" } }}
                  className="glass rounded-xl border border-white/5 hover:border-white/10 overflow-hidden transition-all group cursor-pointer"
                >
                  <div className="aspect-square relative overflow-hidden bg-secondary">
                    {item.img ? <img src={item.img} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" /> : null}
                    <div className="absolute top-3 left-3">
                      <RarityBadge rarity={item.rarity} />
                    </div>
                  </div>
                  <div className="p-4">
                    <h4 className="font-semibold text-sm mb-2">{item.name}</h4>
                    <span className="text-green font-mono font-bold text-sm">{item.creditPrice} Credits</span>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
