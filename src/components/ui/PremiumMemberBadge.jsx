import React, { useId } from "react";
import { MEMBER_TIERS } from "@/lib/premiumMembership";

export default function PremiumMemberBadge({ tier, className = "", locked = false }) {
  const id = useId().replace(/:/g, ""), info = MEMBER_TIERS.find(item => item.id === tier) || MEMBER_TIERS[0];
  const level = MEMBER_TIERS.indexOf(info), color = info.color;
  return <svg viewBox="0 0 100 112" className={className} aria-hidden="true" style={{ color, opacity: locked ? .55 : 1 }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor={locked ? "#253746" : "#e9fbff"} /><stop offset=".45" stopColor={color} /><stop offset="1" stopColor={locked ? "#1b2a36" : "#173b58"} /></linearGradient></defs>
    {level >= 2 && <path d="m13 38-9 9 12 29 13 6M87 38l9 9-12 29-13 6" fill="none" stroke={color} strokeWidth="3" opacity=".6" />}
    <path d="M50 6 85 21v35c0 23-18 38-35 47C33 94 15 79 15 56V21Z" fill="#081824" stroke={`url(#${id})`} strokeWidth="3" />
    <path d="M50 14 77 26v29c0 18-13 31-27 40-14-9-27-22-27-40V26Z" fill={color} fillOpacity=".07" stroke={color} strokeOpacity=".25" />
    {level >= 3 && <path d="m33 19 5-10 12 7L62 9l5 10" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />}
    <path d="M34 36h32M50 36v26M39 49h22" fill="none" stroke={`url(#${id})`} strokeWidth="4.5" strokeLinecap="round" />
    <path d="m32 69 18 7 18-7" fill="none" stroke={color} strokeWidth="2" opacity=".7" />
    <text x="50" y="90" textAnchor="middle" fill={color} fontFamily="Arial,sans-serif" fontWeight="900" fontSize="12" letterSpacing="1">{info.mark}</text>
    {level === 4 && <path d="m50 0 4 5-4 5-4-5Z" fill={color} />}
  </svg>;
}
