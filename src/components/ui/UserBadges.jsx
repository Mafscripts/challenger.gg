import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Crown, Monitor } from "lucide-react";

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
  premium: {
    label: "Premium",
    description: "Active Premium member.",
    className: "border-yellow-400/35 bg-yellow-400/10 text-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.18)]",
    icon: Crown,
  },
};

export const specialBadgeTypes = Object.keys(specialBadgeConfig);

export function hasActivePremium(user) {
  if (!user?.is_premium) return false;
  if (!user.premium_expires) return true;
  const expiresAt = new Date(user.premium_expires).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function userSpecialBadges(user) {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  const types = new Set(
    badges
      .map((badge) => badge?.type)
      .filter((type) => specialBadgeConfig[type])
  );

  if (user?.verified_player || user?.is_verified_player) types.add("verified_player");
  if (user?.streamer_badge || user?.is_streamer) types.add("streamer");
  if (hasActivePremium(user)) types.add("premium");
  else types.delete("premium");

  return [...types].map((type) => ({
    type,
    name: badges.find((badge) => badge?.type === type)?.name || specialBadgeConfig[type].label,
  }));
}

export default function UserBadges({
  user,
  badges,
  size = "sm",
  showForceStream = true,
  showMonitorCam = false,
  iconOnly = false,
  streamerHref = "",
  showTooltip = true,
  tooltipPlacement = "top",
  className = "",
}) {
  const rows = badges || userSpecialBadges(user);
  const forcedStream = showForceStream && Boolean(user?.force_stream_required || user?.stream_override_required);
  const monitorCamRequired = showMonitorCam && Boolean(user?.monitor_cam_required || user?.required_monitor_cam || user?.moni_cam_required || user?.monitor_cam_override_required);
  if (rows.length === 0 && !forcedStream && !monitorCamRequired) return null;

  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  const iconClass = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";
  const iconOnlyClass = size === "xs" ? "h-5 w-5" : "h-6 w-6";

  const tooltipPositionClass = tooltipPlacement === "bottom"
    ? "left-1/2 top-full mt-2 -translate-x-1/2"
    : "bottom-full left-1/2 mb-2 -translate-x-1/2";

  const tooltip = (label, description, Icon, toneClass) => (
    <span className={`pointer-events-none invisible absolute z-[70] w-36 rounded-lg border border-white/10 bg-popover px-3 py-2 text-left opacity-0 shadow-2xl transition-all group-hover/badge:visible group-hover/badge:opacity-100 ${tooltipPositionClass}`}>
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
        const badgeHref = badge.type === "streamer" ? streamerHref : "";
        const BadgeTag = badgeHref ? Link : "span";
        const linkProps = badgeHref ? { to: badgeHref, title: "Open streamer tournaments" } : {};
        if (iconOnly) {
          return (
            <BadgeTag
              key={badge.type}
              {...linkProps}
              title={linkProps.title}
              className={`group/badge relative inline-flex shrink-0 select-none items-center justify-center rounded-full border ${iconOnlyClass} ${badgeHref ? "cursor-pointer transition-transform hover:-translate-y-0.5" : "cursor-default"} ${config.className}`}
            >
              <Icon className={iconClass} />
              {showTooltip && tooltip(badge.name || config.label, config.description, Icon, config.className.split(" ").find((token) => token.startsWith("text-")) || "text-white")}
            </BadgeTag>
          );
        }
        return (
          <BadgeTag
            key={badge.type}
            {...linkProps}
            className={`group/badge relative inline-flex select-none items-center gap-1 rounded-md border font-black uppercase tracking-wider ${sizeClass} ${badgeHref ? "cursor-pointer transition-transform hover:-translate-y-0.5" : "cursor-default"} ${config.className}`}
          >
            <Icon className={iconClass} />
            {badge.name || config.label}
            {showTooltip && tooltip(badge.name || config.label, config.description, Icon, config.className.split(" ").find((token) => token.startsWith("text-")) || "text-white")}
          </BadgeTag>
        );
      })}
      {forcedStream && (
        <span
          className={`${iconOnly ? `justify-center rounded-full ${iconOnlyClass}` : `rounded-md ${sizeClass}`} group/badge relative inline-flex cursor-default select-none items-center border border-orange/25 bg-orange/10 font-black uppercase tracking-wider text-orange`}
        >
          {iconOnly ? <AlertTriangle className={iconClass} /> : "Stream Required"}
          {showTooltip && tooltip("Stream Required", "Admin requires this player to stream", AlertTriangle, "text-orange")}
        </span>
      )}
      {monitorCamRequired && (
        <span
          className={`${iconOnly ? `justify-center rounded-full ${iconOnlyClass}` : `rounded-md ${sizeClass}`} group/badge relative inline-flex cursor-default select-none items-center border border-red-400/35 bg-red-500/10 font-black uppercase tracking-wider text-red-400 shadow-[0_0_14px_rgba(248,113,113,0.2)]`}
        >
          {iconOnly ? "!" : "Monitor Cam Required"}
          {showTooltip && tooltip("Monitor Cam", "This player must use monitor cam in match rooms.", AlertTriangle, "text-red-400")}
        </span>
      )}
    </div>
  );
}
