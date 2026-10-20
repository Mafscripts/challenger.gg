import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { prisma } from "./prisma.js";
import { createUserWithPassword, ensureUserRecords, updateUserIdentity, validateDisplayName, validateUsername } from "./auth.js";
import { getPublicRoleConfig, getRoleConfig, hasRolePower, publicRoleBadges, publicStaffPresentation } from "../src/lib/roles.js";
import { hasRole } from "./roles.js";
import entityRoutes from "./routes/entities.js";
import functionRoutes from "./routes/functions.js";

function fixture(t, initial = []) {
  const users = new Map(initial.map(user => [user.id, { role: "user", credits: 10, metadata: {}, ...user }]));
  const credits = [], locks = [], pending = new Map();
  const replace = (target, key, value) => { const original = target[key]; target[key] = value; t.after(() => { target[key] = original; }); };
  replace(prisma.user, "findFirst", async ({ where }) => [...users.values()].find(user => {
    if (where.id?.not === user.id) return false;
    if (where.OR) return where.OR.some(condition => Object.entries(condition).some(([field, value]) => String(user[field] || "").toLowerCase() === value.equals));
    return Object.entries(where).every(([field, value]) => user[field] === value);
  }) || null);
  replace(prisma.user, "findUnique", async ({ where }) => structuredClone(where.id ? users.get(where.id) || null : [...users.values()].find(user => user.email === where.email) || null));
  replace(prisma.user, "count", async () => users.size);
  replace(prisma.user, "create", async ({ data }) => { const row = { ...data, id: `user-${users.size + 1}`, metadata: {}, credits: 0 }; users.set(row.id, row); return structuredClone(row); });
  replace(prisma.user, "update", async ({ where, data }) => {
    const row = users.get(where.id), update = structuredClone(data);
    if (update.credits?.decrement) update.credits = row.credits - update.credits.decrement;
    const next = { ...row, ...update }; users.set(where.id, next); return structuredClone(next);
  });
  for (const table of ["playerProfile", "rankedStats", "xPStats"]) replace(prisma[table], "findMany", async () => []);
  replace(prisma.creditTransaction, "create", async ({ data }) => { credits.push(data); return data; });
  replace(prisma, "$transaction", async callback => {
    const releases = [], acquired = new Set();
    const tx = { user: prisma.user, $executeRaw: async (_query, key) => {
      if (acquired.has(key)) return 1;
      locks.push(key); acquired.add(key);
      const previous = pending.get(key) || Promise.resolve();
      let release;
      const next = new Promise(resolve => { release = resolve; });
      pending.set(key, next); await previous; releases.push(release); return 1;
    } };
    try { return await callback(tx); } finally { releases.reverse().forEach(release => release()); }
  });
  return { users, credits, locks };
}
const registration = (username, display_name = username) => ({ username, display_name, email: `${username}@example.com`, password: "valid-password-123" });

test("account names allow only ASCII letters, numbers, underscores and hyphens", () => {
  assert.equal(validateUsername(" Player-One_2 "), "player-one_2");
  assert.equal(validateDisplayName(" Player-One_2 "), "Player-One_2");
  for (const value of ["bad?name", "bad name", "bad.name", "bad/name", "éclair", "name😀", "name\u200b", {}, "bad#name"]) {
    assert.throws(() => validateUsername(value), { status: 400 });
    assert.throws(() => validateDisplayName(value), { status: 400 });
  }
  assert.throws(() => validateUsername("a".repeat(21)), { status: 400 });
  assert.throws(() => validateDisplayName("a".repeat(61)), { status: 400 });
});

test("signup checks display names, usernames and legacy aliases without case distinctions", async t => {
  const f = fixture(t, [{ id: "existing", username: "Alpha", display_name: "Bravo", handle: "Charlie", full_name: "Delta" }]);
  for (const name of ["ALPHA", "bravo", "CHARLIE", "delta"]) {
    await assert.rejects(createUserWithPassword(registration(name, "FreshName")), { status: 409 });
    await assert.rejects(createUserWithPassword(registration("fresh-name", name)), { status: 409 });
  }
  assert.equal(f.users.size, 1);
  const user = await createUserWithPassword(registration("fresh-name", "Fresh-Name"));
  assert.equal(user.role, "user"); assert.equal(user.display_name, "Fresh-Name");
});

