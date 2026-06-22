import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { base44, invalidateApiCache } from "@/api/base44Client";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);

  const completeAuth = useCallback((currentUser) => {
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
      const authenticated = await base44.auth.isAuthenticated();
      if (!authenticated) {
        markUnauthenticated();
        return null;
      }

      const currentUser = await bootstrapCurrentUser({ force });
      if (!currentUser?.id) {
        markUnauthenticated();
        return null;
      }

      completeAuth(currentUser);
      return currentUser;
    } catch (error) {
      if (![401, 403, 404].includes(error.status)) {
        console.error("User auth check failed:", error);
      }
      markUnauthenticated();
      return null;
    }
  }, [completeAuth, markUnauthenticated]);

  const checkAppState = useCallback(() => checkUserAuth(), [checkUserAuth]);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const logout = useCallback((shouldRedirect = true) => {
    base44.auth.logout();
    invalidateApiCache();
    markUnauthenticated();

    if (shouldRedirect && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [markUnauthenticated]);

  const navigateToLogin = useCallback(() => {
    base44.auth.redirectToLogin(typeof window !== "undefined" ? window.location.href : undefined);
  }, []);

  const value = useMemo(() => ({
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
