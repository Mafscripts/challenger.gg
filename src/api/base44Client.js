import {
  blockedPublicCommerceFunctions,
  commerceUnavailableMessage,
  publicCommerceEnabled,
} from "@/lib/commerce";

const normalizeApiBase = (value) => String(value || "").replace(/\/+$/, "");

const API_BASE = (() => {
  const configuredBase = normalizeApiBase(import.meta.env.VITE_API_URL || "/api");
  if (configuredBase && configuredBase !== "/api") return configuredBase;

  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:4000/api";
  }

  return configuredBase || "/api";
})();
const TOKEN_KEYS = ["auth_token", "base44_access_token", "token"];
const ENTITY_CACHE_MS = 15_000;
const ME_CACHE_MS = 60_000;

const inflight = new Map();
const entityCache = new Map();
let meCache = { value: null, expiresAt: 0, promise: null };

const now = () => Date.now();

const getToken = () => {
  if (typeof window === "undefined") return null;
  for (const key of TOKEN_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  return null;
};

const setToken = (token) => {
  if (typeof window === "undefined") return;
  if (token) {
    TOKEN_KEYS.forEach((key) => window.localStorage.setItem(key, token));
  } else {
    TOKEN_KEYS.forEach((key) => window.localStorage.removeItem(key));
  }
};

const authRequiredError = () => {
  const error = new Error("Not authenticated");
  error.status = 401;
  return error;
};

const requireToken = () => {
  if (!getToken()) throw authRequiredError();
};

const stableKey = (value) => JSON.stringify(value, Object.keys(value || {}).sort());

const invalidateApiCache = () => {
  entityCache.clear();
  meCache = { value: null, expiresAt: 0, promise: null };
};

const invalidateMeCache = () => {
  meCache = { value: null, expiresAt: 0, promise: null };
};

const toQuery = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

async function apiFetch(path, options = {}) {
  const method = options.method || "GET";
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const key = `${method}:${path}:${body || ""}`;
  const canDedupe = method === "GET" || options.dedupe;

  if (canDedupe && inflight.has(key)) {
    return inflight.get(key);
  }

  const request = fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {}),
    },
    body,
  }).then(async (response) => {
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.error || data?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }).finally(() => {
    inflight.delete(key);
  });

  if (canDedupe) inflight.set(key, request);
  return request;
}

