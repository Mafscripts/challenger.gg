import { competitionStreamRule } from "./competitionStreaming.js";
import { disconnectEvidenceRule, hardpointDisconnectRule, searchDestroyDisconnectRule } from "./competitiveMatchRules.js";

export const ruleGroups = [
  { id: "essentials", title: "Before you play", description: "Settings, streams & player eligibility", icon: "Swords" },
  { id: "in-match", title: "During the match", description: "Start times, disconnects & hosting", icon: "Gamepad2" },
  { id: "integrity", title: "Results & fair play", description: "Evidence, disputes & admin decisions", icon: "ShieldCheck" },
  { id: "platform", title: "Platform & competitions", description: "Accounts, chat & competition formats", icon: "Trophy" },
];

export const ruleSections = [
  {
    id: "general-match-rules", group: "essentials", title: "General Match Rules", icon: "Swords",
    description: "The standards every player and team must follow before entering a match.",
    summary: "Play on your registered account, with the correct roster and approved match settings.",
    rules: [
      "All participants must follow the official TopFragg competitive rules and the game-specific restrictions displayed on the match page.",
      "All matches must use the approved maps, modes and settings.",
      "All players must use the registered Activision ID associated with their TopFragg account.",
      "Players must compete using their registered team roster. Unauthorized substitutions are prohibited.",
      "Controller-only restrictions apply where specified.",
      "Exploiting glitches, prohibited equipment or restricted gameplay mechanics may result in a map forfeit.",
      "No Stretch Defuse. Nade Delay must be set to Off.",
      "Kill cams must remain enabled for the duration of every match.",
      "If you have ever been console restricted, you are required to play on console in all TopFragg tournaments.",
      "Maps are selected through the official match veto or map-generation system. Manual map selection is not permitted. Where the veto system applies, each team receives one map veto per match.",
    ],
  },
  {
    id: "stream-requirements", group: "essentials", title: "Stream Requirements", icon: "Radio",
    description: "Mandatory broadcasts for Cash Matches, Money 8s and every tournament, on PC and console.",
    summary: "Every player streams every map. Enable VODs, include gameplay and voice audio, and retain broadcasts for at least 24 hours.",
    rules: [
      competitionStreamRule,
      "Choose Twitch, YouTube or Kick. Every member of the playing roster must add their own channel in Settings before entering. A captain's stream does not cover teammates, even when the captain pays the full team's entry fees.",
      "A working platform stream link must be provided in the official match chat before the match begins.",
      "Past broadcasts (VODs) must be enabled and remain accessible for at least 24 hours after the series.",
      "Gameplay audio and voice communication audio must be included.",
      "Streams must not be intentionally interrupted, concealed, edited or manipulated to obstruct verification. Players must not intentionally hide relevant gameplay from administrative review.",
      "Failure to provide a working stream before the match begins may result in a no-show forfeit.",
      "If a stream fails during gameplay, the affected player must notify the match chat immediately. Admins will review the circumstances and available evidence before deciding whether the match continues, restarts or results in a forfeit.",
      "Console players and verified players are not exempt from mandatory streaming in Cash Matches, Tournaments or Money 8s. In other modes, verified players must stream when an opponent provides evidence and an admin validates the request. Admins may require streaming when match integrity requires it.",
      "Match creation, entry and tournament registration require a saved Twitch, YouTube or Kick channel for every required roster member. Entry fees are only charged after this check passes. A saved link alone does not prove that a stream is live.",
    ],
  },
  {
    id: "monitor-camera", group: "essentials", title: "Monitor Camera Verification", icon: "Camera",
    description: "How monitor camera requests are made, reviewed and completed.",
    summary: "Cooperate with authorized monitor camera requests and enable in-game focus mode when required to use a moni cam.",
    rules: [
      "TopFragg administrators may request monitor camera (moni cam) verification during competitive matches. Players must cooperate with authorized requests.",
      "The camera must clearly show the required monitor and relevant gaming equipment. Players must not intentionally obstruct the requested view.",
      "Verification must be completed within the reasonable timeframe specified by an admin. Refusing a mandatory verification request may result in a series forfeit.",
      "To file a monitor camera claim, proof or suspicions of cheating must be submitted within 10 minutes of admin arrival. Additional proof is encouraged. Admins make the final decision.",
      "If you are required to use a monitor camera, you must enable focus mode in game.",
    ],
  },
  {
    id: "roster-violations", group: "essentials", title: "Player IDs & Roster Violations", icon: "Users",
    description: "Registered identities, substitutes and reporting an incorrect player.",
    rules: [
      "Every participant must use the Activision ID registered for the match.",
      "Playing under another person's account, using an unauthorized substitute or deliberately concealing a player's identity is prohibited.",
      "Roster violations must be reported before the affected map is completed whenever reasonably possible.",
      "Confirmed violations may result in a map forfeit, series forfeit or disqualification following admin review.",
    ],
  },
  {
    id: "restricted-items", group: "essentials", title: "Restricted Items & CDL Settings", icon: "SlidersHorizontal",
    description: "Use the competitive ruleset and item restrictions for your selected Call of Duty title.",
    rules: [
      "All matches must follow the approved competitive ruleset for the selected Call of Duty title.",
      "Prohibited weapons, attachments, perks, equipment, scorestreaks and gameplay mechanics must not be used.",
      "The game-specific rules page and match page determine which items are permitted.",
      "Using restricted equipment may result in a map forfeit following admin review.",
      "In Cash Matches and Tournaments, if the host uses incorrect match rules and the opponent reports it with evidence, staff awards the opposing team one round. The map is not reset for this settings violation.",
    ],
  },
  {
    id: "no-shows", group: "in-match", title: "No-Shows & Match Start Times", icon: "Clock",
    description: "The 15-minute readiness window and how to request a no-show ruling.",
    summary: "Be ready within 15 minutes of the official start. Request an admin decision; never award yourself a forfeit.",
    rules: [
      "Teams have 15 minutes from the official match start time to become ready.",
      { text: "A team may be considered a no-show if it fails to:", items: ["Join the required lobby.", "Invite or accept the opposing team.", "Provide the correct registered players.", "Supply mandatory stream links.", "Respond to reasonable match-start instructions."] },
      "Once the no-show period expires, the waiting team must submit evidence through the official match chat and request an admin decision.",
    ],
  },
  {
    id: "disconnections", group: "in-match", title: "Disconnections & Dev Errors", icon: "Unplug",
    description: "Crash evidence and the different restart procedures for Hardpoint and Search & Destroy.",
    summary: "Report the disconnect immediately and submit the 30 seconds of footage before it. Restart decisions remain subject to admin review.",
    rules: [
      "If a player disconnects, crashes or experiences a dev error during a map, the affected team must immediately notify the match chat.",
      { label: "First 30 seconds", text: "If a player disconnects within 30 seconds of game start, a map reset is approved subject to proof submission and admin review." },
      { label: "Required evidence", text: disconnectEvidenceRule },
      { label: "Hardpoint", text: hardpointDisconnectRule },
      { label: "Search & Destroy", text: searchDestroyDisconnectRule },
      "Depending on the circumstances, an admin may authorize continuation, a map restart, a map forfeit or another appropriate resolution. Disconnecting does not automatically entitle a team to a restart.",
      "Attempts to manipulate a match restart are prohibited.",
    ],
  },
  {
    id: "lag-connection", group: "in-match", title: "Lag & Connection Issues", icon: "Wifi",
    description: "Required telemetry, acceptable connection evidence and when to report a problem.",
    rules: [
      "All players must have latency and packet loss telemetry enabled to submit the required proof.",
      "Players must report significant latency issues as soon as they become apparent and provide proof to admins.",
      "Acceptable evidence may include footage showing freezing, rubber-banding, severe packet loss or other observable connection problems. Admins will review whether the evidence supports the claim.",
      "High ping alone does not automatically qualify a team for a restart.",
      "Teams that continue playing without reporting a known connection issue may lose eligibility for a restart based solely on that issue.",
    ],
  },
  {
    id: "host-swaps", group: "in-match", title: "Hosting & Host Swaps", icon: "ArrowLeftRight",
    description: "Follow the assigned seeding and use the official match chat for host swap requests.",
    summary: "One host swap request per team per series for legitimate latency or connection concerns. Additional changes require admin approval.",
    rules: [
      "Each team must abide by seeding. Each team is permitted one host swap request per series for legitimate latency or connection concerns.",
      "Requests must be made through the official match chat, and the opposing team must be informed.",
      "Host swaps must not be used to delay or manipulate a match. Additional host changes require admin approval.",
      "Follow the hosting assignments displayed in the match room. Where standard seeding rules apply, Map 1 is hosted by the higher seed and Map 2 by the lower seed.",
      "Under standard SND-only or HP-only hosting, Map 3 is hosted by the team with the better combined stats across Maps 1 and 2. Under standard HP/SND hosting, Map 3 is hosted by the winner of the Hardpoint map.",
      "Players may use a neutral host when both teams agree.",
    ],
  },
  {
    id: "score-reporting", group: "integrity", title: "Match Results & Score Reporting", icon: "ClipboardCheck",
    description: "Report accurate results within 10 minutes and keep your scoreboard evidence.",
    summary: "Both teams report the result within 10 minutes of series completion. Disputed scores need admin review before final confirmation.",
    rules: [
      "Both teams are responsible for accurately reporting match results.",
      "Results must be submitted within 10 minutes of series completion.",
      "Players should retain scoreboard screenshots or video evidence. Evidence should clearly show the score and player identities.",
      "Intentionally reporting false results is prohibited and may result in future bans.",
      "Disputed results must be reviewed before final confirmation by an admin.",
    ],
  },
  {
    id: "evidence", group: "integrity", title: "Proof & Evidence Requirements", icon: "Video",
    description: "Provide authentic evidence that clearly shows the incident and the players involved.",
    rules: [
      "Players must provide valid, unaltered evidence when submitting a dispute.",
      "Acceptable evidence includes Twitch, YouTube or Kick VODs, gameplay recordings, screenshots and relevant match logs. Video evidence is required for dispute submissions.",
      "Evidence must clearly establish the incident being reported.",
      "Fabricated clips, edited evidence that misrepresents events, recycled proof from unrelated matches and intentionally false accusations are prohibited.",
      "Screen recording is strongly recommended for all competitive matches.",
    ],
  },
  {
    id: "match-disputes", group: "integrity", title: "Match Disputes", icon: "MessageCircle",
    description: "Keep match disputes in the official match chat and let staff determine the outcome.",
    rules: [
      "All match disputes must be submitted through the official TopFragg match chat within 15 minutes of match completion.",
      "Players must provide a clear explanation of the incident and any supporting evidence.",
      "Teams must not independently award themselves forfeits.",
      "An admin will review the dispute and determine the appropriate outcome.",
    ],
  },
  {
    id: "anti-cheat", group: "integrity", title: "Cheating & Unauthorized Software", icon: "ShieldAlert",
    description: "Zero tolerance for confirmed cheating, with authorized and consent-based verification.",
    rules: [
      "TopFragg maintains a zero-tolerance policy toward confirmed cheating.",
      "Prohibited methods include aimbots, wallhacks, unauthorized radar tools, DMA cheats, prohibited input automation and other tools providing unfair competitive advantages.",
      "Admins may request additional evidence or approved anti-cheat verification.",
      "Any software inspection must use an authorized verification process with informed player consent.",
      "Confirmed cheating may result in immediate disqualification, prize forfeiture where legally permitted and a permanent competitive ban.",
      "Account badges identify status but do not replace dispute evidence or exempt players from verification requirements.",
    ],
  },
  {
    id: "match-manipulation", group: "integrity", title: "Sabotage & Match Manipulation", icon: "Ban",
    description: "Do not interfere with connections, results, verification or legitimate match progress.",
    rules: [
      { text: "Players may not intentionally sabotage or manipulate competitive matches. Prohibited conduct includes:", items: ["Deliberately causing connection disruptions.", "Intentionally delaying matches.", "Exploiting technical issues for competitive advantage.", "Coordinating fraudulent results.", "Deliberately obstructing required verification.", "Attempting to force unauthorized restarts or forfeits."] },
    ],
  },
  {
    id: "sportsmanship", group: "integrity", title: "Sportsmanship & Staff Conduct", icon: "Handshake",
    description: "Respect other players and staff. Use official channels for concerns and legitimate appeals.",
    rules: [
      "Disputes and issues must be handled within the TopFragg match chat and the official ticket or dispute system.",
      "Players must maintain respectful behavior toward opponents, administrators and other participants.",
      "Harassment, threats, impersonation, coordinated targeting of individuals and deliberate disruption of tournament operations are prohibited.",
      "Players may respectfully question admin decisions or submit appeals without facing retaliation for legitimate complaints.",
      "If an admin finds direct or indirect violations of these policies, they have discretion to issue an immediate ban. Penalties remain subject to the published rules, available evidence and the proportionality requirements below.",
    ],
  },
  {
    id: "penalties", group: "integrity", title: "Forfeits & Disqualification", icon: "Flag",
    description: "Available penalties and the standards admins apply when making a ruling.",
    rules: [
      { text: "Depending on the violation, administrators may issue:", items: ["A warning.", "A map restart.", "A map forfeit.", "A series forfeit.", "Tournament disqualification.", "Temporary or permanent competitive suspension."] },
      "Penalties must be proportionate to the violation and supported by the published rules and available evidence.",
    ],
  },
  {
    id: "appeals", group: "integrity", title: "Admin Decisions & Appeals", icon: "Scale",
    description: "Follow authorized instructions and use the support system to request a review.",
    rules: [
      "TopFragg administrators are responsible for reviewing disputes, evaluating evidence and enforcing competitive rules consistently.",
      "Players must follow authorized match instructions while an investigation is ongoing.",
      "A player may request a review of an administrative decision through the official support system.",
      "Final tournament decisions will be issued by authorized TopFragg management.",
    ],
  },
  {
    id: "platform-rules", group: "platform", title: "General Platform Rules", icon: "Shield",
    description: "Account eligibility and the community standards that apply throughout TopFragg.",
    rules: [
      "All players must be at least 18 years of age to participate in wager matches.",
      "One account per person. Alt accounts will result in permanent bans.",
      "Harassment, hate speech and toxic behavior will not be tolerated.",
      "Use the official support system for account or platform concerns. Match disputes belong in the relevant match chat.",
    ],
  },
  {
    id: "find-players-chat", group: "platform", title: "Find Players Chat Rules", icon: "MessageSquare",
    description: "Keep the player finder useful, safe and focused on finding a team.",
    rules: [
      "Use the room to find teammates, substitutes, opponents or practice partners. Include useful details such as game mode, region, team size and availability.",
      "Profanity, hate speech, harassment, threats, sexual content and targeted abuse are prohibited.",
      "Do not spam repeated messages, advertisements, referral links or unrelated content.",
      "Never share passwords, payment information, private addresses or other sensitive personal information.",
      "Moderators and administrators may remove messages and issue temporary or permanent chat bans.",
      "Attempting to bypass the multilingual language filter may result in a chat ban.",
    ],
  },
  {
    id: "xp-matches", group: "platform", title: "XP Match Rules", icon: "Sparkles",
    description: "Team formats, XP results and match cancellation requirements.",
    rules: [
      "XP Matches support 1v1, 2v2, 3v3 and 4v4. All players on both completed rosters receive their own XP result.",
      "Average team XP is recorded when the lobby fills. Equal teams play for +100 XP on a win and -100 XP on a loss. Wins over stronger teams earn more, and losses to weaker teams cost more.",
      "The calculated XP change ranges from 10 to 190 per player. Total XP cannot go below zero. Both captains must confirm the same final score.",
      "Once an opponent joins, cancellation requires a request accepted by the opposing captain. A declined or unanswered request leaves the match active and it must be played. Agreed cancellations do not change XP.",
      "Unmatched open posts may be removed by their host. Contact staff for disputes or exceptional circumstances.",
    ],
  },
  {
    id: "ranked", group: "platform", title: "Ranked Rules", icon: "Medal",
    description: "Placements, ELO, seasons and account integrity.",
    rules: [
      "10 placement matches are required before receiving an initial rank.",
      "Leaving a ranked match in progress results in an automatic loss and ELO penalty.",
      "Rank decay applies after 14 days of inactivity in Diamond+ tiers.",
      "Season resets occur every 3 months with new placement matches.",
      "Boosting, including having a higher-ranked player play on your account, is a bannable offense.",
    ],
  },
  {
    id: "cash-matches", group: "platform", title: "Cash Matches & Money 8s", icon: "DollarSign",
    description: "Mandatory streams, wager funds, score confirmation and dispute handling.",
    rules: [
      competitionStreamRule,
      "All wager funds are held in escrow during the match. Both parties must confirm the result for payouts to process.",
      "Disputed wagers are reviewed by moderators within 24 hours.",
      "Minimum wager amount is $1. Maximum is $500 per match.",
      "Wager payouts process instantly upon result confirmation. Repeated false dispute claims will result in account restrictions.",
      "Follow the score reporting, evidence, disconnect and no-show procedures in this rulebook. Do not award yourself a win or forfeit.",
    ],
  },
  {
    id: "tournaments", group: "platform", title: "Tournament Rules", icon: "Trophy",
    description: "Check-in, registered rosters, brackets and published prize distributions.",
    rules: [
      competitionStreamRule,
      "Teams must check in 15 minutes before tournament start time. Failure to check in forfeits your spot and registration fee.",
      "Substitutes must be registered before the tournament begins and may only play when authorized under the registered roster rules.",
      "Tournament brackets are generated by the official system. Published event seeding and bracket settings apply.",
      "Prize distributions follow the published structure for each event.",
      "Follow the match room's assigned maps, modes, settings and hosting order. Requests for rulings must go through the official match chat.",
    ],
  },
];

export const ruleQuickLinks = [
  { id: "no-shows", value: "15 min", label: "Match readiness", detail: "From the official start", icon: "Clock" },
  { id: "stream-requirements", value: "Every map", label: "PC & console streams", detail: "Cash · Money 8s · Tournaments", icon: "Radio" },
  { id: "score-reporting", value: "10 min", label: "Report your result", detail: "After series completion", icon: "ClipboardCheck" },
  { id: "stream-requirements", value: "24 hours", label: "Keep your VODs", detail: "Gameplay + voice audio", icon: "Video" },
];

export function ruleText(rule) {
  return typeof rule === "string" ? rule : [rule.label, rule.text, ...(rule.items || [])].filter(Boolean).join(" ");
}

export function searchRulebook(query) {
  const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ruleSections.map((section, sectionIndex) => ({
    ...section, sectionIndex,
    entries: section.rules.map((rule, ruleIndex) => ({ rule, ruleIndex })).filter(({ rule }) => {
      const text = `${section.title} ${section.description} ${ruleText(rule)}`.toLowerCase();
      return words.every(word => text.includes(word));
    }),
  })).filter(section => section.entries.length);
}
