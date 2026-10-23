import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, CheckCheck, ChevronRight, Crown, Headphones, LockKeyhole, MonitorPlay, Palette, ShieldCheck, Sparkles } from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import PremiumMemberBadge from "@/components/ui/PremiumMemberBadge";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { activePremium, MEMBER_TIERS, PREMIUM_PLANS, membershipProgress } from "@/lib/premiumMembership";
import "@/styles/premium-layout.css";

const comparison = [
  { group: "THE ARENA", rows: [
    ["Ranked, Free 8s & XP Matches", true, true],
    ["Public tournaments", true, true],
    ["Premium-entry tournaments", false, true],
    ["Cash Match platform fee", "1% on $20+ matches", "1% on $50+ matches"],
  ] },
  { group: "YOUR IDENTITY", rows: [
    ["Solid name colors", "Verified players", "All name colors"],
    ["Animated name effects", "During free trials", true],
    ["Free username change", "5 credits per change", "1 per calendar month"],
    ["Premium crown", false, true],
    ["Member milestone badges", false, "1, 3, 6, 12 & 24 months"],
  ] },
  { group: "STREAM & SUPPORT", rows: [
    ["Animated player stat overlays", true, true],
    ["Animated webcam frames", true, true],
    ["Live support & saved conversations", true, true],
    ["Priority in the live-support inbox", false, true],
  ] },
];
const cell = value => typeof value === "boolean" ? value ? <span className="pm-included"><Check size={17} /><span className="sr-only">Included</span></span> : <span className="pm-unavailable" aria-label="Not included">—</span> : <span>{value}</span>;
const openSupport = () => window.dispatchEvent(new CustomEvent("topfragg:open-support"));

