import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, ShieldCheck, Users, X } from "lucide-react";

const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;

export default function TournamentJoinModal({
  isOpen,
  onClose,
  tournament,
  teams = [],
  selectedTeamId = "",
  onSelectTeam,
  onCreateTeam,
  onJoin,
  joining = false,
  paymentMode = "own",
  onPaymentModeChange,
  requiresCredits = false,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (typeof document === "undefined") return null;

  const requiredPlayers = rosterSize(tournament?.team_size);
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const selectedTeamReady = Boolean(
    selectedTeam
    && Number(selectedTeam.roster_size || requiredPlayers) === requiredPlayers
    && selectedTeam.members?.length === requiredPlayers,
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && tournament && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-tournament-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-card shadow-[0_30px_90px_rgba(0,0,0,.65)]"
          >
            <div className="relative border-b border-white/[0.07] px-6 py-5">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange to-transparent" />
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-orange">Tournament registration</p>
                  <h2 id="join-tournament-title" className="mt-1.5 text-xl font-black tracking-[-0.02em] text-white">Join {tournament.name}</h2>
                  <p className="mt-1 text-xs leading-5 text-vapor">Select the tournament team you want to register.</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 text-vapor transition-colors hover:bg-white/[0.07] hover:text-white" aria-label="Close registration">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[58vh] space-y-4 overflow-y-auto p-6">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-background/45 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange/10 text-orange"><Users className="h-4 w-4" /></span>
                  <div>
                    <p className="text-xs font-black text-white">{tournament.team_size || `${requiredPlayers}v${requiredPlayers}`} roster</p>
                    <p className="mt-0.5 text-[10px] text-vapor">Exactly {requiredPlayers} active player{requiredPlayers === 1 ? "" : "s"} required</p>
                  </div>
                </div>
                <ShieldCheck className="h-4 w-4 text-cyan" />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Your tournament teams</p>
                  <span className="text-[10px] font-bold text-vapor">{teams.length} available</span>
                </div>
                <div className="space-y-2">
                  {teams.map((team) => {
                    const memberCount = team.members?.length || 0;
                    const ready = Number(team.roster_size || requiredPlayers) === requiredPlayers && memberCount === requiredPlayers;
                    const selected = team.id === selectedTeamId;
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => onSelectTeam?.(team.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${selected ? "border-orange/45 bg-orange/[0.09]" : "border-white/[0.07] bg-background/30 hover:border-white/15 hover:bg-white/[0.035]"}`}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] font-black ${selected ? "border-orange/30 bg-orange/15 text-orange" : "border-white/[0.07] bg-white/[0.03] text-vapor"}`}>
                          {team.tag || "TEAM"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-white">{team.name}</p>
                          <p className="mt-0.5 text-[10px] text-vapor">{memberCount}/{requiredPlayers} active players</p>
                        </div>
                        <span className={`rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${ready ? "border-green/20 bg-green/10 text-green" : "border-orange/20 bg-orange/10 text-orange"}`}>
                          {ready ? "Ready" : "Incomplete"}
                        </span>
                        {selected && <Check className="h-4 w-4 shrink-0 text-orange" />}
                      </button>
                    );
                  })}

                  {teams.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 bg-background/20 px-5 py-8 text-center">
                      <Users className="mx-auto h-7 w-7 text-vapor/35" />
                      <p className="mt-3 text-sm font-black text-white">No tournament team yet</p>
                      <p className="mt-1 text-xs text-vapor">Create a {tournament.team_size || `${requiredPlayers}v${requiredPlayers}`} team to enter this event.</p>
                    </div>
                  )}
                </div>
              </div>

              <button type="button" onClick={onCreateTeam} className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan/20 bg-cyan/[0.07] px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-cyan transition-colors hover:bg-cyan/[0.12]">
                <Plus className="h-3.5 w-3.5" /> Create a new tournament team
              </button>

              {requiresCredits && (
                <label className="block">
                  <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Payment</span>
                  <select value={paymentMode} onChange={(event) => onPaymentModeChange?.(event.target.value)} className="w-full rounded-xl border border-white/[0.07] bg-secondary px-4 py-3 text-xs text-white outline-none focus:border-orange/35">
                    <option value="own">Pay my own entry only</option>
                    <option value="full_team">Pay the full team entry</option>
                  </select>
                </label>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] bg-background/30 px-6 py-4">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-vapor hover:text-white">Cancel</button>
              <button
                type="button"
                onClick={onJoin}
                disabled={joining || !selectedTeamReady}
                className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-orange px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_10px_28px_rgba(255,130,0,.2)] transition-all hover:-translate-y-0.5 hover:bg-orange/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Join tournament
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
