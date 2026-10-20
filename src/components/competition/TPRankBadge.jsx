import React, { useId } from "react";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import { tpRank, TP_RANK_TIERS } from "@/lib/tpRanks";
import "@/styles/tp-rank.css";

const star = "48 22 55 37 72 39 60 51 63 68 48 60 33 68 36 51 24 39 41 37";

function TPStar({ rank }) {
  const uid = useId().replace(/:/g, "");
  const level = rank.elite ? 9 : rank.level;
  const champion = rank.elite && rank.position === 1;
  const metal = rank.elite || level === 7 ? "#e9bd55" : level === 8 ? "#e8ddff" : rank.color;
  const dark = rank.elite ? "#76501d" : level >= 7 ? "#61557a" : "#253d55";
  const gem = rank.elite ? champion ? "#ff7771" : "#c292ff" : rank.color;
  const paint = (name) => `url(#tp-${name}-${uid})`;
  const spark = (cx, cy, radius) => `${cx} ${cy-radius} ${cx+radius*.3} ${cy-radius*.3} ${cx+radius} ${cy} ${cx+radius*.3} ${cy+radius*.3} ${cx} ${cy+radius} ${cx-radius*.3} ${cy+radius*.3} ${cx-radius} ${cy} ${cx-radius*.3} ${cy-radius*.3}`;
  return <svg className={`tp-rank-star${rank.elite ? " tp-rank-star-elite" : ""}`} viewBox="0 0 96 96" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`tp-metal-${uid}`} x1="20" y1="10" x2="72" y2="85" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fffbed" /><stop offset=".19" stopColor={metal} /><stop offset=".42" stopColor="#fffdf3" /><stop offset=".48" stopColor={metal} /><stop offset=".76" stopColor={dark} /><stop offset="1" stopColor={metal} />
      </linearGradient>
      <linearGradient id={`tp-edge-${uid}`} x1="28" y1="14" x2="65" y2="81" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fffdf1" /><stop offset=".42" stopColor={metal} /><stop offset=".6" stopColor={dark} /><stop offset="1" stopColor={metal} />
      </linearGradient>
      <linearGradient id={`tp-gem-${uid}`} x1="38" y1="30" x2="60" y2="62" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" /><stop offset=".25" stopColor={gem} /><stop offset="1" stopColor={rank.elite ? "#50284f" : "#142739"} />
      </linearGradient>
      <radialGradient id={`tp-core-${uid}`}><stop stopColor={gem} stopOpacity=".24" /><stop offset="1" stopColor="#08131f" /></radialGradient>
    </defs>
    {/* Each tier adds a different silhouette, so rank remains visible at small sizes. */}
    {level >= 3 && <path d={level >= 8 ? "M48 7 77 20 84 49 70 74 48 88 26 74 12 49 19 20Z" : "M48 15 72 24 75 53 65 71 48 82 31 71 21 53 24 24Z"} fill="#07121d" stroke={paint("edge")} strokeWidth={level >= 8 ? 2 : 1.5} />}
    {level >= 4 && [false, true].map(right => <g key={`wings-${right}`} transform={right ? "translate(96 0) scale(-1 1)" : undefined}>
      <path d={level >= 6 ? "M29 35 4 22 9 40 24 48 6 41 13 56 27 61 13 56 21 71 36 75 32 59Z" : "M28 36 11 30 17 48 25 53 18 49 23 64 35 70 31 52Z"} fill={paint("metal")} stroke={dark} strokeWidth=".9" strokeLinejoin="round" />
      <path d={level >= 6 ? "m9 29 17 11M12 47l14 7M19 63l12 5" : "m17 37 10 7m-3 13 7 6"} stroke="#fff" strokeOpacity=".45" strokeWidth="1" />
    </g>)}
    {level >= 7 && [false, true].map(right => <g key={`laurel-${right}`} transform={right ? "translate(96 0) scale(-1 1)" : undefined}>
      <path d="M43 84C17 78 10 56 17 32" stroke={paint("edge")} strokeWidth="1.4" />
      {[0,1,2,3].map(i => <path key={i} d={`M${19+i*3} ${47+i*8}q-11 -1 -9 -12q9 0 9 12Z`} fill={paint("metal")} transform={`rotate(${-i*9} ${19+i*3} ${47+i*8})`} />)}
    </g>)}
    {level >= 5 && <circle cx="48" cy="45" r={level >= 8 ? 31 : 27} fill={paint("core")} stroke={paint("edge")} strokeWidth="1.3" />}
    {level >= 8 && <>
      <path d="m48 2 5 10-5 7-5-7Zm0 76 5 7-5 9-5-9Z" fill={paint("metal")} stroke={metal} strokeWidth=".7" />
      <path d="m15 18 12-7m42 0 12 7M12 69l10 10m52 0 10-10" stroke={metal} strokeWidth="1.4" />
      {[[-1,1],[1,1],[-1,-1],[1,-1]].map(([x,y]) => <polygon key={`${x}:${y}`} points={spark(48+x*30,45+y*23,3)} fill={gem} />)}
    </>}
    {level === 2 && <path d="m48 17 29 20-11 34H30L19 37Z" stroke={metal} strokeOpacity=".6" strokeWidth="1.2" />}
    <polygon points={star} fill={paint("metal")} stroke="#050c14" strokeWidth="3.6" strokeLinejoin="round" />
    <polygon points={star} fill={paint("metal")} stroke={paint("edge")} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="m48 22 0 23-24-6 17-2Zm0 23 15 23-3-17 12-12Z" fill="#fff" fillOpacity=".28" />
    <path d="m48 45 0 15-15 8 3-17Zm0 0 7-8-7-15Z" fill="#07101d" fillOpacity=".4" />
    {level >= 2 && <polygon points="48 33 52 41 61 43 55 49 56 58 48 54 40 58 41 49 35 43 44 41" fill={level >= 5 ? "#0b1624" : paint("gem")} stroke={paint("edge")} strokeWidth="1" />}
    {level >= 5 && <>
      <path d="m48 34 8 12-8 13-8-13Z" fill={paint("gem")} stroke="#fff8e5" strokeWidth=".8" />
      <path d="m48 34 0 12 8 0m-8 13V46l-8 0" stroke="#fff" strokeOpacity=".4" strokeWidth=".7" />
    </>}
    {level >= 6 && !champion && <path d="m37 13 11-6 11 6-11 6Z" fill={paint("metal")} stroke={metal} strokeWidth=".6" />}
    {rank.elite && <>
      <path d="m33 77 15 5 15-5-4 10H37Z" fill={paint("metal")} stroke={metal} strokeWidth="1" />
      <path d="m39 80 9 3 9-3" stroke="#fff8df" strokeWidth=".7" />
      <polygon points={spark(8,18,4)} fill="#fff4c5" /><polygon points={spark(88,18,4)} fill="#fff4c5" />
    </>}
    {champion && <>
      <path d="m30 21-3-17 13 8 8-11 8 11 13-8-3 17-18 5Z" fill="#5b391a" stroke="#fff1b6" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m31 7 9 9 8-11 8 11 9-9-2 12-15 4-15-4Z" fill={paint("metal")} />
      <path d="m48 12 3 5-3 4-3-4Z" fill="#ff8a7e" stroke="#ffe5be" strokeWidth=".6" />
      <path d="M34 24 48 28l14-4" stroke="#fff0b5" strokeWidth="2" />
    </>}
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
