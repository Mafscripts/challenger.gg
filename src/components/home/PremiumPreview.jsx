import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Check, ArrowRight, Zap, Star, Shield } from "lucide-react";

const perks = [
  "2x XP Boost on all matches",
  "Exclusive Premium cosmetics monthly",
  "Priority matchmaking queue",
  "Custom profile frames & badges",
  "Reduced marketplace fees",
  "Access to Premium-only tournaments",
];

export default function PremiumPreview() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-orange/[0.03] to-cyan/[0.03]" />
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 relative">
        <div className="glass rounded-2xl border border-orange/20 p-8 lg:p-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan/5 rounded-full blur-[80px]" />
          
          <div className="relative z-10 flex flex-col lg:flex-row items-start gap-12">
            <div className="lg:w-1/2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange/10 border border-orange/20 mb-6">
                <Crown className="w-3.5 h-3.5 text-orange" />
                <span className="text-orange text-xs font-mono font-semibold uppercase tracking-wider">Premium Membership</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-black tracking-tight mb-4">
                Unlock Your
                <br />
                <span className="text-orange text-glow-orange">Full Potential</span>
              </h2>
              <p className="text-vapor leading-relaxed mb-8 max-w-md">
                Premium members gain access to exclusive benefits, cosmetics, and competitive advantages that elevate every aspect of the platform.
              </p>
              <div className="flex items-baseline gap-2 mb-8">
                <span className="text-5xl font-black font-mono text-orange">$9.99</span>
                <span className="text-vapor">/month</span>
              </div>
              <Link to="/premium" className="inline-flex items-center gap-2 px-8 py-4 bg-orange text-white font-bold text-sm rounded-lg hover:shadow-lg hover:shadow-orange/25 transition-all uppercase tracking-wider">
                <Crown className="w-4 h-4" />
                Go Premium
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="lg:w-1/2">
              <div className="space-y-4">
                {perks.map((perk, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-orange/10 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-orange" />
                    </div>
                    <span className="text-sm">{perk}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}