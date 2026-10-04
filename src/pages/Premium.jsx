import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  Crown,
  Gem,
  Headset,
  Palette,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trophy,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import UserBadges from "@/components/ui/UserBadges";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const plans = [
  { id: "weekly", label: "Weekly", price: "3.99", note: "Try Premium for 7 days" },
  { id: "monthly", label: "Monthly", price: "9.99", note: "Most popular", featured: true },
  { id: "yearly", label: "Yearly", price: "99.99", note: "Save with a full year" },
];

const benefits = [
  { icon: Palette, title: "1 free name change", desc: "Change your display name once per Premium month without paying credits or a fee." },
  { icon: Gem, title: "Wager name colors", desc: "Choose a verified Premium accent color so your name stands out in wager rooms and profiles." },
  { icon: Trophy, title: "Premium tournaments", desc: "Join Premium-only tournaments and unlock their exclusive prize pools instantly." },
  { icon: Headset, title: "Instant live support", desc: "Premium support requests skip the normal 5-minute wait when a match needs staff." },
  { icon: RotateCcw, title: "Trophy reset", desc: "Reset one Gold, Silver or Bronze trophy counter once per Premium membership period." },
  { icon: Crown, title: "Premium crown", desc: "Your profile and every player card show the Premium crown and badge automatically." },
  { icon: ShoppingBag, title: "Marketplace savings", desc: "Pay lower platform fees and get access to Premium-only drops and cosmetics." },
  { icon: Sparkles, title: "Monthly drops", desc: "Receive seasonal profile items, cosmetics and member rewards as Premium evolves." },
];

const comparison = [
  ["Ranked, XP Matches & Wagers", true, true],
  ["Standard Tournaments", true, true],
  ["Premium-only Tournaments", false, true],
  ["1 free name change", false, true],
  ["Wager name color", false, true],
  ["Instant live support", false, true],
  ["1 Gold / Silver / Bronze trophy reset", false, true],
  ["Premium crown on profile & player cards", false, true],
  ["Reduced Marketplace Fees", false, true],
  ["Monthly Cosmetic Drops", false, true],
];

const hasActivePremium = (user) => Boolean(
  user?.is_premium === true
  && (!user?.premium_expires || new Date(user.premium_expires).getTime() > Date.now()),
);

