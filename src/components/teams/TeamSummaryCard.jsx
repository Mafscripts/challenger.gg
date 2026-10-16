import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Crown, Gamepad2, Globe2, Shield, Swords, Trophy, UserPlus, Users } from "lucide-react";
import { normalizeTeamRosterSize } from "@/lib/teamFormats";
import { teamPageUrl, teamPlayerFormat, teamPurposeFor } from "@/lib/teamPresentation";

const purposeIcons = { challenge: Swords, tournament: Trophy, wager: Swords, ranked: Shield, general: Users };
const nonNegative = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export default function TeamSummaryCard({ team, membership, profileUserId, isOwnProfile = true, members, usersById = {}, activeMatch, currentTournament, onOpen }) {
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [team.logo_url]);
  const purpose = teamPurposeFor(team);
  const PurposeIcon = purposeIcons[purpose.icon];
  const captain = Boolean(profileUserId && String(team.captain_id || "") === String(profileUserId));
  const role = captain ? "Captain" : membership?.role ? String(membership.role).replace(/_/g, " ") : membership ? "Member" : "Visitor";
  const size = normalizeTeamRosterSize(team.roster_size);
  const membersKnown = Array.isArray(members);
  const ready = membersKnown && members.length >= size;
  const wins = nonNegative(team.total_wins);
  const losses = nonNegative(team.total_losses);
  const winRate = wins + losses ? `${Math.round(wins / (wins + losses) * 100)}%` : "—";
  const missing = membersKnown ? Math.max(0, size - members.length) : 0;
  const openLabel = isOwnProfile && captain ? "Manage roster" : "View roster";
  const openAction = (tab, label, className) => onOpen ? (
    <button type="button" onClick={() => onOpen(tab)} className={className}>{label}<ArrowRight className="h-3.5 w-3.5" /></button>
  ) : <Link to={teamPageUrl(team, tab)} className={className}>{label}<ArrowRight className="h-3.5 w-3.5" /></Link>;

  return (
    <article className="team-summary-card">
      <div className="team-summary-cover" aria-hidden="true">
        {team.banner_url && <img src={team.banner_url} alt="" loading="lazy" />}
      </div>
      <div className="relative flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan/25 bg-background font-mono text-lg font-black text-cyan">
            {team.logo_url && !logoFailed ? <img src={team.logo_url} alt="" onError={() => setLogoFailed(true)} loading="lazy" className="h-full w-full object-cover" /> : String(team.tag || team.name || "TF").slice(0, 3).toUpperCase()}
          </div>
          <span className="team-summary-badge"><PurposeIcon className="h-3.5 w-3.5" />{purpose.label}</span>
        </div>
        <div className="mt-4">
          <h3 className="break-words text-xl font-black leading-tight text-white">{team.name || "Unnamed team"}</h3>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-cyan">{team.tag ? `[${team.tag}] · ` : ""}{teamPlayerFormat(team)} team</p>
          <p className="mt-2 text-xs leading-5 text-vapor">{purpose.description}</p>
        </div>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-xs">
          <div><dt className="text-[10px] text-vapor">{isOwnProfile ? "Your role" : membership ? "Player's role" : "Your access"}</dt><dd className="mt-1 flex items-center gap-1.5 font-bold capitalize text-white">{captain ? <Crown className="h-3.5 w-3.5 text-orange" /> : <Users className="h-3.5 w-3.5 text-cyan" />}{role}</dd></div>
          <div><dt className="text-[10px] text-vapor">Region</dt><dd className="mt-1 flex items-center gap-1.5 font-bold uppercase text-white"><Globe2 className="h-3.5 w-3.5 text-cyan" />{team.region || "Global"}</dd></div>
          <div><dt className="text-[10px] text-vapor">Format</dt><dd className="mt-1 flex items-center gap-1.5 font-bold text-white"><Gamepad2 className="h-3.5 w-3.5 text-cyan" />{size === 1 ? "Solo" : `${size} players`}</dd></div>
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="team-summary-metric"><p className="text-[10px] text-vapor">Team record</p><p className="mt-1 text-sm font-black text-white"><span className="text-green">{wins}W</span> · <span className="text-red-300">{losses}L</span></p></div>
          <div className="team-summary-metric"><p className="text-[10px] text-vapor">Team win rate</p><p className="mt-1 text-sm font-black text-white">{winRate}</p></div>
        </div>
        {membersKnown && <div className="mt-4 border-t border-white/10 pt-3">
          <div className="flex items-center justify-between gap-2 text-xs"><span className="font-bold text-white">Roster · {members.length}/{size}</span><span className={`inline-flex items-center gap-1 ${ready ? "text-green" : "text-vapor"}`}>{ready ? <CheckCircle className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}{ready ? "Roster full" : `${missing} open ${missing === 1 ? "spot" : "spots"}`}</span></div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan" style={{ width: `${Math.min(100, members.length / size * 100)}%` }} /></div>
          <p className="mt-2 truncate text-[11px] text-vapor">{members.slice(0, 4).map((member) => usersById[member.user_id]?.display_name || usersById[member.user_id]?.username || member.user_name || "Player").join(" · ") || "No players yet"}</p>
        </div>}
        <div className="mt-auto pt-4">
          {activeMatch ? <Link to={activeMatch.href} className="mb-3 flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/5 p-3 text-xs text-cyan"><Swords className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block font-bold">Open match room</span><span className="mt-1 block truncate text-vapor">vs {activeMatch.opponent}</span></span><ArrowRight className="h-4 w-4 shrink-0" /></Link>
            : currentTournament && <p className="mb-3 truncate text-xs text-vapor"><Trophy className="mr-1.5 inline h-3.5 w-3.5 text-cyan" />{currentTournament.tournament?.name || "Tournament entered"}</p>}
          <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-4">
            {openAction("overview", "Open team", "team-summary-action team-summary-primary")}
            {openAction("roster", openLabel, "team-summary-action")}
          </div>
          {isOwnProfile && captain && membersKnown && !ready && <p className="mt-2 text-[11px] text-vapor">Invite {missing === 1 ? "one more player" : `${missing} more players`} from your roster.</p>}
        </div>
      </div>
    </article>
  );
}
