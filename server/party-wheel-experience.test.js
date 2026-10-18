import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { partyWheelFrame, partyWheelIsLive } from "../src/lib/partyWheelAnimation.js";
import { createPartyWheelAudio } from "../src/lib/partyWheelAudio.js";
import { createPartyFireworks } from "../src/lib/partyFireworks.js";

const start = Date.parse("2026-10-18T12:00:00Z");
const spin = { id: "draw", scope: "all_teams", started_at: new Date(start).toISOString(), duration_ms: 6000, turns: 7, landing_index: 2, team_count: 2 };

test("the wheel lands under the pointer for every roster size, following server time", () => {
  for (let count = 1; count <= 64; count++) for (let index = 0; index < count; index++) {
    const frame = partyWheelFrame({ ...spin, landing_index: index }, count, start + 5700, 300);
    assert.equal(frame.finished, true);
    const landing = ((index + .5) * (360 / count) + frame.rotation) % 360;
    assert.ok(Math.abs(landing) < .00001 || Math.abs(landing - 360) < .00001);
  }
  assert.equal(partyWheelFrame(spin, 8, start - 500).rotation, 0);
  assert.equal(partyWheelFrame(spin, 8, start + 3000).progress, .5);
  assert.ok(partyWheelFrame(spin, 8, start + 3000).rotation < partyWheelFrame(spin, 8, start + 6000).rotation);
  assert.equal(partyWheelFrame(spin, 8, start + 3000, 0, true).rotation, 0);
  assert.equal(partyWheelFrame(spin, 8, start + 6000, 0, true).finished, true);
});

test("an old draw is static after reload; waiting and live draws share the same timeline", () => {
  assert.equal(partyWheelIsLive(spin, start - 750), true);
  assert.equal(partyWheelIsLive(spin, start + 5999), true);
  assert.equal(partyWheelIsLive(spin, start + 6000), false);
  assert.equal(partyWheelIsLive(spin, start + 60000), false);
  assert.equal(partyWheelIsLive(null, start), false);
  assert.deepEqual(partyWheelFrame(null, 0, start), { progress: 0, rotation: 0, finished: false });
});

test("wheel audio unlocks on interaction, throttles ticks, mutes scheduled sound and releases resources", async () => {
  let contexts = 0, context;
  class AudioContext {
    constructor() { contexts++; context = this; this.state = "suspended"; this.currentTime = 0; this.sampleRate = 48000; this.notes = []; this.gains = []; }
    async resume() { this.state = "running"; }
    createGain() {
      const values = [];
      this.gains.push(values);
      return { connect() {}, disconnect() {}, gain: { setValueAtTime: (value) => values.push(value), exponentialRampToValueAtTime() {} } };
    }
    createOscillator() {
      const note = { frequency: { setValueAtTime(value) { note.pitch = value; }, exponentialRampToValueAtTime(value) { note.endPitch = value; } }, connect() {}, disconnect() {}, start(time) { note.startAt = time; }, stop() { note.stops = (note.stops || 0) + 1; } };
      this.notes.push(note); return note;
    }
    createBuffer(_channels, length) { const samples = new Float32Array(length); return { getChannelData: () => samples }; }
    createBufferSource() { const source = this.createOscillator(); source.kind = "noise"; return source; }
    createBiquadFilter() { return { frequency: { setValueAtTime() {} }, connect() {}, disconnect() {} }; }
    async close() { this.state = "closed"; }
  }
  const audio = createPartyWheelAudio(() => AudioContext);
  audio.tick(); audio.finish(); audio.fireworkLaunch(); audio.fireworkBurst(); assert.equal(contexts, 0, "audio must not be created by mounting or polling");
  assert.equal(await audio.unlock(), true); assert.equal(contexts, 1);
  audio.tick(); audio.tick(); assert.equal(context.notes.length, 1);
  context.currentTime = .06; audio.tick(); assert.equal(context.notes.length, 2);
  audio.finish(); assert.equal(context.notes.length, 6);
  assert.deepEqual(context.notes.slice(-4).map((note) => note.pitch), [523.25, 659.25, 783.99, 1046.5]);
  audio.mute(true); assert.equal(context.gains[0].at(-1), 0);
  context.currentTime = .2; audio.tick(); audio.finish(); assert.equal(context.notes.length, 6);
  audio.fireworkLaunch(); audio.fireworkBurst(); assert.equal(context.notes.length, 6, "muting includes fireworks");
  audio.mute(false); audio.tick(); assert.equal(context.notes.length, 7);
  audio.fireworkLaunch(); audio.fireworkBurst(); assert.equal(context.notes.length, 14);
  assert.equal(context.notes.filter((note) => note.kind === "noise").length, 5, "launch whoosh, explosion and crackles use shaped noise");
  assert.equal(context.notes[7].endPitch, 1500); assert.equal(context.notes[10].endPitch, 35);
  audio.stopFireworks();
  assert.ok(context.notes.slice(7).every((note) => note.stops === 2));
  assert.ok(context.notes.slice(0, 7).every((note) => note.stops === 1), "stopping fireworks leaves wheel and fanfare sounds alone");
  audio.close(); assert.equal(context.state, "closed"); assert.ok(context.notes.every((note) => note.stops >= 2));
  assert.equal(await audio.unlock(), false); audio.tick(); assert.equal(contexts, 1);
  const unsupported = createPartyWheelAudio(() => undefined);
  assert.equal(await unsupported.unlock(), false); unsupported.tick(); unsupported.finish(); unsupported.close();
});

