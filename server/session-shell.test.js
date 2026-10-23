import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await build({
  stdin: { resolveDir: root, loader: "jsx", contents: `
    import Layout from "./src/components/layout/PageLayout.jsx";
    import { setState } from "@/lib/AuthContext";
    export function view(state) { setState(state); const node = Layout(); return { name: node.type.name, props: node.props }; }
  ` },
  bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-router-dom"], loader: { ".css": "empty" },
  plugins: [{ name: "shell-boundaries", setup(build) {
    build.onResolve({ filter: /^@\/lib\/AuthContext$/ }, () => ({ path: "auth", namespace: "shell-test" }));
    build.onResolve({ filter: /.*/ }, args => args.importer.endsWith("PageLayout.jsx") && !args.path.startsWith("react") && !args.path.endsWith(".css")
      ? { path: args.path.includes("PageLoader") ? "loader" : "boundary", namespace: "shell-test" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "shell-test" }, ({ path }) => ({ contents: path === "auth"
      ? "let state; export const setState = value => { state = value; }; export const useAuth = () => state;"
      : path === "loader" ? "export default function SessionLoader() { return null; }"
        : "export function NavigationLayoutProvider() { return null; } export const useNavigationLayout = () => ({layout:'topbar'}); export const isNativeApp = false; export const publicCommerceEnabled = true; export default function Boundary() { return null; }" }));
  } }],
});
const compiled = { exports: {} };
new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
const { view } = compiled.exports;

test("refresh never mounts guest navigation or competition headers while the initial session is unresolved", () => {
  for (const user of [null, { id: "cached-player" }]) {
    const result = view({ user, authChecked: false, isLoadingAuth: true });
    assert.equal(result.name, "SessionLoader");
    assert.equal(result.props.fullscreen, true);
  }
});

test("confirmed guests and signed-in players receive the normal page shell", () => {
  for (const user of [null, { id: "player" }]) assert.equal(view({ user, authChecked: true, isLoadingAuth: false }).name, "NavigationLayoutProvider");
});

test("background session refresh preserves the already authenticated page", () => {
  assert.equal(view({ user: { id: "player" }, authChecked: true, isLoadingAuth: true }).name, "NavigationLayoutProvider");
});
