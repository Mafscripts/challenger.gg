import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AccountSection from "@/components/settings/AccountSection";
import CreditsSection from "@/components/settings/CreditsSection";
import DiscordSection from "@/components/settings/DiscordSection";
import GamingIdsSection from "@/components/settings/GamingIdsSection";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
  };

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        await loadUser();
      }
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-3xl mx-auto px-4 lg:px-6">
        <h1 className="text-3xl font-black tracking-tight mb-2">Settings</h1>
        <p className="text-vapor text-sm mb-8">Manage your account and integrations</p>
        <AccountSection user={user} onUserUpdate={loadUser} />
        <CreditsSection user={user} onUserUpdate={loadUser} />
        <GamingIdsSection user={user} onUserUpdate={loadUser} />
        <DiscordSection user={user} onUserUpdate={loadUser} />
      </div>
    </div>
  );
}