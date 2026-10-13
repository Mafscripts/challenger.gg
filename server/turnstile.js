const verificationError = (message, status = 400) => Object.assign(new Error(message), { status });

export const registrationSecurityConfig = () => {
  const siteKey = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  const secretKey = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  const required = Boolean(siteKey || secretKey);
  if (required && (!siteKey || !secretKey)) {
    throw verificationError("Registration security is temporarily unavailable. Please try again later.", 503);
  }
  return { turnstile_required: required, turnstile_site_key: siteKey };
};

const allowedHostnames = () => {
  const configured = String(process.env.TURNSTILE_ALLOWED_HOSTNAMES || "").trim();
  if (configured) return configured.split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  try {
    const hostname = new URL(process.env.APP_URL || process.env.TOPFRAGG_PUBLIC_URL).hostname.toLowerCase();
    const domain = hostname.replace(/^www\./, "");
    return [domain, `www.${domain}`];
  } catch {
    return [];
  }
};

export const verifyRegistrationTurnstile = async (req, remoteIp) => {
  if (!registrationSecurityConfig().turnstile_required) return;
  const hostnames = allowedHostnames();
  if (!hostnames.length) {
    throw verificationError("Registration security is temporarily unavailable. Please try again later.", 503);
  }
  const token = req.body?.turnstile_token;
  if (typeof token !== "string" || !token.trim() || token.length > 2048) {
    throw verificationError("Please complete the security check before creating your account.");
  }

  let result;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY.trim(),
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Verification service unavailable");
    result = await response.json();
    if (!result || typeof result.success !== "boolean") throw new Error("Invalid verification response");
  } catch {
    throw verificationError("The security check is temporarily unavailable. Please try again.", 503);
  }
  if (result["error-codes"]?.some((code) => ["internal-error", "missing-input-secret", "invalid-input-secret", "bad-request"].includes(code))) {
    throw verificationError("The security check is temporarily unavailable. Please try again.", 503);
  }
  if (!result.success || result.action !== "register" || !hostnames.includes(String(result.hostname || "").toLowerCase())) {
    throw verificationError("The security check expired or failed. Please try again.");
  }
};
