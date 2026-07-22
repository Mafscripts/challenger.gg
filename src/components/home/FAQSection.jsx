import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  { q: "How does the ranking system work?", a: "Our ELO-based ranking system tracks performance across all game modes. Complete 10 placement matches to receive your initial rank, then climb through Bronze, Silver, Gold, Platinum, Diamond, Master, Pro, and Champion. Rankings reset seasonally with placement matches." },
  { q: "How do wagers work?", a: "Create or join wagers by selecting your match type, stake amount, and game mode. Both parties deposit funds into escrow. After the match, the winner reports the result and funds are released. Disputes are handled by our moderation team with video evidence review." },
  { q: "What is the map veto system?", a: "Before each match, maps are randomly selected from the active map pool for the chosen game mode. Each team gets one veto to ban a map they don't want to play. The final map is automatically selected from the remaining pool. This ensures fair and competitive map selection." },
  { q: "How does the marketplace work?", a: "Browse and purchase cosmetic items including knife skins, weapon skins, calling cards, badges, and more. Items range from Common to Exclusive rarity. Premium members receive reduced marketplace fees and access to exclusive drops. You can also trade items directly with other players." },
  { q: "Is there a mobile app?", a: "Topfragg.gg is fully responsive and works seamlessly on mobile browsers. Dedicated iOS and Android apps are in development and will launch later in 2026 with push notifications, match alerts, and quick-queue functionality." },
  { q: "How do I join a team?", a: "Navigate to the Teams section to browse existing teams or create your own. Team captains can invite players, and you can apply to join teams that are recruiting. Teams have their own profiles, statistics, and rankings." },
];

export default function FAQSection() {
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" className="py-24">
      <div className="max-w-3xl mx-auto px-4 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-cyan text-xs font-mono font-semibold tracking-widest uppercase">Support</span>
          <h2 className="text-4xl lg:text-5xl font-black mt-3 tracking-tight">FAQ</h2>
        </motion.div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-xl border border-white/5 overflow-hidden"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-semibold text-sm pr-4">{faq.q}</span>
                <ChevronDown className={`w-4 h-4 text-vapor shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-5 text-sm text-vapor leading-relaxed">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
