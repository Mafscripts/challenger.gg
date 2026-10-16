import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { challengeRoomPath } from "@/lib/challengeRanks";

export default function ChallengeTeamAdmin() {
  const rooms = useQuery({ queryKey: ["admin-challenges"], queryFn: async () => {
    const { data } = await base44.functions.invoke("getChallengeOverview");
    if (!data?.success) throw new Error(data?.error || "Could not load challenges");
    return data.matches;
  }, refetchInterval: 15000, refetchIntervalInBackground: false });
  const rows = [...(rooms.data || [])].sort((a, b) => Number(b.status === "disputed") - Number(a.status === "disputed"));
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-black"><ShieldCheck size={20} className="text-purple-300" />Challenge a Team management</h2><p className="mt-2 text-xs text-vapor">Open a room to review score reports, resolve disputes, cancel matches, remove solo players or revert a result and XP. Actions are audited.</p></div><button type="button" onClick={() => rooms.refetch()} disabled={rooms.isFetching} className="team-summary-action"><RefreshCw size={14} />Refresh</button></div>{rooms.isPending && <p role="status">Loading challenges…</p>}{rooms.error && <p role="alert" className="text-red-300">{rooms.error.message}</p>}{!rooms.isPending && !rows.length && <p className="rounded-xl border border-white/10 p-6 text-sm text-vapor">No challenges yet.</p>}{rows.map((match) => <Link key={match.id} to={challengeRoomPath(match.id)} className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${match.status === "disputed" ? "border-red-400/30 bg-red-400/5" : "border-white/10 bg-card"}`}><span className="flex-1 text-sm font-bold">{match.alpha_team.name} vs {match.bravo_team?.name || "Solo challengers"}<small className="mt-1 block text-xs font-normal text-vapor">{match.size}v{match.size} · {match.game_name} · {match.players.length}/{match.size * 2} players</small></span><span className="text-xs capitalize text-purple-200">{match.status.replaceAll("_", " ")}</span>{match.score && <strong>{match.score.alpha}–{match.score.bravo}</strong>}<ArrowRight size={16} /></Link>)}</section>;
}
