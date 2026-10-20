import React from "react";
import { Globe2, MessageCircle, Twitch, Twitter, Youtube, Radio } from "lucide-react";
import TrophyCounts from "@/components/ui/TrophyCounts";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import "@/styles/profile-header.css";

const icons = { discord: MessageCircle, twitter: Twitter, x: Twitter, twitch: Twitch, youtube: Youtube, kick: Radio, website: Globe2 };

export default function ProfileHeaderBar({ socials = [], trophies = [] }) {
  const counts = Object.fromEntries(trophies.map((trophy) => [trophy.key, trophy.value]));
  return <div className="profile-header-bar">
    <div className="profile-header-socials" aria-label="Player socials">
      {socials.map((social) => {
        const Icon = icons[social.key] || Globe2;
        const Social = social.url ? "a" : "span";
        return <BadgeTooltip key={social.key} label={social.label} description={social.value} toneClass="text-cyan">
          <Social {...(social.url ? { href: social.url, target: "_blank", rel: "noopener noreferrer" } : { tabIndex: 0 })} aria-label={`${social.label}: ${social.value}`} className="profile-header-social"><Icon aria-hidden="true" /></Social>
        </BadgeTooltip>;
      })}
    </div>
    <TrophyCounts trophies={counts} align="end" className="profile-header-trophies" />
  </div>;
}