const auth = {
  setToken(token) {
    setToken(token);
    invalidateApiCache();
  },

  async isAuthenticated() {
    return Boolean(getToken());
  },

  async me({ force = false } = {}) {
    if (!getToken()) {
      const error = new Error("Not authenticated");
      error.status = 401;
      throw error;
    }

    if (!force && meCache.value && meCache.expiresAt > now()) {
      return meCache.value;
    }

    if (!force && meCache.promise) return meCache.promise;

    meCache.promise = apiFetch("/auth/me").then((user) => {
      meCache = { value: user, expiresAt: now() + ME_CACHE_MS, promise: null };
      return user;
    }).catch((error) => {
      meCache.promise = null;
      if ([401, 403, 404].includes(error.status)) {
        meCache.value = null;
        meCache.expiresAt = 0;
      }
      throw error;
    });

    return meCache.promise;
  },

  async loginViaEmailPassword(email, password) {
    const result = await apiFetch("/auth/login", { method: "POST", body: { email, password }, dedupe: false });
    setToken(result.access_token);
    meCache = { value: result.user, expiresAt: now() + ME_CACHE_MS, promise: null };
    return result;
  },

  async register(payload) {
    const result = await apiFetch("/auth/register", { method: "POST", body: payload, dedupe: false });
    if (result.access_token) {
      setToken(result.access_token);
      meCache = { value: result.user, expiresAt: now() + ME_CACHE_MS, promise: null };
    }
    return result;
  },

  async verifyOtp(payload) {
    const result = await apiFetch("/auth/verify-otp", { method: "POST", body: payload, dedupe: false });
    if (result.access_token) {
      setToken(result.access_token);
      meCache = { value: result.user, expiresAt: now() + ME_CACHE_MS, promise: null };
    }
    return result;
  },

  resendOtp(email) {
    return apiFetch("/auth/resend-otp", { method: "POST", body: { email }, dedupe: false });
  },

  resetPasswordRequest(email) {
    return apiFetch("/auth/reset-password-request", { method: "POST", body: { email }, dedupe: false });
  },

  resetPassword(payload) {
    return apiFetch("/auth/reset-password", { method: "POST", body: payload, dedupe: false });
  },

  changePassword(payload) {
    return apiFetch("/auth/change-password", { method: "POST", body: payload, dedupe: false });
  },

  async updateMe(payload) {
    const user = await apiFetch("/auth/me", { method: "PATCH", body: payload, dedupe: false });
    meCache = { value: user, expiresAt: now() + ME_CACHE_MS, promise: null };
    entityCache.clear();
    return user;
  },

  logout(redirectTo) {
    setToken(null);
    invalidateApiCache();
    if (redirectTo && typeof window !== "undefined") {
      window.location.href = redirectTo;
    }
  },

  redirectToLogin(returnTo) {
    if (typeof window !== "undefined") {
      window.location.href = `/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
    }
  },

  loginWithProvider() {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  },
};

const entityClient = (entity) => ({
  async filter(filter = {}, order, limit) {
    requireToken();
    const cacheKey = `${entity}:filter:${stableKey(filter)}:${order || ""}:${limit || ""}`;
    const cached = entityCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.value;

    const value = await apiFetch(`/entities/${entity}${toQuery({ filter, order, limit })}`);
    entityCache.set(cacheKey, { value, expiresAt: now() + ENTITY_CACHE_MS });
    return value;
  },

  filterFresh(filter = {}, order, limit) {
    requireToken();
    return apiFetch(`/entities/${entity}${toQuery({ filter, order, limit })}`, { dedupe: false });
  },

  async get(id) {
    requireToken();
    const cacheKey = `${entity}:get:${String(id)}`;
    const cached = entityCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.value;

    const value = await apiFetch(`/entities/${entity}/${encodeURIComponent(id)}`);
    entityCache.set(cacheKey, { value, expiresAt: now() + ENTITY_CACHE_MS });
    return value;
  },

  async create(payload) {
    requireToken();
    const value = await apiFetch(`/entities/${entity}`, { method: "POST", body: payload, dedupe: false });
    entityCache.clear();
    if (entity === "Wallet" || entity === "WalletTransaction") invalidateMeCache();
    return value;
  },

  async update(id, payload) {
    requireToken();
    const value = await apiFetch(`/entities/${entity}/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, dedupe: false });
    entityCache.clear();
    if (entity === "Wallet" || entity === "WalletTransaction") invalidateMeCache();
    if (entity === "User" && meCache.value?.id === id) {
      meCache = { value, expiresAt: now() + ME_CACHE_MS, promise: null };
    }
    return value;
  },

  async delete(id) {
    requireToken();
    const value = await apiFetch(`/entities/${entity}/${encodeURIComponent(id)}`, { method: "DELETE", dedupe: false });
    entityCache.clear();
    if (entity === "Wallet" || entity === "WalletTransaction") invalidateMeCache();
    return value;
  },
});

export const base44 = {
  auth,
  entities: new Proxy({}, {
    get(_target, entity) {
      return entityClient(entity);
    },
  }),
  functions: {
    async invoke(name, payload = {}) {
      if (!publicCommerceEnabled && blockedPublicCommerceFunctions.has(name)) {
        const error = new Error(commerceUnavailableMessage);
        error.code = "PUBLIC_COMMERCE_DISABLED";
        error.status = 503;
        throw error;
      }
      requireToken();
      const data = await apiFetch(`/functions/${name}`, { method: "POST", body: payload, dedupe: false });
      entityCache.clear();
      invalidateMeCache();
      if (["completeRegistration", "createWallet"].includes(name)) {
        meCache = { value: data.user || data, expiresAt: now() + ME_CACHE_MS, promise: null };
      }
      return { data };
    },
  },
};

export { invalidateApiCache };
