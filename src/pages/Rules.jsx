import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ChevronDown, BookOpen, AlertTriangle, Users, Swords, Trophy, DollarSign, Monitor } from "lucide-react";

const sections = [
  {
    title: "General Platform Rules",
    icon: Shield,
    rules: [
      "All players must be at least 18 years of age to participate in wager matches.",
      "One account per person. Alt accounts will result in permanent bans.",
      "Harassment, hate speech, and toxic behavior will not be tolerated.",
      "All disputes must be submitted within 15 minutes of match completion.",
      "Video evidence is required for all dispute submissions.",
      "Platform decisions on disputes are final after review.",
    ],
  },
  {
    title: "Match Rules",
    icon: Swords,
    rules: [
      "Maps are selected via the official veto system. Manual map selection is not permitted.",
      "Each team receives one map veto per match.",
      "Match results must be reported within 10 minutes of completion.",
      "Disconnections within the first 30 seconds may trigger a restart at moderator discretion.",
      "Intentional disconnections forfeit the match.",
      "Screen recording is strongly recommended for all competitive matches.",
      "Verified players do not have to stream by default. They must stream only when an opponent requests it with clips or evidence and an admin validates that request.",
      "Admins may override a verified player and force them to stream when match integrity requires it.",
    ],
  },
  {
    title: "Ranked Rules",
    icon: Trophy,
    rules: [
      "10 placement matches are required before receiving an initial rank.",
      "Leaving a ranked match in progress results in an automatic loss and ELO penalty.",
      "Rank decay applies after 14 days of inactivity in Diamond+ tiers.",
      "Season resets occur every 3 months with new placement matches.",
      "Boosting (having a higher-ranked player play on your account) is a bannable offense.",
    ],
  },
  {
    title: "Wager Rules",
    icon: DollarSign,
    rules: [
      "All wager funds are held in escrow during the match.",
      "Both parties must confirm the result for payouts to process.",
      "Disputed wagers are reviewed by moderators within 24 hours.",
      "Minimum wager amount is $1. Maximum is $500 per match.",
      "Wager payouts process instantly upon result confirmation.",
      "Repeated false dispute claims will result in account restrictions.",
    ],
  },
  {
    title: "Tournament Rules",
    icon: Users,
    rules: [
      "Teams must check in 15 minutes before tournament start time.",
      "Failure to check in forfeits your spot and registration fee.",
      "Substitutes must be registered before the tournament begins.",
      "Tournament brackets are generated randomly and cannot be contested.",
      "Prize distributions follow the published structure for each event.",
    ],
  },
  {
    title: "Anti-Cheat & Fair Play",
    icon: Monitor,
    rules: [
      "All players must have anti-cheat software running during matches.",
      "Use of any unauthorized software, exploits, or modifications is prohibited.",
      "AI-powered detection monitors all matches in real-time.",
      "Confirmed cheating results in permanent ban and forfeiture of all funds.",
      "Reporting suspected cheaters is encouraged and reviewed within 48 hours.",
      "Streamer badges are blue and verified player badges are green. Badges identify account status but do not replace dispute evidence.",
    ],
  },
];

export default function Rules() {
  const [openSection, setOpenSection] = useState(0);

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 lg:px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan/10 border border-cyan/20 mb-6">
            <BookOpen className="w-4 h-4 text-cyan" />
            <span className="text-cyan text-xs font-mono font-semibold tracking-widest uppercase">Platform Guidelines</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-4">Rules & Regulations</h1>
          <p className="text-vapor max-w-xl mx-auto">These rules ensure fair competition and a positive experience for all Topfragg.gg users. Violations may result in warnings, suspensions, or permanent bans.</p>
        </div>

        <div className="space-y-3">
          {sections.map((section, i) => {
            const Icon = section.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-xl border border-white/5 overflow-hidden"
              >
                <button
                  onClick={() => setOpenSection(openSection === i ? -1 : i)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <div className="p-2 rounded-lg bg-secondary">
                    <Icon className="w-4 h-4 text-cyan" />
                  </div>
                  <span className="font-bold flex-1">{section.title}</span>
                  <ChevronDown className={`w-4 h-4 text-vapor transition-transform ${openSection === i ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {openSection === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 pl-16">
                        <ol className="space-y-3">
                          {section.rules.map((rule, j) => (
                            <li key={j} className="text-sm text-vapor leading-relaxed flex gap-3">
                              <span className="text-cyan font-mono text-xs mt-0.5 shrink-0">{j + 1}.</span>
                              {rule}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Contact */}
        <div className="glass rounded-xl border border-white/5 p-8 mt-10 text-center">
          <AlertTriangle className="w-8 h-8 text-orange mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">Need to Report a Violation?</h3>
          <p className="text-vapor text-sm mb-4">If you witness rule violations, please report them through the match room dispute system or contact our support team.</p>
          <Link to="/support" className="inline-flex items-center gap-2 px-6 py-2.5 bg-cyan/10 text-cyan border border-cyan/20 rounded-lg text-sm font-bold hover:bg-cyan/20 transition-all">
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