test("animated rockets burst with matching sound events, finish cleanly and cancel for reduced motion or a new draw", () => {
  let time = 0, nextFrame = 0, enabled = true, strokes = 0, clears = 0, stopped = 0;
  const frames = new Map(), launches = [], bursts = [];
  const context = { setTransform() {}, clearRect() { clears++; }, createLinearGradient: () => ({ addColorStop() {} }), beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, stroke() { strokes++; } };
  const canvas = { getContext: () => context };
  const fireworks = createPartyFireworks(canvas, {
    now: () => time, random: () => .5, viewport: () => ({ width: 1280, height: 720, ratio: 2 }), allowed: () => enabled,
    requestFrame: (fn) => { frames.set(++nextFrame, fn); return nextFrame; }, cancelFrame: (id) => frames.delete(id),
    onLaunch: () => launches.push(time), onBurst: () => bursts.push(time), onStop: () => stopped++,
  });
  const advance = (ms) => { time += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); };
  fireworks.start(); advance(0);
  for (let index = 0; index < 105; index++) advance(50);
  assert.equal(launches.length, 5); assert.equal(bursts.length, 5);
  assert.ok(bursts.every((at, index) => at - launches[index] >= 670 && at - launches[index] <= 750));
  assert.ok(strokes > 300); assert.equal(canvas.width, 2560); assert.equal(canvas.height, 1440);
  assert.equal(frames.size, 0, "the animation has a finite duration");
  fireworks.start(); advance(0); assert.equal(frames.size, 1);
  fireworks.stop(); assert.equal(frames.size, 0, "reset cancels all scheduled animation");
  enabled = false; fireworks.start(); assert.equal(frames.size, 0, "reduced motion prevents new fireworks");
  enabled = true; fireworks.start(); advance(0);
  enabled = false; advance(50); assert.equal(frames.size, 0, "a hidden tab or changed preference stops existing fireworks and sound");
  assert.ok(clears > 0); assert.ok(stopped >= 4);
});

test("the real draw studio renders large-wheel controls, account/guest inputs and spectator restrictions", async (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
  const result = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import PartyDrawStage from './src/components/competition/PartyDrawStage.jsx';
    import PartyTeamCount from './src/components/competition/PartyTeamCount.jsx';
    import {PartyAddPlayers,PartyAddDuo} from './src/components/competition/PartyPlayerEntry.jsx';
    export function render(props) {return renderToStaticMarkup(<PartyDrawStage {...props} settings={props.manager && <PartyTeamCount room={props.room} act={props.act}/>} >{props.manager && <><PartyAddPlayers room={props.room}/><PartyAddDuo room={props.room}/></>}</PartyDrawStage>);}
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"], external: ["react", "react-dom", "react-dom/server"], alias: { "@": `${root}/src` },
    plugins: [{ name: "account-search-boundary", setup(bundle) {
      bundle.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "wheel-test" }));
      bundle.onLoad({ filter: /.*/, namespace: "wheel-test" }, () => ({ contents: "export const base44={party:{searchPlayers:async()=>({players:[]})}};" }));
    } }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const room = { mode: "coed", round: 1, team_size: 2, status: "open", teams: [{ id: "a", name: "Alpha" }, { id: "b", name: "Bravo" }], players: [{ id: "p", name: "Website player", user_id: "u" }] };
  const props = { room, entries: room.players, manager: true, act() {} };
  const html = compiled.exports.render(props);
  assert.match(html, /party-draw-studio/); assert.match(html, /party-wheel-hub/);
  const wheel = html.match(/<svg[^>]*class="party-wheel"[\s\S]*?<\/svg>/)?.[0];
  assert.ok(wheel);
  assert.match(wheel, /Topfragg visual team spinner/);
  assert.doesNotMatch(wheel, /Website player|<text|<title/, "the wheel is decorative; player names belong in the roster and results");
  assert.match(html, /Sound/); assert.match(html, /Confetti/); assert.match(html, /Focus wheel/);
  assert.match(html, /Spin &amp; draw all teams/); assert.match(html, /Ctrl \+ Enter/);
  assert.match(html, /Search a player or enter a guest/); assert.match(html, /role="combobox"/);
  assert.match(html, /Add a fixed duo/); assert.match(html, /Add multiple guests/);
  assert.match(html, /Number of teams/); assert.match(html, /type="number"[^>]*min="1"[^>]*max="128"/);
  assert.doesNotMatch(html, /Add team<\/button>/);
  const spectator = compiled.exports.render({ ...props, manager: false });
  assert.match(spectator, /The host controls the wheel/);
  assert.doesNotMatch(spectator, /Spin &amp; draw all teams|Add a fixed duo/);
  assert.match(spectator, /disabled=""[^>]*aria-label="Spin to draw all teams"/);
  const completed = compiled.exports.render({ ...props, allReady: true, room: { ...room, status: "ready", spin: { ...spin, entries: room.players } } });
  assert.match(completed, /View drawn teams/); assert.doesNotMatch(completed, /Spin &amp; draw all teams/);
  const completedSpectator = compiled.exports.render({ ...props, manager: false, allReady: true, room: { ...room, status: "ready", spin: { ...spin, entries: room.players } } });
  assert.match(completedSpectator, /View drawn teams/); assert.doesNotMatch(completedSpectator, /Choose bracket|New draw/);
  const singleTeam = compiled.exports.render({ ...props, allReady: true, room: { ...room, status: "ready", teams: room.teams.slice(0, 1) } });
  assert.match(singleTeam, /View drawn teams/); assert.doesNotMatch(singleTeam, /Choose bracket/);
});
