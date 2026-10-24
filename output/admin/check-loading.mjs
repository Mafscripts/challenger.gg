import { build } from "esbuild";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import express from "express";

const root = process.cwd().replaceAll("\\", "/");
const bundle = await build({
  stdin: {
    resolveDir: root,
    loader: "jsx",
    contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { useAdminConsoleData } from "./src/hooks/useAdminConsoleData.js";

      window.requests = [];
      window.deferredRequests = [];
      window.resolveRequest = (name, data) => {
        const index = window.deferredRequests.findIndex(request => request.name === name);
        if (index < 0) throw new Error("No pending request: " + name);
        window.deferredRequests.splice(index, 1)[0].resolve(data);
      };
      window.rejectRequest = (name, message) => {
        const index = window.deferredRequests.findIndex(request => request.name === name);
        if (index < 0) throw new Error("No pending request: " + name);
        window.deferredRequests.splice(index, 1)[0].reject(new Error(message));
      };
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      function Fixture() {
        const [tab, setTab] = useState(new URLSearchParams(location.search).get("tab") || "users");
        const [options, setOptions] = useState({});
        const [user, setUser] = useState({ id: "staff-review", role: "ceo" });
        const result = useAdminConsoleData(user, tab, {}, options);
        window.adminControls = { setTab, setOptions, setUser };
        window.adminSnapshot = {
          tab,
          rows: result.userDirectory.rows,
          keys: Object.keys(result.data),
          data: result.data,
          sectionLoading: result.sectionLoading,
          sectionError: result.sectionError,
          refreshing: result.refreshing,
        };
        return <main>
          <h1>{tab}</h1>
          <div id="loading">{result.sectionLoading ? "loading" : "ready"}</div>
          <div id="users">{result.userDirectory.rows.map(row => <div key={row.id}>{row.display_name} · {row.available_balance}</div>)}</div>
        </main>;
      }
      createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>);
    `,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  define: { "import.meta.env": "{}" },
  alias: { "@": `${root}/src` },
  plugins: [{
    name: "admin-api-fixture",
    setup(plugin) {
      plugin.onResolve({ filter: /^@\/api\/base44Client$/ }, argument => ({ path: argument.path, namespace: "admin-api-fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "admin-api-fixture" }, () => ({
        loader: "js",
        contents: `
          function request(name, payload) {
            window.requests.push({ name, payload });
            if (name === "syncTournamentLifecycle") return Promise.resolve({data:{success:true,synced:[]}});
            return new Promise((resolve, reject) => window.deferredRequests.push({name,payload,resolve,reject}));
          }
          export const base44 = {
            functions: {invoke: (name, payload) => request(name, payload)},
            entities: new Proxy({}, {get: (_target, entity) => ({filterFresh: (...args) => request(entity + ".filterFresh", args)})}),
          };
        `,
      }));
    },
  }],
});

const app = express();
app.get("/review", (_request, response) => response.type("html").send('<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>'));
app.get("/fixture.js", (_request, response) => response.type("js").send(bundle.outputFiles[0].text));
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const { chromium } = createRequire(import.meta.url)("C:/Users/livao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
let browser;

try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const names = () => page.evaluate(() => window.requests.map(request => request.name));
  const count = async name => (await names()).filter(value => value === name).length;
  const waitRequest = name => page.waitForFunction(name => window.requests?.some(request => request.name === name), name);
  const resolve = (name, data) => page.evaluate(({ name, data }) => window.resolveRequest(name, data), { name, data });
  const open = async tab => {
    await page.goto(`http://127.0.0.1:${server.address().port}/review?tab=${tab}`);
    await page.waitForFunction(() => Boolean(window.adminControls));
  };
  const switchTab = async tab => {
    await page.evaluate(tab => window.adminControls.setTab(tab), tab);
    await page.waitForFunction(tab => window.adminSnapshot.tab === tab, tab);
  };
  const options = async value => {
    await page.evaluate(value => window.adminControls.setOptions(value), value);
    // Flush React state and query observers without relying on a network response.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };

  await open("users");
  await waitRequest("getAdminUsers");
  await resolve("getAdminUsers", { data: { success: true, rows: [{ id: "player-one", display_name: "dev", available_balance: 42 }], total: 1, next_cursor: null } });
  await page.waitForFunction(() => document.getElementById("users").textContent.includes("dev · 42"));
  await page.waitForTimeout(350);
  assert.deepEqual(await names(), ["getAdminUsers"], "User directory must not fetch a hidden dashboard, platform wallets or lifecycle sync");
  assert.equal(await page.locator("#loading").textContent(), "ready");

  await switchTab("marketplace");
  await waitRequest("MarketplaceItem.filterFresh");
  await resolve("MarketplaceItem.filterFresh", [{ id: "item-one", name: "Card" }]);
  await page.waitForFunction(() => !window.adminSnapshot.sectionLoading);
  await switchTab("users");
  await page.waitForTimeout(100);
  assert.equal(await count("getAdminUsers"), 1, "Returning to a fresh directory cache should not repeat its request");
  assert.equal(await count("getAdminDashboard"), 0);

  await options({ overviewOpen: true });
  await waitRequest("getAdminDashboard");
  assert.equal(await page.locator("#loading").textContent(), "ready", "An optional, still-loading overview must not block the user directory");
  await resolve("getAdminDashboard", { data: { success: true, totals: { users: 1 } } });
  await page.waitForFunction(() => Boolean(window.adminSnapshot.data.dashboardOverview));
  await options({});
  await options({ overviewOpen: true });
  assert.equal(await count("getAdminDashboard"), 1, "Reopening a fresh overview should use cached totals");

  await open("tournaments");
  await waitRequest("Tournament.filterFresh");
  await waitRequest("TournamentMatch.filterFresh");
  await waitRequest("MarketplaceItem.filterFresh");
  assert.equal(await count("User.filterFresh"), 0, "Tournament list must not fetch every player before a roster or invite form is opened");
  assert.equal(await count("TournamentParticipant.filterFresh"), 0, "Tournament list must not fetch platform-wide registrations");
  await resolve("Tournament.filterFresh", [{ id: "tournament-one", name: "Season opener" }]);
  await resolve("TournamentMatch.filterFresh", []);
  await resolve("MarketplaceItem.filterFresh", []);
  await page.waitForFunction(() => !window.adminSnapshot.sectionLoading);
  await waitRequest("syncTournamentLifecycle");
  assert.equal(await count("getAdminDashboard"), 0, "Tournament screen must not fetch hidden dashboard totals");

  await options({ tournamentInviteOnly: true });
  await waitRequest("User.filterFresh");
  assert.equal(await count("TournamentParticipant.filterFresh"), 0, "Opening invites alone should not fetch registrations");
  await resolve("User.filterFresh", [{ id: "player-one", display_name: "dev" }]);
  await options({ tournamentRosterId: "tournament-one" });
  await waitRequest("TournamentParticipant.filterFresh");
  const rosterRequest = await page.evaluate(() => window.requests.find(request => request.name === "TournamentParticipant.filterFresh"));
  assert.deepEqual(rosterRequest.payload[0], { tournament_id: "tournament-one" }, "Registrations must be restricted to the selected tournament");
  await resolve("TournamentParticipant.filterFresh", [{ id: "entry-one", tournament_id: "tournament-one", user_id: "player-one" }]);
  await page.waitForFunction(() => window.adminSnapshot.data.tournamentParticipants?.[0]?.id === "entry-one");
  await options({});
  await switchTab("tournamentMatches");
  await switchTab("dashboard");
  await waitRequest("getAdminDashboard");
  await resolve("getAdminDashboard", { data: { success: true, totals: { tournaments: 1 } } });
  await switchTab("tournaments");
  await options({ tournamentRosterId: "tournament-one" });
  await page.waitForTimeout(100);
  assert.equal(await count("TournamentParticipant.filterFresh"), 1, "Reopening the selected roster should use its fresh cache");
  assert.equal(await count("Tournament.filterFresh"), 1);
  assert.equal(await count("User.filterFresh"), 1);
  assert.equal(await count("syncTournamentLifecycle"), 1, "Switching relevant sections should share one lifecycle sync within its 60-second cache");

  await options({ tournamentRosterId: "tournament-two" });
  await page.waitForFunction(() => window.requests.filter(request => request.name === "TournamentParticipant.filterFresh").length === 2);
  const secondRoster = await page.evaluate(() => window.requests.filter(request => request.name === "TournamentParticipant.filterFresh")[1]);
  assert.deepEqual(secondRoster.payload[0], { tournament_id: "tournament-two" });
  assert.ok(!await page.evaluate(() => window.adminSnapshot.data.tournamentParticipants?.some(row => row.tournament_id === "tournament-one")), "Changing roster must not expose another tournament's cached registrations");
  await resolve("TournamentParticipant.filterFresh", []);

  await open("wagers");
  await waitRequest("Wager.filterFresh");
  await page.evaluate(() => window.rejectRequest("Wager.filterFresh", "Temporary request failure"));
  await page.waitForFunction(() => window.adminSnapshot.sectionError === "wagers" && !window.adminSnapshot.sectionLoading);
  assert.equal(await count("getAdminDashboard"), 0, "A failed section must not start unrelated dashboard requests");
  await page.evaluate(() => window.adminControls.setUser({ id: "ordinary-player", role: "user" }));
  await switchTab("users");
  await page.waitForTimeout(100);
  assert.deepEqual(await names(), ["Wager.filterFresh"], "A non-staff session must not fetch privileged admin data");
  assert.deepEqual(await page.evaluate(() => window.adminSnapshot.rows), []);
  assert.deepEqual(pageErrors, []);
  console.log("Admin loading passes: users load with one directory request, hidden overview/wallet reads absent, fresh tabs reuse cache, optional overview does not block, tournament people/registrations load on demand with per-tournament cache, lifecycle sync is shared for 60 seconds, request failures remain visible and non-staff sessions make no admin requests.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
