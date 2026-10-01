import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import AccountSection from "@/components/settings/AccountSection";
import CreditsSection from "@/components/settings/CreditsSection";
import PaymentPermissionsSection from "@/components/settings/PaymentPermissionsSection";
import DiscordSection from "@/components/settings/DiscordSection";
import TwitchSection from "@/components/settings/TwitchSection";
import GamingIdsSection from "@/components/settings/GamingIdsSection";
import SocialsSection from "@/components/settings/SocialsSection";
import PageHeader from "@/components/ui/PageHeader";
import PageLoader from "@/components/ui/PageLoader";

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
    return <PageLoader label="Loading settings" />;
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-3xl mx-auto px-4 lg:px-6">
        <PageHeader eyebrow="Account control" title="Settings" description="Manage your account, gaming identities and integrations." />
        <AccountSection user={user} onUserUpdate={loadUser} />
        <SocialsSection user={user} onUserUpdate={loadUser} />
        <CreditsSection user={user} onUserUpdate={loadUser} />
        <PaymentPermissionsSection user={user} onUserUpdate={loadUser} />
        <GamingIdsSection user={user} onUserUpdate={loadUser} />
        <TwitchSection user={user} onUserUpdate={loadUser} />
        <DiscordSection user={user} onUserUpdate={loadUser} />
      </div>
    </div>
  );
}
