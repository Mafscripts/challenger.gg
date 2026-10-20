import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BadgeCheck, Crown, Monitor } from "lucide-react";
import BadgeTooltip from "@/components/ui/BadgeTooltip";

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
    className: "border-white/15 bg-white/[0.055] text-vapor shadow-[0_0_14px_rgba(210,214,220,0.08)]",
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
  showMonitorCam = true,
  iconOnly = false,
  streamerHref = "",
  showTooltip = true,
  tooltipPlacement = "top",
  className = "",
}) {
  const suppliedBadges = Array.isArray(badges) ? badges : [];
  const automaticBadges = userSpecialBadges(user);
  const rows = [...suppliedBadges, ...automaticBadges].filter((badge, index, all) => (
    specialBadgeConfig[badge?.type] && all.findIndex(candidate => candidate?.type === badge.type) === index
  ));
  const forcedStream = showForceStream && Boolean(user?.force_stream_required || user?.stream_override_required);
  const monitorCamRequired = showMonitorCam && Boolean(user?.monitor_cam_required || user?.required_monitor_cam || user?.moni_cam_required || user?.monitor_cam_override_required);
  if (rows.length === 0 && !forcedStream && !monitorCamRequired) return null;

  const sizeClass = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  const iconClass = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";
  const iconOnlyClass = size === "xs" ? "h-5 w-5" : "h-6 w-6";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {rows.map((badge) => {
        const config = specialBadgeConfig[badge.type];
        if (!config) return null;
        const Icon = config.icon;
        const badgeHref = badge.type === "streamer" ? streamerHref : "";
        const BadgeTag = badgeHref ? Link : "span";
        const linkProps = badgeHref ? { to: badgeHref, "aria-label": "Open streamer tournaments" } : {};
        return (
          <BadgeTooltip
            key={badge.type}
            enabled={showTooltip}
            label={badge.name || config.label}
            description={config.description}
            icon={Icon}
            toneClass={config.className.split(" ").find((token) => token.startsWith("text-")) || "text-white"}
            placement={tooltipPlacement}
          >
            <BadgeTag
              {...linkProps}
              tabIndex={showTooltip ? 0 : undefined}
              aria-label={iconOnly ? badge.name || config.label : linkProps["aria-label"]}
              className={`relative inline-flex select-none items-center border font-black uppercase tracking-wider ${iconOnly ? `shrink-0 justify-center rounded-full ${iconOnlyClass}` : `gap-1 rounded-md ${sizeClass}`} ${badgeHref ? "cursor-pointer transition-transform hover:-translate-y-0.5" : "cursor-default"} ${config.className}`}
            >
              <Icon className={iconClass} />
              {!iconOnly && (badge.name || config.label)}
            </BadgeTag>
          </BadgeTooltip>
        );
      })}
      {forcedStream && (
        <BadgeTooltip enabled={showTooltip} label="Stream Required" description={user?.stream_required_by_rules ? "Every player in this competition must stream on Twitch, YouTube or Kick, including console and verified players." : "Admin requires this player to stream"} icon={AlertTriangle} toneClass="text-orange" placement={tooltipPlacement}>
          <span tabIndex={showTooltip ? 0 : undefined} aria-label={iconOnly ? "Stream Required" : undefined}
            className={`${iconOnly ? `justify-center rounded-full ${iconOnlyClass}` : `rounded-md ${sizeClass}`} relative inline-flex cursor-default select-none items-center border border-orange/25 bg-orange/10 font-black uppercase tracking-wider text-orange`}>
            {iconOnly ? <AlertTriangle className={iconClass} /> : "Stream Required"}
          </span>
        </BadgeTooltip>
      )}
      {monitorCamRequired && (
        <BadgeTooltip enabled={showTooltip} label="Monitor Cam" description="This player must use monitor cam in match rooms." icon={AlertTriangle} toneClass="text-red-400" placement={tooltipPlacement}>
          <span tabIndex={showTooltip ? 0 : undefined} aria-label={iconOnly ? "Monitor Cam Required" : undefined}
            className={`${iconOnly ? `justify-center rounded-full ${iconOnlyClass}` : `rounded-md ${sizeClass}`} relative inline-flex cursor-default select-none items-center border border-red-400/35 bg-red-500/10 font-black uppercase tracking-wider text-red-400 shadow-[0_0_14px_rgba(248,113,113,0.2)]`}>
            {iconOnly ? "!" : "Monitor Cam Required"}
          </span>
        </BadgeTooltip>
      )}
    </div>
  );
}
