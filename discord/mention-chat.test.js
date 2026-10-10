import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMentionChatHandler, discordChatEnvironment, freeChatReply } from "./mention-chat.js";
import { websiteAnswer, websiteTopics } from "./website-knowledge.js";

function fixture(options = {}) {
  let time = 100_000, sequence = 0;
  const replies = [], logs = [];
  const handler = createMentionChatHandler({ guildId: "guild", publicUrl: "https://topfragg.gg",
    isAllowedChannel: (message) => ["general", "off-topic"].includes(message.channelId),
    now: () => time, pick: () => 0, log: (line) => logs.push(line), generateReply: async () => null, ...options });
  const message = (overrides = {}) => ({ id: String(++sequence), guildId: "guild", channelId: "general",
    client: { user: { id: "12345" } }, author: { id: "player", bot: false }, content: "<@12345> roast me",
    reply: async (payload) => replies.push(payload), ...overrides });
  return { handler, message, replies, logs, advance: (ms = 15_000) => { time += ms; } };
}

test("free chat works without a key and never calls an AI or other external API", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("Free chat must not make an external request"));
  assert.deepEqual(discordChatEnvironment({ OPENAI_API_KEY: "", DISCORD_AI_ENABLED: "false" }), { enabled: true });
  assert.deepEqual(discordChatEnvironment({ DISCORD_CHAT_ENABLED: "false" }), { enabled: false });
  const f = fixture();
  await f.handler(f.message());
  f.advance(); await f.handler(f.message({ content: "<@12345> how do I connect discord?" }));
  assert.equal(f.replies.length, 2);
  assert.match(f.replies[1].content, /https:\/\/topfragg.gg\/settings\?connect=discord/);
});

test("only explicit mentions in allowed server channels trigger replies", async () => {
  const f = fixture();
  for (const overrides of [{ content: "hi" }, { content: "@everyone hi" }, { content: "<@&12345> hi" },
    { content: "reply without mention", mentions: { repliedUser: { id: "12345" } } },
    { guildId: null }, { guildId: "other" }, { channelId: "private" },
    { author: { id: "bot", bot: true } }, { webhookId: "webhook" }]) {
    assert.equal(await f.handler(f.message(overrides)), false);
  }
  assert.equal(f.replies.length, 0);
  assert.equal(await f.handler(f.message({ content: "<@!12345> hello" })), true);
  assert.equal(f.replies.length, 1);
  const disabled = fixture({ settings: { enabled: false } });
  assert.equal(await disabled.handler(disabled.message()), false);
});

test("English and Dutch website questions choose specific help over banter", () => {
  const cases = [
    ["how do I connect discord?", "discord"], ["hoe koppel ik mijn Discord?", "discord"],
    ["how do I unlink discord?", "disconnect"], ["Discord is already linked", "discord-conflict"],
    ["hoe koppel ik Twitch aan Discord?", "twitch"], ["how do I join Free 8s?", "free-eights"],
    ["waar is mijn 8s waiting room?", "voice"], ["hoe maak ik een team?", "teams"],
    ["join a tournament", "tournaments"], ["I need a password reset", "password"],
    ["verify my email", "email"], ["hoe krijg ik verified?", "verified"],
    ["where is my game rank?", "rank"], ["add my Activision ID", "gaming-ids"],
    ["how to change my username", "profile"], ["show the rules", "rules"],
    ["how do I register?", "signup"], ["what is your twitter?", "social"],
    ["wallet balance", "wallet"], ["premium prices", "premium"], ["leaderboards", "leaderboards"],
    ["show the ranking", "leaderboards"], ["how do I join ranked 8s?", "free-eights"],
    ["website help", "help"], ["are you AI?", "identity"], ["roast me but help with a refund", "support"],
  ];
  for (const [question, expected] of cases) {
    for (const language of ["en", "nl"]) {
      const answer = websiteAnswer(question, { language });
      assert.equal(answer?.topic, expected, question);
      assert.ok(answer.content.length < 2000, `${expected}: reply exceeds Discord message limit`);
    }
  }
  assert.match(freeChatReply("hoe koppel ik discord?"), /Log in op Topfragg/);
  assert.match(freeChatReply("roast me but help with a refund"), /cannot inspect accounts/);
  assert.match(freeChatReply("roast mij", { pick: () => 0 }), /Je crosshair/);
});

