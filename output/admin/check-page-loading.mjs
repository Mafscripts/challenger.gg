import { build } from "esbuild";
import { createRequire } from "node:module";
import { readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import express from "express";

const root = process.cwd().replaceAll("\\", "/");
const bundle = await build({
  stdin: {
    resolveDir: root,
    loader: "jsx",
    contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { MemoryRouter } from "react-router-dom";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import Admin from "./src/pages/Admin.jsx";
      window.requests = [];
      window.deferredRequests = [];
      window.resolveRequest = (name, data) => {
        const index = window.deferredRequests.findIndex(request => request.name === name);
        if (index < 0) throw new Error("No pending request: " + name);
        window.deferredRequests.splice(index, 1)[0].resolve(data);
      };
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      createRoot(document.getElementById("root")).render(
        <MemoryRouter initialEntries={["/admin?tab=users"]}>
          <QueryClientProvider client={client}><Admin /></QueryClientProvider>
        </MemoryRouter>
      );
    `,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  define: { "import.meta.env": "{}" },
  alias: { "@": `${root}/src` },
  loader: { ".css": "empty", ".png": "dataurl", ".svg": "dataurl", ".webp": "dataurl", ".jpg": "dataurl" },
  plugins: [{
    name: "admin-page-fixture",
    setup(plugin) {
      plugin.onResolve({ filter: /^@\/api\/base44Client$/ }, argument => ({ path: argument.path, namespace: "api-fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "api-fixture" }, () => ({
        loader: "js",
        contents: `
          function request(name, payload) {
            window.requests.push({name,payload});
            if (name === "syncTournamentLifecycle") return Promise.resolve({data:{success:true,synced:[]}});
            return new Promise(resolve => window.deferredRequests.push({name,payload,resolve}));
          }
          export const invalidateApiCache = () => {};
          export const base44 = {
            auth: {me: () => request("auth.me", {}), isAuthenticated: async () => true},
            functions: {invoke: (name, payload) => request(name, payload)},
            entities: new Proxy({}, {get: (_target, entity) => ({
              filterFresh: (...args) => request(entity + ".filterFresh", args),
              filter: (...args) => request(entity + ".filter", args),
              list: (...args) => request(entity + ".list", args),
            })}),
          };
        `,
      }));
      plugin.onResolve({ filter: /^@\/lib\/AuthContext$/ }, argument => ({ path: argument.path, namespace: "auth-fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "auth-fixture" }, () => ({ loader: "js", contents: 'const user={id:"staff-review",display_name:"Reviewer",role:"ceo"}; export const useAuth=()=>({user,isLoadingAuth:false,isAuthenticated:true});' }));
    },
  }],
});

const styles = (await readdir("dist/assets")).filter(name => name.endsWith(".css"));
const app = express();
app.use(express.static("dist"));
app.get("/review", (_request, response) => response.type("html").send(`<!doctype html><html><head>${styles.map(name => `<link rel="stylesheet" href="/assets/${name}">`).join("")}</head><body class="app-style-arena" style="background:#08131e;color:#eef7ff"><div id="root"></div><script src="/fixture.js"></script></body></html>`));
app.get("/fixture.js", (_request, response) => response.type("js").send(bundle.outputFiles[0].text));
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
let browser;

try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const names = () => page.evaluate(() => window.requests.map(request => request.name));
  const count = async name => (await names()).filter(value => value === name).length;
  const waitRequest = (name, total = 1) => page.waitForFunction(({ name, total }) => window.requests?.filter(request => request.name === name).length >= total, { name, total });
  const resolve = (name, data) => page.evaluate(({ name, data }) => window.resolveRequest(name, data), { name, data });
  const nav = page.locator(".admin-console-sidebar");
  const workspace = page.locator("#admin-workspace");
  const usersResponse = { data: { success: true, rows: [{ id: "player-one", display_name: "dev", username: "topfragg-dev", email: "dev@example.test", role: "user", available_balance: 42.25 }], total: 1, next_cursor: null } };
  const tournament = { id: "tournament-one", name: "Season opener", status: "open", registered_teams: 1, max_teams: 8, game: "mw4", game_mode: "Best of 3", game_modes: ["hp", "snd", "overload"], entry_type: "free", team_size: "4v4" };

  await page.goto(`http://127.0.0.1:${server.address().port}/review?tab=users`);
  await waitRequest("getAdminUsers");
  await page.waitForTimeout(350);
  assert.deepEqual(await names(), ["getAdminUsers"], "Opening Users should request only its paginated directory");
  await resolve("getAdminUsers", usersResponse);
  await page.getByRole("table", { name: "Player directory" }).getByText("dev", { exact: true }).waitFor();
  const wallet = page.getByRole("table", { name: "Player directory" }).locator('td[data-label="Wallet"]');
  assert.equal((await wallet.textContent()).trim(), "$42.25", "Balance should display directly from the directory response");
  assert.equal(await count("Wallet.filterFresh"), 0);
  assert.equal(await count("auth.me"), 0, "AuthContext should provide the already-authenticated staff user");

  await page.locator(".admin-overview summary").click();
  await waitRequest("getAdminDashboard");
  assert.ok(await wallet.isVisible(), "An expanded overview awaiting totals must keep the directory visible");
  await resolve("getAdminDashboard", { data: { success: true, players: { total: 52, banned: 0 }, support: { open: 3, match_open: 1 }, matches: { wagers: { active: 0 }, ranked: { active: 0 } }, operations: { tournament_live: 0, tournament_registration: 1, alerts: 0 }, economy: { available: 42.25, pending_withdrawals: 0 } } });
  await page.waitForFunction(() => document.querySelector(".admin-overview").textContent.includes("52"));
  await page.locator(".admin-overview summary").click();
  await nav.getByRole("button", { name: "Tournaments", exact: true }).click();
  await waitRequest("Tournament.filterFresh");
  await waitRequest("TournamentMatch.filterFresh");
  await waitRequest("MarketplaceItem.filterFresh");
  assert.equal(await count("User.filterFresh"), 0);
  assert.equal(await count("TournamentParticipant.filterFresh"), 0);
  await workspace.getByText("Loading Tournaments...", { exact: true }).waitFor();
  await resolve("Tournament.filterFresh", [tournament]);
  await resolve("TournamentMatch.filterFresh", []);
  await resolve("MarketplaceItem.filterFresh", []);
  await workspace.getByRole("heading", { name: "Season opener", exact: true }).waitFor();
  await waitRequest("syncTournamentLifecycle");
  assert.equal(await count("getAdminDashboard"), 1, "Navigating tournament sections must not reload the closed overview");
  await workspace.getByRole("checkbox", { name: "Invite only", exact: true }).check();
  await waitRequest("User.filterFresh");
  assert.equal(await count("TournamentParticipant.filterFresh"), 0, "Opening invites should load people without loading tournament registrations");
  await workspace.getByRole("button", { name: "Manage 1 registered team", exact: true }).click();
  await waitRequest("User.filterFresh");
  await waitRequest("TournamentParticipant.filterFresh");
  await workspace.getByText("Loading registered teams…", { exact: true }).waitFor();
  const rosterRead = await page.evaluate(() => window.requests.find(request => request.name === "TournamentParticipant.filterFresh"));
  assert.deepEqual(rosterRead.payload[0], { tournament_id: "tournament-one" });
  await resolve("TournamentParticipant.filterFresh", [{ id: "entry-one", tournament_id: "tournament-one", team_name: "QA roster", seed: 1, members: ["player-one"] }]);
  await workspace.getByText("Loading registered teams…", { exact: true }).waitFor();
  await resolve("User.filterFresh", [{ id: "player-one", display_name: "dev", username: "topfragg-dev", email: "dev@example.test" }]);
  await workspace.getByText("#1 QA roster", { exact: true }).waitFor();
  assert.equal(await workspace.getByText("dev", { exact: true }).count(), 2, "Roster and invitation selector should display the player's name after their shared lookup");
  await workspace.getByRole("checkbox", { name: "Invite only", exact: true }).uncheck();
  await workspace.getByRole("button", { name: "Hide registered teams", exact: true }).click();
  await workspace.getByRole("button", { name: "Manage 1 registered team", exact: true }).click();
  await workspace.getByText("#1 QA roster", { exact: true }).waitFor();
  assert.equal(await count("TournamentParticipant.filterFresh"), 1, "Reopening the fresh roster should use its cache");
  assert.equal(await count("User.filterFresh"), 1);

  await nav.getByRole("button", { name: "Users", exact: true }).click();
  await page.getByRole("table", { name: "Player directory" }).getByText("dev", { exact: true }).waitFor();
  assert.equal(await count("getAdminUsers"), 1, "Returning to Users within its cache window should not repeat the read");
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await waitRequest("getAdminUsers", 2);
  assert.equal(await count("getAdminDashboard"), 1, "Header refresh should not request a collapsed overview");
  await resolve("getAdminUsers", usersResponse);
  await page.getByRole("button", { name: "Refresh data", exact: true }).waitFor();
  assert.equal(await count("Wallet.filterFresh"), 0);

  await page.getByRole("table", { name: "Player directory" }).getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add Money", exact: true }).waitFor();
  await waitRequest("getAdminUserSecurity");
  await resolve("getAdminUserSecurity", { data: { success: true, ips: [], shared_accounts: [], history: [], incoming_ip_captured: true } });
  await page.getByRole("dialog").getByRole("button", { name: "Add Money", exact: true }).click();
  // The account dialog can still cover the in-page adjustment form.
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
  const adjustmentForm = page.locator("#wallet-adjustment-form");
  await adjustmentForm.getByLabel("Amount", { exact: true }).fill("10");
  await adjustmentForm.getByLabel("Reason", { exact: true }).fill("Browser regression fixture");
  await adjustmentForm.getByRole("button", { name: "Add", exact: true }).click();
  await waitRequest("adminAdjustWallet");
  const adjustment = await page.evaluate(() => window.requests.find(request => request.name === "adminAdjustWallet").payload);
  assert.equal(adjustment.user_id, "player-one");
  assert.equal(adjustment.type, "money");
  assert.equal(adjustment.amount, 10);
  await resolve("adminAdjustWallet", { data: { success: true, wallet: { id: "wallet-one", user_id: "player-one", available_balance: 52.25 }, user: { id: "player-one", wallet_balance: 52.25 } } });
  await waitRequest("getAdminUsers", 3);
  await page.waitForFunction(() => document.querySelector('td[data-label="Wallet"]').textContent.trim() === "$52.25");
  assert.ok(await page.evaluate(() => window.deferredRequests.some(request => request.name === "getAdminUsers")), "The updated wallet must render before the background directory request finishes");
  assert.equal((await wallet.textContent()).trim(), "$52.25", "Wallet response must patch the directory's available_balance immediately");
  assert.equal(await count("Wallet.filterFresh"), 0);
  assert.deepEqual(errors, []);
  console.log("Full Admin page passes: Users opens with one directory read and correct balance; overview totals load only after expansion; tournaments render before people/rosters load; invite selector and roster share an on-demand player read; roster loading, selected filter and names are correct; tabs reuse cache and header refresh stays scoped; balance adjustment displays immediately while its background directory refresh is pending. No browser errors.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
