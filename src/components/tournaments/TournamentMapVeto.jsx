import React, { useState } from "react";
import { Ban, Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { tournamentMapImage } from "@/lib/tournamentGames";
import { tournamentVetoPending } from "@/lib/tournamentMapVeto";

export default function TournamentMapVeto({ match, user, onUpdated }) {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const veto = match.map_veto;
  if (veto?.version !== 1) return null;
  const sides = ["team_a", "team_b"].filter(side => veto.captains?.[side] === user?.id);
  const side = sides.length === 1 ? sides[0] : null;
  const bans = Object.entries(veto.bans || {});
  const pending = tournamentVetoPending(match);
  const closed = match.completed || match.winner_id || match.match_started_date || ["completed", "cancelled", "closed", "in_progress", "live", "disputed", "score_conflict"].includes(match.status);
  const canVeto = side && !veto.bans?.[side] && !closed;
  const bannedBy = name => bans.find(([, ban]) => ban.map.toLowerCase() === name.toLowerCase());
  const submit = async () => {
    if (!canVeto || !selected || bannedBy(selected) || busy) return;
    setBusy(true); setError("");
    try {
      const response = await base44.functions.invoke("vetoTournamentMap", { tournament_match_id: match.id, map_name: selected });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not veto this map.");
      onUpdated(response.data.match); setSelected("");
    } catch (error) { setError(error.message || "Could not veto this map."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-cyan/20 bg-card/80 p-4 sm:p-5" aria-label="Captain map veto">
    <header className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-black"><Ban className="h-4 w-4 text-cyan" />Captain map veto</h2><span className="text-xs font-bold text-cyan">{bans.length}/2 vetoes</span></header>
    <p className="mt-2 text-xs leading-5 text-vapor">Each captain bans one map for the whole series. Both bans are permanent. The series is selected from the remaining maps once both captains have confirmed.</p>
    <div className="mt-3 flex flex-wrap gap-2">{["team_a", "team_b"].map(slot => <span key={slot} className={`rounded-lg border px-3 py-2 text-[11px] ${veto.bans?.[slot] ? "border-red-400/25 text-red-300" : "border-white/10 text-vapor"}`}><strong>{match[`${slot}_name`] || slot.replace("_", " ")}</strong>: {veto.bans?.[slot]?.map || "Waiting for captain"}</span>)}</div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{(match.map_pool || []).map(name => {
      const ban = bannedBy(name);
      const image = tournamentMapImage(name, match.game_id);
      return <button key={name} type="button" aria-pressed={selected === name && !ban} aria-label={`${name}${ban ? ` — vetoed by ${match[`${ban[0]}_name`] || ban[0]}` : ""}`} disabled={!canVeto || busy || Boolean(ban)} onClick={() => { setSelected(name); setError(""); }} className={`relative isolate min-h-[94px] overflow-hidden rounded-lg border p-3 text-left disabled:cursor-default ${ban ? "border-red-400/35" : selected === name ? "border-cyan ring-1 ring-cyan" : "border-white/10 hover:border-cyan/50"}`}>
        {image && <img src={image} alt="" loading="lazy" decoding="async" className={`absolute inset-0 -z-20 h-full w-full object-cover ${ban ? "grayscale" : ""}`} />}
        <span aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/60 to-black/30" />
        {ban && <span aria-hidden="true" className="absolute inset-x-1 top-1/2 h-0.5 -rotate-12 bg-red-400/80" />}
        <span className={`relative block font-bold text-xs ${ban ? "text-red-300 line-through decoration-red-400 decoration-2" : "text-white"}`}>{name}</span>
        {ban && <span className="relative mt-2 block text-[10px] font-bold text-red-300">Vetoed · {match[`${ban[0]}_name`] || ban[0]}</span>}
        {!ban && selected === name && <Check className="mt-2 h-4 w-4 text-cyan" />}
      </button>;
    })}</div>
    {error && <p role="alert" className="mt-3 text-xs text-red-300">{error}</p>}
    {canVeto ? <button type="button" disabled={!selected || Boolean(bannedBy(selected)) || busy} onClick={() => void submit()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-xs font-black text-red-300 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}Confirm veto{selected ? ` · ${selected}` : ""}</button> : pending && !closed && <p className="mt-4 text-xs text-vapor">{side && veto.bans?.[side] ? "Your veto is locked. Waiting for the other captain." : "Only the registered team captains can veto maps."}</p>}
  </section>;
}
