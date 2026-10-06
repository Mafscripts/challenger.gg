import React from "react";
import { Link } from "react-router-dom";
import { AtSign, Globe2, MessageCircle, Trophy, Twitch, Youtube } from "lucide-react";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import TrophyCounts from "@/components/ui/TrophyCounts";
import UserBadges from "@/components/ui/UserBadges";

const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value) => `$${number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const playerName = (player) => player?.user_name || player?.name || player?.full_name || player?.username || player?.display_name || player?.email || "Unknown player";
const teamMonogram = (name) => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
  return String(words[0] || "--").slice(0, 2).toUpperCase();
};
const trophiesFor = (player) => player?.trophies || {
  gold: number(player?.gold_count),
  silver: number(player?.silver_count),
  bronze: number(player?.bronze_count),
  premium: number(player?.premium_count),
};
const socialsFor = (player) => player?.socials || {
  discord: player?.discord_username || player?.discord,
  twitter: player?.twitter || player?.x || player?.twitter_url,
  twitch: player?.twitch || player?.twitch_url,
  youtube: player?.youtube || player?.youtube_url,
  website: player?.website || player?.website_url,
};
const recordFor = (player) => ({
  wins: number(player?.wins ?? player?.wager_wins ?? player?.eights_wins),
  losses: number(player?.losses ?? player?.wager_losses ?? player?.eights_losses),
});
const earningsFor = (player) => Math.max(number(player?.earnings), number(player?.lifetime_earnings), number(player?.total_wager_earnings));

const socialDefinitions = [
  { key: "discord", label: "Discord", icon: MessageCircle },
  { key: "twitter", label: "X", icon: AtSign },
  { key: "twitch", label: "Twitch", icon: Twitch },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "website", label: "Website", icon: Globe2 },
];

const socialUrl = (key, value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (key === "discord") {
    const invite = text.replace(/^discord\.gg\//i, "").replace(/^discord\.com\/invite\//i, "");
    return invite !== text ? `https://discord.gg/${invite}` : "";
  }
  const handle = text.replace(/^@/, "");
  if (key === "twitter") return `https://x.com/${handle}`;
  if (key === "twitch") return `https://twitch.tv/${handle}`;
  if (key === "youtube") return `https://youtube.com/${handle}`;
  return key === "website" ? `https://${text}` : "";
};

