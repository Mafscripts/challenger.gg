import {
  blockedPublicCommerceFunctions,
  commerceUnavailableMessage,
  publicCommerceEnabled,
} from "@/lib/commerce";
import { notifyCancelledMatch, notifyCancelledMatchResponse } from "@/lib/cancelledMatchRoom";
import { notifyMatchPostedResponse } from "@/lib/notificationInbox";
import { rememberRestriction, clearRestriction, appealHeaders } from "@/lib/accountRestriction";
import { rememberNetworkRestriction, clearNetworkRestriction } from "@/lib/networkAccess";
import { apiBase } from "@/lib/appEnvironment";

const API_BASE = apiBase;
const TOKEN_KEYS = ["auth_token", "base44_access_token", "token"];
const ENTITY_CACHE_MS = 15_000;
const ME_CACHE_MS = 60_000;
const readOnlyFunctions = new Set([
  "getTradingOverview",
  "getTradeInventory",
  "getTradeListings",
  "getTradeListing",
  "getChallengeStandings",
  "getAdminDashboard",
  "getAdminWallets",
  "getAdminWalletSummary",
  "getProgressionResetOverview",
  "getAdminAuditLogs",
  "getAdminAuditEntry",
  "getAdminAuditCounts",
  "getAdminUsers",
  "getAdminUserCount",
  "getAdminUserSecurity",
  "getAdminTickets",
  "getAdminTicketCounts",
  "getChallengeOverview",
  "getChallengeRoom",
  "getChallengeActivity",
  "getFreeEightsOverview",
  "getFreeEightsPlayerStats",
  "getFreeEightsStandings",
  "getLeaderboardPlayers",
  "getLeaderboardAvatars",
  "getMoneyEightsStandings",
  "getXPStandings",
  "getXPFormatStandings",
  "getXPMatchfinder",
  "getMyActiveXPMatch",
  "getCompetitionTrophyCounts",
  "getDirectMessages",
  "searchMessageRecipients",
  "getAnimatedNameFreeTrialStatus",
]);

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
  const canDedupe = options.dedupe ?? (method === "GET");

  if (canDedupe && inflight.has(key)) {
    return inflight.get(key);
  }

  const controller = options.timeoutMs > 0 ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
  const request = fetch(`${API_BASE}${path}`, {
    method,
    ...(controller ? { signal: controller.signal } : {}),
    ...(options.credentials ? { credentials: options.credentials } : {}),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {}),
    },
    body,
  }).then(async (response) => {
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        const error = new Error(response.status >= 500
          ? "The server is temporarily unavailable. Please try again shortly."
          : "The server returned an unexpected response. Please try again shortly.");
        error.status = response.status;
        error.code = "INVALID_API_RESPONSE";
        throw error;
      }
    }
    if (!response.ok) {
      rememberRestriction(data);
      rememberNetworkRestriction(data);
      const error = new Error(data?.error || data?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }).catch((error) => {
    if (controller?.signal.aborted) {
      const timeoutError = new Error("The request took too long. Please try again.");
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  }).finally(() => {
    if (timeout !== null) clearTimeout(timeout);
    if (inflight.get(key) === request) inflight.delete(key);
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

  async loginViaEmailPassword(identifier, password) {
    const result = await apiFetch("/auth/login", { method: "POST", body: { identifier, password }, dedupe: false });
    setToken(result.access_token);
    meCache = { value: result.user, expiresAt: now() + ME_CACHE_MS, promise: null };
    return result;
  },

  deleteAccount(payload) {
    return apiFetch("/auth/delete-account", { method: "POST", body: payload });
  },

  getRegistrationConfig() {
    return apiFetch("/auth/registration-config");
  },

  getNetworkStatus() {
    return apiFetch("/auth/network-status");
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
    clearNetworkRestriction();
    clearRestriction();
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

  filterFresh(filter = {}, order, limit, options = {}) {
    requireToken();
    return apiFetch(`/entities/${entity}${toQuery({ filter, order, limit })}`, { ...options, dedupe: false });
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

  getFresh(id, options = {}) {
    requireToken();
    return apiFetch(`/entities/${entity}/${encodeURIComponent(id)}`, { ...options, dedupe: false });
  },

  async create(payload) {
    requireToken();
    const value = await apiFetch(`/entities/${entity}`, { method: "POST", body: payload, dedupe: false });
    entityCache.clear();
    if (["Wallet", "WalletTransaction", "PlayerProfile"].includes(entity)) invalidateMeCache();
    return value;
  },

  async update(id, payload) {
    requireToken();
    const value = await apiFetch(`/entities/${entity}/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, dedupe: false });
    entityCache.clear();
    notifyCancelledMatch(value, entity);
    if (["Wallet", "WalletTransaction", "PlayerProfile"].includes(entity)) invalidateMeCache();
    if (entity === "User" && meCache.value?.id === id) {
      meCache = { value, expiresAt: now() + ME_CACHE_MS, promise: null };
    }
    return value;
  },

  async delete(id) {
    requireToken();
    const value = await apiFetch(`/entities/${entity}/${encodeURIComponent(id)}`, { method: "DELETE", dedupe: false });
    entityCache.clear();
    if (["Wallet", "WalletTransaction", "PlayerProfile"].includes(entity)) invalidateMeCache();
    return value;
  },
});

export const base44 = {
  mobileOAuth: {
    createTicket(provider) {
      requireToken();
      return apiFetch("/mobile/oauth/ticket", { method: "POST", body: { provider }, dedupe: false });
    },
  },
  banAppeals: {
    me: (before) => apiFetch(`/ban-appeals/me${toQuery({ before })}`, { headers: appealHeaders() }),
    send: (body) => apiFetch("/ban-appeals/me/messages", { method: "POST", body, headers: appealHeaders() }),
    list: (params = {}) => apiFetch(`/ban-appeals/admin${toQuery(params)}`),
    detail: (id, before) => apiFetch(`/ban-appeals/admin/${encodeURIComponent(id)}${toQuery({ before })}`),
    reply: (id, body) => apiFetch(`/ban-appeals/admin/${encodeURIComponent(id)}/messages`, { method: "POST", body }),
    status: (id, status) => apiFetch(`/ban-appeals/admin/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } }),
  },
  rankVerification: {
    me() { requireToken(); return apiFetch("/rank-verification/me", { dedupe: false }); },
    async select(rank) {
      requireToken();
      const result = await apiFetch("/rank-verification/select", { method: "POST", body: { rank }, dedupe: false });
      invalidateApiCache();
      return result;
    },
    async requestTop250(payload) {
      requireToken();
      const result = await apiFetch("/rank-verification/top250-request", { method: "POST", body: payload, dedupe: false });
      invalidateApiCache();
      return result;
    },
    list(status, cursor) { requireToken(); return apiFetch(`/rank-verification/admin${toQuery({ status, cursor })}`, { dedupe: false }); },
    player(userId) { requireToken(); return apiFetch(`/rank-verification/admin/${encodeURIComponent(userId)}`, { dedupe: false }); },
    image(userId, attemptId) { requireToken(); return apiFetch(`/rank-verification/image/${encodeURIComponent(userId)}/${encodeURIComponent(attemptId)}`, { dedupe: false }); },
    async review(userId, payload) {
      requireToken();
      const result = await apiFetch(`/rank-verification/admin/${encodeURIComponent(userId)}`, { method: "POST", body: payload, dedupe: false });
      invalidateApiCache();
      return result;
    },
  },
  profile: {
    matchPresets() {
      requireToken();
      return apiFetch("/profile/match-presets", { timeoutMs: 10_000 });
    },
    saveMatchPreset(preset) {
      requireToken();
      return apiFetch("/profile/match-presets", { method: "PUT", body: preset, timeoutMs: 10_000 });
    },
    deleteMatchPreset(presetId) {
      requireToken();
      return apiFetch(`/profile/match-presets/${encodeURIComponent(presetId)}`, { method: "DELETE", timeoutMs: 10_000 });
    },
    teamPage(teamId) {
      requireToken();
      return apiFetch(`/profile/team-page${toQuery({ team: teamId })}`, { timeoutMs: 15_000 });
    },
    teamPageActivity(teamIds) {
      requireToken();
      return apiFetch(`/profile/team-page/activity${toQuery({ team_ids: teamIds })}`, { timeoutMs: 15_000 });
    },
    teamPagePlayers(teamId) {
      requireToken();
      return apiFetch(`/profile/team-page/players${toQuery({ team: teamId })}`, { timeoutMs: 15_000 });
    },
    teamXPMatches(teamIds, includeSummary = false) {
      requireToken();
      return apiFetch(`/profile/team-xp-matches${toQuery({ team_ids: teamIds, ...(includeSummary ? { summary: "1" } : {}) })}`, { dedupe: false, timeoutMs: 15_000 });
    },
    teams(userId) {
      requireToken();
      return apiFetch(`/profile/${encodeURIComponent(userId)}/teams`);
    },
    friendship(userId) {
      requireToken();
      return apiFetch(`/profile/${encodeURIComponent(userId)}/friendship`, { dedupe: false });
    },
    friendRequests(offset = 0) {
      requireToken();
      return apiFetch(`/profile/friend-requests${toQuery({ offset })}`, { dedupe: false });
    },
    async changeFriendship(userId, action) {
      requireToken();
      const result = await apiFetch(`/profile/${encodeURIComponent(userId)}/friendship`, { method: "POST", body: { action }, dedupe: false });
      invalidateApiCache();
      window.dispatchEvent(new CustomEvent("topfragg:friends-updated"));
      window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
      return result;
    },
    trophyShowcase(userId) {
      requireToken();
      return apiFetch(`/profile/${encodeURIComponent(userId)}/trophy-showcase`);
    },
    arena(userId) {
      requireToken();
      return apiFetch(`/profile/${encodeURIComponent(userId)}/arena`);
    },
    friends(userId, offset = 0) {
      requireToken();
      return apiFetch(`/profile/${encodeURIComponent(userId)}/friends${toQuery({ offset })}`);
    },
    async trophyCounts(userIds) {
      requireToken();
      const ids = [...new Set((userIds || []).filter(Boolean))].sort();
      if (!ids.length) return Promise.resolve({});
      return apiFetch(`/profile/trophies${toQuery({ user_ids: ids })}`);
    },
    tournamentParticipants(userId) {
      requireToken();
      return apiFetch(`/profile/${encodeURIComponent(userId)}/tournament-participants`);
    },
  },
  party: {
    searchPlayers(query) { requireToken(); return apiFetch(`/party-rooms/players?query=${encodeURIComponent(query)}`); },
    list() { requireToken(); return apiFetch("/party-rooms"); },
    get(id, matchId, { fresh = false } = {}) {
      requireToken();
      return apiFetch(`/party-rooms/${encodeURIComponent(id)}${toQuery({ match: matchId, ...(fresh ? { _refresh: Date.now() } : {}) })}`);
    },
    create(input) { requireToken(); return apiFetch("/party-rooms", { method: "POST", body: input }); },
    change(id, input) { requireToken(); return apiFetch(`/party-rooms/${encodeURIComponent(id)}`, { method: "POST", body: input }); },
  },
  public: {
    playerOverlay(identifier) {
      return apiFetch(`/public/player-overlay/${encodeURIComponent(identifier)}`);
    },
    homeOverview() {
      return apiFetch("/public/home-overview");
    },
  },
  auth,
  recruitment: {
    list(params) { requireToken(); return apiFetch(`/recruitment${toQuery(params)}`, { timeoutMs: 15_000 }); },
    save(post) { requireToken(); return apiFetch("/recruitment", { method: "PUT", body: post, timeoutMs: 15_000 }); },
    close(id, reason) { requireToken(); return apiFetch(`/recruitment/${encodeURIComponent(id)}/close`, { method: "POST", body: { reason }, timeoutMs: 15_000 }); },
  },
  community: {
    blocked: () => apiFetch("/community/blocked"),
    block: (userId, blocked) => apiFetch("/community/block", { method: "POST", body: { user_id: userId, blocked } }),
    report: (messageId, reason) => apiFetch("/community/report", { method: "POST", body: { message_id: messageId, reason } }),
  },
  discord: {
    membership() { requireToken(); return apiFetch("/discord/membership", { dedupe: false }); },
    connect(returnTo) {
      requireToken();
      return apiFetch("/discord/connect", { method: "POST", body: { return_to: returnTo }, credentials: "include", dedupe: false });
    },
    freeEightsVoice(wagerId) {
      requireToken();
      return apiFetch(`/discord/free-eights${wagerId ? `/${encodeURIComponent(wagerId)}` : ""}`, { dedupe: false, timeoutMs: 5000 });
    },
    status() {
      requireToken();
      return apiFetch("/discord/status", { dedupe: false });
    },
    async sync() {
      requireToken();
      const result = await apiFetch("/discord/sync", { method: "POST", dedupe: false });
      invalidateMeCache();
      return result;
    },
    async disconnect() {
      requireToken();
      const result = await apiFetch("/discord/connection", { method: "DELETE", dedupe: false });
      invalidateMeCache();
      return result;
    },
  },
  streamAccounts: {
    status() { requireToken(); return apiFetch("/stream-accounts/status", { dedupe: false }); },
    connect(provider) {
      requireToken();
      if (!["youtube", "kick"].includes(provider)) throw new Error("Unknown streaming provider");
      return apiFetch(`/stream-accounts/${provider}/connect`, { method: "POST", credentials: "include", dedupe: false });
    },
    async disconnect(provider) {
      requireToken();
      if (!["youtube", "kick"].includes(provider)) throw new Error("Unknown streaming provider");
      const result = await apiFetch(`/stream-accounts/${provider}/connection`, { method: "DELETE", dedupe: false });
      invalidateMeCache();
      return result;
    },
  },
  twitch: {
    connect() {
      requireToken();
      return apiFetch("/twitch/connect", { method: "POST", dedupe: false });
    },
    status() {
      requireToken();
      return apiFetch("/twitch/status", { dedupe: false });
    },
    async disconnect() {
      requireToken();
      const result = await apiFetch("/twitch/connection", { method: "DELETE", dedupe: false });
      invalidateMeCache();
      return result;
    },
  },
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
      const data = await apiFetch(`/functions/${name}`, { method: "POST", body: payload, dedupe: readOnlyFunctions.has(name) });
      if (!readOnlyFunctions.has(name)) {
        entityCache.clear();
        invalidateMeCache();
        if (data?.success !== false && !/^(get|list|search|check|find|validate|preview)/i.test(name)
          && /(score|result|resolve|reset|revert|grant|premium|role|wallet)/i.test(name)) {
          window.dispatchEvent(new CustomEvent("topfragg:standings-updated"));
        }
      }
      notifyCancelledMatchResponse(data, name);
      notifyMatchPostedResponse(data, name);
      if (["completeRegistration", "createWallet"].includes(name)) {
        meCache = { value: data.user || data, expiresAt: now() + ME_CACHE_MS, promise: null };
      }
      return { data };
    },
  },
};

export { invalidateApiCache };
