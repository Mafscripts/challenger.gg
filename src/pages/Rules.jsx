import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Search, Shield, Users, Swords, Trophy, DollarSign, Monitor, Clock, Wifi, RotateCcw, Bomb, Camera, MessageCircle, Radio, X } from "lucide-react";
import { competitionStreamRule } from "@/lib/competitionStreaming";
import PageHeader from "@/components/ui/PageHeader";
import "@/styles/rules.css";

const killCamRule = "Kill cams must remain enabled for the duration of every match.";

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
    title: "Find Players Chat Rules",
    icon: MessageCircle,
    rules: [
      "Use the room to find teammates, substitutes, opponents, or practice partners.",
      "Include useful details such as game mode, region, team size, and availability.",
      "Profanity, hate speech, harassment, threats, sexual content, and targeted abuse are prohibited.",
      "Do not spam repeated messages, advertisements, referral links, or unrelated content.",
      "Never share passwords, payment information, private addresses, or other sensitive personal information.",
      "Moderators, admins, super admins, and the CEO may remove messages and issue temporary or permanent chat bans.",
      "Attempting to bypass the multilingual language filter may result in a chat ban.",
    ],
  },
  {
    title: "Match Rules",
    icon: Swords,
    rules: [
      competitionStreamRule,
      "No Stretch Defuse.",
      "Nade Delay must be set to Off.",
      killCamRule,
      "If you have ever been console restricted, you are required to play on console in all Topfragg tournaments.",
      "Maps are selected via the official veto system. Manual map selection is not permitted.",
      "Each team receives one map veto per match.",
      "Match results must be reported within 10 minutes of completion.",
      "Disconnections within the first 30 seconds may trigger a restart at moderator discretion.",
      "Intentional disconnections forfeit the match.",
      "Screen recording is strongly recommended for all competitive matches.",
      "Verified status does not waive mandatory streaming in Cash Matches, Tournaments or Money 8s. In other modes, verified players must stream when an opponent provides clips or evidence and an admin validates the request.",
      "Admins may override a verified player and force them to stream when match integrity requires it.",
    ],
  },
  {
    title: "Hardpoint Rules",
    icon: RotateCcw,
    rules: [
      "If the combined score is under 150 when a player disconnects, the game must be reset.",
      "If the combined score is 150 or higher when a player disconnects, the game must be played out. Ending the game early results in a forfeit.",
    ],
  },
  {
    title: "Search & Destroy Rules",
    icon: Bomb,
    rules: [
      "If a player disconnects from the lobby, end the game and resume play from the point where the game left off before the disconnection.",
    ],
  },
  {
    title: "Timer & Grace Period Rules",
    icon: Clock,
    rules: [
      "If opponents do not show up within the allotted 15-minute timer window shown in the Match Room, the absent team is automatically forfeited.",
    ],
  },
  {
    title: "Host & Connection Rules",
    icon: Wifi,
    rules: [
      "SND hosting: Map 1 is hosted by the higher seed. Map 2 is hosted by the lower seed. Map 3 is hosted by the team with the better combined stats across Maps 1 and 2.",
      "HP/SND hosting: Map 1 is hosted by the higher seed. Map 2 is hosted by the lower seed. Map 3 is hosted by the winner of the Hardpoint map.",
      "HP hosting: Map 1 is hosted by the higher seed. Map 2 is hosted by the lower seed. Map 3 is hosted by the team with the better combined stats across Maps 1 and 2.",
      "Players may use a neutral host when both teams agree.",
    ],
  },
  {
    title: "XP Match Rules",
    icon: Trophy,
    rules: [
      "XP Matches support 1v1, 2v2, 3v3 and 4v4. All players on both completed rosters receive their own XP result.",
      "Average team XP is recorded when the lobby fills. Equal teams play for +100 XP on a win and -100 XP on a loss. Wins over stronger teams earn more, and losses to weaker teams cost more.",
      "The calculated XP change ranges from 10 to 190 per player. Total XP cannot go below zero. Both captains must confirm the same final score.",
      "Once an opponent joins, cancellation requires a request accepted by the opposing captain. A declined or unanswered request leaves the match active and it must be played. Agreed cancellations do not change XP.",
      "Unmatched open posts may be removed by their host. Contact staff for disputes or exceptional circumstances.",
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
      competitionStreamRule,
      "All wager funds are held in escrow during the match.",
      "Both parties must confirm the result for payouts to process.",
      "Disputed wagers are reviewed by moderators within 24 hours.",
      "Minimum wager amount is $1. Maximum is $500 per match.",
      "Wager payouts process instantly upon result confirmation.",
      "Repeated false dispute claims will result in account restrictions.",
      "If the host uses incorrect match rules and the opponent reports it with evidence, staff awards the opposing team one round. The map is not reset.",
    ],
  },
  {
    title: "Tournament Rules",
    icon: Users,
    rules: [
      competitionStreamRule,
      "Teams must check in 15 minutes before tournament start time.",
      "Failure to check in forfeits your spot and registration fee.",
      "Substitutes must be registered before the tournament begins.",
      "Tournament brackets are generated randomly and cannot be contested.",
      "Prize distributions follow the published structure for each event.",
      "If the host uses incorrect match rules and the opponent reports it with evidence, staff awards the opposing team one round. The map is not reset.",
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
      "Streamer badges use a silver treatment and verified player badges remain green. Badges identify account status but do not replace dispute evidence.",
    ],
  },
  {
    title: "Stream Requirements",
    icon: Radio,
    rules: [
      competitionStreamRule,
      "Choose one supported platform: Twitch, YouTube or Kick. Every player must add their own channel in Settings > Connected accounts > Streaming channels before entering.",
      "Every member of the playing roster must stream. A captain's stream does not cover teammates, even when the captain pays the full team's entry fees.",
      "Streaming is compulsory on all platforms, including PC, PlayStation and Xbox. Console players and verified players are not exempt.",
      "Keep your stream running from the start to the end of every map. If you cannot stream or your broadcast stops, notify staff through the match room or support ticket system immediately.",
      "Match creation, entry and tournament registration are blocked until every required roster member has a saved Twitch, YouTube or Kick channel. Entry fees are only charged after this check passes.",
    ],
  },
];

