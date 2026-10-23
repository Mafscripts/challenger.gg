import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { MemoryRouter } from "react-router-dom";
    import Navbar from "./src/components/layout/Navbar.jsx";
    import { setState } from "@/lib/AuthContext";
    export function firstPaint(state) { setState(state); return renderToStaticMarkup(<MemoryRouter initialEntries={["/ranked"]}><Navbar /></MemoryRouter>); }
  ` },
  bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
  external: ["react", "react-dom/server", "react-router-dom"], define: { "import.meta.env": "{}" },
  alias: { "@": `${root.replaceAll("\\", "/").replace(/\/$/, "")}/src` }, loader: { ".css": "empty" },
  plugins: [{ name: "navbar-session-boundaries", setup(build) {
    build.onResolve({ filter: /^@\/lib\/AuthContext$/ }, () => ({ path: "auth", namespace: "navbar-test" }));
    build.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "navbar-test" }));
    build.onResolve({ filter: /^(\.\/NavigationLayoutProvider|@\/components\/layout\/NavigationLayoutProvider)$/ }, () => ({ path: "layout", namespace: "navbar-test" }));
    build.onLoad({ filter: /.*/, namespace: "navbar-test" }, ({ path }) => ({ contents: path === "auth"
      ? "let state; export const setState = value => {state=value}; export const useAuth = () => state;"
      : path === "layout" ? "export const useNavigationLayout = () => ({layout:'topbar'});"
        : "export const base44 = {functions:{invoke(){throw new Error('First paint must not request data')}}};" }));
  } }],
});
const compiled = { exports: {} };
new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const render = (t, state) => {
  const original = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) original(...args); });
  return compiled.exports.firstPaint(state);
};

test("the first navbar render already shows the verified player, before header effects run", t => {
  const html = render(t, { user: { id: "player", username: "ArenaPlayer", role: "user" }, isAuthenticated: true, authChecked: true, isLoadingAuth: false });
  assert.match(html, /Open account menu for ArenaPlayer/);
  assert.doesNotMatch(html, /href="\/(register|login)"/);
});

test("Login and Register stay hidden while the initial session is being checked", t => {
  const html = render(t, { user: null, isAuthenticated: false, authChecked: false, isLoadingAuth: true });
  assert.doesNotMatch(html, /href="\/(register|login)"/);
});

test("confirmed visitors can still log in and register", t => {
  const html = render(t, { user: null, isAuthenticated: false, authChecked: true, isLoadingAuth: false });
  assert.match(html, /href="\/register"/);
  assert.match(html, /href="\/login"/);
});
