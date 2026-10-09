import { randomInt } from "node:crypto";
import { chatLanguage, websiteAnswer } from "./website-knowledge.js";

const TTL_MS = 10 * 60_000;
const COOLDOWN_MS = 15_000;

export const discordChatEnvironment = (env = process.env) => ({
  enabled: String(env.DISCORD_CHAT_ENABLED || "true").toLowerCase() !== "false",
});

const lines = {
  en: {
    roast: [
      "Your crosshair and the enemy are in a long-distance relationship. 🎯",
      "You don't miss shots. You provide emotional support to the walls.",
      "That ego is top 250. That aim is still accepting the terms and conditions.",
      "Your best rotation is from the match back to the lobby.",
      "You called him one shot. The only thing damaged was your credibility.",
      "Your highlight reel is just the enemy's highlight reel from another angle.",
      "You camp so long the objective started charging you rent.",
      "You play like the minimap is paid DLC.",
      "You said 'watch this' and gave the enemy a free killcam.",
      "Your recoil control looks like you're signing the wall.",
      "Your controller isn't broken. It just wants a transfer.",
      "You pre-aimed next Tuesday and still got caught off guard.",
    ],
    greeting: ["Comms online. Aim still under investigation. What's up? 🎮", "Yo. Here for help, or are we blaming the controller again?", "You rang? Give me a question or ask for a roast."],
    thanks: ["Got you. Now rotate before we both lose the hill.", "Anytime. One less excuse for the scoreboard."],
    bye: ["GG. May your next lobby be kinder than your aim.", "Later. Leave the excuses in spawn."],
    fallback: ["I know website help and gaming banter. Ask me about Discord linking, Free 8s or teams — or say 'roast me'.", "Need a website link or a roast? Those are my two loadouts. 🎮"],
  },
  nl: {
    roast: [
      "Je crosshair en de tegenstander hebben een langeafstandsrelatie. 🎯",
      "Jij mist geen schoten. Je geeft de muren emotionele steun.",
      "Je ego is top 250. Je aim moet de tutorial nog accepteren.",
      "Je beste rotatie is van de match terug naar de lobby.",
      "Je riep 'one shot'. Alleen je geloofwaardigheid had damage.",
      "Je highlightvideo is de killcam van de tegenstander vanuit een andere hoek.",
      "Je campt zo lang dat de objective huur begint te vragen.",
      "Je speelt alsof de minimap betaalde DLC is.",
      "Je zei 'kijk dit' en gaf de tegenstander een gratis clip.",
      "Je recoil control lijkt op een handtekening op de muur.",
      "Je controller is niet kapot. Hij wil gewoon een transfer.",
      "Je pre-aimde volgende dinsdag en was alsnog te laat.",
    ],
    greeting: ["Comms online. Je aim wordt nog onderzocht. Wat is er? 🎮", "Hoi. Hulp nodig, of krijgt de controller weer de schuld?", "Je riep? Stel een vraag of vraag om een roast."],
    thanks: ["Graag gedaan. Nu roteren voordat we de hill verliezen.", "Geen probleem. Weer één excuus minder voor je scoreboard."],
    bye: ["GG. Hopelijk is je volgende lobby vriendelijker dan je aim.", "Later. Laat je excuses in spawn."],
    fallback: ["Ik ken website-uitleg en gamingbanter. Vraag naar Discord koppelen, Free 8s of teams — of zeg 'roast mij'.", "Een websitelink of een roast nodig? Dat zijn mijn twee loadouts. 🎮"],
  },
};

export function freeChatReply(text, { publicUrl, previous, pick = randomInt } = {}) {
  const language = chatLanguage(text);
  const guide = websiteAnswer(text, { publicUrl, language });
  if (guide) return guide.content;
  let kind = "fallback";
  if (/\b(roast|joke|grap\w*|funny|grappig|banter|trash|noob|bot|aim|camp\w*|clutch|skill issue)\b/i.test(text)) kind = "roast";
  else if (/\b(thanks?|thank you|bedankt|dank\w*)\b/i.test(text)) kind = "thanks";
  else if (/\b(bye|later|goodnight|doei|welterusten|gg)\b/i.test(text)) kind = "bye";
  else if (!text.trim() || /\b(hi|hey|hello|yo|hoi|hallo|sup)\b/i.test(text)) kind = "greeting";
  const candidates = lines[language][kind].filter((line) => line !== previous);
  return candidates[pick(candidates.length)];
}

export function createMentionChatHandler({
  guildId, publicUrl, isAllowedChannel, settings = discordChatEnvironment(),
  now = Date.now, pick = randomInt, log = () => {},
}) {
  const seen = new Map(), cooldowns = new Map(), previous = new Map();
  let recentReplies = [];
  return async (message) => {
    const botId = message.client?.user?.id;
    if (!settings.enabled || !botId || message.guildId !== guildId || message.author.bot
      || message.webhookId || !isAllowedChannel(message)) return false;
    const mention = new RegExp(`<@!?${botId}>`, "g");
    if (!mention.test(message.content || "")) return false;
    const time = now();
    for (const [key, at] of seen) if (time - at >= TTL_MS) seen.delete(key);
    for (const [key, at] of cooldowns) if (time - at >= COOLDOWN_MS) cooldowns.delete(key);
    for (const [key, value] of previous) if (time - value.at >= TTL_MS) previous.delete(key);
    recentReplies = recentReplies.filter((at) => time - at < 60_000);
    if (seen.has(message.id) || cooldowns.has(message.author.id) || recentReplies.length >= 20) return true;
    const sessionKey = `${message.channelId}:${message.author.id}`;
    // Never echo player text, fetch chat history or send data to an AI provider.
    const text = String(message.content || "").replace(mention, "").replace(/<[^>]+>/g, "").trim().slice(0, 1500);
    const content = freeChatReply(text, { publicUrl, previous: previous.get(sessionKey)?.content, pick });
    seen.set(message.id, time);
    cooldowns.set(message.author.id, time);
    recentReplies.push(time);
    try {
      await message.reply({ content, allowedMentions: { parse: [], repliedUser: false }, failIfNotExists: false });
      if (!previous.has(sessionKey) && previous.size >= 200) previous.delete(previous.keys().next().value);
      previous.set(sessionKey, { at: time, content });
    } catch {
      log("Free chat reply unavailable");
    }
    return true;
  };
}
