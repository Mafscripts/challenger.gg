import { playerCardAppearance } from "@/lib/playerCards";
import "@/styles/player-cards.css";
import React from "react";
import { Link } from "react-router-dom";
import { Link2, Mars, Venus } from "lucide-react";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import { FreeEightsVoiceBadge } from "@/components/competition/FreeEightsDiscord";

export default function CommunityMatchRoster({ players, color, voiceStates, waitingRoomUrl }) {
  const statuses = new Map(voiceStates.map((entry) => [entry.user_id, entry.status]));
  return <div className="party-community-roster">
    <div className="party-community-columns"><span>Player</span><span>Activision name</span><span>Discord voice</span></div>
    <div className="divide-y divide-white/[0.055]">{players.map((player) => {
      const profile = player.profile || {}, name = player.name;
      const Name = player.user_id ? Link : "span";
      return <article {...playerCardAppearance(profile)} key={player.id} className="match-player-card party-community-player">
        <div className="flex min-w-0 items-center gap-3"><span className={`h-11 w-11 shrink-0 overflow-hidden rounded-xl border ${color === "orange" ? "border-orange/25" : "border-cyan/25"}`}><PlayerAvatarImage user={profile} src={profile.avatar_url || player.avatar_url} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><Name {...(player.user_id ? { to: `/profile/${encodeURIComponent(profile.username || player.user_id)}` } : {})} data-name-effect={profile.display_name_color || undefined} style={profile.display_name_color ? { "--player-name-color": profile.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white ${profile.display_name_color ? "player-name-color" : ""}`}>{name}</Name>{player.gender === "male" ? <Mars className="h-3.5 w-3.5 text-sky-300" aria-label="Male" /> : player.gender === "female" ? <Venus className="h-3.5 w-3.5 text-fuchsia-300" aria-label="Female" /> : null}{player.user_id && <UserBadges user={profile} size="xs" iconOnly />}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-vapor">{player.duo_id ? <span className="inline-flex items-center gap-1 text-purple-300" title={players.filter((mate) => mate.duo_id === player.duo_id).map((mate) => mate.name).join(" + ")}><Link2 className="h-3 w-3" />Fixed duo</span> : <span>Solo player</span>}<span className="text-vapor/55">{player.user_id ? "Account linked" : "Guest"}</span></div></div></div>
        <div className="min-w-0"><p className="party-community-field-label">Activision name</p>{profile.activision_id ? <div className="inline-flex max-w-full rounded-lg border border-white/10 bg-secondary px-3 py-2"><ActivisionIdLabel user={profile} /></div> : <span className="text-xs text-vapor/50">{player.user_id ? "Not set" : "Guest player"}</span>}</div>
        <div className="min-w-0"><p className="party-community-field-label">Discord voice</p>{player.user_id ? <FreeEightsVoiceBadge status={statuses.get(player.user_id)} waitingRoomUrl={waitingRoomUrl} /> : <span className="text-xs text-vapor/50">Account not linked</span>}</div>
      </article>;
    })}</div>
  </div>;
}
