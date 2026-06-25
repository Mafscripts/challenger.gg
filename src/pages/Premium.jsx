import React, { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Check, Zap, Shield, ShoppingBag, Trophy, Users, Sparkles, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const benefits = [
  { icon: Zap, title: "2x XP Boost", desc: "Double experience on all matches. Level up and prestige faster than ever." },
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
  const [subscribing, setSubscribing] = useState(false);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const response = await base44.functions.invoke("subscribePremium", { plan_type: "monthly" });
      if (response.data.success) {
        toast({ title: "Premium activated", description: "Your premium membership is now active." });
      } else {
        toast({ title: "Subscription failed", description: response.data.error || "Unable to activate premium", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Subscription failed", description: error.message || "Unable to activate premium", variant: "destructive" });
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        {/* Hero */}
        <div className="text-center mb-20 relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-96 h-96 bg-orange/10 rounded-full blur-[120px]" />
          </div>
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-orange/10 border border-orange/20 mb-6">
              <Crown className="w-4 h-4 text-orange" />
              <span className="text-orange text-xs font-mono font-semibold tracking-widest uppercase">Premium Membership</span>
            </div>
            <h1 className="text-5xl lg:text-7xl font-black tracking-tight mb-4">
              ELEVATE YOUR
              <br />
              <span className="text-orange text-glow-orange">GAME</span>
            </h1>
            <p className="text-vapor text-lg max-w-2xl mx-auto mb-10">
              Unlock the full Topfragg.gg experience with exclusive benefits, cosmetics, and competitive advantages that separate the good from the great.
            </p>
            <div className="flex items-center justify-center gap-6 mb-8">
              <div>
                <span className="text-6xl font-black font-mono text-orange">$9.99</span>
                <span className="text-vapor text-lg ml-1">/mo</span>
              </div>
            </div>
            <button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="inline-flex items-center gap-2 px-10 py-5 bg-orange text-white font-bold rounded-xl hover:shadow-2xl hover:shadow-orange/25 transition-all text-lg uppercase tracking-wider"
            >
              <Crown className="w-5 h-5" /> {subscribing ? "Subscribing..." : "Subscribe Now"} <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
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
              whileHover={{ y: -4 }}
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
              { feature: "Play 8s, Ranked, Wagers", free: true, premium: true },
              { feature: "2x XP Boost", free: false, premium: true },
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
