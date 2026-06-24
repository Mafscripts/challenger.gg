import React from "react";
import { motion } from "framer-motion";
import { FileText, Shield, Swords, Wallet, ShoppingBag, Users, AlertTriangle } from "lucide-react";

const sections = [
  {
    id: "accounts",
    icon: Users,
    title: "Accounts and Eligibility",
    body: [
      "You must provide accurate account information and keep your login credentials secure.",
      "One person may not operate multiple accounts to bypass bans, limits, matchmaking, tournament rules, or marketplace restrictions.",
      "You are responsible for all activity that occurs through your account.",
      "Wager features, withdrawals, and paid competitions may require age, identity, payment, or regional eligibility checks.",
    ],
  },
  {
    id: "competition",
    icon: Swords,
    title: "Competitive Play",
    body: [
      "Players must follow the posted Rules and match-specific instructions for ranked matches, XP matches, wagers, teams, and tournaments.",
      "Match scores, evidence, roster eligibility, check-in timing, map vetoes, no-shows, disconnects, and disputes may be reviewed by staff.",
      "Cheating, boosting, exploiting, match fixing, account sharing, harassment, or intentional disruption may result in forfeits, penalties, suspensions, or bans.",
      "Leaderboard ratings, ELO, XP, tournament placement, and records may be adjusted when staff corrects abuse, bugs, fraud, or incorrectly reported outcomes.",
    ],
  },
  {
    id: "payments",
    icon: Wallet,
    title: "Wallets, Wagers, and Payments",
    body: [
      "Wallet balances, deposits, wager entries, payouts, credits, withdrawals, refunds, fees, and adjustments are recorded in platform systems.",
      "You may not use payment methods you are not authorized to use or attempt chargebacks, reversals, laundering, or payment abuse.",
      "Wager payouts and withdrawals may be delayed or denied while disputes, fraud checks, payment reviews, or identity checks are pending.",
      "Taxes, reporting obligations, and compliance with local laws are your responsibility unless applicable law requires otherwise.",
    ],
  },
  {
    id: "marketplace",
    icon: ShoppingBag,
    title: "Marketplace, Credits, and Digital Items",
    body: [
      "Credits, cosmetics, inventory items, premium benefits, and digital rewards are limited licenses for use on Challenger.gg and are not cash equivalents.",
      "Marketplace listings, trades, purchases, and item availability may be limited, removed, corrected, or reversed for fraud, bugs, policy violations, or system errors.",
      "Premium benefits and monthly drops may change by month and may require an active membership at the time rewards are granted.",
      "You may not sell, transfer, or trade accounts outside approved platform tools.",
    ],
  },
  {
    id: "conduct",
    icon: Shield,
    title: "Community Conduct",
    body: [
      "You may not harass, threaten, dox, impersonate, spam, scam, or post hateful, illegal, sexually explicit, or malicious content.",
      "Names, team names, chat messages, profile content, and uploaded evidence must follow community standards.",
      "Staff may remove content, restrict features, or suspend access when conduct creates risk for players, staff, the platform, or partners.",
      "Reports should be truthful. Repeated false reports or forged evidence may lead to penalties.",
    ],
  },
  {
    id: "disputes",
    icon: AlertTriangle,
    title: "Disputes, Enforcement, and Availability",
    body: [
      "Staff decisions on match disputes, wager disputes, tournament rulings, support tickets, and enforcement actions are final unless reopened by staff.",
      "The platform may be updated, interrupted, limited, or unavailable while features, data, payments, security, or infrastructure are maintained.",
      "Challenger.gg is not affiliated with Activision or Call of Duty. Game publisher rules and platform network rules still apply.",
      "We may update these terms when features, laws, or platform operations change. Continued use means you accept the updated terms.",
    ],
  },
  {
    id: "privacy",
    icon: FileText,
    title: "Privacy and Data",
    body: [
      "We use account, gameplay, payment, wallet, marketplace, support, moderation, device, and usage data to operate and protect the platform.",
      "Support tickets, match evidence, chat, transaction records, and moderation records may be reviewed by authorized staff.",
      "We may retain records needed for legal, tax, fraud prevention, payment, dispute, security, and platform integrity purposes.",
      "Do not submit sensitive personal information unless it is required for support, payment, identity, or compliance review.",
    ],
  },
];

export default function Terms() {
  return (
    <div className="min-h-screen py-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan/10 border border-cyan/20 mb-6">
            <FileText className="w-4 h-4 text-cyan" />
            <span className="text-cyan text-xs font-mono font-semibold tracking-widest uppercase">Legal</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-4">Terms of Service</h1>
          <p className="text-vapor max-w-2xl mx-auto">
            These terms govern use of Challenger.gg, including accounts, matches, wagers, teams, tournaments, marketplace activity, support, and premium features.
          </p>
          <p className="text-xs text-vapor/60 mt-4 font-mono">Effective June 23, 2026</p>
        </div>

        <div className="glass rounded-xl border border-white/5 p-6 mb-6">
          <p className="text-sm text-vapor leading-relaxed">
            By creating an account, joining a match, entering a wager or tournament, purchasing credits, trading items, using chat, or contacting support, you agree to these terms and the platform Rules. If you do not agree, do not use Challenger.gg.
          </p>
        </div>

        <div className="space-y-4">
          {sections.map((section, index) => {
            const Icon = section.icon;
            return (
              <motion.section
                key={section.id}
                id={section.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="glass rounded-xl border border-white/5 p-6 scroll-mt-24"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-secondary">
                    <Icon className="w-4 h-4 text-cyan" />
                  </div>
                  <h2 className="font-black text-xl">{section.title}</h2>
                </div>
                <ol className="space-y-3">
                  {section.body.map((item, itemIndex) => (
                    <li key={item} className="text-sm text-vapor leading-relaxed flex gap-3">
                      <span className="text-cyan font-mono text-xs mt-0.5 shrink-0">{itemIndex + 1}.</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </motion.section>
            );
          })}
        </div>

        <div className="glass rounded-xl border border-cyan/10 p-6 mt-6">
          <h2 className="font-bold text-lg mb-2">Contact</h2>
          <p className="text-sm text-vapor">
            Questions about these terms or your account can be submitted through the Contact Support page.
          </p>
        </div>
      </div>
    </div>
  );
}
