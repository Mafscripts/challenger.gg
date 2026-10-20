import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { base44, invalidateApiCache } from "@/api/base44Client";
import { bootstrapCurrentUser, clearBootstrapSession } from "@/lib/userBootstrap";
import { RESTRICTION_EVENT, readRestriction, clearRestriction, isRestriction } from "@/lib/accountRestriction";
import { NETWORK_RESTRICTION_EVENT, readNetworkRestriction, clearNetworkRestriction } from "@/lib/networkAccess";
import { isNativeApp, NATIVE_RESUME_EVENT } from "@/lib/nativeApp";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);
  const [restriction, setRestriction] = useState(readRestriction);
  const [networkRestriction, setNetworkRestriction] = useState(readNetworkRestriction);

  useEffect(() => {
    const blocked = (event) => { setNetworkRestriction(event.detail); setIsLoadingAuth(false); setAuthChecked(true); };
    window.addEventListener(NETWORK_RESTRICTION_EVENT, blocked);
    return () => window.removeEventListener(NETWORK_RESTRICTION_EVENT, blocked);
  }, []);

  useEffect(() => {
    const blocked = (event) => {
      setRestriction(event.detail);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    };
    window.addEventListener(RESTRICTION_EVENT, blocked);
    return () => window.removeEventListener(RESTRICTION_EVENT, blocked);
  }, []);

  const completeAuth = useCallback((currentUser) => {
    if (readNetworkRestriction()) {
      setNetworkRestriction(readNetworkRestriction());
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }
    if (readRestriction()) {
      setRestriction(readRestriction());
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }
    clearRestriction();
    setRestriction(null);
    setUser(currentUser || null);
    setIsAuthenticated(Boolean(currentUser?.id));
    setIsLoadingAuth(false);
    setAuthChecked(true);
    setAuthError(null);
  }, []);

  const markUnauthenticated = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    setIsLoadingAuth(false);
    setAuthChecked(true);
    setAuthError(null);
  }, []);

  const checkUserAuth = useCallback(async ({ force = false } = {}) => {
    try {
      setIsLoadingAuth(true);
      if (readRestriction()) {
        setRestriction(readRestriction());
        markUnauthenticated();
        return null;
      }
      const authenticated = await base44.auth.isAuthenticated();
      if (!authenticated) {
        markUnauthenticated();
        return null;
      }

      const currentUser = await bootstrapCurrentUser({ force });
      if (readNetworkRestriction()) {
        setNetworkRestriction(readNetworkRestriction());
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return null;
      }
      if (!currentUser?.id) {
        if (readRestriction()) { setRestriction(readRestriction()); markUnauthenticated(); return null; }
        base44.auth.logout();
        clearBootstrapSession();
        markUnauthenticated();
        return null;
      }

      completeAuth(currentUser);
      return currentUser;
    } catch (error) {
      if (readNetworkRestriction()) {
        setNetworkRestriction(readNetworkRestriction());
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return null;
      }
      if (isRestriction(error.data) || readRestriction()) {
        setRestriction(error.data?.restriction || readRestriction());
        markUnauthenticated();
        return null;
      }
      if (![401, 403, 404].includes(error.status)) {
        console.error("User auth check failed:", error);
      }
      if ([401, 403, 404].includes(error.status)) {
        base44.auth.logout();
        clearBootstrapSession();
      }
      markUnauthenticated();
      return null;
    }
  }, [completeAuth, markUnauthenticated]);

  const checkAppState = useCallback(() => checkUserAuth(), [checkUserAuth]);
  useEffect(() => {
    if (!isNativeApp) return;
    const refresh = async () => {
      if (!await base44.auth.isAuthenticated()) return;
      try { completeAuth(await base44.auth.me({ force: true })); }
      catch (error) {
        // A temporary mobile network outage must not sign the player out.
        if ([401, 403, 404].includes(error.status)) markUnauthenticated();
      }
    };
    window.addEventListener(NATIVE_RESUME_EVENT, refresh);
    return () => window.removeEventListener(NATIVE_RESUME_EVENT, refresh);
  }, [completeAuth, markUnauthenticated]);
  const resumeNetworkAccess = useCallback(async () => {
    clearNetworkRestriction();
    setNetworkRestriction(null);
    return checkUserAuth({ force: true });
  }, [checkUserAuth]);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const logout = useCallback((shouldRedirect = true) => {
    setNetworkRestriction(null);
    setRestriction(null);
    clearBootstrapSession(user?.id);
    base44.auth.logout();
    invalidateApiCache();
    markUnauthenticated();

    if (shouldRedirect && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [markUnauthenticated, user?.id]);

  const navigateToLogin = useCallback(() => {
    base44.auth.redirectToLogin(typeof window !== "undefined" ? window.location.href : undefined);
  }, []);

  const value = useMemo(() => ({
    networkRestriction,
    resumeNetworkAccess,
    restriction,
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    appPublicSettings,
    authChecked,
    logout,
    navigateToLogin,
    completeAuth,
    checkUserAuth,
    checkAppState,
  }), [
    networkRestriction,
    resumeNetworkAccess,
    restriction,
    user,
    isAuthenticated,
    isLoadingAuth,
    authError,
    appPublicSettings,
    authChecked,
    logout,
    navigateToLogin,
    completeAuth,
    checkUserAuth,
    checkAppState,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
