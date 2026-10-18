import React, { useId } from "react";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import { tpRank, TP_RANK_TIERS } from "@/lib/tpRanks";
import "@/styles/tp-rank.css";

const star = "32 8 38.2 23.5 55 24.7 42.2 35.6 46.3 52 32 43 17.7 52 21.8 35.6 9 24.7 25.8 23.5Z";

function TPStar({ rank }) {
  const uid = useId().replace(/:/g, "");
  const fillId = `tp-metal-${uid}`;
  const detailed = rank.elite ? 8 : rank.level;
  return <svg className={`tp-rank-star${rank.elite ? " tp-rank-star-elite" : ""}`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs><linearGradient id={fillId} x1="12" y1="8" x2="49" y2="56" gradientUnits="userSpaceOnUse">
      <stop stopColor={rank.elite ? "#fff8cd" : "#ffffff"} />
      <stop offset=".36" stopColor={rank.elite ? "#fde68a" : rank.color} />
      <stop offset=".67" stopColor={rank.elite ? "#b87912" : rank.color} />
      <stop offset="1" stopColor={rank.elite ? "#fff1b8" : "#334155"} />
    </linearGradient></defs>
    {detailed >= 3 && <circle cx="32" cy="31" r="25" stroke="currentColor" strokeOpacity=".35" strokeWidth="1" strokeDasharray={detailed >= 5 ? "2 3" : "35 7"} />}
    {detailed >= 4 && <path d="m4 29 8 6 4 17-8-7Zm56 0-8 6-4 17 8-7ZM10 49l11 8 1 4-12-8Zm44 0-11 8-1 4 12-8Z" fill="currentColor" fillOpacity=".7" />}
    {detailed >= 6 && <path d="m32 1 3 5-3 5-3-5Zm-27 16 4 1 2 5-5-1Zm54 0-4 1-2 5 5-1ZM29 57h6l-3 6Z" fill="currentColor" />}
    {detailed >= 7 && <path d="M16 10 7 24M48 10l9 14M4 32l-2 8m60-8 1 8M25 59h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    {rank.elite && <>
      <path d="M12 13 22 6M42 6l10 7M2 26l5-3M62 26l-5-3" stroke="#f0abfc" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m32 1 2 3-2 3-2-3ZM2 40l2 2-2 2-2-2Zm60 0 2 2-2 2-2-2Z" fill="#fff6db" />
      <circle cx="32" cy="31" r="29" stroke="#fde68a" strokeOpacity=".35" strokeWidth=".7" />
    </>}
    {rank.elite && rank.position === 1 && <path d="m18 12 2-10 7 5 5-7 5 7 7-5 2 10-14-3Z" fill="#fff2b0" stroke="#facc15" strokeWidth=".8" />}
    <path d={`M${star}`} fill={`url(#${fillId})`} stroke={rank.elite ? "#fff1b8" : "currentColor"} strokeWidth="1.2" strokeLinejoin="round" />
    {detailed >= 2 && <>
      <path d="M32 8v24l-22-7.3L25.8 23.5Z" fill="white" fillOpacity=".25" />
      <path d="m32 32 14.3 20L42.2 35.6 55 24.7Z" fill="#07111e" fillOpacity=".35" />
      <path d="M32 32v11L17.7 52Z" fill="#07111e" fillOpacity=".25" />
    </>}
    {detailed >= 5 && <path d="m32 20 3 8 8 .5-6 5 1.8 8-6.8-4.3-6.8 4.3 1.8-8-6-5 8-.5Z" fill="#0b1016" fillOpacity=".65" stroke="currentColor" strokeWidth=".8" />}
    {detailed >= 8 && <path d="m32 25 4 6-4 6-4-6Z" fill={rank.elite ? "#f0abfc" : "#fff8d6"} stroke="white" strokeWidth=".7" />}
  </svg>;
}

export default function TPRankBadge({ xp = 0, matchesPlayed = 0, position = null, loading = false, showXp = false, size = "compact" }) {
  const rank = tpRank({ xp, matchesPlayed, position });
  if (loading) return <span className="tp-rank-loading" role="status" aria-label="Loading TP rank" />;
  if (!rank.level) return <span className="tp-rank-unranked" title="Complete your first XP Match to earn a TP RANK star.">Unranked</span>;
  const next = TP_RANK_TIERS.find((tier) => tier.minXp > rank.xp);
  const description = `${rank.xp.toLocaleString()} XP · ${rank.matchesPlayed.toLocaleString()} completed XP matches.${rank.elite ? ` Exclusive numbered star for XP leaderboard #${rank.position}.` : next ? ` Next star at ${next.minXp.toLocaleString()} XP.` : " Maximum XP star."}`;
  return <BadgeTooltip label={`TP RANK · ${rank.elite ? `${rank.position === 1 ? "Champion " : ""}#${rank.position}` : rank.name}`} description={description} toneClass="text-cyan">
    <span tabIndex={0} className={`tp-rank-badge tp-rank-${size}${rank.elite ? " tp-rank-elite" : ""}${rank.elite && rank.position === 1 ? " tp-rank-champion" : ""}`} style={{ "--tp-rank-color": rank.elite ? "#facc15" : rank.color }} aria-label={`TP RANK ${rank.name}${rank.position ? `, #${rank.position}` : ""}, ${rank.xp} XP`}>
      <span className="tp-rank-symbol"><TPStar rank={rank} />{rank.elite && <span className="tp-rank-number">#{rank.position}</span>}</span>
      {showXp && <span className="tp-rank-xp">{rank.xp.toLocaleString()} XP</span>}
    </span>
  </BadgeTooltip>;
}

export function TPRankGuide() {
  return <details className="tp-rank-guide">
    <summary>TP RANK <span>How stars work</span></summary>
    <div className="tp-rank-guide-content">
      <p>Complete your first XP Match to earn a star, win or lose. Until then, you are Unranked with no symbol. Higher XP unlocks more detailed stars.</p>
      <div className="tp-rank-guide-tiers">
        {TP_RANK_TIERS.map((tier) => <div key={tier.level} className="tp-rank-guide-tier"><TPRankBadge xp={tier.minXp} matchesPlayed={1} size="large" /><strong>{tier.name}</strong><span>{tier.minXp.toLocaleString()}+ XP</span></div>)}
      </div>
      <div className="tp-rank-guide-elite">
        <TPRankBadge xp={50000} matchesPlayed={1} position={127} size="large" />
        <div><strong>Top 1000 · Your own number</strong><p>The highest 1,000 eligible players on the XP leaderboard wear the exclusive gold star with their current position. Your position updates with the standings and replaces your regular XP star.</p></div>
        <TPRankBadge xp={50000} matchesPlayed={1} position={1} size="large" />
        <div><strong>#1 · Champion</strong><p>Only the current leader wears the crowned Champion star.</p></div>
      </div>
      <p>TP RANK is exclusive to XP Matches. Ranked and Free 8s use their own ranks. The stars shown here are previews.</p>
    </div>
  </details>;
}
