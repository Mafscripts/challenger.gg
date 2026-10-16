import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import { navigationLayoutKey, preferredNavigationLayout } from "../src/lib/navigationLayout.js";

test("navigation defaults to topbar, stays scoped to each account and respects the saved account preference", () => {
  const values = new Map([[navigationLayoutKey("a"), "sidebar"]]);
  const storage = { getItem: (key) => values.get(key) };
  assert.equal(preferredNavigationLayout({ id: "a" }, storage), "sidebar");
  assert.equal(preferredNavigationLayout({ id: "b" }, storage), "topbar");
  assert.equal(preferredNavigationLayout(null, storage), "topbar");
  assert.equal(preferredNavigationLayout({ id: "a", navigation_layout: "topbar" }, storage), "topbar");
  assert.equal(preferredNavigationLayout({ id: "a", navigation_layout: "invalid" }, storage), "sidebar");
  assert.equal(preferredNavigationLayout({ id: "a" }, { getItem: () => { throw new Error("Storage blocked"); } }), "topbar");
});

test("players can persist either navigation layout without changing identity, privileges or other account settings", async (t) => {
  let user = { id: "player", username: "Player", role: "user", email_verified: true, metadata: { activision_id: "Player#123", allow_team_credit_payments: true } };
  let writes = 0;
  const override = (target, name, fn) => { const original = target[name]; target[name] = fn; t.after(() => { target[name] = original; }); };
  override(prisma.user, "findUnique", async ({ where }) => where.id === user.id ? structuredClone(user) : null);
  override(prisma.user, "update", async ({ where, data }) => { assert.equal(where.id, "player"); writes++; user = { ...user, ...structuredClone(data) }; return structuredClone(user); });
  override(prisma.ban, "findMany", async () => []);
  const app = express(); app.use(express.json()); app.use("/auth", authRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/auth/me`;
  const request = (body, token = signUser(user)) => fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  for (const layout of ["sidebar", "topbar"]) {
    const response = await request({ navigation_layout: layout });
    assert.equal(response.status, 200); assert.equal((await response.json()).navigation_layout, layout);
    assert.equal(user.metadata.activision_id, "Player#123"); assert.equal(user.metadata.allow_team_credit_payments, true);
    assert.equal(user.role, "user");
    const saved = await fetch(url, { headers: { Authorization: `Bearer ${signUser(user)}` } });
    assert.equal((await saved.json()).navigation_layout, layout);
  }
  const before = structuredClone(user), previousWrites = writes;
  for (const layout of [null, "", "invalid", [], {}, true]) assert.equal((await request({ navigation_layout: layout })).status, 400);
  assert.equal((await request({ navigation_layout: "sidebar", user_id: "other" })).status, 403);
  assert.equal((await request({ navigation_layout: "sidebar", role: "admin" })).status, 403);
  assert.equal((await request({ navigation_layout: "sidebar" }, "invalid-token")).status, 401);
  assert.deepEqual(user, before); assert.equal(writes, previousWrites);
});

test("real layout controls render both choices, preserve Free/Money 8s navigation and show staff links only to staff", async (t) => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const output = await build({
    stdin: { resolveDir: root, loader: "jsx", contents: `
      import React from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      import { MemoryRouter } from "react-router-dom";
      import { setTestUser } from "@/lib/AuthContext";
      import { NavigationLayoutProvider } from "./src/components/layout/NavigationLayoutProvider.jsx";
      import NavigationLayoutSection from "./src/components/settings/NavigationLayoutSection.jsx";
      import Sidebar from "./src/components/layout/Sidebar.jsx";
      export function render(user, route) {
        setTestUser(user);
        return renderToStaticMarkup(<MemoryRouter initialEntries={[route]}><NavigationLayoutProvider><Sidebar /><NavigationLayoutSection /></NavigationLayoutProvider></MemoryRouter>);
      }
    ` },
    bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
    external: ["react", "react-dom/server", "react-router-dom"],
    alias: { "@": `${root.replaceAll("\\", "/").replace(/\/$/, "")}/src` },
    plugins: [{ name: "navigation-test-boundaries", setup(bundle) {
      bundle.onResolve({ filter: /^@\/lib\/AuthContext$/ }, () => ({ path: "auth", namespace: "navigation-test" }));
      bundle.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "navigation-test" }));
      bundle.onResolve({ filter: /^@\/components\/ui\/use-toast$/ }, () => ({ path: "toast", namespace: "navigation-test" }));
      bundle.onLoad({ filter: /.*/, namespace: "navigation-test" }, ({ path }) => ({ contents: path === "auth"
        ? "let user; export const setTestUser = value => { user = value; }; export const useAuth = () => ({user, completeAuth() {}});"
        : path === "api" ? "export const base44 = {auth: {updateMe() { throw new Error('Rendering must not save settings'); }}};"
          : "export const toast = () => {};" }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const html = module.exports.render({ id: "player", role: "user", navigation_layout: "sidebar" }, "/ranked/8s?mode=money");
  assert.match(html, /<input(?=[^>]*value="sidebar")(?=[^>]*checked="")/);
  assert.match(html, /aria-label="Use topbar navigation"/);
  assert.match(html, /<a(?=[^>]*href="\/ranked\/8s\?mode=money")(?=[^>]*aria-current="page")/);
  assert.doesNotMatch(html, /<a(?=[^>]*href="\/ranked\/8s")(?=[^>]*aria-current="page")/);
  assert.doesNotMatch(html, /Admin Panel/);
  assert.match(html, /<input(?=[^>]*name="navigation-layout")(?=[^>]*value="topbar")/);
  const admin = module.exports.render({ id: "admin", role: "admin", navigation_layout: "topbar" }, "/leaderboards?tab=wagers");
  assert.match(admin, /Admin Panel/);
  assert.match(admin, /aria-label="Use sidebar navigation"/);
  assert.match(admin, /<input(?=[^>]*value="topbar")(?=[^>]*checked="")/);
  assert.doesNotMatch(admin, /<a(?=[^>]*href="\/leaderboards")(?=[^>]*aria-current="page")/);
});
