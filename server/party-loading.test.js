import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { mergeRoomUpdate } from "../src/lib/partyRoomUpdates.js";

const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
const snapshot = () => ({ room: { id: "room", revision: 4, players: [{ id: "p", name: "Liv" }] }, voice: { fresh: true }, server_time: "first" });

test("unchanged polls reuse room data; late polls cannot undo a successful action", () => {
  const previous = snapshot(), poll = structuredClone(previous);
  poll.server_time = "later";
  assert.equal(mergeRoomUpdate(previous, poll), previous);
  poll.room.revision--;
  poll.room.players = [];
  assert.equal(mergeRoomUpdate(previous, poll), previous);
  assert.equal(mergeRoomUpdate(null, previous), previous);
  const otherRoom = { ...poll, room: { ...poll.room, id: "another-room" } };
  assert.equal(mergeRoomUpdate(previous, otherRoom), otherRoom);
});

test("Discord and public profile changes still arrive without a room revision change", () => {
  const previous = snapshot(), voicePoll = structuredClone(previous);
  voicePoll.voice.team_urls = { team: "https://discord.com/channels/guild/team" };
  const voiceUpdate = mergeRoomUpdate(previous, voicePoll);
  assert.equal(voiceUpdate.room, previous.room, "voice updates must not revalidate the roster");
  assert.deepEqual(voiceUpdate.voice, voicePoll.voice);
  const profilePoll = structuredClone(voiceUpdate);
  profilePoll.room.players[0].profile = { avatar_url: "/new-avatar.png" };
  const profileUpdate = mergeRoomUpdate(voiceUpdate, profilePoll);
  assert.equal(profileUpdate.room.players[0].profile.avatar_url, "/new-avatar.png");
  assert.equal(profileUpdate.voice, voiceUpdate.voice);
  const action = structuredClone(profileUpdate);
  action.room.revision++;
  action.room.players.push({ id: "guest", name: "Guest" });
  assert.equal(mergeRoomUpdate(profileUpdate, action).room, action.room);
});

test("the initial Co-ed download excludes matchrooms while retaining the wheel and sound", async (t) => {
  const result = await build({ entryPoints: [`${root}/src/pages/CoedSwitcheroo.jsx`], bundle: true, write: false,
    minify: true, splitting: true, outdir: `${root}/tmp/party-loading-check`, format: "esm", metafile: true,
    external: ["react", "react-dom", "react-router-dom"], alias: { "@": `${root}/src` }, loader: { ".css": "empty" } });
  const outputs = result.metafile.outputs;
  const entry = Object.keys(outputs).find((key) => outputs[key].entryPoint?.endsWith("pages/CoedSwitcheroo.jsx"));
  const initial = new Set();
  const visit = (key) => {
    if (initial.has(key)) return;
    initial.add(key);
    for (const dependency of outputs[key].imports) if (!dependency.external && dependency.kind !== "dynamic-import") visit(dependency.path);
  };
  visit(entry);
  const inputs = [...initial].flatMap((key) => Object.keys(outputs[key].inputs));
  assert.ok(inputs.some((key) => key.endsWith("AnimatedNameWheel.jsx")));
  assert.ok(inputs.some((key) => key.endsWith("partyWheelAudio.js")));
  assert.ok(inputs.some((key) => key.endsWith("partyFireworks.js")));
  assert.ok(!inputs.some((key) => key.endsWith("PartyMatchRoom.jsx")));
  assert.ok(Object.values(outputs).some((output) => output.entryPoint?.endsWith("PartyMatchRoom.jsx")));
  t.diagnostic(`Initial page JavaScript: ${[...initial].reduce((sum, key) => sum + outputs[key].bytes, 0)} bytes (single-page check, uncompressed)`);
});

test("wheel frames move both rotors and play ticks without rendering React on each frame", async (t) => {
  const effects = [], transforms = [], frames = new Map();
  let renders = 0, nextFrame = 0, ticks = 0, finishes = 0;
  const react = {
    useState: (initial) => {
      let value = typeof initial === "function" ? initial() : initial;
      return [value, (update) => { const next = typeof update === "function" ? update(value) : update; if (next !== value) renders++; value = next; }];
    },
    useRef: (value) => ({ current: value }), useId: () => "wheel-test",
    useEffect: (effect) => effects.push(effect),
    createElement: (type, props) => { if (props?.ref) props.ref.current = { setAttribute: (name, value) => transforms.push({ name, value }) }; return { type, props }; },
  };
  const result = await build({ entryPoints: [`${root}/src/components/competition/AnimatedNameWheel.jsx`], bundle: true, write: false,
    format: "cjs", platform: "node", jsx: "transform", alias: { "@": `${root}/src` },
    plugins: [{ name: "wheel-hooks", setup(bundle) {
      bundle.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, ({ path }) => ({ path, namespace: "wheel-test" }));
      bundle.onLoad({ filter: /.*/, namespace: "wheel-test" }, ({ path }) => ({ contents: path.endsWith("jsx-runtime")
        ? "export const jsx = (type, props) => globalThis.__partyWheelTestHooks.createElement(type, props); export const jsxs = jsx;"
        : "const hooks = globalThis.__partyWheelTestHooks; export const {useState,useRef,useId,useEffect} = hooks; export default hooks;" }));
    } }] });
  const keys = ["window", "requestAnimationFrame", "cancelAnimationFrame", "__partyWheelTestHooks"];
  const original = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  const start = 100000;
  let now = start;
  t.mock.method(Date, "now", () => now);
  try {
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    globalThis.__partyWheelTestHooks = react;
    globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
    globalThis.cancelAnimationFrame = (id) => frames.delete(id);
    const module = { exports: {} };
    new Function("module", "exports", result.outputFiles[0].text)(module, module.exports);
    const props = { entries: [{ id: "a" }, { id: "b" }], spin: { id: "spin", scope: "all_teams", started_at: new Date(start).toISOString(), duration_ms: 6000, turns: 7, landing_index: 0 }, onTick: () => ticks++, onFinish: () => finishes++ };
    module.exports.default(props);
    const cleanup = effects.map((effect) => effect());
    const frame = (time) => { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback()); };
    frame(start); frame(start + 1000); frame(start + 2000);
    assert.equal(transforms.length, 6, "both rotor transforms update every frame");
    assert.ok(ticks > 0, "spin ticks remain audible");
    assert.equal(renders, 0, "React should not render at animation frame frequency");
    frame(start + 6000);
    assert.equal(finishes, 1);
    assert.equal(renders, 1, "render the finished state once");
    assert.equal(frames.size, 0, "stop requesting frames after the reveal");
    cleanup.forEach((stop) => stop?.());
  } finally {
    keys.forEach((key, index) => { if (original[index]) Object.defineProperty(globalThis, key, original[index]); else delete globalThis[key]; });
  }
});
