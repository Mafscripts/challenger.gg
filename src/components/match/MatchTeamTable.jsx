import React, { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, AtSign, Globe2, MessageCircle, Trophy, Twitch, Youtube } from "lucide-react";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import TrophyCounts from "@/components/ui/TrophyCounts";
import UserBadges from "@/components/ui/UserBadges";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FreeEightsRankBadge from "@/components/competition/FreeEightsRankBadge";
import { FreeEightsVoiceBadge } from "@/components/competition/FreeEightsDiscord";
import { normalizeFreeEightsElo } from "@/lib/freeEightsRanks";

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
const trophiesFor = (player) => (player?.trophies && typeof player.trophies === "object") ? player.trophies : {
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
  { key: "discord", label: "Discord", icon: MessageCircle, toneClass: "text-purple-300", description: "Open this player's Discord link." },
  { key: "twitter", label: "X", icon: AtSign, toneClass: "text-white", description: "Open this player's X profile." },
  { key: "twitch", label: "Twitch", icon: Twitch, toneClass: "text-purple-300", description: "Open this player's Twitch channel." },
  { key: "youtube", label: "YouTube", icon: Youtube, toneClass: "text-red-400", description: "Open this player's YouTube channel." },
  { key: "website", label: "Website", icon: Globe2, toneClass: "text-cyan", description: "Open this player's website." },
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
  const tooltipPrefix = useId();
  const socials = socialsFor(player);
  const available = socialDefinitions.filter(({ key }) => socials?.[key]);
  if (available.length === 0) return <span className="text-xs text-vapor/45">&mdash;</span>;
  return (
    <div className="grid w-full max-w-[86px] grid-cols-4 gap-1">
      {available.map(({ key, label, icon: Icon, toneClass, description }) => {
        const href = socialUrl(key, socials[key]);
        const tooltipId = `${tooltipPrefix}-${key}`;
        const Social = href ? "a" : "span";
        const classes = "group/badge relative inline-flex h-5 w-full min-w-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/20 text-vapor transition-colors hover:border-cyan/30 hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan";
        return <Social key={key} {...(href ? { href, target: "_blank", rel: "noopener noreferrer" } : { tabIndex: 0 })} aria-label={label} aria-describedby={tooltipId} className={classes}><Icon className="h-3 w-3" aria-hidden="true" /><BadgeTooltip id={tooltipId} label={label} description={href ? description : `${label}: ${socials[key]}`} icon={Icon} toneClass={toneClass} /></Social>;
      })}
    </div>
  );
}

