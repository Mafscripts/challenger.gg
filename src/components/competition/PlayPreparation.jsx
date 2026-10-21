import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, Gamepad2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { hasActivisionId } from "@/lib/activision";
import { hasCompetitionStream } from "@/lib/competitionStreaming";
import { hasFreeEightsRank } from "@/lib/freeEightsRankRequirement";
import { hasFreeEightsDiscordLink } from "@/lib/freeEightsDiscord";
import { PLAY_MODES, playModeFor, preparedTeams } from "@/lib/playModes";
import usePlayTeams from "@/hooks/usePlayTeams";

function Readiness({ mode, user }) {
  const cache = useQueryClient();
  const [refreshError, setRefreshError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const account = useQuery({ queryKey: ["play-account", user.id], queryFn: () => base44.auth.me(), staleTime: 0, retry: false });
  const player = account.data || user;
  const teams = usePlayTeams(user.id, Boolean(mode.team));
  const discordLinked = hasFreeEightsDiscordLink(player);
  const membership = useQuery({
    queryKey: ["play-discord-membership", user.id, player.discord_user_id],
    queryFn: () => base44.discord.membership(),
    enabled: Boolean(mode.discord && discordLinked), staleTime: 60_000, retry: false,
  });
  const rosterReady = Boolean(!teams.isError && teams.data && preparedTeams(teams.data, mode, user.id).length);
  const items = [
    { label: "Activision ID", ready: hasActivisionId(player), href: "/settings#settings-gaming", action: "Add ID" },
    ...(mode.discord ? [{ label: "Discord account", ready: discordLinked, href: "/settings#settings-discord", action: "Connect" },
      { label: "Topfragg Discord server", ready: !membership.isError && membership.data?.in_guild === true, pending: discordLinked && membership.isPending,
        unknown: discordLinked && (membership.isError || membership.data?.code === "FREE_EIGHTS_DISCORD_MEMBERSHIP_UNAVAILABLE"),
        href: "/settings#settings-discord", action: discordLinked ? "Check server" : "Connect first" }] : []),
    ...(mode.rank ? [{ label: "Game rank", ready: hasFreeEightsRank(player), href: "/settings#settings-rank", action: "Set rank" }] : []),
    ...(mode.stream ? [{ label: "Stream channel", ready: hasCompetitionStream(player), href: "/settings#settings-streaming", action: "Add channel" }] : []),
    ...(mode.team ? [{ label: mode.optionalTeam ? "Roster to post a challenge" : mode.eventTeam ? "Tournament roster" : `${mode.name === "XP Matches" ? "XP" : "Wager"} team`,
      ready: rosterReady, pending: teams.isPending, unknown: teams.isError, optional: mode.optionalTeam || mode.eventTeam,
      href: `/teams?create=${mode.team}`, action: teams.isError ? "Open teams" : "Manage teams" }] : []),
  ];
  const required = items.filter((item) => !item.optional);
  const complete = required.filter((item) => item.ready).length;
  const ready = complete === required.length && !account.isError && !refreshError;
  const refresh = async () => {
    setRefreshing(true);
    try { cache.setQueryData(["play-account", user.id], await base44.auth.me({ force: true })); setRefreshError(false); }
    catch { setRefreshError(true); }
    finally { setRefreshing(false); }
    if (mode.team) void teams.refetch();
    if (mode.discord && discordLinked) void membership.refetch();
  };

  return <div className="min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-black"><ShieldCheck className="h-4 w-4 text-cyan" />Ready to play</h3>
      <span className={`text-[10px] font-bold ${ready ? "text-green" : "text-vapor"}`} aria-live="polite">{account.isError || refreshError ? "Checks need refresh" : ready ? "Account setup ready" : `${complete}/${required.length} setup checks complete`}</span>
    </div>
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map((item) => <li key={item.label} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.07] bg-black/10 px-3 py-2.5 text-xs">
        {item.ready ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green" /> : <Circle className="h-4 w-4 shrink-0 text-vapor" />}
        <span className="min-w-0 flex-1">{item.label}{item.optional && <small className="block text-[10px] text-vapor">{mode.eventTeam ? "Check the event format" : "Not needed to accept solo"}</small>}</span>
        {!item.ready && (item.pending ? <span className="text-[10px] text-vapor">Checking…</span> : <Link to={item.href} className="site-hover shrink-0 rounded px-1.5 py-1 text-[10px] font-bold text-cyan">{item.unknown ? "Review" : item.action}</Link>)}
      </li>)}
    </ul>
    <p className="mt-3 text-[10px] leading-5 text-vapor">{account.isError || refreshError ? "Account could not be refreshed. " : ""}{mode.stream ? "Stream every map. " : ""}{mode.discord ? "Server membership and voice readiness are checked again when you play. " : ""}Match availability, your roster and all player requirements are checked when you create or join.</p>
    {mode.team && <Link to={`/find-players?competition=${mode.id}`} className="site-hover mr-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold text-cyan">Find teammates<ArrowRight className="h-3.5 w-3.5" /></Link>}
    <button type="button" disabled={refreshing || account.isFetching || Boolean(mode.team && teams.isFetching) || Boolean(mode.discord && membership.isFetching)} className="site-hover mt-1 rounded px-2 py-1 text-xs font-bold text-cyan disabled:opacity-50" onClick={refresh}>Refresh setup checks</button>
  </div>;
}

export default function PlayPreparation({ mode: fixedMode, className = "" }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState("xp");
  const mode = playModeFor(fixedMode || selected);
  return <section className={`rounded-2xl border border-cyan/20 bg-card p-4 sm:p-5 ${className}`} aria-label="Play guide and account preparation">
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="min-w-0 xl:border-r xl:border-white/[0.07] xl:pr-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-black"><Gamepad2 className="h-4 w-4 text-cyan" />{fixedMode ? "How to play" : "Find your game"}</h2>
          {!fixedMode && <select aria-label="Choose competition mode" value={mode.id} onChange={(event) => setSelected(event.target.value)} className="max-w-full rounded-lg border border-cyan/20 bg-background px-3 py-2 text-xs font-bold text-cyan">{PLAY_MODES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        </div>
        <p className="mt-3 text-xs font-bold text-cyan">{mode.entry}</p>
        <p className="mt-1 text-xs leading-5 text-vapor">{mode.detail}</p>
        <p className="mt-2 text-[10px] font-bold text-white">Progress: {mode.progress}</p>
        {!fixedMode ? <Link to={mode.href} className="site-hover mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan/20 px-3 py-2 text-xs font-bold text-cyan">Open {mode.name}<ArrowRight className="h-3.5 w-3.5" /></Link> : <details className="mt-3 text-xs"><summary className="cursor-pointer font-bold text-cyan">Compare other modes</summary><div className="mt-2 grid gap-1 sm:grid-cols-2">{PLAY_MODES.filter((item) => item.id !== mode.id).map((item) => <Link key={item.id} to={item.href} className="site-hover rounded-lg px-2 py-2"><strong className="block text-cyan">{item.name}</strong><span className="text-[10px] text-vapor">{item.entry} · {item.progress}</span></Link>)}</div></details>}
      </div>
      {user ? <Readiness mode={mode} user={user} /> : <div className="self-center text-sm text-vapor">Sign in to check your account setup.<Link to="/login" className="site-hover ml-2 inline-flex items-center gap-1 rounded px-2 py-1 text-cyan">Sign in<ArrowRight className="h-3.5 w-3.5" /></Link></div>}
    </div>
  </section>;
}