export default function Premium() {
  const { user, checkUserAuth } = useAuth();
  const [planId, setPlanId] = useState("monthly"), [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(Boolean(user)), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const active = activePremium(user), plan = PREMIUM_PLANS.find(item => item.id === planId);
  const progress = membership?.progress || membershipProgress([]);
  const next = MEMBER_TIERS.find(tier => tier.id === progress.next), current = MEMBER_TIERS.find(tier => tier.id === progress.current);
  const expires = user?.premium_expires ? new Date(user.premium_expires).toLocaleDateString([], { dateStyle: "medium" }) : null;
  useEffect(() => {
    if (!user?.id) { setMembership(null); setLoading(false); return; }
    let alive = true; setLoading(true); setError("");
    base44.functions.invoke("getPremiumMembershipStatus").then(async ({ data }) => {
      if (!data?.success) throw new Error(data?.error || "Could not load membership history.");
      if (alive) setMembership(data);
      if (data.awarded) await checkUserAuth({ force: true });
    }).catch(err => { if (alive) setError(err.message || "Could not load membership history."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id, retry, checkUserAuth]);

  return <div className="premium-page pm-page page-shell">
    <div className="page-container">
      <section className="pm-hero">
        <div className="pm-hero-copy"><div className="pm-eyebrow"><TopfraggLogo showWordmark={false} /> TOPFRAGG MEMBERSHIP</div>
          <h1>Your identity.<br /><span>Upgraded.</span></h1>
          <p>Make your name move. Build your member legacy. Get more from every session on Topfragg.</p>
          <div className="pm-hero-links"><a href="#compare">Free vs Premium <ArrowRight size={16} /></a><a href="#member-progress">Explore member badges <ChevronRight size={15} /></a></div>
          <div className="pm-signals"><span><Palette size={15} /> Animated names</span><span><MonitorPlay size={15} /> Stream overlays</span><span><Headphones size={15} /> Priority support</span></div>
        </div>
        <aside className="pm-plan-card"><div className="pm-plan-top"><span><Crown size={16} /> TOPFRAGG PREMIUM</span><span className="pm-status" data-active={active}>{active ? "Active member" : "Membership"}</span></div>
          <div className="pm-price"><strong>${plan.price}</strong><span>/ {plan.period}</span></div><p>Stand out in the arena. Stay part of the story.</p>
          <div className="pm-plan-options" aria-label="Membership duration">{PREMIUM_PLANS.map(option => <button key={option.id} aria-pressed={planId === option.id} onClick={() => setPlanId(option.id)}>{option.label}{option.id === "yearly" && <small>Save 17%</small>}</button>)}</div>
          {active ? <><Link className="pm-primary" to="/settings#settings-name-color">Customize your identity <ArrowRight size={16} /></Link><p className="pm-plan-note">{expires ? `Your membership is active until ${expires}.` : "Your Premium membership is active."}</p></> : <><button className="pm-primary" disabled>Purchases opening soon <LockKeyhole size={14} /></button><p className="pm-plan-note">Paid checkout is not open yet. Existing Premium memberships stay active.</p></>}
          <button className="pm-support-link" onClick={openSupport}><Headphones size={14} /> Questions? Open live support</button>
        </aside>
      </section>

      <section className="pm-perks" aria-label="Premium highlights">
        <article><span className="pm-perk-icon"><Palette /></span><div><small>MAKE IT YOURS</small><h2>A name with presence</h2><p>Unlock animated name effects across your Topfragg profile and player cards.</p><Link to="/settings#settings-name-color">Name settings <ArrowRight size={13} /></Link></div></article>
        <article><span className="pm-perk-icon"><Headphones /></span><div><small>WE HAVE YOUR BACK</small><h2>Priority live support</h2><p>Your requests are marked Premium and move to the top of the staff inbox. Messages stay saved.</p><button onClick={openSupport}>Open support <ArrowRight size={13} /></button></div></article>
        <article><span className="pm-perk-icon"><ShieldCheck /></span><div><small>MORE ROOM TO PLAY</small><h2>A better fee threshold</h2><p>Free: 1% on Cash Matches from $20. Premium: 1% from $50, with no platform fee below that threshold.</p><a href="#compare">See the details <ArrowRight size={13} /></a></div></article>
      </section>

      <section id="compare" className="pm-comparison">
        <header className="pm-section-heading"><div><span className="pm-eyebrow">CHOOSE YOUR EXPERIENCE</span><h2>Same arena. More possibilities.</h2><p>Free gets you in the game. Premium adds your own signature.</p></div><TopfraggLogo showWordmark={false} /></header>
        <div className="pm-table-wrap"><table><caption className="sr-only">Free and Topfragg Premium feature comparison</caption><thead><tr><th scope="col">What you get</th><th scope="col"><small>FREE</small><strong>$0</strong><span>Always welcome.</span></th><th scope="col"><small><Crown size={13} /> PREMIUM</small><strong>${plan.price}<em> / {plan.period}</em></strong><span>Your next level.</span></th></tr></thead>
          <tbody>{comparison.map(section => <React.Fragment key={section.group}><tr className="pm-table-group"><th colSpan={3} scope="colgroup">{section.group}</th></tr>{section.rows.map(([label, free, paid]) => <tr key={label}><th scope="row">{label}</th><td>{cell(free)}</td><td>{cell(paid)}</td></tr>)}</React.Fragment>)}</tbody>
        </table></div>
        <footer className="pm-fee-note"><ShieldCheck size={16} /><p>Cash Match thresholds use the listed entry amount per player. The 1% platform fee applies to winning profit, never your returned stake. Reward-item discounts can reduce this fee. Money 8s is separate.</p></footer>
      </section>

      <section id="member-progress" className="pm-membership">
        <header className="pm-section-heading"><div><span className="pm-eyebrow">YOUR TIME. YOUR LEGACY.</span><h2>A badge that grows with you.</h2><p>Five original Topfragg member badges. Earn them through time spent as a Premium member.</p></div><Sparkles size={26} /></header>
        {loading ? <p className="pm-progress-feedback" role="status">Loading your membership progress…</p> : error ? <div className="pm-progress-feedback" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></div> : <>
          <div className="pm-progress-summary"><div className="pm-current-badge">{current ? <PremiumMemberBadge tier={current.id} /> : <Crown size={29} />}</div><div><span>{user ? `${user.display_name || user.username || "Your"} · Member progression` : "Your member journey"}</span><h3>{current ? current.name : active ? "Your legacy starts here" : "Start your Premium legacy"}</h3><p>{progress.days} earned membership days{next ? ` · ${progress.remaining_days} more days to ${next.label}` : " · All milestones unlocked"}</p></div><strong>{current?.label || "0"}<small>{current ? "CURRENT BADGE" : "BADGES EARNED"}</small></strong></div>
          <div className="pm-progress-track" role="progressbar" aria-label={next ? `Progress to ${next.label} member badge` : "All member badges unlocked"} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress.percent}%` }} /></div>
          <div className="pm-progress-label"><span>{current?.label || "Start"}</span><span>{next ? `Next: ${next.label} · ${progress.percent}%` : "Diamond Elite achieved"}</span></div>
          <div className="pm-badge-grid">{MEMBER_TIERS.map(tier => { const earned = progress.earned.includes(tier.id), upcoming = next?.id === tier.id; return <article key={tier.id} className="pm-badge-card" data-earned={earned} data-next={upcoming} style={{ "--badge-color": tier.color }}><span className="pm-badge-period">{tier.label}</span><PremiumMemberBadge tier={tier.id} locked={!earned} /><h3>{tier.name}</h3><p>{tier.days} membership days</p><span className="pm-badge-state">{earned ? <><CheckCheck size={13} /> Unlocked</> : upcoming ? <><ChevronRight size={13} /> Next milestone</> : <><LockKeyhole size={11} /> Locked</>}</span></article>; })}</div>
          <div className="pm-membership-note"><ClockNote /><p>Only elapsed membership time counts. Renewals add to your progress; overlapping periods count once. Breaks pause your progress, and earned badges stay yours. Your highest unlocked badge appears beside your name.</p></div>
          {active && !progress.has_history && <p className="pm-progress-feedback">Your Premium access is active, but no dated membership history is available yet. We do not estimate badge progress from your account age.</p>}
          {!user && <Link className="pm-sign-in" to="/login">Sign in to see your membership progress <ArrowRight size={15} /></Link>}
        </>}
      </section>
      <footer className="pm-closing"><TopfraggLogo /><span>Your game. Your identity. Your Topfragg.</span><button onClick={openSupport}>Talk to the team <ArrowRight size={14} /></button></footer>
    </div>
  </div>;
}
function ClockNote() { return <ShieldCheck size={17} />; }
