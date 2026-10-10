import test from "node:test";
import assert from "node:assert/strict";
import { createGroqReply, groqChatEnvironment } from "./groq-chat.js";
import { createMentionChatHandler } from "./mention-chat.js";

const settings = { enabled: true, apiKey: "test-private-key", model: "openai/gpt-oss-20b" };
const success = (content = "Your aim is still buffering.", finish_reason = "stop") => ({
  ok: true, json: async () => ({ choices: [{ finish_reason, message: { content } }] }),
});

test("Groq needs its own key and can be disabled without affecting preset chat", async () => {
  assert.deepEqual(groqChatEnvironment({ OPENAI_API_KEY: "ignored" }), { enabled: true, apiKey: "", model: settings.model });
  assert.equal(groqChatEnvironment({ GROQ_API_KEY: " key " }).apiKey, "key");
  for (const config of [{ ...settings, apiKey: "" }, { ...settings, enabled: false }]) {
    const reply = createGroqReply({ settings: config, fetchImpl: () => assert.fail("Must not contact Groq") });
    assert.equal(await reply({ text: "hello" }), null);
  }
});

test("request sends only the tagged text and reviewed website facts, without chat history", async () => {
  let request;
  const reply = createGroqReply({ settings, fetchImpl: async (url, options) => {
    request = { url, ...options, body: JSON.parse(options.body) }; return success();
  } });
  assert.match(await reply({ text: "roast me", previous: "PRIVATE OLD REPLY", author: "PRIVATE USER ID" }), /buffering/);
  assert.equal(request.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(request.redirect, "error");
  assert.equal(request.headers.Authorization, `Bearer ${settings.apiKey}`);
  assert.equal(request.body.model, settings.model);
  assert.equal(request.body.reasoning_effort, "low");
  assert.equal(request.body.max_completion_tokens, 1024);
  assert.equal(request.body.messages.length, 2);
  assert.deepEqual(request.body.messages[1], { role: "user", content: "roast me" });
  const system = request.body.messages[0].content;
  assert.match(system, /Create 8s lobby/);
  assert.match(system, /Open 8s Lobby/);
  assert.match(system, /Activision ID/);
  assert.match(system, /gaming roasts/);
  assert.doesNotMatch(JSON.stringify(request.body), /PRIVATE|test-private-key|discord\.gg|free preset replies/);
});

test("AI output keeps one trusted destination and strips invites, unknown links and pings", async () => {
  const reply = createGroqReply({ settings, fetchImpl: async () => success(
    "Create your lobby. [8s](https://topfragg.gg/ranked/8s) [Settings](https://topfragg.gg/settings) https://discord.gg/invite discord.gg/invite https://evil.example @everyone <@55555> test-private-key"
  ) });
  const content = await reply({ text: "how do i make an 8's lobby" });
  assert.deepEqual(content.match(/https?:\/\/[^)\s]+/g), ["https://topfragg.gg/ranked/8s"]);
  assert.doesNotMatch(content, /discord\.gg|evil\.example|@everyone|<@|test-private-key/);
  assert.match(content, /Create your lobby/);
});

test("AI responses respect Dutch and English, custom site URLs and Discord length", async () => {
  let prompt;
  const reply = createGroqReply({ settings, publicUrl: "https://arena.example/", fetchImpl: async (_, options) => {
    prompt = JSON.parse(options.body).messages[0].content;
    return success("Stap voor stap. ".repeat(300));
  } });
  const content = await reply({ text: "hoe maak ik een 8s lobby?" });
  assert.match(prompt, /Reply in Dutch/);
  assert.match(content, /https:\/\/arena.example\/ranked\/8s/);
  assert.ok(content.length <= 1900);
  await reply({ text: "how do I play 8s?" });
  assert.match(prompt, /Reply in English/);
});

test("one roast request produces a single short punchline even when AI returns several", async () => {
  const cases = [
    ["Your aim is still buffering. Your scoreboard is blank. Your controller wants a transfer.", "Your aim is still buffering."],
    ["Sure, here are three roasts:\n1. Your aim is still buffering.\n2. Your scoreboard is blank.\n3. Your controller wants a transfer.", "Your aim is still buffering."],
    ["- Je aim moet de tutorial nog doen.\n- Je controller wil een transfer.", "Je aim moet de tutorial nog doen."],
  ];
  for (const [response, expected] of cases) {
    const reply = createGroqReply({ settings, fetchImpl: async (_, options) => {
      assert.match(JSON.parse(options.body).messages[0].content, /exactly ONE short punchline/);
      return success(response);
    } });
    assert.equal(await reply({ text: "roast me" }), expected);
  }
  const long = createGroqReply({ settings, fetchImpl: async () => success("Your aim is ".repeat(100)) });
  assert.ok((await long({ text: "roast me" })).length <= 240);
  const help = createGroqReply({ settings, fetchImpl: async () => success("First, open Free 8s. Then follow the rank and Discord steps.") });
  assert.match(await help({ text: "help me play 8s before you roast me" }), /Then follow/);
});

