import React from "react";
import { Coins, Crown, Lock, Sparkles } from "lucide-react";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";

const creditPackages = [
  { credits: 1, price: 1, label: "Starter", tone: "cyan" },
  { credits: 5, price: 3.75, label: "Small pack", tone: "blue" },
  { credits: 10, price: 7.5, label: "Standard pack", tone: "purple" },
  { credits: 20, price: 15, label: "Large pack", tone: "pink" },
  { credits: 50, price: 37.5, label: "Max pack", tone: "gold" },
];

function CreditPackageArtwork({ credits }) {
  return <div className="marketplace-credit-artwork" aria-hidden="true">
    <span className="marketplace-credit-coin-back" /><span className="marketplace-credit-coin-back" />
    <span className="marketplace-credit-coin"><span><img src="/topfragg-mark.svg" alt="" loading="lazy" decoding="async" /></span></span>
    <span className="marketplace-credit-quantity">×{credits}</span>
  </div>;
}

export default function CreditsStore({ user }) {
  return <section className="marketplace-credits marketplace-section" id="credits-store" aria-labelledby="marketplace-credits-title">
    <div className="marketplace-section-heading"><div><p className="marketplace-eyebrow"><Coins size={13} />The credit vault</p><h2 id="marketplace-credits-title">Credits Store<span>.</span></h2><p>Your balance and the available credit packages.</p></div>
      {user && <div className="marketplace-credit-balance"><span><Coins size={18} />Your credits</span><strong>{Number(user.credits || 0).toLocaleString()}</strong></div>}
    </div>
    <CommercePausedNotice />
    <div className="marketplace-credit-grid">{creditPackages.map((pack) => <article key={pack.credits} className="marketplace-credit-pack" data-tone={pack.tone} aria-disabled="true">
      <p className="marketplace-credit-pack-label">{pack.label}</p>
      <CreditPackageArtwork credits={pack.credits} />
      <div className="marketplace-credit-pack-copy"><h3>{pack.credits} {pack.credits === 1 ? "Credit" : "Credits"}</h3><strong>${pack.price.toFixed(2)}</strong></div>
      <p className="marketplace-credit-unit-price">{pack.credits === 1 ? "$1.00 per credit" : "$0.75 per credit"}</p>
      <span className="marketplace-credit-unavailable"><Lock size={12} />Coming soon</span>
    </article>)}</div>
    <p className="marketplace-credit-note"><Sparkles size={14} /><span>Credits can be used for tournament entry fees and display name changes (5 credits each, free for <Crown size={12} className="inline" /> Premium members).</span></p>
  </section>;
}
