export function corsOptions(env = process.env) {
  const configured = String(env.CORS_ORIGIN || "").trim();
  if (!configured) return { origin: true, credentials: true };
  const origins = configured.split(",").map(value => value.trim()).filter(Boolean);
  const nativeOrigins = String(env.NATIVE_APP_ORIGINS || "capacitor://localhost").split(",").map(value => value.trim()).filter(Boolean);
  return { origin: [...new Set([...origins, ...nativeOrigins])], credentials: true };
}
