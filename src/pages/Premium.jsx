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

const nameEffectShowcase = [
  { id: "fx-prism", label: "Prism Protocol", detail: "Rainbow flow", tone: "from-rose-400 via-yellow-300 to-violet-400" },
  { id: "fx-royal-frost", label: "Royal Frost", detail: "Purple / White", tone: "from-violet-400 via-white to-violet-300" },
  { id: "fx-pink-noise", label: "Pink Noise", detail: "Pink / White", tone: "from-pink-400 via-white to-rose-400" },
  { id: "fx-solar-circuit", label: "Solar Circuit", detail: "Cyan / Orange", tone: "from-cyan via-orange to-cyan" },
  { id: "fx-blue-mercury", label: "Blue Mercury", detail: "Blue / Silver", tone: "from-blue-400 via-slate-200 to-blue-300" },
  { id: "fx-aurora-core", label: "Aurora Core", detail: "Green / Cyan / Violet", tone: "from-green-400 via-cyan to-violet-400" },
  { id: "fx-emberwave", label: "Emberwave", detail: "Orange / Rose", tone: "from-orange via-rose-400 to-orange" },
  { id: "fx-neon-eclipse", label: "Neon Eclipse", detail: "Lime / Cyan / Purple", tone: "from-lime-300 via-cyan to-violet-400" },
  { id: "fx-galaxy", label: "Galaxy Drift", detail: "Deep Space / Starlight", tone: "from-indigo-950 via-violet-500 to-cyan-300" },
  { id: "fx-diamond-shine", label: "Diamond Shine", detail: "Crystal / Prism", tone: "from-white via-cyan to-pink-300" },
  { id: "fx-cosmic-nebula", label: "Cosmic Nebula", detail: "Purple Spiral", tone: "from-violet-950 via-violet-400 to-fuchsia-300" },
  { id: "fx-stellar-rush", label: "Stellar Rush", detail: "Blue / White", tone: "from-slate-950 via-cyan-300 to-white" },
  { id: "fx-prism-mirage", label: "Prism Mirage", detail: "Chromatic", tone: "from-fuchsia-400 via-cyan to-lime-300" },
  { id: "fx-golden-dimension", label: "Golden Dimension", detail: "Amber 3D", tone: "from-yellow-100 via-amber-400 to-orange-600" },
  { id: "fx-tesla-arc", label: "Tesla Arc", detail: "Electric White / Blue", tone: "from-slate-900 via-white to-cyan-300" },
  { id: "fx-tempest-core", label: "Tempest Core", detail: "Ocean Storm", tone: "from-slate-950 via-cyan-700 to-sky-200" },
  { id: "fx-astral-forge", label: "Astral Forge", detail: "Nebula Fire", tone: "from-slate-950 via-orange-500 to-violet-300" },
  { id: "fx-celestial-halo", label: "Celestial Halo", detail: "Golden Starfield", tone: "from-slate-950 via-amber-300 to-white" },
  { id: "fx-violet-cosmos", label: "Violet Cosmos", detail: "Purple Starlight", tone: "from-violet-950 via-fuchsia-500 to-white" },
  { id: "fx-lightning-gold", label: "Gold Lightning", detail: "Yellow / White", tone: "from-yellow-100 via-yellow-400 to-amber-500" },
  { id: "fx-lightning-gold-red", label: "Goldflare Lightning", detail: "Yellow / Red", tone: "from-yellow-200 via-orange to-red-500" },
  { id: "fx-lightning-blue-white", label: "Frostbolt Lightning", detail: "Blue / White", tone: "from-white via-cyan to-blue-500" },
];

const benefits = [
  { icon: Palette, title: "1 free name change", desc: "Change your display name once per Premium month without paying credits or a fee.", tone: "orange" },
  { icon: Gem, title: "Animated name effects", desc: "Pick a Premium color or flowing effect that follows your name across every Topfragg screen.", tone: "violet" },
  { icon: Trophy, title: "Premium tournaments", desc: "Join Premium-only tournaments and unlock their exclusive prize pools instantly.", tone: "gold" },
  { icon: Headset, title: "Instant live support", desc: "Premium support requests skip the normal 5-minute wait when a match needs staff.", tone: "cyan" },
  { icon: RotateCcw, title: "Trophy reset", desc: "Reset one Gold, Silver or Bronze trophy counter once per Premium membership period.", tone: "rose" },
  { icon: Crown, title: "Premium crown", desc: "Your profile and every player card show the Premium crown and badge automatically.", tone: "gold" },
  { icon: ShoppingBag, title: "Marketplace savings", desc: "Pay lower platform fees and get access to Premium-only drops and cosmetics.", tone: "green" },
  { icon: Sparkles, title: "Monthly drops", desc: "Receive seasonal profile items, cosmetics and member rewards as Premium evolves.", tone: "blue" },
];

