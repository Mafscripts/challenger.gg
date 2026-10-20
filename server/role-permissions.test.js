import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { prisma } from "./prisma.js";
import { ensureUserRecords } from "./auth.js";
import functionRoutes from "./routes/functions.js";
import entityRoutes from "./routes/entities.js";
import { canManageRoles } from "../src/lib/roles.js";

const handler = functionRoutes.stack.find(layer => layer.route?.path === "/:name").route.stack.at(-1).handle;
const invoke = (user, body) => new Promise((resolve, reject) => {
  void handler({ params: { name: "updateUserRole" }, user, body }, { json: resolve }, reject);
});
function fixture(t) {
  let target = { id: "target", username: "player", display_name: "Player", role: "user", admin_role: null, is_admin: false, metadata: { badges: [{ type: "streamer", name: "Streamer" }] } };
  const writes = [], audit = [];
  const replace = (object, key, value) => { const original = object[key]; object[key] = value; t.after(() => { object[key] = original; }); };
  replace(prisma.user, "findUnique", async () => structuredClone(target));
  replace(prisma.user, "update", async ({ data }) => { writes.push(data); target = { ...target, ...data }; return structuredClone(target); });
  replace(prisma.adminAction, "create", async ({ data }) => { audit.push(data); return data; });
  return { writes, audit, replace, target: () => target };
}

test("only the private CEO role can manage roles in the UI", () => {
  for (const role of ["user", "moderator", "admin", "super_admin"]) assert.equal(canManageRoles(role), false);
  assert.equal(canManageRoles("ceo"), true);
});

test("admins, super admins and forged request fields cannot assign, remove or grant any role", async t => {
  const f = fixture(t);
  for (const user of [
    { id: "actor", role: "admin", admin_role: "admin", is_admin: true },
    { id: "actor", role: "super_admin", admin_role: "super_admin", is_admin: true },
    { id: "actor", role: "moderator" },
    { id: "actor", role: "user", is_admin: true },
  ]) {
    for (const role of ["user", "moderator", "admin", "super_admin", "ceo"]) {
      await assert.rejects(invoke(user, { user_id: "target", role, actor_role: "ceo", admin_role: "ceo" }), { status: 403 });
    }
  }
  assert.equal(f.writes.length, 0); assert.equal(f.audit.length, 0);
});

test("the CEO can appoint and remove an Admin through the protected action", async t => {
  const f = fixture(t);
  const owner = { id: "owner", role: "ceo", username: "Owner" };
  const granted = await invoke(owner, { user_id: "target", role: "admin" });
  assert.equal(granted.success, true); assert.equal(f.target().role, "admin");
  assert.equal(f.target().admin_role, "admin"); assert.equal(f.target().is_admin, true);
  assert.ok(f.target().metadata.badges.some(badge => badge.type === "streamer"));
  const removed = await invoke(owner, { user_id: "target", role: "user" });
  assert.equal(removed.success, true); assert.equal(f.target().role, "user");
  assert.equal(f.target().admin_role, null); assert.equal(f.target().is_admin, false);
  assert.equal(f.audit.length, 2);
});

test("role changes retain hierarchy checks and reject unknown role names", async t => {
  const f = fixture(t);
  const invalid = await invoke({ id: "owner", role: "ceo" }, { user_id: "target", role: "__proto__" });
  assert.equal(invalid.success, false); assert.equal(f.writes.length, 0);
  // The existing actor/target hierarchy checks still run after authorization.
  const denied = await invoke({ id: "owner", role: "user", admin_role: "ceo" }, { user_id: "target", role: "admin" });
  assert.equal(denied.success, false); assert.match(denied.error, /hierarchy/);
  assert.equal(f.writes.length, 0);
});

test("generic User patches cannot change roles directly or through nested metadata", () => {
  const guard = entityRoutes.stack.find(layer => !layer.route).handle;
  for (const field of ["role", "admin_role", "is_admin"]) for (const body of [{ [field]: "ceo" }, { metadata: { [field]: "ceo" } }]) {
    let status;
    guard({ params: { entity: "User" }, method: "PATCH", body }, { status: code => { status = code; return { json: () => {} }; } }, () => assert.fail("Role edit must be rejected"));
    assert.equal(status, 403);
  }
});

test("bootstrap does not make an ordinary account CEO even when it is the only account", async t => {
  const f = fixture(t);
  const current = { ...f.target(), handle: "player", account_created_date: new Date("2026-10-19"), email_verified: true };
  f.replace(prisma.user, "findUnique", async () => structuredClone(current));
  f.replace(prisma, "$transaction", async callback => callback({ user: prisma.user, $executeRaw: async () => 1 }));
  for (const table of ["wallet", "playerProfile", "rankedStats", "xPStats"]) {
    f.replace(prisma[table], "findMany", async () => [{ id: table, metadata: { user_id: "target" } }]);
    f.replace(prisma[table], "findUnique", async () => null);
  }
  const result = await ensureUserRecords(current, { role: "ceo", admin_role: "ceo" });
  assert.equal(result.user.role, "user"); assert.equal(result.user.admin_role, null);
  assert.equal(result.user.is_admin, false);
});

test("non-CEO role management renders no account list or role controls", async () => {
  const root = process.cwd().replaceAll("\\", "/");
  const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import RoleManagement from './src/components/admin/RoleManagement.jsx';
    const directory={rows:[{id:'player',username:'Player',role:'user'}],total:1};
    export const render = role => renderToStaticMarkup(<RoleManagement actorRole={role} directory={directory} search=""/>);
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"], external: ["react", "react-dom/server"], alias: { "@": `${root}/src` }, loader: { ".css": "empty" }, plugins: [{ name: "role-ui-api", setup(plugin) {
    plugin.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "role-ui-api" }));
    plugin.onLoad({ filter: /.*/, namespace: "role-ui-api" }, () => ({ contents: "export const base44={};", loader: "js" }));
  } }] });
  const mod = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  for (const role of ["admin", "super_admin", "moderator"]) {
    const html = mod.exports.render(role);
    assert.match(html, /restricted to the platform owner/); assert.doesNotMatch(html, /<select|Save role|<table/);
  }
  assert.match(mod.exports.render("ceo"), /Save role for Player/);
});
