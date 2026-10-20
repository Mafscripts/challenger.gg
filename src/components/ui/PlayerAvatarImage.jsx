import React, { useState } from "react";

const DEFAULT_PLAYER_AVATAR = "/assets/default-player-avatar.svg";

export default function PlayerAvatarImage({ src, alt = "", className = "", loading = "lazy" }) {
  const [failedSrc, setFailedSrc] = useState("");
  const customSrc = typeof src === "string" ? src.trim() : "";
  const imageSrc = customSrc && customSrc !== failedSrc ? customSrc : DEFAULT_PLAYER_AVATAR;

  return <img src={imageSrc} alt={alt} loading={loading} decoding="async"
    className={`block h-full w-full object-cover ${className}`}
    onError={() => { if (imageSrc !== DEFAULT_PLAYER_AVATAR) setFailedSrc(imageSrc); }} />;
}