export default function Premium() {
  const [user, setUser] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const premiumActive = hasActivePremium(user);
  const selectedPlanDetails = useMemo(() => plans.find((plan) => plan.id === selectedPlan) || plans[1], [selectedPlan]);
  const expiryText = user?.premium_expires
    ? new Date(user.premium_expires).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Active membership";

  const handleSubscribe = async () => {
    if (premiumActive) {
      toast({ title: "Premium is already active", description: `Your membership is active until ${expiryText}.` });
      return;
    }
    setCheckoutBusy(true);
    try {
      const response = await base44.functions.invoke("subscribePremium", { plan_type: selectedPlan });
      if (!response.data?.success) throw new Error(response.data?.error || "Premium could not be activated.");
      const refreshed = await base44.auth.me({ force: true }).catch(() => null);
      if (refreshed) setUser(refreshed);
      toast({ title: "Premium activated", description: `Your ${selectedPlanDetails.label.toLowerCase()} membership is ready.` });
    } catch (error) {
      toast({ title: "Premium could not be activated", description: error.message || "Check your wallet balance and try again.", variant: "destructive" });
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 lg:px-6">
        <PageHeader
          eyebrow="Topfragg membership"
          title="Premium"
          description="A sharper profile, faster support and better access across every competitive room."
          className="dark-focus dark-media"
          action={(
            <div className={`rounded-xl border px-4 py-3 text-right ${premiumActive ? "border-green/30 bg-green/10" : "border-orange/20 bg-orange/[0.06]"}`}>
              <p className={`text-[9px] font-black uppercase tracking-[0.18em] ${premiumActive ? "text-green" : "text-orange"}`}>{premiumActive ? "Active membership" : "From"}</p>
              <p className="mt-1 font-mono text-2xl font-black text-white">${selectedPlanDetails.price} <span className="text-xs text-vapor">/ {selectedPlan === "yearly" ? "year" : selectedPlan === "weekly" ? "week" : "month"}</span></p>
            </div>
          )}
        />

        <section className="premium-panel relative overflow-hidden rounded-3xl border border-orange/20">
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-cyan/10 blur-3xl" />
          <div className="relative grid gap-8 p-6 lg:grid-cols-[1.08fr_.92fr] lg:p-10">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange/25 bg-orange/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-orange"><Crown className="h-3.5 w-3.5" /> Topfragg Premium</div>
              <h2 className="mt-5 max-w-2xl font-heading text-3xl font-black leading-[1.02] text-white sm:text-4xl lg:text-6xl">More access.<br /><span className="text-orange">More presence.</span></h2>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-vapor">Premium puts the useful things first: a free name change, a custom wager color, instant support and a crown that follows you into every player card.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={handleSubscribe} disabled={checkoutBusy} className="inline-flex items-center gap-2 rounded-xl bg-orange px-5 py-3 text-xs font-black uppercase tracking-wider text-background shadow-lg shadow-orange/20 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{checkoutBusy ? "Activating..." : premiumActive ? "Premium active" : `Get ${selectedPlanDetails.label} Premium`} <ArrowRight className="h-4 w-4" /></button>
                <a href="#compare" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.06]">Compare benefits</a>
              </div>
              {premiumActive && <p className="mt-3 text-xs font-bold text-green">Premium active until {expiryText}.</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                ["Profile signal", "Crown + Premium badge", Crown, "text-yellow-300"],
                ["Wager identity", "Free name color", Palette, "text-cyan"],
                ["Support access", "Instant live help", Headset, "text-green"],
                ["Trophy case", "One free reset", RotateCcw, "text-orange"],
              ].map(([label, value, Icon, tone]) => (
                <div key={label} className="premium-card flex items-center gap-3 rounded-2xl p-4"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] ${tone}`}><Icon className="h-5 w-5" /></span><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div></div>
              ))}
            </div>
          </div>
        </section>

        <section className="premium-panel rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Choose your membership</p><h2 className="mt-1 text-lg font-black text-white">Use your Topfragg wallet</h2><p className="mt-1 text-xs text-vapor">No external checkout. Your selected plan is charged from your available wallet balance.</p></div>
            <div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-[620px]">
              {plans.map((plan) => (
                <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan.id)} className={`relative rounded-xl border p-3 text-left transition ${selectedPlan === plan.id ? "border-orange/60 bg-orange/10 shadow-[0_0_24px_rgba(255,136,0,.10)]" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}>
                  {plan.featured && <span className="absolute -top-2 right-2 rounded-full bg-orange px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-background">Popular</span>}
                  <span className="block text-[10px] font-black uppercase tracking-wider text-white">{plan.label}</span><span className="mt-1 block font-mono text-lg font-black text-orange">${plan.price}</span><span className="mt-1 block text-[10px] text-vapor">{plan.note}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map((benefit, index) => (
            <motion.div key={benefit.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.035 }} className="premium-card group relative overflow-hidden rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-orange/25">
              <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-orange/[0.06] blur-2xl transition group-hover:bg-orange/[0.12]" />
              <div className="relative"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange/20 bg-orange/10 text-orange"><benefit.icon className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-black text-white">{benefit.title}</h3><p className="mt-2 text-xs leading-5 text-vapor">{benefit.desc}</p></div>
            </motion.div>
          ))}
        </section>

        <section className="premium-panel overflow-hidden rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">Your Premium signal</p><h2 className="mt-1 text-xl font-black text-white">One membership, visible everywhere</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-vapor">When Premium is active, the crown and Premium badge are added automatically to your profile, roster rows, wager cards and tournament match rooms.</p></div><div className="flex items-center gap-3 rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.06] px-4 py-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-300/15 text-yellow-300"><Crown className="h-6 w-6" /></div><div><p className="text-[9px] font-black uppercase tracking-wider text-yellow-200">Player card</p><p className="mt-1 text-sm font-black text-white">Premium member</p></div></div></div>
          {user && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4"><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"><UserBadges user={user} size="sm" showMonitorCam={false} /><span className="text-xs font-bold text-white">Your live profile badges</span></div>{premiumActive ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green"><CheckCircle2 className="h-4 w-4" /> Active until {expiryText}</span> : <span className="inline-flex items-center gap-1.5 text-xs text-vapor"><Clock3 className="h-4 w-4" /> Activate Premium to unlock the crown</span>}</div>}
        </section>

        <section id="compare" className="premium-panel overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Plan comparison</p><h2 className="mt-1 text-lg font-black text-white">Free vs Premium</h2></div><BadgeCheck className="h-6 w-6 text-orange" /></div>
          <div className="grid grid-cols-[1.6fr_.45fr_.55fr] border-b border-white/[0.06] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-vapor sm:grid-cols-[1.8fr_.35fr_.45fr]"><span>Feature</span><span className="text-center">Free</span><span className="text-center text-orange">Premium</span></div>
          {comparison.map(([feature, free, premium]) => <div key={feature} className="grid grid-cols-[1.6fr_.45fr_.55fr] items-center border-b border-white/[0.05] px-5 py-3 last:border-0 sm:grid-cols-[1.8fr_.35fr_.45fr]"><span className="text-xs font-bold text-white sm:text-sm">{feature}</span><span className="text-center">{free ? <Check className="mx-auto h-4 w-4 text-green" /> : <span className="text-vapor">—</span>}</span><span className="text-center">{premium ? <Check className="mx-auto h-4 w-4 text-orange" /> : <span className="text-vapor">—</span>}</span></div>)}
        </section>
      </div>
    </div>
  );
}
