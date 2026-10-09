import { topfraggDiscordInviteUrl } from "../src/lib/discordCommunity.js";

// Reviewed against App.jsx, Settings.jsx, DiscordSection.jsx, TwitchSection.jsx,
// FreeEightsDiscord.jsx, RankedEights.jsx, Teams.jsx and TournamentJoinModal.jsx.
// Update this authored guide when the website's flows change.
export const websiteTopics = [
  {
    id: "identity", match: /\b(are you (an? )?(ai|human|real)|chatgpt|artificial intelligence|ben (je|jij).*(ai|mens|echt))\b/i,
    en: "I'm Topfragg's gaming bot: free preset replies and a website help guide. No paid AI behind this aim assist.",
    nl: "Ik ben de Topfragg-gamingbot met gratis vaste reacties en website-uitleg. Geen betaalde AI achter deze aim assist.", links: [],
  },
  {
    id: "disconnect", match: /\b(disconnect|unlink|ontkoppel\w*)\b.*\bdiscord\b|\bdiscord\b.*\b(disconnect|unlink|ontkoppel\w*)\b/i,
    en: "Open Settings → Connections → Discord and choose Disconnect. Finish or leave an active Free 8s lobby first. Your Verified Player community role stays; a website connection is separate.",
    nl: "Ga naar Settings → Connections → Discord en kies Disconnect. Rond eerst je actieve Free 8s-lobby af of verlaat die. Je Verified Player-communityrol blijft; de websitekoppeling staat daar los van.", links: [["Discord settings", "/settings#settings-discord"]],
  },
  {
    id: "discord-conflict", match: /already.?linked|already connected|al gekoppeld|andere account|another (topfragg )?account/i,
    en: "A Discord identity can be linked to one Topfragg account. Disconnect it from the old account first. If you cannot access that account, open /support so staff can check privately.",
    nl: "Een Discord-identiteit kan aan één Topfragg-account gekoppeld zijn. Ontkoppel eerst op het oude account. Geen toegang meer? Open /support zodat staff dit privé kan controleren.", links: [["Discord settings", "/settings#settings-discord"], ["Support", "/support"]],
  },
  {
    id: "password", match: /\b(password|wachtwoord|forgot|kan niet inloggen|cannot log ?in|can't log ?in)\b/i,
    en: "Use Forgot Password for a reset link. To change a known password, open Settings → Password & security. Never post your password or reset link in Discord.",
    nl: "Gebruik Forgot Password voor een resetlink. Een bekend wachtwoord wijzigen kan via Settings → Password & security. Plaats je wachtwoord of resetlink nooit in Discord.", links: [["Reset password", "/forgot-password"], ["Settings", "/settings"]],
  },
  {
    id: "email", match: /\b(email|e-mail|mail)\b.*\b(verif\w*|bevestig\w*|code|link)\b|\b(verif\w*|bevestig\w*)\b.*\b(email|e-mail|mail)\b/i,
    en: "Verify your email through the verification page and check your spam folder if the message is missing. This is separate from your Discord role. Contact support if you remain stuck.",
    nl: "Bevestig je e-mail via de verificatiepagina en controleer je spammap als de mail ontbreekt. Dit staat los van je Discord-rol. Kom je niet verder, neem dan contact op met support.", links: [["Verify email", "/verify-email"], ["Support", "/support"]],
  },
  {
    id: "support", match: /\b(support|ticket\w*|disput\w*|refund\w*|payment\w*|withdraw\w*|betaling\w*|uitbetal\w*|terugbetal\w*|cheat\w*|report a player|speler melden)\b/i,
    en: "Use /support in Discord or open a website support ticket. For match disputes, use the report/dispute option in your match room and include evidence. Follow website tickets under My Tickets. I cannot inspect accounts, issue refunds or decide results.",
    nl: "Gebruik /support in Discord of open een websiteticket. Voor matchgeschillen gebruik je de report/dispute-optie in je matchroom, met bewijs. Volg websitetickets onder My Tickets. Ik kan geen accounts inzien, geld terugboeken of uitslagen beslissen.", links: [["Support", "/support"], ["My Tickets", "/my-tickets"]],
  },
  {
    id: "twitch", match: /\b(twitch|streamer|stream\w*|live alerts)\b/i,
    en: "Sign in and open Settings → Connections → Twitch, press Connect Twitch and approve with the channel you stream from. Discord live alerts also require your Discord account to be linked and the staff-assigned Streamer role.",
    nl: "Log in en ga naar Settings → Connections → Twitch. Klik Connect Twitch en keur goed met je streamaccount. Voor Discord-livealerts moet ook Discord gekoppeld zijn en heb je de Streamer-rol van staff nodig.", links: [["Twitch settings", "/settings#settings-twitch"]],
  },
  {
    id: "voice", match: /\b(voice|waiting room|wachtkamer|microfoon|mic|room link|discord room|discord kanaal)\b/i,
    en: "Open your Free 8s match room on the website and use its Discord / 8s Waiting Room link. Join with the Discord account linked in Settings. Use your own lobby's room link. If moves keep failing, contact /support with the match ID.",
    nl: "Open je Free 8s-matchroom en gebruik daar de Discord-/8s Waiting Room-link. Join met hetzelfde Discord-account als in Settings. Gebruik de link van je eigen lobby. Blijft een verplaatsing misgaan, stuur het match-ID via /support.", links: [["Free 8s", "/ranked/8s"], ["Discord settings", "/settings#settings-discord"]],
  },
  {
    id: "rank", match: /\b(ranks?|elo|diamond|crimson|iridescent|top ?250|screenshot|amateur)\b/i,
    en: "Open Settings → Game rank to view or submit your game rank. For Free 8s, complete the rank step shown on the lobby page before joining. Check Free 8s Elo on the website; I cannot see or change your current rank.",
    nl: "Ga naar Settings → Game rank om je gamerank te bekijken of in te dienen. Volg voor Free 8s eerst de rankstap op de lobbypagina. Bekijk je Free 8s-Elo op de website; ik kan je huidige rank niet inzien of aanpassen.", links: [["Game rank", "/settings#settings-rank"], ["Leaderboards", "/leaderboards"]],
  },
  {
    id: "free-eights", match: /\b(8s|eights|free ?8|bo6|bo7|mw3|black ops|modern warfare)\b/i,
    en: "Open Free 8s, choose the game, complete the rank step and connect Discord. Join the Topfragg Discord with that same account, then select Accept This Match on an available lobby. Open the match room and follow its Discord voice link. Verified Player alone does not link your website account.",
    nl: "Open Free 8s, kies de game, voltooi de rankstap en koppel Discord. Join de Topfragg Discord met datzelfde account en kies Accept This Match bij een beschikbare lobby. Open daarna de matchroom en volg de Discord-voicelink. Alleen Verified Player hebben koppelt je websiteaccount niet.", links: [["Free 8s", "/ranked/8s"], ["Connect Discord", "/settings?connect=discord"], ["Discord server", topfraggDiscordInviteUrl]],
  },
  {
    id: "teams", match: /\b(team\w*|roster|captain|invite\w*|uitnodig\w*|squad)\b/i,
    en: "Open Teams to create or manage your team. Captains can invite players; invited players accept their pending invitation there. For tournaments, create/select a tournament team with the roster size required by that event.",
    nl: "Open Teams om je team aan te maken of te beheren. Captains kunnen spelers uitnodigen; spelers accepteren hun openstaande uitnodiging daar. Voor toernooien maak of kies je een tournament team met de vereiste rostergrootte.", links: [["Teams", "/teams"]],
  },
  {
    id: "tournaments", match: /\b(tournament\w*|toernooi\w*|bracket|event\w*)\b/i,
    en: "Open Tournaments, choose an event and read its format, rules, start time and entry details. Use Join tournament and select a suitable tournament team when required. Follow the event's registration instructions; I cannot see live entries or guarantee availability.",
    nl: "Open Tournaments, kies een event en bekijk format, regels, starttijd en deelnamevoorwaarden. Gebruik Join tournament en kies waar nodig een geschikt tournament team. Volg de registratiestappen van het event; ik kan geen live inschrijvingen zien of plekken garanderen.", links: [["Tournaments", "/tournaments"], ["Teams", "/teams"]],
  },
  {
    id: "verified", match: /\b(verif\w*|rol|role)\b/i,
    en: "Verified Player is assigned automatically when you join the Discord. Use /verify if the role is missing. For Free 8s, separately connect Discord through website Settings; a community role is not an account connection.",
    nl: "Verified Player krijg je automatisch bij het joinen van Discord. Gebruik /verify als de rol ontbreekt. Voor Free 8s koppel je Discord daarnaast via de website-instellingen; een communityrol is geen accountkoppeling.", links: [["Connect Discord", "/settings?connect=discord"]],
  },
  {
    id: "discord", match: /\bdiscord\b|\b(link|connect|koppel\w*)\b.*\b(account|accounts)\b/i,
    en: "Sign in on Topfragg, open Settings → Connections → Discord and press Connect Discord. Approve identity access in Discord, then return to Topfragg. Use your actual Discord account; typing a username does not link it. Join the server with the same linked account.",
    nl: "Log in op Topfragg en open Settings → Connections → Discord. Klik Connect Discord, keur de identiteitstoegang goed en keer terug naar Topfragg. Gebruik je echte Discord-account; alleen een gebruikersnaam invullen koppelt niets. Join de server met hetzelfde gekoppelde account.", links: [["Connect Discord", "/settings?connect=discord"], ["Discord server", topfraggDiscordInviteUrl]],
  },
  {
    id: "gaming-ids", match: /\b(activision|psn|xbox|battlenet|battle\.net|gaming ids?|game.?id|gamertag|steam)\b/i,
    en: "Open Settings → Connections → Gaming IDs to update the gaming identities displayed on your profile. The Discord connection is a separate step under Discord.",
    nl: "Ga naar Settings → Connections → Gaming IDs om de gaming-identiteiten op je profiel bij te werken. Discord koppelen is een aparte stap onder Discord.", links: [["Gaming IDs", "/settings#settings-gaming"]],
  },
  {
    id: "profile", match: /\b(profile|profiel|username|gebruikersnaam|avatar|social\w*|settings|instellingen)\b/i,
    en: "Open Settings for your profile, username, security, game rank and connections. Social profiles and Gaming IDs have their own sections; Discord and Twitch each have their own connection flow.",
    nl: "Open Settings voor je profiel, gebruikersnaam, beveiliging, gamerank en koppelingen. Social profiles en Gaming IDs hebben eigen secties; Discord en Twitch hebben elk een aparte koppeling.", links: [["Settings", "/settings"], ["Profile", "/profile"]],
  },
  {
    id: "rules", match: /\b(rules?|regels?|regelboek|allowed|toegestaan)\b/i,
    en: "Read the website rules and the specific rules on your event/match page. Use /rules for Discord's community and competition guidance. Staff handle case-specific rulings through /support.",
    nl: "Lees de websiteregels en de specifieke regels op je event-/matchpagina. Gebruik /rules voor Discord-uitleg over community en competitie. Staff behandelt individuele beslissingen via /support.", links: [["Rules", "/rules"]],
  },
  {
    id: "signup", match: /\b(register|sign ?up|aanmelden|registreren|account maken|account aanmaken|login|log ?in|inloggen|beginnen|starten)\b/i,
    en: "Create a Topfragg account, verify your email and sign in. Then open Settings to complete your profile and connections. For Free 8s, also complete the game-rank and Discord steps on the lobby page.",
    nl: "Maak een Topfragg-account, bevestig je e-mail en log in. Vul daarna je profiel en koppelingen in via Settings. Voor Free 8s volg je ook de rank- en Discord-stappen op de lobbypagina.", links: [["Register", "/register"], ["Login", "/login"], ["Settings", "/settings"]],
  },
  {
    id: "social", match: /\b(twitter|x\.com|follow|volg\w*)\b/i,
    en: "Follow Topfragg on X for our posts. Bring the squad; leave the excuses in spawn.",
    nl: "Volg Topfragg op X voor onze posts. Neem je squad mee; laat je excuses in spawn.", links: [["Topfragg on X", "https://x.com/_topfragg"]],
  },
  {
    id: "wallet", match: /\b(wallet|balance|saldo|credits?|deposit|storten)\b/i,
    en: "Open Wallet for the balance and actions available to your account. Follow the current options shown there. For missing payments or balance problems, use /support; I cannot inspect balances.",
    nl: "Open Wallet voor je saldo en de beschikbare accountacties. Volg de actuele opties op die pagina. Gebruik /support bij ontbrekende betalingen of saldoproblemen; ik kan geen saldo inzien.", links: [["Wallet", "/wallet"], ["Support", "/support"]],
  },
  {
    id: "premium", match: /\b(premium|subscription|abonnement|price|prijzen|kosten)\b/i,
    en: "Open Premium for the current benefits, availability and prices. I do not keep a live price list; follow what the website currently shows.",
    nl: "Open Premium voor de actuele voordelen, beschikbaarheid en prijzen. Ik houd geen live prijslijst bij; volg wat de website nu toont.", links: [["Premium", "/premium"]],
  },
  {
    id: "leaderboards", match: /\b(leaderboard\w*|ranking|ranglijst\w*|standings)\b/i,
    en: "Open Leaderboards for current standings and your profile for your own record. I cannot retrieve live standings in chat.",
    nl: "Open Leaderboards voor de actuele ranglijsten en je profiel voor je eigen record. Ik kan geen live standen ophalen in de chat.", links: [["Leaderboards", "/leaderboards"], ["Profile", "/profile"]],
  },
  {
    id: "help", match: /\b(help|website|site|links?|commands?|commando\w*|how does.*work|hoe werkt|wat kan)\b/i,
    en: "Ask me about connecting Discord/Twitch, Free 8s, ranks, teams, tournaments, settings or support. I use a built-in website guide; I cannot look up private accounts or live match data. Most account pages require sign-in.",
    nl: "Vraag me naar Discord/Twitch koppelen, Free 8s, ranks, teams, toernooien, instellingen of support. Ik gebruik een ingebouwde websitegids en kan geen privéaccounts of live matchdata opzoeken. Voor de meeste accountpagina's moet je inloggen.", links: [["Settings", "/settings"], ["Free 8s", "/ranked/8s"], ["Teams", "/teams"], ["Tournaments", "/tournaments"], ["Support", "/support"]],
  },
];

export const chatLanguage = (text) => /\b(hoe|waar|wat|waarom|ik|jij|je|mijn|jouw|kan|kun|wil|hoi|hallo|bedankt|grappig|grap|roast mij|koppelen|toernooi\w*|instellingen|wachtwoord|gratis|doei)\b/i.test(text) ? "nl" : "en";

export function websiteAnswer(text, { publicUrl = "https://topfragg.gg", language = chatLanguage(text) } = {}) {
  const topic = websiteTopics.find((item) => item.match.test(text));
  if (!topic) return null;
  const base = publicUrl.replace(/\/$/, "");
  const links = topic.links.map(([label, path]) => `[${label}](${path.startsWith("/") ? base + path : path})`);
  return { topic: topic.id, content: [topic[language], links.join(" · ")].filter(Boolean).join("\n") };
}