function TournamentRankBadge({ goldTrophies }) {
  const gold = number(goldTrophies);
  if (gold < 3) return null;
  const rank = gold > 5
    ? { label: "Pro", className: "border-yellow-300/30 bg-yellow-300/[0.1] text-yellow-300" }
    : gold === 5
        ? { label: "Semi Pro", className: "border-cyan/25 bg-cyan/[0.08] text-cyan" }
      : { label: "Amateur", className: "border-amber-500/25 bg-amber-500/[0.08] text-amber-400" };
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${rank.className}`}><Trophy className="h-2.5 w-2.5" />{rank.label}</span>;
}

function PlayerSocials({ player }) {
  const socials = socialsFor(player);
  const available = socialDefinitions.filter(({ key }) => socials?.[key]);
  if (available.length === 0) return <span className="text-xs text-vapor/45">&mdash;</span>;
  return (
    <div className="grid w-full max-w-[86px] grid-cols-4 gap-1">
      {available.map(({ key, label, icon: Icon }) => {
        const href = socialUrl(key, socials[key]);
        const classes = "inline-flex h-5 w-full min-w-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/20 text-vapor transition-colors hover:border-cyan/30 hover:text-cyan";
        return href ? <a key={key} href={href} target="_blank" rel="noreferrer" title={label} className={classes}><Icon className="h-3 w-3" /></a> : <span key={key} title={`${label}: ${socials[key]}`} className={classes}><Icon className="h-3 w-3" /></span>;
      })}
    </div>
  );
}

export default function MatchTeamTable({ label, name, color = "cyan", seed, isFirstHost = false, players = [], captainId, isComplete = false, isWinner = false, finalScore = 0 }) {
  const isOrange = color === "orange";
  const toneClass = isOrange ? "text-orange" : "text-cyan";
  const tintClass = isOrange ? "border-orange/30 bg-orange/10" : "border-cyan/30 bg-cyan/10";
  const hoverToneClass = isOrange ? "hover:text-orange" : "hover:text-cyan";

  return (
    <section className="match-team-card relative overflow-visible rounded-xl border border-white/[0.075] bg-[#1c2025]">
      <div className={`absolute inset-x-10 top-0 h-px ${isOrange ? "bg-gradient-to-r from-transparent via-orange/70 to-transparent" : "bg-gradient-to-r from-transparent via-cyan/70 to-transparent"}`} />
      <header className="flex flex-col gap-4 bg-[#202328] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border font-mono text-base font-black ${tintClass} ${toneClass}`}>{teamMonogram(name || label)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${toneClass}`}>{label}</p>
            {seed ? <span className="rounded-md border border-white/[0.06] bg-black/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-vapor">Seed #{seed}</span> : null}
            {isFirstHost ? <span className={`rounded-md border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${tintClass} ${toneClass}`}>Hosts map 1</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2.5"><h3 className="truncate text-xl font-black sm:text-2xl">{name || "Open slot"}</h3>{isWinner ? <span className="inline-flex items-center gap-1 rounded-md border border-green/25 bg-green/[0.09] px-2 py-1 text-[8px] font-black uppercase tracking-wider text-green"><Trophy className="h-3 w-3" /> Winner</span> : null}</div>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-vapor">{players.length} confirmed player{players.length === 1 ? "" : "s"}</p>
        </div>
        {isComplete && name ? <div className="min-w-28 shrink-0 rounded-xl border border-white/[0.08] bg-black/20 px-5 py-2.5 text-center"><p className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor">Final score</p><p className={`mt-1 font-mono text-2xl font-black tabular-nums ${toneClass}`}>{finalScore ?? 0}</p></div> : null}
      </header>

      <div className="hidden grid-cols-[minmax(210px,1.25fr)_minmax(170px,.9fr)_90px_105px_minmax(210px,1fr)_86px] gap-3 border-y border-white/[0.07] bg-[#2a2d33] px-5 py-3 text-[8px] font-black uppercase tracking-[0.18em] text-vapor xl:grid"><span>User</span><span>Gamertag</span><span>Record</span><span>Earnings</span><span>Trophies</span><span>Socials</span></div>
      {players.length === 0 ? <div className="flex min-h-28 items-center justify-center border-t border-white/[0.06] text-xs text-vapor">Roster unavailable</div> : (
        <div className="divide-y divide-white/[0.055]">
          {players.map((player, index) => {
            const userId = player.user_id || player.id;
            const displayName = playerName(player);
            const profileSlug = userId || player.username || player.handle || player.user_name;
            const trophies = trophiesFor(player);
            const record = recordFor(player);
            const role = player.role || (captainId && String(userId) === String(captainId) ? "captain" : "member");
            return (
              <article key={userId || `${displayName}-${index}`} className="match-player-card grid gap-4 bg-[#191c21] px-4 py-4 transition-colors hover:bg-[#24282d] sm:px-5 xl:grid-cols-[minmax(210px,1.25fr)_minmax(170px,.9fr)_90px_105px_minmax(210px,1fr)_86px] xl:items-center xl:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border font-mono text-sm font-black ${tintClass} ${toneClass}`}>{player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : displayName.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2">{profileSlug ? <Link to={`/profile/${encodeURIComponent(profileSlug)}`} data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white transition-colors ${hoverToneClass} ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</Link> : <span data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</span>}<TournamentRankBadge goldTrophies={trophies.gold} /><UserBadges user={player} size="xs" iconOnly showMonitorCam className="min-w-0" /></div><p className={`mt-1 truncate text-[9px] font-black uppercase ${role === "captain" ? "text-cyan" : "text-vapor"}`}>{role === "captain" ? "Captain" : "Member"}</p></div>
                </div>
                <div className="min-w-0"><p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor xl:hidden">Gamertag</p><div className="inline-flex max-w-full rounded-lg border border-white/[0.18] bg-[#30343a] px-3 py-2"><ActivisionIdLabel user={player} className="max-w-full" /></div></div>
                <div><p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor xl:hidden">Record</p><p className="font-mono text-sm font-black"><span className="text-white">{record.wins}W</span><span className="mx-1.5 text-white/20">/</span><span className="text-vapor">{record.losses}L</span></p></div>
                <div><p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor xl:hidden">Earnings</p><p className="font-mono text-sm font-black text-green">{money(earningsFor(player))}</p></div>
                <div><p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor xl:hidden">Trophies</p><TrophyCounts trophies={trophies} /></div>
                <div><p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor xl:hidden">Socials</p><PlayerSocials player={player} /></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
