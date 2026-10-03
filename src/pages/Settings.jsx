import React, { useEffect, useState } from "react";
import {
  AtSign,
  Coins,
  ChevronDown,
  Gamepad2,
  Gift,
  KeyRound,
  Link2,
  MessageCircle,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import AccountSection from "@/components/settings/AccountSection";
import CreditsSection from "@/components/settings/CreditsSection";
import PaymentPermissionsSection from "@/components/settings/PaymentPermissionsSection";
import DiscordSection from "@/components/settings/DiscordSection";
import TwitchSection from "@/components/settings/TwitchSection";
import GamingIdsSection from "@/components/settings/GamingIdsSection";
import SocialsSection from "@/components/settings/SocialsSection";
import ReferralSection from "@/components/settings/ReferralSection";
import PageHeader from "@/components/ui/PageHeader";
import PageLoader from "@/components/ui/PageLoader";

const settingGroups = [
  {
    id: "account",
    label: "Account",
    description: "Identity & security",
    icon: UserRound,
    items: [
      { label: "Profile & username", icon: UserRound, target: "settings-account" },
      { label: "Password & security", icon: KeyRound, target: "settings-password" },
    ],
  },
  {
    id: "wallet",
    label: "Wallet & rewards",
    description: "Credits & payments",
    icon: WalletCards,
    items: [
      { label: "Credits", icon: Coins, target: "settings-credits" },
      { label: "Team payments", icon: ShieldCheck, target: "settings-payments" },
      { label: "Referrals", icon: Gift, target: "settings-referrals" },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    description: "Social & gaming",
    icon: Link2,
    items: [
      { label: "Social profiles", icon: AtSign, target: "settings-socials" },
      { label: "Gaming IDs", icon: Gamepad2, target: "settings-gaming" },
      { label: "Twitch", icon: MessageCircle, target: "settings-twitch" },
      { label: "Discord", icon: MessageCircle, target: "settings-discord" },
    ],
  },
];

function scrollToSetting(target) {
  document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function GroupLabel({ icon: Icon, title, description }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan/15 bg-cyan/[0.06] text-cyan">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-vapor">{description}</p>
      </div>
    </div>
  );
}

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState("account");

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
  };

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) await loadUser();
      setLoading(false);
    });
  }, []);

  if (loading) return <PageLoader label="Loading settings" />;

  const displayName = user?.display_name || user?.full_name || user?.username || "Player";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen py-6 sm:py-8">
      <div className="mx-auto max-w-7xl px-4 lg:px-6">
        <PageHeader
          eyebrow="Account control"
          title="Settings"
          description="Everything you need to manage your Topfragg account, security, payments and connected identities."
          action={
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-background/35 px-3 py-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan/20 bg-cyan/10 text-xs font-black text-cyan">
                {initials}
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="max-w-[150px] truncate text-xs font-bold text-white">{displayName}</p>
                <p className="text-[9px] uppercase tracking-wider text-vapor">Account settings</p>
              </div>
            </div>
          }
        />

        <div className="sticky top-3 z-20 mb-8 rounded-2xl border border-white/[0.07] bg-background/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="space-y-1">
            {settingGroups.map((group) => {
              const Icon = group.icon;
              const isOpen = openGroup === group.id;
              return (
                <div key={group.id} className="overflow-hidden rounded-xl border border-transparent">
                  <button
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : group.id)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition ${isOpen ? "border-cyan/15 bg-cyan/[0.06]" : "hover:bg-white/[0.025]"}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan/15 bg-cyan/[0.06] text-cyan">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span>
                        <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-white">{group.label}</span>
                        <span className="mt-0.5 block text-[9px] text-vapor">{group.description}</span>
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 text-vapor transition-transform ${isOpen ? "rotate-180 text-cyan" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <button
                            key={item.target}
                            type="button"
                            onClick={() => scrollToSetting(item.target)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-[10px] font-bold text-vapor transition hover:border-cyan/15 hover:bg-cyan/[0.06] hover:text-white"
                          >
                            <ItemIcon className="h-3.5 w-3.5" />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-10">
          <section id="settings-account" className="scroll-mt-28">
            <GroupLabel icon={UserRound} title="Account & security" description="Your identity, login credentials and account security." />
            <AccountSection user={user} onUserUpdate={loadUser} />
          </section>

          <section className="scroll-mt-28">
            <GroupLabel icon={WalletCards} title="Wallet & rewards" description="Credits, team payment permissions and your referral program." />
            <div className="grid gap-6 lg:grid-cols-2">
              <div id="settings-credits" className="scroll-mt-28"><CreditsSection user={user} onUserUpdate={loadUser} /></div>
              <div id="settings-referrals" className="scroll-mt-28"><ReferralSection /></div>
              <div id="settings-payments" className="scroll-mt-28 lg:col-span-2"><PaymentPermissionsSection user={user} onUserUpdate={loadUser} /></div>
            </div>
          </section>

          <section className="scroll-mt-28">
            <GroupLabel icon={Link2} title="Connected identities" description="Connect your gaming accounts and social profiles to Topfragg." />
            <div className="space-y-6">
              <div id="settings-socials" className="scroll-mt-28"><SocialsSection user={user} onUserUpdate={loadUser} /></div>
              <div id="settings-gaming" className="scroll-mt-28"><GamingIdsSection user={user} onUserUpdate={loadUser} /></div>
              <div id="settings-twitch" className="scroll-mt-28"><TwitchSection user={user} onUserUpdate={loadUser} /></div>
              <div id="settings-discord" className="scroll-mt-28"><DiscordSection user={user} onUserUpdate={loadUser} /></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