const comparison = [
  ["Ranked, XP Matches & Wagers", true, true],
  ["Standard Tournaments", true, true],
  ["Premium-only Tournaments", false, true],
  ["1 free name change", false, true],
  ["Premium name colors & animations", false, true],
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
  const [selectedEffectId, setSelectedEffectId] = useState("fx-prism");
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const premiumActive = hasActivePremium(user);
  const selectedPlanDetails = useMemo(() => plans.find((plan) => plan.id === selectedPlan) || plans[1], [selectedPlan]);
  const selectedEffect = useMemo(() => nameEffectShowcase.find((effect) => effect.id === selectedEffectId) || nameEffectShowcase[0], [selectedEffectId]);
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
    <div className="premium-page min-h-screen py-8">
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

        <section className="premium-hero relative overflow-hidden rounded-3xl border border-orange/20">
          <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-orange/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-cyan/10 blur-3xl" />
          <div className="relative grid gap-8 p-6 lg:grid-cols-[1.08fr_.92fr] lg:p-10">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange/25 bg-orange/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-orange"><Crown className="h-3.5 w-3.5" /> Topfragg Premium</div>
              <h2 className="mt-5 max-w-2xl font-heading text-3xl font-black leading-[1.02] text-white sm:text-4xl lg:text-6xl">Your name.<br /><span className="text-orange">Your signal.</span></h2>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-vapor">Premium puts the useful things first: an animated name effect, a free name change, instant support and a crown that follows you into every player card.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={handleSubscribe} disabled={checkoutBusy} className="inline-flex items-center gap-2 rounded-xl bg-orange px-5 py-3 text-xs font-black uppercase tracking-wider text-background shadow-lg shadow-orange/20 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{checkoutBusy ? "Activating..." : premiumActive ? "Premium active" : `Get ${selectedPlanDetails.label} Premium`} <ArrowRight className="h-4 w-4" /></button>
                <a href="#compare" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/[0.06]">Compare benefits</a>
              </div>
              {premiumActive && <p className="mt-3 text-xs font-bold text-green">Premium active until {expiryText}.</p>}
            </div>

            <div className="premium-hero-perks grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                ["Profile signal", "Crown + Premium badge", Crown, "gold"],
                ["Everywhere identity", "Animated name effects", Palette, "violet"],
                ["Support access", "Instant live help", Headset, "cyan"],
                ["Trophy case", "One free reset", RotateCcw, "orange"],
              ].map(([label, value, Icon, tone]) => (
                <div key={label} className={`premium-hero-perk premium-hero-perk--${tone} flex items-center gap-3 rounded-2xl p-4`}><span className="premium-hero-perk-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Icon className="h-5 w-5" /></span><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div></div>
              ))}
            </div>
          </div>
        </section>

        <section className="premium-name-lab relative overflow-hidden rounded-3xl border border-cyan/20 p-5 sm:p-7 lg:p-9">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_70%_30%,rgba(34,211,238,.14),transparent_55%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[.86fr_1.14fr] xl:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-cyan"><Sparkles className="h-3.5 w-3.5" /> Premium name lab</div>
              <h2 className="mt-4 max-w-xl font-heading text-3xl font-black leading-[1.02] text-white sm:text-4xl">Not just a color.<br /><span className="text-cyan">A moving identity.</span></h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-vapor">Choose an effect in Edit Profile. It follows you through profiles, tournament rosters, wagers, matchrooms and leaderboards.</p>

              <div className="premium-live-card mt-6 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3"><span className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">Live player-card preview</span><span className="inline-flex items-center gap-1 rounded-full border border-yellow-300/25 bg-yellow-300/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-yellow-200"><Crown className="h-3 w-3" /> Premium</span></div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-cyan/35 bg-gradient-to-br from-cyan/20 via-secondary to-violet-500/15 font-heading text-2xl font-black text-cyan shadow-[0_0_28px_rgba(34,211,238,.14)]">T</div>
                  <div className="min-w-0"><p data-name-effect={selectedEffect.id} style={{ "--player-name-color": selectedEffect.id }} className="player-name-color truncate font-heading text-2xl font-black tracking-tight">TOPFRAGG</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-vapor">Premium competitor <span className="mx-1 text-white/20">•</span> 46 ELO</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-cyan">{selectedEffect.label}</p><p className="mt-0.5 text-[10px] text-vapor">{selectedEffect.detail}</p></div><span className="text-[10px] font-black uppercase tracking-wider text-green">Live everywhere</span></div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {nameEffectShowcase.map((effect) => {
                const selected = effect.id === selectedEffect.id;
                return <button key={effect.id} type="button" onClick={() => setSelectedEffectId(effect.id)} className={`premium-effect-choice group relative overflow-hidden rounded-2xl border p-4 text-left transition ${selected ? "is-selected" : ""}`}>
                  <span className={`pointer-events-none absolute -right-4 -top-5 h-20 w-20 rounded-full bg-gradient-to-br ${effect.tone} opacity-[.14] blur-2xl`} />
                  <span data-name-effect={effect.id} style={{ "--player-name-color": effect.id }} className="player-name-color relative block font-heading text-lg font-black tracking-tight">TOPFRAGG</span>
                  <span className="relative mt-2 block text-[10px] font-black uppercase tracking-wider text-white">{effect.label}</span>
                  <span className="relative mt-1 block text-[10px] text-vapor">{effect.detail}</span>
                  {selected && <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-cyan text-background"><Check className="h-3.5 w-3.5 stroke-[3]" /></span>}
                </button>;
              })}
            </div>
          </div>
        </section>

        <section className="premium-plan-deck rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Choose your membership</p><h2 className="mt-1 text-lg font-black text-white">Use your Topfragg wallet</h2><p className="mt-1 text-xs text-vapor">No external checkout. Your selected plan is charged from your available wallet balance.</p></div>
            <div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-[620px]">
              {plans.map((plan) => (
                <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan.id)} className={`premium-plan relative rounded-xl border p-3 text-left transition ${selectedPlan === plan.id ? "is-selected" : ""}`}>
                  {plan.featured && <span className="absolute -top-2 right-2 rounded-full bg-orange px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-background">Popular</span>}
                  <span className="block text-[10px] font-black uppercase tracking-wider text-white">{plan.label}</span><span className="mt-1 block font-mono text-lg font-black text-orange">${plan.price}</span><span className="mt-1 block text-[10px] text-vapor">{plan.note}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map((benefit, index) => (
            <motion.div key={benefit.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.035 }} className={`premium-benefit premium-benefit--${benefit.tone} group relative overflow-hidden rounded-2xl p-5`}>
              <div className="premium-benefit-orb absolute right-0 top-0 h-20 w-20 rounded-full blur-2xl transition" />
              <div className="relative"><div className="premium-benefit-icon flex h-10 w-10 items-center justify-center rounded-xl"><benefit.icon className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-black text-white">{benefit.title}</h3><p className="mt-2 text-xs leading-5 text-vapor">{benefit.desc}</p></div>
            </motion.div>
          ))}
        </section>

        <section className="premium-signal overflow-hidden rounded-2xl p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">Your Premium signal</p><h2 className="mt-1 text-xl font-black text-white">One membership, visible everywhere</h2><p className="mt-2 max-w-2xl text-xs leading-5 text-vapor">When Premium is active, the crown and Premium badge are added automatically to your profile, roster rows, wager cards and tournament match rooms.</p></div><div className="flex items-center gap-3 rounded-2xl border border-yellow-300/20 bg-yellow-300/[0.06] px-4 py-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-300/15 text-yellow-300"><Crown className="h-6 w-6" /></div><div><p className="text-[9px] font-black uppercase tracking-wider text-yellow-200">Player card</p><p className="mt-1 text-sm font-black text-white">Premium member</p></div></div></div>
          {user && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4"><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"><UserBadges user={user} size="sm" showMonitorCam={false} /><span className="text-xs font-bold text-white">Your live profile badges</span></div>{premiumActive ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green"><CheckCircle2 className="h-4 w-4" /> Active until {expiryText}</span> : <span className="inline-flex items-center gap-1.5 text-xs text-vapor"><Clock3 className="h-4 w-4" /> Activate Premium to unlock the crown</span>}</div>}
        </section>

        <section id="compare" className="premium-compare overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Plan comparison</p><h2 className="mt-1 text-lg font-black text-white">Free vs Premium</h2></div><BadgeCheck className="h-6 w-6 text-orange" /></div>
          <div className="grid grid-cols-[1.6fr_.45fr_.55fr] border-b border-white/[0.06] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-vapor sm:grid-cols-[1.8fr_.35fr_.45fr]"><span>Feature</span><span className="text-center">Free</span><span className="text-center text-orange">Premium</span></div>
          {comparison.map(([feature, free, premium]) => <div key={feature} className="grid grid-cols-[1.6fr_.45fr_.55fr] items-center border-b border-white/[0.05] px-5 py-3 last:border-0 sm:grid-cols-[1.8fr_.35fr_.45fr]"><span className="text-xs font-bold text-white sm:text-sm">{feature}</span><span className="text-center">{free ? <Check className="mx-auto h-4 w-4 text-green" /> : <span className="text-vapor">—</span>}</span><span className="text-center">{premium ? <Check className="mx-auto h-4 w-4 text-orange" /> : <span className="text-vapor">—</span>}</span></div>)}
        </section>
      </div>
    </div>
  );
}