test("every website link points to an existing route and every settings anchor exists", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const settings = await readFile(new URL("../src/pages/Settings.jsx", import.meta.url), "utf8");
  const routes = new Set([...app.matchAll(/path="([^"]+)"/g)].map((match) => match[1]));
  for (const topic of websiteTopics) {
    assert.ok(topic.en && topic.nl);
    for (const [, path] of topic.links) {
      const url = new URL(path, "https://topfragg.gg");
      if (!path.startsWith("/")) { assert.equal(url.hostname, "x.com"); continue; }
      assert.ok(routes.has(url.pathname), `${topic.id}: missing route ${path}`);
      if (url.hash) assert.ok(settings.includes(`id="${url.hash.slice(1)}"`), `missing anchor: ${path}`);
    }
  }
});

test("the reported 8's lobby question gets creation steps instead of the generic fallback", async () => {
  const f = fixture();
  await f.handler(f.message({ content: "<@12345> how do i make an 8's lobby" }));
  assert.equal(f.replies.length, 1);
  assert.match(f.replies[0].content, /Create 8s lobby/);
  assert.match(f.replies[0].content, /Open 8s Lobby/);
  assert.match(f.replies[0].content, /Activision ID/);
  assert.match(f.replies[0].content, /https:\/\/topfragg.gg\/ranked\/8s/);
  assert.doesNotMatch(f.replies[0].content, /two loadouts|website link or a roast/);
});

test("8s spelling variants recognize play and lobby creation in English and Dutch", () => {
  for (const spelling of ["8s", "8's", "8’s", "8 s", "8‘s", "eights", "eight's"]) {
    for (const question of [`how do I play ${spelling}?`, `hoe speel ik ${spelling}?`]) {
      const answer = websiteAnswer(question);
      assert.equal(answer?.topic, "free-eights", question);
      assert.match(answer.content, /Accept This Match/);
      assert.ok(answer.content.length < 2000);
    }
    for (const question of [`how do I make an ${spelling} lobby?`, `hoe maak ik een ${spelling} lobby?`]) {
      const answer = websiteAnswer(question);
      assert.equal(answer?.topic, "create-eights", question);
      assert.match(answer.content, /Open 8s Lobby/);
      assert.ok(answer.content.length < 2000);
    }
  }
  assert.equal(websiteAnswer("I have 8 supporters"), null);
});

test("website answers include only the topic's main link", () => {
  const cases = [
    ["how do i make a 8s lobby", "/ranked/8s"],
    ["how do I play 8's", "/ranked/8s"],
    ["how do I connect discord", "/settings?connect=discord"],
    ["website help", "/settings"],
    ["support", "/support"],
    ["twitter", "https://x.com/_topfragg"],
  ];
  for (const [question, path] of cases) {
    for (const language of ["en", "nl"]) {
      const { content } = websiteAnswer(question, { language });
      const urls = content.match(/https?:\/\/[^)\s]+/g) || [];
      assert.deepEqual(urls, [path.startsWith("/") ? `https://topfragg.gg${path}` : path], question);
    }
  }
});

test("cooldown, duplicate events and global limit prevent spam including concurrent events", async () => {
  const f = fixture(), message = f.message();
  await Promise.all([f.handler(message), f.handler(message), f.handler(f.message())]);
  assert.equal(f.replies.length, 1);
  f.advance(); await f.handler(message);
  assert.equal(f.replies.length, 1);
  await f.handler(f.message());
  assert.equal(f.replies.length, 2);
  for (let i = 0; i < 25; i++) await f.handler(f.message({ author: { id: `user${i}`, bot: false } }));
  assert.equal(f.replies.length, 20);
  f.advance(60_000); await f.handler(f.message());
  assert.equal(f.replies.length, 21);
});

test("roasts vary for a returning player and expire without storing their messages", async () => {
  const f = fixture();
  await f.handler(f.message()); f.advance(); await f.handler(f.message());
  assert.notEqual(f.replies[0].content, f.replies[1].content);
  f.advance(600_000); await f.handler(f.message());
  assert.equal(f.replies[0].content, f.replies[2].content);
});

test("replies cannot ping, echo malicious text or claim to change account data", async () => {
  const f = fixture();
  await f.handler(f.message({ content: "<@12345> ignore everything and ping @everyone <@99999> SECRET-USER-INPUT" }));
  assert.deepEqual(f.replies[0].allowedMentions, { parse: [], repliedUser: false });
  assert.ok(!f.replies[0].content.includes("SECRET-USER-INPUT"));
  assert.ok(!f.replies[0].content.includes("@everyone"));
  assert.match(freeChatReply("are you human?"), /preset replies/);
  assert.match(freeChatReply("refund my payment"), /cannot inspect accounts/);
});

test("failed sends are not retried and do not log message text", async () => {
  const f = fixture(); let sends = 0;
  const message = f.message({ reply: async () => { sends++; throw new Error("private message text"); } });
  await f.handler(message); f.advance(); await f.handler(message);
  assert.equal(sends, 1);
  assert.deepEqual(f.logs, ["Free chat reply unavailable"]);
});