const sectionGroups = [
  { title: "Platform", indices: [0, 1, 11] },
  { title: "Match essentials", indices: [12, 2, 5, 6] },
  { title: "Game modes", indices: [3, 4] },
  { title: "Competitions", indices: [7, 8, 9, 10] },
];

const readingOrder = sectionGroups.flatMap(group => group.indices);

const descriptions = [
  "Account requirements, community conduct and dispute procedures.",
  "Keep the player finder useful, safe and focused on finding a team.",
  "The settings and standards to follow in every competitive match.",
  "How to handle disconnections during a Hardpoint map.",
  "How to resume a Search & Destroy map after a disconnection.",
  "Arrival deadlines and what happens when an opponent does not show up.",
  "Hosting order, seeding and connection requirements.",
  "Team formats, XP results and match cancellation requirements.",
  "Placements, ELO, seasons and account integrity.",
  "Escrow, payouts, score confirmation and wager disputes.",
  "Check-in, rosters, brackets and tournament results.",
  "Fair play, evidence and competitive integrity.",
  "Mandatory streaming on Twitch, YouTube or Kick for Cash Matches, Tournaments and Money 8s.",
];

export default function Rules() {
  const [activeSection, setActiveSection] = useState(0);
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const activePosition = readingOrder.indexOf(activeSection);
  const results = readingOrder.map(index => ({
    ...sections[index],
    index,
    entries: sections[index].rules.map((text, ruleIndex) => ({ text, ruleIndex })).filter(({ text }) => (
      !search || sections[index].title.toLowerCase().includes(search) || text.toLowerCase().includes(search)
    )),
  })).filter(section => section.entries.length > 0);
  const displayed = search ? results : results.filter(section => section.index === activeSection);
  const resultCount = results.reduce((total, section) => total + section.entries.length, 0);
  const selectSection = (index) => { setActiveSection(index); setQuery(""); };

  return (
    <div className="rules-page min-h-screen py-8">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <PageHeader
          eyebrow="Competition standards"
          title="Rules & Regulations"
          description="Everything you need to compete fairly. Choose a category or search for a specific rule."
          action={<Link to="/support" className="rules-support-link"><MessageCircle className="h-4 w-4" /> Contact support <ArrowRight className="h-3.5 w-3.5" /></Link>}
        />

        <div className="rules-layout">
          <aside className="rules-sidebar arena-panel">
            <div className="rules-sidebar-heading"><BookOpen className="h-4 w-4 text-cyan" /><h2>Rulebook</h2><span>{sections.length} categories</span></div>
            <nav aria-label="Rule categories" className="rules-navigation">
              {sectionGroups.map(group => (
                <div key={group.title} className="rules-nav-group">
                  <p>{group.title}</p>
                  {group.indices.map(index => {
                    const section = sections[index];
                    const Icon = section.icon;
                    return <button key={section.title} type="button" aria-current={!search && activeSection === index ? "true" : undefined} onClick={() => selectSection(index)} className="rules-nav-item">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{section.title}</span>
                      <ChevronRight className="rules-nav-chevron h-3.5 w-3.5 shrink-0" />
                    </button>;
                  })}
                </div>
              ))}
            </nav>
          </aside>

          <div className="rules-content">
            <div className="rules-search-bar">
              <label className="rules-search">
                <Search className="h-4 w-4 shrink-0 text-cyan" />
                <span className="sr-only">Search all rules</span>
                <input type="search" placeholder="Search all rules..." value={query} onChange={event => setQuery(event.target.value)} />
              </label>
              {query && <button type="button" className="rules-clear-search" onClick={() => setQuery("")} aria-label="Clear search"><X className="h-4 w-4" /></button>}
              <span className="rules-search-count" role="status">{search ? `${resultCount} ${resultCount === 1 ? "rule" : "rules"} found` : "Official rulebook"}</span>
            </div>

            <div className="rules-reader arena-panel">
              {displayed.length === 0 ? (
                <div className="rules-empty">
                  <Search className="h-7 w-7 text-cyan" />
                  <h2>No rules found</h2>
                  <p>Try a different keyword or choose a category from the rulebook.</p>
                  <button type="button" onClick={() => setQuery("")} className="rules-support-link">Clear search <X className="h-3.5 w-3.5" /></button>
                </div>
              ) : displayed.map(section => {
                const Icon = section.icon;
                return <section key={section.title} aria-labelledby={`rules-section-${section.index}`} className="rules-section">
                  <header className="rules-section-header">
                    <div className="rules-section-icon"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="rules-eyebrow">{sectionGroups.find(group => group.indices.includes(section.index)).title}</p>
                      <h2 id={`rules-section-${section.index}`}>{section.title}</h2>
                      <p className="rules-section-description">{descriptions[section.index]}</p>
                    </div>
                    <span className="rules-section-count">{section.entries.length} {section.entries.length === 1 ? "rule" : "rules"}</span>
                  </header>
                  <ol className="rules-list" role="list">
                    {section.entries.map(({ text, ruleIndex }) => (
                      <li key={ruleIndex} value={ruleIndex + 1} className={text === killCamRule ? "rules-list-item rules-list-item-important" : "rules-list-item"}>
                        <span className="rules-number" aria-hidden="true">{String(ruleIndex + 1).padStart(2, "0")}</span>
                        <div>{text === killCamRule && <span className="rules-required"><Camera className="h-3 w-3" /> Required setting</span>}<p>{text}</p></div>
                      </li>
                    ))}
                  </ol>
                </section>;
              })}
              {!search && <div className="rules-pagination">
                <button type="button" disabled={activePosition === 0} onClick={() => selectSection(readingOrder[activePosition - 1])}><ArrowLeft className="h-3.5 w-3.5" /> Previous category</button>
                <span>{String(activePosition + 1).padStart(2, "0")} <span>/ {sections.length}</span></span>
                <button type="button" disabled={activePosition === readingOrder.length - 1} onClick={() => selectSection(readingOrder[activePosition + 1])}>Next category <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>}
            </div>

            <div className="rules-help">
              <Shield className="h-5 w-5 shrink-0 text-cyan" />
              <div><h3>Need a ruling or want to report a violation?</h3><p>Use the match room dispute system for match disputes. For other concerns, open a support ticket and include any relevant evidence.</p></div>
              <Link to="/support">Open a ticket <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
