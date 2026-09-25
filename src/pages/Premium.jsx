import React from "react";
import { motion } from "framer-motion";
import { Check, Shield, ShoppingBag, Trophy, Users, Sparkles, LockKeyhole } from "lucide-react";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";
import PageHeader from "@/components/ui/PageHeader";

const benefits = [
  { icon: Trophy, title: "Premium Tournaments", desc: "Access exclusive Premium-only tournaments with separate prize pools." },
  { icon: ShoppingBag, title: "Marketplace Benefits", desc: "50% reduced marketplace fees on all purchases and sales." },
  { icon: Sparkles, title: "Monthly Cosmetics", desc: "Receive an exclusive cosmetic drop every month — including Legendary+ items." },
  { icon: Shield, title: "Enhanced Profile", desc: "Premium badge, custom profile frames, animated avatars, and priority showcase." },
  { icon: Users, title: "Priority Queue", desc: "Jump to the front of matchmaking queues for faster games." },
];

const cosmetics = [
  { name: "June: Solar Circuit Camo", rarity: "Legendary" },
  { name: "July: Neon Rival Calling Card", rarity: "Epic" },
  { name: "August: Apex Champion Emblem", rarity: "Mythic" },
];

export default function Premium() {
  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <PageHeader
          eyebrow="Premium membership"
          title="Elevate Your Game"
          description="Unlock the complete Topfragg experience with exclusive benefits, cosmetics and competitive advantages."
          className="dark-focus dark-media mb-8"
          action={<div className="text-left sm:text-right"><div><span className="font-mono text-4xl font-black text-white">$9.99</span><span className="ml-1 text-sm text-vapor">/mo</span></div><p className="mt-1 text-[9px] font-black uppercase tracking-wider text-blue-300">Premium access</p></div>}
        />
        <div className="mb-12 rounded-2xl border border-white/[0.07] bg-card/60 p-5 text-center">
          <CommercePausedNotice className="mx-auto mb-5 max-w-xl text-left" />
          <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-8 py-4 text-sm font-bold uppercase tracking-wider text-vapor"><LockKeyhole className="h-5 w-5" /> Subscriptions Paused</button>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {benefits.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.1, ease: "easeOut" } }}
              className="glass rounded-xl p-8 border border-orange/10 hover:border-orange/20 transition-all group"
            >
              <div className="inline-flex p-3 rounded-xl bg-orange/10 text-orange mb-5 group-hover:scale-110 transition-transform">
                <b.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-3">{b.title}</h3>
              <p className="text-vapor text-sm leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Upcoming Cosmetics */}
        <div className="glass rounded-2xl border border-orange/10 p-10 mb-20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-orange/5 rounded-full blur-[100px]" />
          <div className="relative">
            <h2 className="text-3xl font-black mb-8 text-center">Upcoming Monthly Drops</h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {cosmetics.map((c, i) => (
                <div key={i} className="glass rounded-xl p-6 border border-white/5 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-orange/20 to-yellow-400/20 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-orange" />
                  </div>
                  <p className="font-semibold text-sm mb-1">{c.name}</p>
                  <span className="text-xs text-orange font-mono">{c.rarity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comparison */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-black mb-8 text-center">Free vs Premium</h2>
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <div className="grid grid-cols-3 px-5 py-3 border-b border-white/5 text-xs text-vapor uppercase tracking-wider font-semibold">
              <span>Feature</span>
              <span className="text-center">Free</span>
              <span className="text-center text-orange">Premium</span>
            </div>
            {[
              { feature: "Play Ranked, Wagers, Tournaments", free: true, premium: true },
              { feature: "Premium Tournaments", free: false, premium: true },
              { feature: "Reduced Marketplace Fees", free: false, premium: true },
              { feature: "Monthly Cosmetic Drops", free: false, premium: true },
              { feature: "Premium Badge & Frames", free: false, premium: true },
              { feature: "Priority Matchmaking", free: false, premium: true },
              { feature: "Animated Profile Avatars", free: false, premium: true },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 px-5 py-3 border-b border-white/5 last:border-0 items-center">
                <span className="text-sm">{row.feature}</span>
                <div className="text-center">
                  {row.free ? <Check className="w-4 h-4 text-green mx-auto" /> : <span className="text-vapor text-sm">—</span>}
                </div>
                <div className="text-center">
                  <Check className="w-4 h-4 text-orange mx-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
