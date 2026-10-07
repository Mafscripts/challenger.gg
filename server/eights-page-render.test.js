import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("App renders actual Free and Money 8s pages with the shared QueryClient provider", async (t) => {
  // Render the real App and RankedEights component. Stub auth, surrounding
  // layout and unrelated pages; this exercises the useQuery call which build
  // and backend tests cannot detect a missing provider for, even when disabled.
  const root = fileURLToPath(new URL("../", import.meta.url));
  const empty = "export default function Empty() { return null; }";
  const stubs = new Map([
    ["@/lib/AuthContext", `export const AuthProvider = ({ children }) => children;
      export const useAuth = () => ({ user: { id: 'test-player', discord_user_id: '200000000000000001', discord_connected_at: '2026-10-07' }, isAuthenticated: true });`],
    ["@/components/layout/PageLayout", "import { Outlet } from 'react-router-dom'; export default Outlet;"],
    ["@/components/ProtectedRoute", "import { Outlet } from 'react-router-dom'; export default Outlet;"],
    ["./components/ScrollToTop", empty],
    ["@/lib/utils", `import { clsx } from 'clsx'; import { twMerge } from 'tailwind-merge';
      export const cn = (...inputs) => twMerge(clsx(inputs)); export const isIframe = false;`],
    ["@/components/competition/FreeEightsDiscord", `export const hasFreeEightsDiscordLink = () => true;
      export const isFreeEightsDiscordRequired = () => false;
      export const ConnectFreeEightsDiscord = () => null;
      export const FreeEightsDiscordDialog = () => null;
      export const FreeEightsDiscordNotice = () => null;`],
    ["@/components/match/CreateLobbyModal", empty],
  ]);
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  const absoluteStubs = new Map([...stubs].map(([source, code]) => [
    `${normalizedRoot}/src/${source.replace(/^@\//, "").replace(/^\.\//, "")}`,
    code,
  ]));
  const server = await createServer({
    root,
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
    server: { middlewareMode: true },
    plugins: [{
      name: "eights-render-fixtures",
      enforce: "pre",
      transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/App.jsx")) {
          return code.replace(/from (['"])react-router-dom\1/g, "from 'eights-test-router'");
        }
      },
      resolveId(source) {
        if (source === "eights-test-router") return "\0eights-test-router";
        if (stubs.has(source)) return `\0eights-test:${source}`;
        const absoluteSource = source.replaceAll("\\", "/").replace(/\.(jsx|js)$/, "");
        if (absoluteStubs.has(absoluteSource)) return `\0eights-test-absolute:${absoluteSource}`;
        if (source.startsWith("@/pages/") && source !== "@/pages/RankedEights") return "\0eights-test-empty";
        if (absoluteSource.startsWith(`${normalizedRoot}/src/pages/`) && !absoluteSource.endsWith("/RankedEights")) return "\0eights-test-empty";
      },
      load(id) {
        if (id === "\0eights-test-router") return `import React from 'react'; import { MemoryRouter } from 'react-router-dom';
          export * from 'react-router-dom';
          export const BrowserRouter = ({ children, future }) => React.createElement(MemoryRouter, { initialEntries: [globalThis.__eightsRenderPath], future }, children);`;
        if (id === "\0eights-test-empty") return empty;
        if (id.startsWith("\0eights-test-absolute:")) return absoluteStubs.get(id.slice("\0eights-test-absolute:".length));
        if (id.startsWith("\0eights-test:")) return stubs.get(id.slice("\0eights-test:".length));
      },
    }],
  });
  t.after(() => server.close());
  const originalPath = globalThis.__eightsRenderPath;
  t.after(() => { if (originalPath === undefined) delete globalThis.__eightsRenderPath; else globalThis.__eightsRenderPath = originalPath; });
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => {
    // Router's layout-effect SSR warning is expected for this render fixture.
    if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args);
  });
  const { default: App } = await server.ssrLoadModule("/src/App.jsx");
  const { default: RankedEights } = await server.ssrLoadModule("/src/pages/RankedEights.jsx");
  const { queryClientInstance } = await server.ssrLoadModule("/src/lib/query-client.js");
  t.after(() => queryClientInstance.clear());
  queryClientInstance.setQueryData(["free-eights-overview", "test-player"], { success: true, lobbies: [], counts: {}, active_lobby: null });
  for (const [path, expected] of [["/ranked/8s", "Free 8s"], ["/ranked/8s?mode=money", "Money 8s"], ["/ranked/8s#matchfinder", "Free 8s"]]) {
    // Prove that the real page exercises the reported crash without the provider.
    assert.throws(() => renderToString(React.createElement(MemoryRouter,
      { initialEntries: [path] }, React.createElement(RankedEights))), /No QueryClient set/);
    globalThis.__eightsRenderPath = path;
    const html = renderToString(React.createElement(App));
    assert.ok(html.includes(expected), `${path} must render its competition page`);
    assert.ok(html.includes("monthly standings") || html.includes("wallet entry fee"));
  }
});
