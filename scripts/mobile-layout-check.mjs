// Read-only responsive checks against the local Vite server, using fake accounts.
// Usage: node scripts/mobile-layout-check.mjs <path-to-playwright/index.mjs> [output-folder] [--quick]
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { desktopExample, installDesktopFixtures } from "./free-eights-desktop-fixtures.mjs";

const { chromium } = await import(process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])).href : "playwright");
const output = path.resolve(process.argv[3] || "tmp/mobile-audit");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [], errors = [];
const quick = process.argv.includes("--quick");
const quickWidth = Number(process.argv.find(value => value.startsWith("--width="))?.slice(8) || 390);
try {
  const viewports = quick ? [{ width: quickWidth, height: quickWidth <= 320 ? 568 : 844 }] : [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 768, hasTouch: viewport.width < 768 });
    const state = desktopExample();
    state.origin = "http://127.0.0.1:5180";
    Object.assign(state.user, { role: "ceo", is_admin: true });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.hostname === "127.0.0.1" || url.pathname.startsWith("/api/") ? route.continue() : route.abort();
    });
    await installDesktopFixtures(context, state);
    if (viewport.width < 768) await context.addInitScript(() => { window.CapacitorCustomPlatform = { name: "ios" }; });
    const message = { id: "example-message", message_type: "direct_message", sender_id: state.users[1].id, sender_name: "Luna", recipient_id: state.user.id, recipient_name: state.user.display_name, content: "A test message with a long link: https://example.invalid/" + "long".repeat(30), is_read: false, created_date: new Date().toISOString() };
    const notification = { id: "example-notification", type: "system", title: "Mobile test notification", message: "Open your inbox to see your latest messages.", created_date: new Date().toISOString(), is_read: false };
    await context.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      let data;
      if (url.pathname.endsWith("/public/home-overview")) data = { stats: {}, tournaments: [], ladder: [], matches: [] };
      else if (url.pathname.endsWith("/community/blocked")) data = { user_ids: [] };
      else if (url.pathname.endsWith("/functions/getDirectMessages")) data = { success: true, messages: [message], users: state.users.map(user => ({ ...user, name: user.display_name })) };
      else if (url.pathname.endsWith("/functions/searchMessageRecipients")) {
        const requested = route.request().postDataJSON()?.recipient_id;
        data = { success: true, users: state.users.filter(user => requested ? user.id === requested : user.id !== state.user.id).map(user => ({ ...user, name: user.display_name })) };
      }
      else if (url.pathname.endsWith("/entities/Message")) data = url.searchParams.get("filter")?.includes("tournament_invitation") ? [] : [message];
      else if (url.pathname.endsWith("/entities/Notification")) data = [notification];
      else return route.fallback();
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push({ width: viewport.width, url: page.url(), message: error.message, stack: error.stack }));
    const inspect = async (name, selectors = []) => {
      await page.waitForTimeout(350);
      const measurement = await page.evaluate(selectors => {
        const rect = element => { const r = element.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; };
        const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden";
        const inHorizontalScroller = element => {
          for (let parent = element.parentElement; parent && parent.tagName !== "MAIN"; parent = parent.parentElement) {
            if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth) return true;
          }
          return false;
        };
        return { viewport: { width: innerWidth, height: window.visualViewport?.height || innerHeight }, documentWidth: document.documentElement.scrollWidth,
          dialogOverflow: [...document.querySelectorAll(".arena-dialog")].filter(visible).filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ width: el.clientWidth, contentWidth: el.scrollWidth })),
          elements: Object.fromEntries(selectors.map(selector => { const el = document.querySelector(selector); return [selector, el && visible(el) ? rect(el) : null]; })),
          overflow: [...document.querySelectorAll("main a,main button,main input,main textarea,main h1,main h2,main [role=dialog]")].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return (r.x < -1 || r.right > innerWidth + 1) && !inHorizontalScroller(el); }).slice(0, 8).map(el => ({ tag: el.tagName, text: el.textContent?.trim().slice(0, 60), ...rect(el) })) };
      }, selectors);
      results.push({ name, width: viewport.width, ...measurement });
      if (selectors.length || measurement.overflow.length) await page.screenshot({ path: path.join(output, `${viewport.width}-${name.replaceAll(/[^a-z0-9-]/gi, "-")}.png`), fullPage: false });
    };
    for (const route of quick ? ["/messages"] : ["/", "/dashboard", "/ranked", "/ranked/8s", "/xp", "/wagers", "/tournaments", "/settings", "/messages", "/my-matches", "/teams", "/admin"]) {
      await page.goto(state.origin + route, { waitUntil: "networkidle", timeout: 30_000 });
      await inspect(route, route === "/messages" ? [".messages-workspace", ".native-tab-bar"] : []);
    }
    await page.goto(state.origin + "/messages?conversation=" + state.users[1].id, { waitUntil: "networkidle" });
    await inspect("message-thread", [".messages-workspace", ".messages-composer", ".native-tab-bar"]);
    await page.getByRole("button", { name: "Report or block player" }).click();
    await page.getByRole("button", { name: "Send report", exact: true }).waitFor({ state: "visible" });
    await inspect("conversation-safety", ["[role=dialog]"]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open emoji picker" }).click();
    await inspect("emoji-picker", [".chat-emoji-popover"]);
    await page.keyboard.press("Escape");
    if (viewport.width < 768) {
      await page.getByRole("textbox", { name: /^Message / }).focus();
      await page.setViewportSize({ width: viewport.width, height: Math.min(450, viewport.height) });
      await inspect("message-keyboard-height", [".messages-workspace", ".messages-composer", ".native-tab-bar"]);
      await page.setViewportSize(viewport);
      // Model iOS's other keyboard mode: only visualViewport shrinks.
      await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 400 });
        window.visualViewport.dispatchEvent(new Event("resize"));
      });
      await inspect("message-visual-keyboard", [".messages-workspace", ".messages-composer", ".native-tab-bar"]);
      await page.getByRole("button", { name: "Open emoji picker" }).click();
      await inspect("emoji-visual-keyboard", [".chat-emoji-popover"]);
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--app-safe-area-top", "54px");
        document.documentElement.style.setProperty("--app-safe-area-bottom", "34px");
        window.dispatchEvent(new Event("resize"));
      });
      await inspect("emoji-safe-area", [".chat-emoji-popover"]);
      await page.evaluate(() => {
        document.documentElement.style.removeProperty("--app-safe-area-top");
        document.documentElement.style.removeProperty("--app-safe-area-bottom");
      });
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        delete window.visualViewport.height;
        window.visualViewport.dispatchEvent(new Event("resize"));
      });
    }
    await page.getByRole("button", { name: "New message", exact: true }).click();
    await page.getByRole("textbox", { name: "Search players by username or display name" }).fill("Tutorial");
    await inspect("recipient-search", [".messages-recipient-dialog"]);
    await page.keyboard.press("Escape");
    await page.goto(state.origin + "/settings#settings-delete-account", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Delete my account", exact: true }).click();
    await inspect("account-deletion-confirmation", ["[role=alertdialog]"]);
    if (await page.getByRole("button", { name: "Permanently delete", exact: true }).isEnabled()) throw new Error("Account deletion must require confirmation and password.");
    await page.getByRole("button", { name: "Keep account", exact: true }).click();
    await page.goto(state.origin + "/dashboard", { waitUntil: "networkidle" });
    for (const [label, selector] of [["Open messages", "#nav-messages-preview"], ["Open notifications", "#nav-notifications-preview"], ["Open account menu for", "#nav-account-menu"]]) {
      await page.getByRole("button", { name: new RegExp(label) }).click();
      await inspect(label, [selector, ".app-topbar", ".native-tab-bar"]);
      await page.keyboard.press("Escape");
    }
    console.log(`Checked ${viewport.width}px: pages, messages, dialogs and menus.`);
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify({ results, errors }, null, 2));
  const overflows = results.filter(row => row.documentWidth > row.viewport.width || row.overflow.length || row.dialogOverflow.length).map(({name,width,overflow,dialogOverflow}) => ({name,width,overflow,dialogOverflow}));
  const clipped = results.flatMap(row => Object.entries(row.elements).flatMap(([selector, rect]) => {
    if (!rect || selector === ".native-tab-bar" || selector === ".app-topbar" || selector === ".messages-workspace") return [];
    const bottom = row.elements[".native-tab-bar"]?.y ?? row.viewport.height;
    const top = row.name === "emoji-safe-area" ? 54 : 0;
    const safeBottom = row.name === "emoji-safe-area" ? bottom - 34 : bottom;
    return rect.x < -1 || rect.right > row.viewport.width + 1 || rect.y < top - 1 || rect.bottom > safeBottom + 1 ? [{name:row.name,width:row.width,selector,rect,bottom:safeBottom}] : [];
  }));
  console.log(JSON.stringify({ checks: results.length, overflows, clipped, errors }, null, 2));
  if (overflows.length || clipped.length || errors.length) process.exitCode = 1;
}
