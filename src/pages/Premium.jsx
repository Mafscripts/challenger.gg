import React from "react";
import { motion } from "framer-motion";
import { Check, Shield, ShoppingBag, Trophy, Users, Sparkles, Crown, ArrowRight, Zap, BadgeCheck } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

const benefits = [
  { icon: Trophy, title: "Premium Tournaments", desc: "Access Premium-only tournaments and exclusive prize pools." },
  { icon: ShoppingBag, title: "Marketplace Benefits", desc: "Reduced marketplace fees and better value on purchases and sales." },
  { icon: Sparkles, title: "Monthly Drops", desc: "Receive exclusive cosmetic drops, profile items and seasonal rewards." },
  { icon: Shield, title: "Premium Profile", desc: "Premium badge, enhanced profile presentation and exclusive frames." },
  { icon: Users, title: "Priority Access", desc: "Priority access to selected queues, events and limited tournament slots." },
  { icon: Zap, title: "Competitive Perks", desc: "Extra access to Topfragg competitive features reserved for Premium users." },
];

const comparison = [
  ["Ranked, XP Matches & Wagers", true, true],
  ["Standard Tournaments", true, true],
  ["Premium-only Tournaments", false, true],
  ["Reduced Marketplace Fees", false, true],
  ["Monthly Cosmetic Drops", false, true],
  ["Premium Badge & Frames", false, true],
  ["Priority Event Access", false, true],
];

export default function Premium() {
  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-[1500px] px-4 lg:px-6">
        <PageHeader
          eyebrow="Topfragg membership"
          title="Premium"
          description="One membership for extra tournament access, profile perks, marketplace benefits and exclusive Topfragg rewards."
          className="dark-focus dark-media mb-6"
          action={
            <div className="rounded-xl border border-orange/20 bg-orange/[0.06] px-4 py-3 text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Membership</p>
              <p className="mt-1 font-mono text-2xl font-black text-white">$9.99 <span className="text-xs text-vapor">/ month</span></p>
            </div>
          }
        />

        <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,136,0,.10),rgba(20,216,255,.03),rgba(255,255,255,.02))]">
          <div className="grid gap-8 p-6 lg:grid-cols-[1.2fr_.8fr] lg:p-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-orange/20 bg-orange/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-orange">
                <Crown className="h-3.5 w-3.5" /> Topfragg Premium
              </div>
              <h2 className="mt-5 max-w-2xl text-3xl font-black leading-tight text-white lg:text-5xl">More access. Better rewards. One clean upgrade.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-vapor">Premium is a standalone Topfragg membership. It does not replace your normal account — it adds exclusive tournament access, cosmetic drops, profile upgrades and marketplace benefits.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-orange px-5 py-3 text-xs font-black uppercase tracking-wider text-background transition hover:brightness-110">
                  Get Premium <ArrowRight className="h-4 w-4" />
                </button>
                <a href="#compare" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.06]">
                  Compare plans
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                ["Premium tournaments", "Exclusive access"],
                ["Monthly rewards", "Cosmetics & profile items"],
                ["Marketplace", "Reduced fees"],
                ["Profile", "Premium badge & frames"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/[0.07] bg-background/35 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">{label}</p>
                  <p className="mt-1 text-sm font-black text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.04 }}
              className="rounded-2xl border border-white/[0.07] bg-card/70 p-5 transition hover:border-orange/20 hover:bg-card"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange/20 bg-orange/10 text-orange"><benefit.icon className="h-5 w-5" /></div>
              <h3 className="mt-4 text-sm font-black text-white">{benefit.title}</h3>
              <p className="mt-2 text-xs leading-5 text-vapor">{benefit.desc}</p>
            </motion.div>
          ))}
        </section>

        <section id="compare" className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-card/65">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Plan comparison</p>
              <h2 className="mt-1 text-lg font-black text-white">Free vs Premium</h2>
            </div>
            <BadgeCheck className="h-6 w-6 text-orange" />
          </div>
          <div className="grid grid-cols-[1.5fr_.5fr_.5fr] border-b border-white/[0.06] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-vapor">
            <span>Feature</span><span className="text-center">Free</span><span className="text-center text-orange">Premium</span>
          </div>
          {comparison.map(([feature, free, premium]) => (
            <div key={feature} className="grid grid-cols-[1.5fr_.5fr_.5fr] items-center border-b border-white/[0.05] px-5 py-3 last:border-0">
              <span className="text-sm text-white">{feature}</span>
              <span className="text-center">{free ? <Check className="mx-auto h-4 w-4 text-green" /> : <span className="text-vapor">—</span>}</span>
              <span className="text-center">{premium ? <Check className="mx-auto h-4 w-4 text-orange" /> : <span className="text-vapor">—</span>}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
