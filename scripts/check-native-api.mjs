import { resolveApiBase } from "../src/lib/appEnvironment.js";

// Check the same HTTPS host the app will embed, before spending time on Xcode.
// A redirect on OPTIONS (especially to HTTP) makes WKWebView report Load failed.
const api = resolveApiBase(process.env.VITE_NATIVE_API_URL, true);
const origin = "capacitor://localhost";
const request = (path, options = {}) => fetch(`${api}${path}`, {
  ...options,
  redirect: "manual",
  signal: AbortSignal.timeout(15_000),
  headers: { Origin: origin, ...options.headers },
});
const checkResponse = response => {
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Native API redirects (${response.status}). Set VITE_NATIVE_API_URL to the final HTTPS /api address.`);
  }
  if (!response.ok) throw new Error(`Native API returned HTTP ${response.status}.`);
  if (response.headers.get("access-control-allow-origin") !== origin) {
    throw new Error("Native API does not allow the capacitor://localhost origin.");
  }
};
try {
  const preflight = await request("/auth/login", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,authorization",
    },
  });
  checkResponse(preflight);
  const headers = (preflight.headers.get("access-control-allow-headers") || "").toLowerCase().split(",").map(value => value.trim());
  const methods = (preflight.headers.get("access-control-allow-methods") || "").split(",").map(value => value.trim().toUpperCase());
  if (!methods.includes("POST") || !headers.includes("content-type") || !headers.includes("authorization")) {
    throw new Error("Native API preflight must allow POST, Content-Type and Authorization.");
  }
  const health = await request("/health");
  checkResponse(health);
  if ((await health.json()).ok !== true) throw new Error("Native API health check failed.");
  console.log(`Native API ready: ${api} (HTTPS, no redirects, iPhone CORS allowed).`);
} catch (error) {
  console.error(`iPhone API check failed: ${error.message}`);
  process.exitCode = 1;
}
