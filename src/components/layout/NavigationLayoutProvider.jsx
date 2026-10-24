import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { isNavigationLayout, navigationLayoutKey, preferredNavigationLayout } from "@/lib/navigationLayout";
import { toast } from "@/components/ui/use-toast";
import AdminWorkspaceBridge from "@/components/admin/AdminWorkspaceBridge";

const NavigationLayoutContext = createContext(null);
const storage = () => { try { return window.localStorage; } catch { return null; } };

export function NavigationLayoutProvider({ children }) {
  const { user, completeAuth } = useAuth();
  const [layout, setLayout] = useState(() => preferredNavigationLayout(user, storage()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!savingRef.current) setLayout(preferredNavigationLayout(user, storage()));
  }, [user?.id, user?.navigation_layout]);

  const chooseLayout = async (nextLayout) => {
    if (!user?.id || !isNavigationLayout(nextLayout) || savingRef.current || nextLayout === layout) return;
    const previous = layout;
    savingRef.current = true;
    setLayout(nextLayout); setSaving(true); setError("");
    try {
      const updated = await base44.auth.updateMe({ navigation_layout: nextLayout });
      if (!mounted.current) return;
      try { storage()?.setItem(navigationLayoutKey(user.id), nextLayout); } catch { /* Account preference still saved. */ }
      completeAuth(updated);
    } catch (cause) {
      if (!mounted.current) return;
      setLayout(previous);
      setError("Your navigation preference could not be saved. Please try again.");
      toast({ title: "Could not save navigation", description: cause.message, variant: "destructive" });
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <NavigationLayoutContext.Provider value={{ layout, saving, error, chooseLayout }}>{children}<AdminWorkspaceBridge user={user} /></NavigationLayoutContext.Provider>;
}

export const useNavigationLayout = () => useContext(NavigationLayoutContext);
