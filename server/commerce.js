// This is a client-surface restriction, not an account authorization rule.
// All normal authorization, balance and payment checks remain in the handlers.
export function commerceAllowed(req, env = process.env) {
  const nativeOrigins = String(env.NATIVE_APP_ORIGINS || "capacitor://localhost").split(",").map((value) => value.trim());
  const origin = req.headers?.origin;
  const native = req.headers?.["x-topfragg-client"] === "ios" || nativeOrigins.includes(origin);
  return !native && String(env.WEB_COMMERCE_ENABLED || "true").toLowerCase() !== "false";
}
