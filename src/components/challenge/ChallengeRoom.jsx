import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Headphones, LockKeyhole, RefreshCw, ShieldCheck, Swords, X } from "lucide-react";
import MatchRoomShell from "@/components/match/MatchRoomShell";
import MatchResultSummary from "@/components/match/MatchResultSummary";
import MatchRoomHeader, { MatchRoomTitle } from "@/components/match/MatchRoomHeader";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import MatchMapSeries from "@/components/match/MatchMapSeries";
import MatchChat from "@/components/match/MatchChat";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ChallengeRankBadge from "./ChallengeRankBadge";
import ChallengeStakesNotice from "./ChallengeStakesNotice";
import { primaryButton, secondaryButton, dangerButton, fieldClass } from "./challengeStyles";

export const challengeStatusName = (value) => ({ open: "Open challenge", ready_check: "Join Discord", in_progress: "In progress", awaiting_confirmation: "Confirm score", disputed: "Staff review", completed: "Completed", cancelled: "Cancelled" }[value] || value);

export default function ChallengeRoom({ match, user, busy, action, onJoin, onRefresh }) {
  const [alpha, setAlpha] = useState("");
  const [bravo, setBravo] = useState("");
  const [reason, setReason] = useState("");
  const [scoreOpen, setScoreOpen] = useState(false);
  const me = match.players.find((player) => player.user_id === user?.id);
  const closed = ["completed", "cancelled"].includes(match.status);
  const complete = match.status === "completed";
  const reportable = ["in_progress", "awaiting_confirmation"].includes(match.status);
  const voice = match.voice;
  const full = match.players.length === match.size * 2;
  const canStart = full && voice?.fresh && voice.players?.length === match.size * 2 && voice.players.every((player) => player.status === "in_waiting_room");
  const names = { alpha: match.alpha_team.name, bravo: match.bravo_team?.name || "Solo challengers" };
  const scorePayload = { alpha: alpha === "" ? null : Number(alpha), bravo: bravo === "" ? null : Number(bravo) };
  const scoreValid = alpha !== "" && bravo !== "";
  const statFor = (kind, subjectId) => match.standings?.find((row) => row.kind === kind && row.subject_id === subjectId)
    || match.ratings?.find((row) => row.kind === kind && row.subject_id === subjectId);
  const playersFor = (side) => match.players.filter((player) => player.side === side).map((player) => {
    const personal = !player.team_id || match.size === 1;
    const kind = personal ? "solo" : "team";
    const subjectId = personal ? player.user_id : player.team_id;
    const standing = statFor(kind, subjectId);
    const change = match.xp_changes?.find((row) => row.kind === kind && row.subject_id === subjectId);
    return { ...player, role: player.captain ? "captain" : "member", challenge_xp: change?.new_xp ?? standing?.xp ?? 0,
      challenge_wins: standing?.wins ?? 0, challenge_losses: standing?.losses ?? 0, challenge_xp_delta: change?.delta };
  });
  const alphaPlayers = playersFor("alpha"), bravoPlayers = playersFor("bravo");
  const teamDetails = (side) => {
    const team = match[`${side}_team`];
    const standing = team && statFor("team", team.id);
    const change = team && match.xp_changes?.find((row) => row.kind === "team" && row.subject_id === team.id);
    return <div className="flex flex-wrap items-center gap-2"><span className="text-[9px] font-bold text-vapor">{team ? "Team XP" : "Individual solo XP"}</span>{team && <ChallengeRankBadge xp={change?.new_xp ?? standing?.xp ?? 0} showXp />}</div>;
  };
  const scoreInputs = <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
    <label className="min-w-0 text-center"><span className="text-[9px] font-black uppercase text-orange">{names.alpha}</span><input aria-label="Alpha series score" type="number" min="0" max={Math.floor(match.best_of / 2) + 1} value={alpha} onChange={(event) => setAlpha(event.target.value)} className="mt-2 w-full rounded-xl border border-orange/20 bg-black/20 px-3 py-3 text-center font-mono text-3xl font-black text-orange outline-none" /></label>
    <span className="mb-4 text-[10px] font-black text-vapor">VS</span>
    <label className="min-w-0 text-center"><span className="text-[9px] font-black uppercase text-cyan">{names.bravo}</span><input aria-label="Bravo series score" type="number" min="0" max={Math.floor(match.best_of / 2) + 1} value={bravo} onChange={(event) => setBravo(event.target.value)} className="mt-2 w-full rounded-xl border border-cyan/20 bg-black/20 px-3 py-3 text-center font-mono text-3xl font-black text-cyan outline-none" /></label>
  </div>;
  const controls = <>
    {(match.can_manage || me?.captain && ["open", "ready_check"].includes(match.status)) && <details className="group rounded-xl border border-white/[0.09] bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10px] font-black uppercase tracking-wider text-cyan"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{match.can_manage ? "Staff controls" : "Lobby controls"}</span><span>+</span></summary>
      <div className="mt-4 space-y-4">
        {match.can_manage && reportable || match.can_manage && match.status === "disputed" ? scoreInputs : null}
        <label className="block text-xs font-bold text-vapor">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the cancellation, correction or revert" maxLength={500} className={`mt-2 ${fieldClass}`} /></label>
        <div className="flex flex-col gap-2">
          {!closed && <button className={dangerButton} disabled={busy || reason.trim().length < 5} onClick={() => action("cancel", { reason })}>Cancel challenge</button>}
          {match.can_manage && ["in_progress", "awaiting_confirmation", "disputed"].includes(match.status) && <button className={secondaryButton} disabled={busy || !scoreValid || reason.trim().length < 5} onClick={() => action("resolve", { ...scorePayload, reason })}>Resolve with entered score</button>}
          {match.can_admin && complete && <button className={dangerButton} disabled={busy || reason.trim().length < 5} onClick={() => action("revert", { reason })}>Revert result & XP</button>}
        </div>
        <p className="text-[10px] leading-5 text-vapor">Staff actions are recorded. XP reverts are blocked when a newer match depends on this result.</p>
      </div>
    </details>}
  </>;
  const messages = (match.messages || []).map((entry) => ({ id: entry.id, sender_id: entry.user_id, sender_name: entry.user_name, sender_role: entry.sender_role, sender_avatar_url: entry.sender_avatar_url, staff_badge: entry.staff, content: entry.text, created_date: entry.at }));
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link to="/challenge-a-team" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-vapor hover:text-cyan"><ArrowLeft className="h-4 w-4" />Challenge a Team</Link>
      <div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${complete ? "border-green/25 bg-green/10 text-green" : "border-cyan/20 bg-cyan/10 text-cyan"}`}>{challengeStatusName(match.status)}</span><button onClick={onRefresh} className="rounded-lg border border-white/[0.08] p-2 text-vapor hover:text-cyan" aria-label="Refresh challenge"><RefreshCw className="h-4 w-4" /></button></div>
    </div>
    <MatchRoomShell summary={<MatchResultSummary match={match} mode="challenge" complete={complete} userId={user?.id} alphaName={names.alpha} bravoName={names.bravo} alphaPlayers={alphaPlayers} bravoPlayers={bravoPlayers} />} header={
      <MatchRoomHeader label="Challenge a Team" title={<MatchRoomTitle alpha={names.alpha} bravo={names.bravo} />}
        subtitle={match.game_name} status={challengeStatusName(match.status)} complete={complete}
        metadata={[
          { label: "Format", value: `${match.size}v${match.size}` },
          { label: "Mode", value: match.format_name },
          { label: "Series", value: `Best of ${match.best_of}` },
          { label: "Match ID", value: `#${match.id.slice(-8).toUpperCase()}` },
        ]}
        actions={<>
            {!me && match.status === "open" && <button className={`room-primary-action ${primaryButton}`} onClick={() => onJoin(match)}>Accept this challenge<ArrowRight className="h-4 w-4" /></button>}
            {me?.captain && reportable && <button className={`room-primary-action ${primaryButton}`} onClick={() => setScoreOpen(true)}><Check className="h-4 w-4" />Submit score</button>}
            {me && !me.team_id && ["open", "ready_check"].includes(match.status) && <button className={secondaryButton} disabled={busy} onClick={() => action("leave")}>Leave solo slot</button>}
            <Link to="/rules" className="match-rules-link"><ShieldCheck className="h-4 w-4" />Match rules</Link>
</>}
      />
    } beforeTeams={<>
      {voice && !voice.closed && !closed && <section className="relative m-3 overflow-hidden rounded-2xl border border-purple-400/20 bg-card sm:m-4" aria-label="Challenge Discord voice readiness">
        <div className="flex flex-col gap-4 bg-gradient-to-r from-[#5865F2]/[0.09] via-transparent to-transparent p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/15 text-purple-200"><Headphones className="h-5 w-5" /></span><div><h2 className="text-sm font-black">Discord team voice</h2><p className="mt-1.5 max-w-2xl text-xs leading-5 text-vapor">{match.started_at ? "Team voices are separate. Join the lobby if you reconnect; the bot moves you to your team." : "Join this room’s private lobby voice. Once every player is present, a captain can start the match."}</p><p className="mt-2 text-[10px] font-bold text-vapor">{voice.fresh ? `${voice.players?.filter((player) => ["in_team_voice", "in_waiting_room"].includes(player.status)).length || 0}/${match.size * 2} voice ready` : "Checking Discord voice…"}</p>{voice.error && <p className="mt-2 text-xs text-red-300">{voice.error}</p>}</div></div>
          <div className="flex shrink-0 flex-wrap gap-2">{voice.waiting_room_url ? <a href={voice.waiting_room_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#5865F2] px-4 py-3 text-[11px] font-black text-white hover:bg-[#4752C4]"><Headphones className="h-4 w-4" />Join Discord lobby</a> : <button disabled className={secondaryButton}>{voice.enabled ? "Preparing lobby…" : "Discord not enabled"}</button>}{me && (me.side === "alpha" ? voice.alpha_url : voice.bravo_url) && <a className={secondaryButton} href={me.side === "alpha" ? voice.alpha_url : voice.bravo_url} target="_blank" rel="noreferrer">Your team voice</a>}{(me?.captain || match.can_manage) && match.status === "ready_check" && <button className={primaryButton} disabled={busy || !canStart} onClick={() => action("start")}><Check className="h-4 w-4" />Start match</button>}</div>
        </div>
      </section>}
      {match.cancel_reason && <p className="m-4 rounded-xl border border-orange/20 bg-orange/5 p-4 text-xs text-orange">Cancelled: {match.cancel_reason}</p>}
      {match.status === "disputed" && <p className="m-4 rounded-xl border border-orange/20 bg-orange/5 p-4 text-xs text-orange">This result needs staff review. XP remains pending until staff resolves the score.</p>}
    </>} teams={<>
      <MatchTeamTable label="Defending roster" name={names.alpha} color="orange" players={alphaPlayers} captainId={alphaPlayers.find((player) => player.captain)?.user_id} challenge voiceStates={voice?.players} waitingRoomUrl={voice?.waiting_room_url} teamDetails={teamDetails("alpha")} isComplete={complete} isWinner={complete && match.winner === "alpha"} finalScore={match.score?.alpha} emptySlots={Math.max(0, match.size - alphaPlayers.length)} />
      <div className="flex items-center gap-4 px-2" aria-hidden="true"><span className="h-px flex-1 bg-gradient-to-r from-transparent via-orange/55 to-white/15" /><span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.09] bg-black/25 text-[8px] font-black uppercase tracking-wider text-vapor">VS</span><span className="h-px flex-1 bg-gradient-to-r from-white/15 via-cyan/55 to-transparent" /></div>
      <MatchTeamTable label="Challenging side" name={names.bravo} color="cyan" players={bravoPlayers} captainId={bravoPlayers.find((player) => player.captain)?.user_id} challenge voiceStates={voice?.players} waitingRoomUrl={voice?.waiting_room_url} teamDetails={teamDetails("bravo")} isComplete={complete} isWinner={complete && match.winner === "bravo"} finalScore={match.score?.bravo} emptySlots={Math.max(0, match.size - bravoPlayers.length)} playerActions={match.can_manage && ["open", "ready_check"].includes(match.status) ? (player) => !player.team_id && <button disabled={busy} onClick={() => action("kick", { user_id: player.user_id })} aria-label={`Remove ${player.user_name}`} className="rounded-md border border-red-400/20 p-1 text-red-300 disabled:opacity-40"><X className="h-3 w-3" /></button> : undefined} />
      {match.xp_changes?.length > 0 && <section className="rounded-xl border border-white/[0.09] bg-card p-5"><h2 className="text-xs font-black uppercase tracking-wider">XP awarded</h2><div className="mt-3 divide-y divide-white/[0.06]">{match.xp_changes.map((change) => <div key={change.id} className="flex flex-wrap items-center gap-3 py-3"><span className="min-w-0 flex-1 text-xs font-bold">{change.name}<small className="mt-1 block text-[9px] text-vapor">{change.kind === "team" ? "Team standing" : "Solo standing"}</small></span><ChallengeRankBadge xp={change.new_xp} showXp /><strong className={`font-mono text-xs ${change.delta >= 0 ? "text-green" : "text-red-400"}`}>{change.delta >= 0 ? "+" : ""}{change.delta} XP</strong></div>)}</div></section>}
    </>} sidebar={<>
      {match.is_member || match.can_manage ? <MatchChat conversationId={match.id} matchType="challenge" compact sticky={false} heightClass="h-[420px] xl:h-[480px]" teamAPlayerIds={alphaPlayers} teamBPlayerIds={bravoPlayers} teamAColor="orange" teamBColor="cyan" messages={messages} onSendMessage={(message) => action("chat", { message })} maxMessageLength={1000} disabledReason={closed ? "Room closed" : ""} /> : <section className="rounded-xl border border-white/[0.09] bg-card p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><LockKeyhole className="h-4 w-4 text-cyan" />Match Chat</h2><p className="mt-4 text-xs leading-5 text-vapor">Join this challenge to access room chat and Discord voice.</p></section>}
      {controls}
      <MatchMapSeries maps={(match.series_maps || []).map((map) => ({ ...map, mode: map.mode_name || map.mode }))} gameId={match.game_id} mode={match.format_name} host="System generated" bestOf={match.best_of} compact stacked emptyText="Maps are locked until both complete rosters join the Discord waiting room and a captain starts." />
      <ChallengeStakesNotice />
    </>} />
    <Dialog open={scoreOpen} onOpenChange={setScoreOpen}><DialogContent className="border-white/10 bg-card"><DialogHeader><DialogTitle>Report the series result</DialogTitle><DialogDescription>Use the same left-to-right score for both reports. XP is awarded after both captains agree or a staff decision.</DialogDescription></DialogHeader><div className="mt-4 space-y-5">{scoreInputs}{Object.entries(match.reports || {}).map(([side, score]) => <p key={side} className="text-xs text-vapor">{names[side]} reported {score.alpha}–{score.bravo}</p>)}<button className={`w-full ${primaryButton}`} disabled={busy || !scoreValid} onClick={async () => { if (await action("report", scorePayload)) setScoreOpen(false); }}>Submit score</button></div></DialogContent></Dialog>
  </>;
}