test("rate limits pause requests and honor Retry-After without logging response bodies", async () => {
  let now = 100_000, calls = 0;
  const logs = [];
  const reply = createGroqReply({ settings, now: () => now, log: (line) => logs.push(line), fetchImpl: async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 429, headers: new Headers({ "retry-after": "120" }), json: () => assert.fail("Must not read error body") };
    return success();
  } });
  assert.equal(await reply({ text: "private player message" }), null);
  now += 60_000; assert.equal(await reply({ text: "hello" }), null);
  assert.equal(calls, 1);
  now += 60_000; assert.ok(await reply({ text: "hello" }));
  assert.deepEqual(logs, ["Groq unavailable (HTTP 429); using preset replies"]);
});

test("unauthorized keys pause for five minutes, errors do not expose keys or player text", async () => {
  let now = 0, calls = 0;
  const logs = [];
  const reply = createGroqReply({ settings, now: () => now, log: (line) => logs.push(line), fetchImpl: async () => {
    calls++; return { ok: false, status: 401, headers: new Headers() };
  } });
  await reply({ text: "hello" }); now += 299_999; await reply({ text: "hello" });
  assert.equal(calls, 1);
  now++; await reply({ text: "hello" }); assert.equal(calls, 2);
  const broken = createGroqReply({ settings, log: (line) => logs.push(line), fetchImpl: async () => { throw new Error("PRIVATE test-private-key"); } });
  assert.equal(await broken({ text: "PRIVATE" }), null);
  assert.doesNotMatch(logs.join(" "), /PRIVATE|test-private-key/);
});

test("requests time out and fall back without retries", async () => {
  let calls = 0;
  const reply = createGroqReply({ settings, timeoutMs: 5, fetchImpl: async (_, { signal }) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  } });
  assert.equal(await reply({ text: "hello" }), null);
  assert.equal(await reply({ text: "hello" }), null);
  assert.equal(calls, 1);
});

test("local concurrency, minute and daily limits use fallback rather than more requests", async () => {
  const releases = [];
  const concurrent = createGroqReply({ settings, fetchImpl: () => new Promise((resolve) => releases.push(resolve)) });
  const first = concurrent({ text: "hi" }), second = concurrent({ text: "hi" });
  assert.equal(await concurrent({ text: "hi" }), null);
  releases.forEach((resolve) => resolve(success())); await Promise.all([first, second]);
  let now = 0, calls = 0;
  const limited = createGroqReply({ settings, now: () => now, fetchImpl: async () => { calls++; return success(); } });
  for (let i = 0; i < 7; i++) await limited({ text: "hi" });
  assert.equal(calls, 6);
  for (let i = 6; i < 101; i++) { now += 60_000; await limited({ text: "hi" }); }
  assert.equal(calls, 100);
  now = 86_400_000; assert.ok(await limited({ text: "hi" })); assert.equal(calls, 101);
});

test("empty, malformed and truncated AI completions use preset fallback", async () => {
  for (const response of [success(""), success(null), success("unfinished", "length"), { ok: true, json: async () => ({}) }]) {
    const reply = createGroqReply({ settings, fetchImpl: async () => response });
    assert.equal(await reply({ text: "hi" }), null);
  }
});

test("mention integration sends one request per eligible message and preserves fallback", async () => {
  let calls = 0, time = 100_000;
  const replies = [];
  const generateReply = createGroqReply({ settings, fetchImpl: async (_, options) => {
    calls++;
    assert.deepEqual(JSON.parse(options.body).messages.at(-1), { role: "user", content: "roast me" });
    return calls === 1 ? success("Your minimap filed a missing player report.") : { ok: false, status: 429, headers: new Headers() };
  } });
  const handler = createMentionChatHandler({ guildId: "guild", settings: { enabled: true }, generateReply,
    isAllowedChannel: (m) => m.channelId === "general", now: () => time, pick: () => 0 });
  const message = { id: "1", guildId: "guild", channelId: "general", client: { user: { id: "12345" } },
    author: { id: "player", bot: false }, content: "<@12345> roast me <@55555>", reply: async (payload) => replies.push(payload) };
  await handler({ ...message, content: "roast me" });
  await handler({ ...message, channelId: "private" });
  await Promise.all([handler(message), handler(message)]);
  assert.equal(calls, 1);
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /minimap/);
  assert.equal(replies[0].flags, 4);
  assert.deepEqual(replies[0].allowedMentions, { parse: [], repliedUser: false });
  time += 15_000;
  await handler({ ...message, id: "2" });
  assert.equal(replies.length, 2);
  assert.match(replies[1].content, /Your crosshair/);
});
