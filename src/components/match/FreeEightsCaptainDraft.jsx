import { playerDisplayName } from "@/lib/playerIdentity";
import React from "react";
import { Check, ChevronDown, Crown, GripVertical, MousePointer2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import FreeEightsRankBadge from "@/components/competition/FreeEightsRankBadge";
import { captainDraftSide, captainDraftTurn, captainDraftPlayerIds } from "@/lib/freeEightsCaptainDraft";
import { freeEightsTeamSize, eightsMajorityVotes } from "@/lib/freeEightsFormat";

const dragType = "application/x-topfragg-captain-pick";
const nameFor = (player) => playerDisplayName(player);
const teamName = (side) => side === "host" ? "Team Alpha" : "Team Bravo";
const pickInput = (draft, playerId) => ({ draft_id: draft.id, expected_pick: draft.picks.length, player_id: playerId });

export function CaptainDraftDropZone({ draft, side, userId, busy, onPick, children }) {
  const canPick = draft?.status === "active" && captainDraftSide(draft, userId) === side && captainDraftTurn(draft) === side && !busy;
  return <div
    onDragOver={(event) => { if (canPick && event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
    onDrop={(event) => {
      if (!canPick) return;
      event.preventDefault();
      try {
        const input = JSON.parse(event.dataTransfer.getData(dragType));
        if (input.draft_id === draft.id && input.expected_pick === draft.picks.length && typeof input.player_id === "string") onPick(input);
      } catch { /* Ignore unrelated drag data. */ }
    }}
    className={canPick ? "rounded-xl ring-1 ring-cyan/40" : undefined}
  >
    {canPick && <p className="flex items-center justify-center gap-2 border-b border-cyan/20 bg-cyan/[0.06] px-4 py-3 text-xs font-bold text-cyan"><MousePointer2 className="h-4 w-4" />Your turn — drop one available player here</p>}
    {children}
  </div>;
}

export default function FreeEightsCaptainDraft({ match, players, userId, isParticipant, busy, onVote, onPick, votingOpen, playerActions }) {
  const size = freeEightsTeamSize(match), required = eightsMajorityVotes(match);
  const draft = match.free_eights_captain_draft;
  const votes = (match.free_eights_captain_vote_ids || []).filter((id) => players.some((player) => player.user_id === id));
  const voted = votes.includes(userId), active = draft?.status === "active", completed = draft?.status === "completed";
  const selectedIds = new Set(["host", "challenger"].flatMap((side) => captainDraftPlayerIds(draft, side)));
  const pool = active ? players.filter((player) => !selectedIds.has(player.user_id)) : [];
  const turn = captainDraftTurn(draft), side = captainDraftSide(draft, userId);
  const myTurn = active && side && side === turn && !busy;
  const captain = players.find((player) => player.user_id === draft?.captains?.[turn]);
  const status = completed ? "Teams selected by captains" : active ? myTurn ? "Your turn to pick" : `${nameFor(captain)} is picking` : draft
    ? players.length < size * 2 ? "Approved · waiting for a full lobby" : "Approved · join the Discord Waiting Room"
    : "Want captains to choose the teams?";

  return <details id="room-captain-draft" open={active} className="group/draft m-3 overflow-hidden rounded-xl border border-cyan/25 bg-card sm:m-4" aria-label="Captain draft">
    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan sm:px-5 [&::-webkit-details-marker]:hidden">
      <Crown className="h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
      <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan">Captain draft · {size}v{size}</p><h2 className="mt-1 text-xs font-black text-white" role="status" aria-live="polite">{status}</h2></div>
      {!draft && <span className="shrink-0 font-mono text-xs font-black text-cyan">{votes.length}/{required} agree</span>}
      {active && <span className="shrink-0 text-[10px] font-bold text-cyan">Pick {draft.picks.length + 1}/{size * 2 - 2}</span>}
      {completed && <Check className="h-4 w-4 text-green" aria-hidden="true" />}
      <ChevronDown className="h-4 w-4 shrink-0 text-vapor transition-transform group-open/draft:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t border-white/[0.07]">
    <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-5">
      {!draft && <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm font-black text-cyan">{votes.length}/{required} agree</span>
        {isParticipant && votingOpen && <button type="button" onClick={() => onVote(!voted)} disabled={busy} aria-pressed={voted} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-black transition-colors disabled:opacity-50 ${voted ? "border-white/15 bg-white/[0.05] text-white" : "border-cyan/30 bg-cyan/10 text-cyan hover:bg-cyan/20"}`}>
          {voted ? <Check className="h-4 w-4" /> : <Crown className="h-4 w-4" />}{busy ? "Saving…" : voted ? "Withdraw vote" : "Vote captain draft"}
        </button>}
        {!votingOpen && <span className="text-xs text-vapor">Voting closed</span>}
      </div>}
      {active && <span className={`rounded-lg border px-3 py-2 text-xs font-black ${turn === "host" ? "border-orange/25 bg-orange/[0.07] text-orange" : "border-cyan/25 bg-cyan/[0.07] text-cyan"}`}>{teamName(turn)} · pick {draft.picks.length + 1}/{size * 2 - 2}</span>}
      {completed && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green"><Check className="h-4 w-4" />Teams locked</span>}
    </div>

    {!completed && <div className="border-l-2 border-cyan bg-cyan/[0.04] px-4 py-3 text-xs leading-relaxed text-vapor sm:px-5">
      <p><strong className="text-white">How it works:</strong> {required} players must agree for this {size}v{size} lobby. Once the lobby is full and everyone is in the Discord Waiting Room, two random players become captains. Team Alpha picks first, then captains take turns choosing <strong className="text-white">one player at a time</strong>.</p>
      <p className="mt-1">On your turn, drag an available player into your team below, or use their Pick player button. The start timer pauses during the draft. When both teams are full, the match starts and Discord moves everyone into their selected team voice.</p>
      {!draft && <p className="mt-1 text-[11px]">2v2: 3 votes · 3v3: 4 votes · 4v4: 5 votes. Without enough votes, automatic team selection stays active.</p>}
    </div>}

    {active && <div className="px-4 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-vapor"><Users className="h-4 w-4" />Available players · {pool.length}</h3><p className="text-xs text-vapor">{busy ? "Saving your choice…" : myTurn ? "Pick one player for your team." : side ? "Wait for the other captain to choose." : "Watch the captains build their teams."}</p></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {pool.map((player) => <div key={player.user_id} draggable={Boolean(myTurn)}
          onDragStart={(event) => { if (!myTurn) { event.preventDefault(); return; } event.dataTransfer.setData(dragType, JSON.stringify(pickInput(draft, player.user_id))); event.dataTransfer.effectAllowed = "move"; }}
          className={`flex min-w-0 items-center gap-2.5 rounded-lg border border-white/[0.09] bg-black/15 p-3 ${myTurn ? "cursor-grab hover:border-cyan/40 active:cursor-grabbing" : ""}`}>
          {myTurn && <GripVertical className="h-4 w-4 shrink-0 text-vapor" aria-hidden="true" />}
          <Avatar className="h-9 w-9 shrink-0 rounded-full border border-cyan/20"><AvatarImage src={player.avatar_url || ""} alt="" /><AvatarFallback className="bg-cyan/10 text-xs font-black text-cyan">{nameFor(player).charAt(0)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-white">{nameFor(player)}</p><div className="mt-1"><FreeEightsRankBadge loading={player.free_eights_rank_loading} elo={player.free_eights_elo} screenshotRank={player.screenshot_rank} /></div></div>
          {playerActions?.(player)}
          {myTurn && <button type="button" disabled={busy} onClick={() => onPick(pickInput(draft, player.user_id))} aria-label={`Pick ${nameFor(player)}`} className="shrink-0 rounded-md border border-cyan/25 bg-cyan/10 px-2.5 py-2 text-[10px] font-black text-cyan hover:bg-cyan/20 disabled:opacity-50">Pick player</button>}
        </div>)}
      </div>
    </div>}
    </div>
  </details>;
}
