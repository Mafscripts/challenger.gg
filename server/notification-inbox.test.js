import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { applyNotificationChange } from "../src/lib/notificationInbox.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { MemoryRouter } from "react-router-dom";
    import Menu from "./src/components/layout/NavbarNotificationMenu.jsx";
    import Preview from "./src/components/layout/NavbarNotifications.jsx";
    import MessageMenu from "./src/components/layout/NavbarMessageMenu.jsx";
    import NavigationUnreadBadge from "./src/components/layout/NavigationUnreadBadge.jsx";
    export { Menu, Preview, MessageMenu };
    export const html = props => renderToStaticMarkup(<MemoryRouter><Preview {...props}/></MemoryRouter>);
    export const menusHtml = props => renderToStaticMarkup(<MemoryRouter><Menu {...props}/><MessageMenu {...props}/></MemoryRouter>);
    export const badgeHtml = props => renderToStaticMarkup(<NavigationUnreadBadge {...props}/>);
  ` },
  bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
  external: ["react", "react-dom/server", "react-router-dom"],
  alias: { "@": `${root.replaceAll("\\", "/").replace(/\/$/, "")}/src` },
  loader: { ".css": "empty" },
  plugins: [{ name: "message-api-boundary", setup(bundle) {
    bundle.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "notification-test" }));
    bundle.onLoad({ filter: /.*/, namespace: "notification-test" }, () => ({ contents: "export const base44 = {functions: {invoke: async () => ({data: {users: []}})}};" }));
  } }],
});
const compiled = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { Menu, Preview, MessageMenu, html, menusHtml, badgeHtml } = compiled.exports;
const defaults = { notifications: [], unreadCount: 0, formatTime: () => "Now", onRead() {}, onClose() {} };
const children = (node) => [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(children)];

test("hover then click opens notifications once, and leaving the trigger keeps the panel reachable in both layouts", () => {
  for (const sidebar of [false, true]) {
    let open = false;
    const render = () => Menu({ ...defaults, sidebar, open, onToggle: () => { open = !open; } });
    let menu = render();
    menu.props.onMouseEnter?.();
    children(menu).find((node) => node.type === "button").props.onClick();
    menu = render();
    assert.equal(children(menu).find((node) => node.type === "button").props["aria-expanded"], true);
    menu.props.onMouseLeave?.();
    assert.equal(open, true);
    assert.equal(children(menu).filter((node) => node.type?.$$typeof === Symbol.for("react.lazy")).length, 1);
    children(menu).find((node) => node.type === "button").props.onClick();
    assert.equal(open, false);
    assert.equal(children(render()).filter((node) => node.type?.$$typeof === Symbol.for("react.lazy")).length, 0);
  }
});

test("loading and network failures are visible instead of claiming there are no notifications, and retry is actionable", (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const loading = html({ ...defaults, loading: true });
  assert.match(loading, /Loading notifications/);
  assert.doesNotMatch(loading, /You're all caught up/);
  const failed = html({ ...defaults, error: "Could not load notifications." });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /You're all caught up/);
  let attempts = 0;
  const tree = Preview({ ...defaults, error: "Failed", onRetry: () => attempts++ });
  children(tree).find((node) => node.type === "button" && node.props.children === "Try again").props.onClick();
  assert.equal(attempts, 1);
});

test("opening an unread notification marks it read and closes the menu; already-read disputes are still acknowledged", () => {
  for (const notification of [
    { id: "match", type: "match", is_read: false, action_url: "/my-matches" },
    { id: "dispute", type: "dispute", is_read: true, related_entity_id: "match-id" },
  ]) {
    const calls = [];
    const tree = Preview({ ...defaults, notifications: [notification], onRead: (id) => calls.push(id), onClose: () => calls.push("close") });
    const row = children(tree).find((node) => node.props?.className?.includes("nav-notification-row"));
    row.props.onClick();
    assert.deepEqual(calls, [notification.id, "close"]);
    assert.equal(row.props.to, notification.action_url || "/notifications");
  }
});

test("confirmed reads and deletes synchronize bell and page without double-decrementing or changing unrelated notifications", () => {
  const initial = [{ id: "a", is_read: false, related_entity_id: "match" }, { id: "b", is_read: false }];
  const event = { readId: "a", disputeId: "match" };
  const once = applyNotificationChange(initial, event);
  const twice = applyNotificationChange(once, event);
  assert.deepEqual(twice, once);
  assert.equal(twice.filter((row) => !row.is_read).length, 1);
  assert.equal(twice[0].popup_suppressed, true);
  assert.equal(initial[0].is_read, false);
  assert.deepEqual(applyNotificationChange(twice, { removedId: "a" }), [initial[1]]);
  assert.equal(applyNotificationChange(initial, { markAllRead: true }).filter((row) => !row.is_read).length, 0);
  assert.deepEqual(applyNotificationChange(initial, { clearAll: true }), []);
});

test("messages open and stay open by click only in both layouts, and clicking again closes them", () => {
  for (const sidebar of [false, true]) {
    let open = false;
    const render = () => MessageMenu({ ...defaults, sidebar, open, messages: [], onToggle: () => { open = !open; } });
    let menu = render();
    menu.props.onMouseEnter?.();
    assert.equal(open, false);
    children(menu).find((node) => node.type === "button").props.onClick();
    menu = render();
    assert.equal(children(menu).find((node) => node.type === "button").props["aria-expanded"], true);
    menu.props.onMouseLeave?.();
    assert.equal(open, true);
    children(menu).find((node) => node.type === "button").props.onClick();
    assert.equal(open, false);
  }
});

test("notification and message badges show the unread count in topbar and sidebar, clear at zero and cap only the visual count", (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  for (const sidebar of [false, true]) {
    const output = menusHtml({ ...defaults, sidebar, open: false, messages: [], unreadCount: 3 });
    assert.match(output, /aria-label="3 unread notifications"/);
    assert.match(output, /aria-label="3 unread messages"/);
    assert.equal(output.match(/class="navigation-unread-badge"/g).length, 2);
    assert.equal(output.match(new RegExp(`data-inline="${sidebar}"`, "g")).length, 2);
  }
  assert.equal(badgeHtml({ count: 0, label: "unread messages" }), "");
  assert.match(badgeHtml({ count: 127, label: "unread messages" }), /aria-label="127 unread messages">99\+/);
});