export default function MatchTeamTable({ label, name, color = "cyan", seed, isFirstHost = false, players = [], captainId, isComplete = false, isWinner = false, finalScore = 0, freeEights = false, eloChanges = {}, voiceStates = [], waitingRoomUrl, teamEditing }) {
  const isOrange = color === "orange";
  const toneClass = isOrange ? "text-orange" : "text-cyan";
  const tintClass = isOrange ? "border-orange/30 bg-orange/10" : "border-cyan/30 bg-cyan/10";
  const hoverToneClass = isOrange ? "hover:text-orange" : "hover:text-cyan";
  const columns = freeEights
    ? "[@container(min-width:1020px)]:grid-cols-[minmax(190px,1.3fr)_minmax(170px,.9fr)_minmax(110px,.8fr)_85px_70px_minmax(170px,1fr)_86px]"
    : "xl:grid-cols-[minmax(210px,1.25fr)_minmax(170px,.9fr)_90px_105px_minmax(210px,1fr)_86px]";
  const voiceStatuses = new Map(voiceStates.map((player) => [player.user_id, player.status]));
  const headerDisplay = freeEights ? "[@container(min-width:1020px)]:grid" : "xl:grid";
  const rowLayout = freeEights ? "[@container(min-width:1020px)]:items-center [@container(min-width:1020px)]:gap-3" : "xl:items-center xl:gap-3";
  const fieldLabelClass = `mb-1 text-[8px] font-black uppercase tracking-wider text-vapor ${freeEights ? "[@container(min-width:1020px)]:hidden" : "xl:hidden"}`;

  return (
    <section className={`match-team-card relative overflow-visible rounded-xl border border-white/[0.09] bg-[#10151c] ${freeEights ? "[container-type:inline-size]" : ""}`}>
      <div className={`absolute inset-x-10 top-0 h-px ${isOrange ? "bg-gradient-to-r from-transparent via-orange/70 to-transparent" : "bg-gradient-to-r from-transparent via-cyan/70 to-transparent"}`} />
      <header className={`flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5 ${isOrange ? "bg-gradient-to-r from-orange/[0.09] via-[#161c24] to-[#11161d]" : "bg-gradient-to-r from-cyan/[0.09] via-[#161c24] to-[#11161d]"}`}>
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

      <div className={`hidden ${columns} gap-3 border-y border-white/[0.07] bg-[#141a22] px-5 py-3 text-[8px] font-black uppercase tracking-[0.18em] text-vapor ${headerDisplay}`}><span>User</span><span>{freeEights ? "Activision Name" : "Gamertag"}</span>{freeEights && <span>Rank</span>}<span>Record</span><span>{freeEights ? "8s ELO" : "Earnings"}</span><span>{freeEights ? "Discord Voice" : "Trophies"}</span><span>Socials</span></div>
      {players.length === 0 ? <div className="flex min-h-28 items-center justify-center border-t border-white/[0.06] text-xs text-vapor">Roster unavailable</div> : (
        <div className="divide-y divide-white/[0.055]">
          {players.map((player, index) => {
            const userId = player.user_id || player.id;
            const displayName = playerName(player);
            const profileSlug = userId || player.username || player.handle || player.user_name;
            const trophies = trophiesFor(player);
            const record = recordFor(player);
            const role = player.role || (captainId && String(userId) === String(captainId) ? "captain" : "member");
            const selected = teamEditing?.selected?.userId === userId;
            const swapTarget = teamEditing?.selected && teamEditing.selected.team !== player.team;
            return (
              <article key={userId || `${displayName}-${index}`} draggable={Boolean(teamEditing && !teamEditing.busy)}
                onDragStart={teamEditing ? (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-topfragg-player", JSON.stringify({ userId, team: player.team, revision: teamEditing.revision })); teamEditing.onDragStart(player); } : undefined}
                onDragEnd={teamEditing?.onDragEnd}
                onDragOver={teamEditing ? (event) => { if (!teamEditing.busy && event.dataTransfer.types.includes("application/x-topfragg-player")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } } : undefined}
                onDrop={teamEditing ? (event) => { event.preventDefault(); if (teamEditing.busy) return; try { const source = JSON.parse(event.dataTransfer.getData("application/x-topfragg-player")); if (source.team !== player.team) teamEditing.onDrop(player, source); } catch { /* Ignore unrelated drops. */ } } : undefined}
                className={`match-player-card grid ${freeEights ? "grid-cols-2" : ""} gap-4 bg-[#0e1319] px-4 py-4 transition-colors hover:bg-[#151c25] sm:px-5 ${columns} ${rowLayout} ${teamEditing && !teamEditing.busy ? "cursor-grab active:cursor-grabbing" : ""} ${selected ? "ring-2 ring-inset ring-cyan" : swapTarget ? "hover:ring-2 hover:ring-inset hover:ring-cyan/60" : ""}`}>
                <div className={`flex min-w-0 items-center gap-3 ${freeEights ? "col-span-2 [@container(min-width:1020px)]:col-span-1" : ""}`}>
                  {teamEditing && <button type="button" aria-label={`${selected ? "Cancel swap for" : "Swap"} ${displayName}`} aria-pressed={selected} disabled={teamEditing.busy} onClick={() => teamEditing.onSelect(player)} className="shrink-0 rounded-lg border border-cyan/25 bg-cyan/10 p-2 text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-40"><ArrowLeftRight className="h-4 w-4" /></button>}
                  <Avatar className={`h-11 w-11 border font-mono text-sm font-black ${tintClass} ${toneClass}`}>
                    <AvatarImage src={player.avatar_url || undefined} alt="" className="object-cover" />
                    <AvatarFallback className="bg-transparent">{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-2">{profileSlug ? <Link to={`/profile/${encodeURIComponent(profileSlug)}`} data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white transition-colors ${hoverToneClass} ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</Link> : <span data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</span>}{!freeEights && <TournamentRankBadge goldTrophies={trophies.gold} />}<UserBadges user={player} size="xs" iconOnly showMonitorCam className="min-w-0" /></div><p className={`mt-1 truncate text-[9px] font-black uppercase ${role === "captain" ? "text-cyan" : "text-vapor"}`}>{role === "captain" ? "Captain" : "Member"}</p></div>
                </div>
                <div className="min-w-0"><p className={fieldLabelClass}>{freeEights ? "Activision Name" : "Gamertag"}</p><div className="inline-flex max-w-full rounded-lg border border-white/[0.18] bg-[#30343a] px-3 py-2"><ActivisionIdLabel user={player} className="max-w-full" /></div></div>
                {freeEights && <div className="min-w-0"><p className={fieldLabelClass}>Rank</p><FreeEightsRankBadge elo={player.free_eights_elo} screenshotRank={player.screenshot_rank} /></div>}
                <div><p className={fieldLabelClass}>Record</p><p className="font-mono text-sm font-black"><span className="text-white">{record.wins}W</span><span className="mx-1.5 text-white/20">/</span><span className="text-vapor">{record.losses}L</span></p></div>
                {freeEights ? <div><p className={fieldLabelClass}>8s ELO</p><p className="font-mono text-sm font-black text-cyan">{normalizeFreeEightsElo(player.free_eights_elo).toLocaleString()}</p>{isComplete && eloChanges?.[userId] && <p className={`mt-1 text-[9px] font-bold ${eloChanges[userId].delta > 0 ? "text-green" : "text-vapor"}`}>{eloChanges[userId].delta > 0 ? "+" : ""}{eloChanges[userId].delta} this match</p>}</div> : <div><p className={fieldLabelClass}>Earnings</p><p className="font-mono text-sm font-black text-green">{money(earningsFor(player))}</p></div>}
                {freeEights ? <div className="min-w-0"><p className={fieldLabelClass}>Discord Voice</p><FreeEightsVoiceBadge status={voiceStatuses.get(userId)} waitingRoomUrl={waitingRoomUrl} /></div> : <div><p className={fieldLabelClass}>Trophies</p><TrophyCounts trophies={trophies} /></div>}
                <div><p className={fieldLabelClass}>Socials</p><PlayerSocials player={player} /></div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
