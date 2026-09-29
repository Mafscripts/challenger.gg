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
  sponsoredMemberIds = [],
  onSponsoredMemberIdsChange,
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
  const captainId = String(selectedTeam?.captain_id || "");
  const selectableMemberIds = (selectedTeam?.members || []).map((member) => String(member.user_id || "")).filter((memberId) => memberId && memberId !== captainId);
  const selectedSponsorIds = sponsoredMemberIds.map(String).filter((memberId) => selectableMemberIds.includes(memberId));
  const entryFee = Number(tournament?.entry_fee || 0);
  const captainPayment = entryFee * (1 + selectedSponsorIds.length);
  const toggleSponsoredMember = (memberId) => {
    const normalizedId = String(memberId || "");
    if (!normalizedId || normalizedId === captainId) return;
    onSponsoredMemberIdsChange?.(
      selectedSponsorIds.includes(normalizedId)
        ? selectedSponsorIds.filter((id) => id !== normalizedId)
        : [...selectedSponsorIds, normalizedId],
    );
  };

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
                        onClick={() => { onSelectTeam?.(team.id); onSponsoredMemberIdsChange?.([]); }}
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

              {requiresCredits && selectedTeam && (
                <div>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Choose who you pay for</p>
                      <p className="mt-1 text-[10px] text-vapor">Unselected teammates pay their own entry.</p>
                    </div>
                    <span className="font-mono text-xs font-black text-green">{captainPayment.toLocaleString()} Credits</span>
                  </div>
                  <div className="space-y-2 rounded-xl border border-white/[0.07] bg-background/30 p-2">
                    {(selectedTeam?.members || []).map((member) => {
                      const memberId = String(member.user_id || "");
                      const isCaptain = memberId === captainId;
                      const selected = isCaptain || selectedSponsorIds.includes(memberId);
                      const memberName = member.user_name || member.username || member.display_name || member.handle || "Player";
                      return (
                        <button
                          key={memberId}
                          type="button"
                          onClick={() => toggleSponsoredMember(memberId)}
                          disabled={isCaptain}
                          role="checkbox"
                          aria-checked={selected}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${selected ? "border-green/25 bg-green/[0.08]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/15"}`}
                        >
                          <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? "border-green/40 bg-green text-background" : "border-white/15 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span>
                          <span className="min-w-0 flex-1 truncate text-xs font-bold text-white">{memberName}</span>
                          <span className="text-[9px] font-black uppercase tracking-wider text-vapor">{isCaptain ? "You" : selected ? "You pay" : "Pays own"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
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
