import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import functionRoutes from "./routes/functions.js";
import entityRoutes from "./routes/entities.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

test("legacy Challengers accounts cannot access removed Tryouts actions or generic room endpoints, including admins", async (t) => {
  const users = new Map([
    ["staff", { id: "staff", role: "ceo", email_verified: true, metadata: {} }],
    ["player", { id: "player", role: "user", email_verified: true, metadata: { badges: [{ type: "challengers", name: "Challengers" }] } }],
  ]);
  const override = (target, name, fn) => { const original = target[name]; target[name] = fn; t.after(() => { target[name] = original; }); };
  override(prisma.user, "findUnique", async ({ where }) => structuredClone(users.get(where.id)));
  override(prisma.ban, "findMany", async () => []);
  for (const method of ["findMany", "findUnique", "create", "update", "delete"]) override(prisma.tryoutRoom, method, () => { throw new Error("Retired rooms must not be accessed"); });
  const app = express(); app.use(express.json()); app.use("/functions", functionRoutes); app.use("/entities", entityRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const user of users.values()) {
    const headers = { Authorization: `Bearer ${signUser(user)}`, "Content-Type": "application/json" };
    for (const name of ["getTryouts", "getTryoutRoom", "createTryoutRoom", "updateTryoutRoom", "deleteTryoutRoom", "getTryoutLiveUpdatesToken"]) {
      assert.equal((await fetch(`${origin}/functions/${name}`, { method: "POST", headers, body: JSON.stringify({ room_id: "old-room" }) })).status, 404);
    }
    for (const [method, suffix] of [["GET", ""], ["GET", "/old-room"], ["POST", ""], ["PATCH", "/old-room"], ["DELETE", "/old-room"]]) {
      assert.equal((await fetch(`${origin}/entities/TryoutRoom${suffix}`, { method, headers })).status, 404);
    }
  }
});

test("badge management rejects the retired badge and removes legacy entries on normal updates while preserving supported badges and metadata", async (t) => {
  const staff = { id: "staff", role: "ceo", email_verified: true, metadata: {} };
  let target = { id: "target", username: "Target", role: "moderator", email_verified: true, metadata: {
    activision_id: "Target#123", badges: [{ type: "moderator", name: "Moderator" }, { type: "challengers", name: "Challengers" }, { type: "verified_player", name: "Verified Player" }, { type: "member_1_month", name: "1 month member" }],
  } };
  let writes = 0;
  const override = (object, name, fn) => { const original = object[name]; object[name] = fn; t.after(() => { object[name] = original; }); };
  override(prisma.user, "findUnique", async ({ where }) => structuredClone(where.id === staff.id ? staff : target));
  override(prisma.user, "update", async ({ data }) => { writes++; target = { ...target, ...data }; return structuredClone(target); });
  override(prisma.ban, "findMany", async () => []);
  for (const delegate of [prisma.adminAction, prisma.notification]) override(delegate, "create", async ({ data }) => ({ id: "record", ...data }));
  const app = express(); app.use(express.json()); app.use("/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const update = async (badge_types) => (await fetch(`http://127.0.0.1:${server.address().port}/functions/updateUserBadges`, {
    method: "POST", headers: { Authorization: `Bearer ${signUser(staff)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: target.id, badge_types, monitor_cam_required: true }),
  })).json();
  assert.equal((await update(["challengers"])).success, false);
  assert.equal((await update(["member_2_years"])).success, false);
  assert.equal(writes, 0);
  const result = await update(["verified_player", "streamer"]);
  assert.equal(result.success, true);
  assert.equal(writes, 1);
  assert.deepEqual(target.metadata.badges.map((badge) => badge.type), ["moderator", "member_1_month", "verified_player", "streamer"]);
  assert.equal(target.metadata.activision_id, "Target#123");
  assert.equal(target.metadata.monitor_cam_required, true);
});

test("cached and explicitly supplied Challengers badges no longer render on player cards", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = await build({
    stdin: { resolveDir: root, loader: "jsx", contents: `
      import React from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import UserBadges, {userSpecialBadges, specialBadgeTypes} from "./src/components/ui/UserBadges.jsx";
      export {userSpecialBadges, specialBadgeTypes};
      export const render = props => renderToStaticMarkup(<UserBadges showTooltip={false} {...props}/>);
    ` },
    bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
    external: ["react", "react-dom", "react-dom/server", "react-router-dom"],
    alias: { "@": `${root.replaceAll("\\", "/").replace(/\/$/, "")}/src` },
    // The badges are rendered without tooltips; avoid loading browser-only
    // tooltip positioning dependencies in this server-rendered regression.
    plugins: [{ name: "tooltip-boundary", setup(bundle) {
      bundle.onResolve({ filter: /^@\/components\/ui\/BadgeTooltip$/ }, () => ({ path: "tooltip", namespace: "retirement-test" }));
      bundle.onLoad({ filter: /.*/, namespace: "retirement-test" }, () => ({ contents: "export default function Tooltip({children}) { return children; }" }));
    } }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const { render, userSpecialBadges, specialBadgeTypes } = compiled.exports;
  const legacy = { type: "challengers", name: "Challengers" };
  assert.equal(specialBadgeTypes.includes("challengers"), false);
  assert.deepEqual(userSpecialBadges({ badges: [legacy] }), []);
  assert.equal(render({ user: { badges: [legacy] }, badges: [legacy] }), "");
  const output = render({ user: { badges: [legacy, { type: "verified_player" }, { type: "streamer" }], is_premium: true }, badges: [legacy] });
  assert.doesNotMatch(output, /Challengers|challengers/);
  for (const name of ["Verified Player", "Streamer", "Premium"]) assert.match(output, new RegExp(name));
});