test("simultaneous registrations cannot claim the same public name", async t => {
  const f = fixture(t);
  const results = await Promise.allSettled([
    createUserWithPassword(registration("first-player", "SharedName")),
    createUserWithPassword(registration("second-player", "sharedname")),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
  assert.equal(f.users.size, 1);
  assert.equal(f.locks.filter(key => key === "account-name:sharedname").length, 2);
});

test("renaming rejects duplicate display names before charging, and unchanged saves do not charge", async t => {
  const f = fixture(t, [{ id: "a", username: "player-one", display_name: "PlayerOne" }, { id: "b", username: "player-two", display_name: "PlayerTwo" }]);
  await assert.rejects(updateUserIdentity("a", { username: "new-handle", display_name: "PLAYERTWO" }, { role: "user" }), { status: 409 });
  assert.equal(f.users.get("a").credits, 10); assert.equal(f.credits.length, 0);
  await updateUserIdentity("a", { username: "player-one", display_name: "PlayerOne" }, { role: "user" });
  assert.equal(f.credits.length, 0);
  await updateUserIdentity("a", { username: "new-handle", display_name: "NewName" }, { role: "user" });
  assert.equal(f.users.get("a").credits, 5); assert.equal(f.credits.length, 1);
  await assert.rejects(updateUserIdentity("b", { display_name: "NEW-HANDLE" }, { role: "user" }), { status: 409 });
});

test("bootstrap cannot bypass the protected rename path", async t => {
  const f = fixture(t, [{ id: "a", username: "old-name", handle: "old-name", display_name: "OldName" }]);
  await assert.rejects(ensureUserRecords({ id: "a" }, { username: "bypass-name" }), { status: 400 });
  await assert.rejects(ensureUserRecords({ id: "a" }, { display_name: "bypass-name" }), { status: 400 });
  assert.equal(f.users.get("a").username, "old-name");
});

test("the legacy display-name action uses the same restrictions", async t => {
  const f = fixture(t, [{ id: "a", username: "player-one", display_name: "PlayerOne" }, { id: "b", username: "player-two", display_name: "PlayerTwo" }]);
  const handler = functionRoutes.stack.find(layer => layer.route?.path === "/:name").route.stack.at(-1).handle;
  const invoke = name => new Promise((resolve, reject) => {
    void handler({ params: { name: "changeDisplayName" }, body: { display_name: name }, user: f.users.get("a") }, { json: resolve }, reject);
  });
  await assert.rejects(invoke("bad?name"), { status: 400 });
  await assert.rejects(invoke("PLAYERTWO"), { status: 409 });
  assert.equal(f.users.get("a").display_name, "PlayerOne");
  assert.equal((await invoke("New-Name")).user.display_name, "New-Name");
});

test("generic account patches cannot bypass identity validation via direct fields or metadata", async () => {
  const handler = entityRoutes.stack.find(layer => !layer.route).handle;
  for (const entity of ["User", "user"]) for (const field of ["username", "handle", "display_name", "full_name"]) {
    for (const body of [{ [field]: "Spoof?" }, { metadata: { [field]: "Spoof?" } }]) {
      let status;
      handler({ params: { entity }, method: "PATCH", body }, { status: value => { status = value; return { json: () => {} }; } }, () => assert.fail("Identity edits must use the protected action"));
      assert.equal(status, 403);
    }
  }
});

test("public Admin presentation leaves private CEO authority intact and preserves dates", () => {
  assert.deepEqual(getPublicRoleConfig("ceo"), getPublicRoleConfig("admin"));
  assert.equal(getRoleConfig("ceo").label, "CEO");
  assert.ok(hasRolePower("ceo", "ceo")); assert.ok(!hasRolePower("admin", "ceo"));
  assert.ok(hasRole({ role: "ceo" }, "ceo")); assert.ok(!hasRole({ role: "admin" }, "ceo"));
  const original = { role: "ceo", admin_role: "ceo", created_date: new Date("2026-10-19"), badges: [{ type: "ceo", name: "CEO" }, { type: "admin", name: "Admin" }], messages: [{ sender_role: "ceo", content: "Hello" }] };
  const view = publicStaffPresentation(original);
  assert.equal(view.role, "admin"); assert.equal(view.messages[0].sender_role, "admin");
  assert.equal(view.created_date.toISOString(), original.created_date.toISOString());
  assert.equal(original.role, "ceo"); assert.deepEqual(publicRoleBadges(original.badges), [{ type: "admin", name: "Admin" }]);
});

test("CEO badges and actual match chat render identically to Admin while private role management retains CEO", async t => {
  const root = process.cwd().replaceAll("\\", "/");
  const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import RoleBadge from './src/components/ui/RoleBadge.jsx';
    import {MemoryRouter} from 'react-router-dom';
    import MatchChat from './src/components/match/MatchChat.jsx';
    export const render = (role, internal=false) => renderToStaticMarkup(<RoleBadge role={role} internal={internal}/>);
    export const renderChat = role => renderToStaticMarkup(<MemoryRouter><MatchChat messages={[{id:'message', sender_id:'staff', sender_name:'liv', sender_role:role, content:'Reviewing the match.', created_date:'2026-10-19T12:00:00Z'}]} onSendMessage={()=>{}}/></MemoryRouter>);
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"], external: ["react", "react-dom/server", "react-router-dom"], alias: { "@": `${root}/src` }, loader: { ".css": "empty" }, plugins: [{
    name: "identity-ui-fixture", setup(plugin) {
      plugin.onResolve({ filter: /^@\/(api\/base44Client|lib\/AuthContext)$/ }, args => ({ path: args.path, namespace: "identity-ui-fixture" }));
      plugin.onLoad({ filter: /.*/, namespace: "identity-ui-fixture" }, args => ({ contents: args.path.includes("AuthContext") ? "export const useAuth = () => ({user:null});" : "export const base44 = {};", loader: "js" }));
    },
  }] });
  const mod = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  assert.equal(mod.exports.render("ceo"), mod.exports.render("admin"));
  assert.match(mod.exports.render("ceo", true), /CEO/);
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const chat = mod.exports.renderChat("ceo");
  assert.equal(chat, mod.exports.renderChat("admin"));
  assert.match(chat, /Admin message from liv/); assert.doesNotMatch(chat, /CEO/);
});
