import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Crown, Gamepad2, Globe2, Shield, Swords, Trophy, UserPlus, Users } from "lucide-react";
import { normalizeTeamRosterSize } from "@/lib/teamFormats";
import { teamPageUrl, teamPlayerFormat, teamPurposeFor } from "@/lib/teamPresentation";
import "@/styles/teams-page.css";

const purposeIcons = { challenge: Shield, tournament: Trophy, wager: Swords, ranked: Shield, general: Users };
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
    <article className="team-summary-card team-card-refresh" data-team-type={purpose.icon}>
      <div className="team-summary-cover" aria-hidden="true">
        {team.banner_url && <img src={team.banner_url} alt="" loading="lazy" />}
      </div>
      <div className="team-card-body">
        <div className="team-card-topline"><span className="team-summary-badge"><PurposeIcon className="h-3.5 w-3.5" />{purpose.label}</span><span className="team-card-format"><Gamepad2 className="h-3.5 w-3.5" />{teamPlayerFormat(team)}</span></div>
        <div className="team-card-identity">
          <div className="team-card-logo">
            {team.logo_url && !logoFailed ? <img src={team.logo_url} alt="" onError={() => setLogoFailed(true)} loading="lazy" decoding="async" /> : String(team.tag || team.name || "TF").slice(0, 3).toUpperCase()}
          </div>
          <div className="min-w-0"><p className="team-card-tag">{team.tag ? `[${team.tag}]` : "TopFragg team"}</p><h3>{team.name || "Unnamed team"}</h3></div>
        </div>
        <div className="team-card-meta">
          <span title={isOwnProfile ? "Your role" : membership ? "Player's role" : "Your access"}>{captain ? <Crown className="h-3.5 w-3.5 text-orange" /> : <Users className="h-3.5 w-3.5" />}{role}</span>
          <span><Globe2 className="h-3.5 w-3.5" />{String(team.region || "Global").toUpperCase()}</span>
        </div>
        <dl className="team-card-record">
          <div><dt>Team record</dt><dd><span className="text-green">{wins}W</span><span className="text-vapor"> / </span><span className="text-red-300">{losses}L</span></dd></div>
          <div><dt>Win rate</dt><dd>{winRate}</dd></div>
          <div><dt>Roster</dt><dd>{membersKnown ? `${members.length} / ${size}` : `${size} players`}</dd></div>
        </dl>
        {membersKnown && <div className="team-card-roster">
          <div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-bold text-white">{isOwnProfile ? "Your lineup" : "Team lineup"}</span><span className={`inline-flex items-center gap-1 ${ready ? "text-green" : "text-vapor"}`}>{ready ? <CheckCircle className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}{ready ? "Roster full" : `${missing} open ${missing === 1 ? "spot" : "spots"}`}</span></div>
          <div className="team-card-roster-bar"><div style={{ width: `${Math.min(100, members.length / size * 100)}%` }} /></div>
          <p>{members.slice(0, 4).map((member) => usersById[member.user_id]?.display_name || usersById[member.user_id]?.username || member.user_name || "Player").join(" · ") || "No players yet"}</p>
        </div>}
        <div className="team-card-footer">
          {activeMatch ? <Link to={activeMatch.href} className="team-card-match site-hover"><Swords className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block font-bold">Open match room</span><span className="mt-1 block truncate text-vapor">vs {activeMatch.opponent}</span></span><ArrowRight className="h-4 w-4 shrink-0" /></Link>
            : currentTournament && <p className="mb-3 truncate text-xs text-vapor"><Trophy className="mr-1.5 inline h-3.5 w-3.5" />{currentTournament.tournament?.name || "Tournament entered"}</p>}
          <div className="grid grid-cols-2 gap-2">
            {openAction("overview", "Open team", "team-summary-action team-summary-primary")}
            {openAction("roster", openLabel, "team-summary-action")}
          </div>
          {isOwnProfile && captain && membersKnown && !ready && <p className="mt-2 text-[11px] text-vapor">Invite {missing === 1 ? "one more player" : `${missing} more players`} from your roster.</p>}
        </div>
      </div>
    </article>
  );
}
