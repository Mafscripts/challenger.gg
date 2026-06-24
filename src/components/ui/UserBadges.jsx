import React from "react";
import { Monitor, ShieldCheck } from "lucide-react";

const specialBadgeConfig = {
  verified_player: {
    label: "Verified Player",
    className: "border-green/25 bg-green/10 text-green",
    icon: ShieldCheck,
  },
  streamer: {
    label: "Streamer",
    className: "border-blue-400/25 bg-blue-500/10 text-blue-300",
    icon: Monitor,
  },
};

export const specialBadgeTypes = Object.keys(specialBadgeConfig);

export function userSpecialBadges(user) {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  const types = new Set(
    badges
      .map((badge) => badge?.type)
      .filter((type) => specialBadgeConfig[type])
  );

  if (user?.verified_player || user?.is_verified_player) types.add("verified_player");
  if (user?.streamer_badge || user?.is_streamer) types.add("streamer");

  return [...types].map((type) => ({
    type,
    name: badges.find((badge) => badge?.type === type)?.name || specialBadgeConfig[type].label,
  }));
}

export default function UserBadges({ user, badges, size = "sm", showForceStream = true, className = "" }) {
  const rows = badges || userSpecialBadges(user);
  const forcedStream = showForceStream && Boolean(user?.force_stream_required || user?.stream_override_required);
  if (rows.length === 0 && !forcedStream) return null;

  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  const iconClass = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {rows.map((badge) => {
        const config = specialBadgeConfig[badge.type];
        if (!config) return null;
        const Icon = config.icon;
        return (
          <span
            key={badge.type}
            className={`inline-flex items-center gap-1 rounded-md border font-black uppercase tracking-wider ${sizeClass} ${config.className}`}
          >
            <Icon className={iconClass} />
            {badge.name || config.label}
          </span>
        );
      })}
      {forcedStream && (
        <span className={`inline-flex items-center rounded-md border border-orange/25 bg-orange/10 font-black uppercase tracking-wider text-orange ${sizeClass}`}>
          Stream Required
        </span>
      )}
    </div>
  );
}
