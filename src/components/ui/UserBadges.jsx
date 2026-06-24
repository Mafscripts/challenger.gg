import React from "react";
import { AlertTriangle, BadgeCheck, Monitor } from "lucide-react";

const specialBadgeConfig = {
  verified_player: {
    label: "Verified Player",
    description: "This player is verified.",
    className: "border-green/35 bg-green/15 text-green shadow-[0_0_14px_rgba(0,255,128,0.22)]",
    icon: BadgeCheck,
  },
  streamer: {
    label: "Streamer",
    description: "Streamer badge.",
    className: "border-blue-400/35 bg-blue-500/10 text-blue-300 shadow-[0_0_14px_rgba(96,165,250,0.18)]",
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

export default function UserBadges({ user, badges, size = "sm", showForceStream = true, iconOnly = false, className = "" }) {
  const rows = badges || userSpecialBadges(user);
  const forcedStream = showForceStream && Boolean(user?.force_stream_required || user?.stream_override_required);
  if (rows.length === 0 && !forcedStream) return null;

  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  const iconClass = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";
  const iconOnlyClass = size === "xs" ? "h-5 w-5" : "h-6 w-6";

  const tooltip = (label, description, Icon, toneClass) => (
    <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-36 -translate-x-1/2 rounded-lg border border-white/10 bg-[#111821] px-3 py-2 text-left opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
      <span className={`mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider ${toneClass}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="block text-[11px] font-medium normal-case leading-snug tracking-normal text-vapor">
        {description}
      </span>
    </span>
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {rows.map((badge) => {
        const config = specialBadgeConfig[badge.type];
        if (!config) return null;
        const Icon = config.icon;
        if (iconOnly) {
          return (
            <span
              key={badge.type}
              className={`group relative inline-flex shrink-0 cursor-default select-none items-center justify-center rounded-full border ${iconOnlyClass} ${config.className}`}
            >
              <Icon className={iconClass} />
              {tooltip(badge.name || config.label, config.description, Icon, config.className.split(" ").find((token) => token.startsWith("text-")) || "text-white")}
            </span>
          );
        }
        return (
          <span
            key={badge.type}
            className={`group relative inline-flex cursor-default select-none items-center gap-1 rounded-md border font-black uppercase tracking-wider ${sizeClass} ${config.className}`}
          >
            <Icon className={iconClass} />
            {badge.name || config.label}
            {tooltip(badge.name || config.label, config.description, Icon, config.className.split(" ").find((token) => token.startsWith("text-")) || "text-white")}
          </span>
        );
      })}
      {forcedStream && (
        <span
          className={`${iconOnly ? `justify-center rounded-full ${iconOnlyClass}` : `rounded-md ${sizeClass}`} group relative inline-flex cursor-default select-none items-center border border-orange/25 bg-orange/10 font-black uppercase tracking-wider text-orange`}
        >
          {iconOnly ? <AlertTriangle className={iconClass} /> : "Stream Required"}
          {tooltip("Stream Required", "Admin requires this player to stream", AlertTriangle, "text-orange")}
        </span>
      )}
    </div>
  );
}
