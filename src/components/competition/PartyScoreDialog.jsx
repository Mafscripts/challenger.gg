import React from "react";
import { Check, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PartyScoreDialog({ open, onOpenChange, room, match, manager, disabled, scores, setScores, overrideConfirmed, setOverrideConfirmed, error, act }) {
  const target = Math.ceil(room.bracket.best_of / 2), complete = match.status === "completed";
  const valid = Math.max(...scores.map(Number)) === target && scores[0] !== scores[1];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="party-control-dialog border-white/10 bg-card text-foreground sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg"><Trophy className="h-5 w-5 text-cyan" />{manager ? complete ? "Edit final score" : "Confirm match result" : "Submit your score"}</DialogTitle>
        <DialogDescription>Best of {room.bracket.best_of} · First to {target} map {target === 1 ? "win" : "wins"}. Enter the final series score.</DialogDescription>
      </DialogHeader>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (!valid || complete && !overrideConfirmed || disabled) return;
        if (await act(manager ? "match_score" : "report_score", { match_id: match.id, scores: scores.map(Number), override: complete && overrideConfirmed })) onOpenChange(false);
      }}>
        <div className="grid grid-cols-2 gap-4">{match.teams.map((id, side) => <label key={side} className="space-y-2">
          <span className={`block truncate text-xs font-bold ${side === 0 ? "text-orange" : "text-cyan"}`}>{room.teams.find((team) => team.id === id)?.name || "Team"}</span>
          <Select value={scores[side]} disabled={disabled} onValueChange={(value) => setScores((previous) => previous.map((score, index) => index === side ? value : score))}>
            <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: target + 1 }, (_, i) => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}</SelectContent>
          </Select>
        </label>)}</div>
        <p className="mt-4 text-[11px] leading-relaxed text-vapor">{manager ? "Confirming advances the winner in the bracket." : "The result is confirmed when both teams submit the same score. The host handles disagreements."}</p>
        {manager && complete && <label className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-orange"><input type="checkbox" checked={overrideConfirmed} onChange={(event) => setOverrideConfirmed(event.target.checked)} disabled={disabled} className="mt-0.5" />Replace this result and clear later results that depend on it.</label>}
        {!valid && <p className="mt-3 text-[11px] text-vapor">Choose a winning score to continue.</p>}
        {error && <p className="party-error" role="alert">{error}</p>}
        <button className="party-button party-primary party-full mt-4" disabled={disabled || !valid || complete && !overrideConfirmed}><Check />{manager ? "Confirm final score" : "Submit score"}</button>
      </form>
    </DialogContent>
  </Dialog>;
}
