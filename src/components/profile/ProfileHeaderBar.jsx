import React from "react";
import { CalendarDays, Globe2, MessageCircle, Twitch, Twitter, Youtube, Radio } from "lucide-react";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import "@/styles/profile-header.css";

const icons = { discord: MessageCircle, twitter: Twitter, x: Twitter, twitch: Twitch, youtube: Youtube, kick: Radio, website: Globe2 };

export default function ProfileHeaderBar({ socials = [], region, joinedDate }) {
  return <div className="profile-header-bar">
    <div className="profile-header-details"><span><Globe2 size={14} />{region ? String(region).toUpperCase() : "Region not set"}</span><span><CalendarDays size={14} />Joined {joinedDate || "date unavailable"}</span></div>
    {socials.length > 0 && <div className="profile-header-socials" aria-label="Player socials">
      {socials.map((social) => {
        const Icon = icons[social.key] || Globe2;
        const Social = social.url ? "a" : "span";
        return <BadgeTooltip key={social.key} label={social.label} description={social.value} toneClass="text-cyan">
          <Social {...(social.url ? { href: social.url, target: "_blank", rel: "noopener noreferrer" } : { tabIndex: 0 })} aria-label={`${social.label}: ${social.value}`} className="profile-header-social"><Icon aria-hidden="true" /></Social>
        </BadgeTooltip>;
      })}
    </div>}
  </div>;
}
