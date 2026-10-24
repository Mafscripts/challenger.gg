import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronDown, Circle, Clock3, ExternalLink, Flag, Gamepad2, Loader2, Map as MapIcon, MessageSquare, RefreshCw, Search, ShieldAlert, Trophy, UserRound, Users, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { canAccessAdminPanel, effectiveRoleForUser } from "@/lib/roles";
import { adminTargetUrl, openAdminPlayer } from "@/lib/adminWorkspace";
import { supportMatchMaps, supportModeLabel } from "@/lib/supportMatchDetails";
import "@/styles/admin-matches.css";

const modes = [["all", "All matches"], ["eights", "All 8s"], ["free8s", "Free 8s"], ["money8s", "Money 8s"], ["xp", "XP"], ["ranked", "Ranked"], ["wagers", "Wagers"], ["challenge", "Challenges"], ["tournament", "Tournaments"]];
const states = [["all", "All statuses"], ["active", "Active"], ["disputed", "Disputed"], ["completed", "Completed"], ["cancelled", "Cancelled / expired"]];
const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Date unavailable";
const statusFor = value => {
  if (["disputed", "score_conflict"].includes(value)) return { label: "Disputed", tone: "disputed", Icon: ShieldAlert };
  if (["completed", "finished", "resolved"].includes(value)) return { label: "Completed", tone: "completed", Icon: CheckCircle2 };
  if (["cancelled", "canceled", "expired", "closed", "rejected"].includes(value)) return { label: value === "expired" ? "Expired" : "Cancelled", tone: "cancelled", Icon: XCircle };
  if (["in_progress", "live", "started"].includes(value)) return { label: "In progress", tone: "active", Icon: Circle };
  return { label: String(value || "open").replaceAll("_", " "), tone: "waiting", Icon: Clock3 };
};
function MatchStatus({ status }) { const { label, tone, Icon } = statusFor(status); return <span className="am-status" data-tone={tone}><Icon size={12} />{label}</span>; }
const load = async payload => {
  const { data } = await base44.functions.invoke("getAdminMatches", payload);
  if (!data?.success) throw new Error(data?.error || "Could not load matches.");
  return data;
};

export default function AdminMatches({ user, initialMode = "all", initialState = "all", pollInterval = false }) {
  const location = useLocation(), navigate = useNavigate(), role = effectiveRoleForUser(user);
  const params = new URLSearchParams(location.search);
  const defaultMode = modes.some(([id]) => id === initialMode) ? initialMode : "all";
  const defaultState = states.some(([id]) => id === initialState) ? initialState : "all";
  const mode = modes.some(([id]) => id === params.get("mode")) ? params.get("mode") : defaultMode;
  const state = states.some(([id]) => id === params.get("state")) ? params.get("state") : defaultState;
  const search = params.get("search") || "", selected = params.get("match") || "";
  const [debounced, setDebounced] = useState(search);
  const allowed = Boolean(user?.id) && canAccessAdminPanel(role);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const change = (patch, replace = false) => {
    const next = new URLSearchParams(location.search);
    next.set("tab", params.get("tab") || "matches");
    for (const [key, value] of Object.entries(patch)) {
      const explicitAll = value === "all" && ((key === "mode" && defaultMode !== "all") || (key === "state" && defaultState !== "all"));
      if (!value || value === "all" && !explicitAll) next.delete(key); else next.set(key, value);
    }
    navigate({ pathname: location.pathname, search: `?${next}`, hash: location.hash }, { replace, state: { ...location.state, preserveSectionScroll: true }, preventScrollReset: true });
  };
  const query = useInfiniteQuery({ queryKey: ["admin-console", user?.id, role, "matchDirectory", mode, state, debounced],
    initialPageParam: null, queryFn: ({ pageParam }) => load({ mode, state, search: debounced, cursor: pageParam }),
    getNextPageParam: page => page.next_cursor || undefined, enabled: allowed, staleTime: 30000, refetchOnWindowFocus: false,
    refetchInterval: pollInterval, refetchIntervalInBackground: false });
  const detail = useQuery({ queryKey: ["admin-console", user?.id, role, "matchDetail", selected],
    queryFn: () => load({ match: selected }), enabled: allowed && Boolean(selected), staleTime: 15000, refetchOnWindowFocus: false,
    refetchInterval: pollInterval, refetchIntervalInBackground: false });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap(page => page.rows).map(row => [row.id, row])).values()], [query.data]);
  const match = detail.data?.match;
  const details = match?.details || {};
  const mapRows = supportMatchMaps({ ...details, series_maps: details.series_maps || (match?.mode === "tournament" && details.map_generation_key ? details.maps : undefined) });
  const searching = search.trim() !== debounced;
  const unavailable = query.data?.pages[0]?.unavailable_modes || [];
  const unavailableMode = unavailable.includes(mode) || mode === "eights" && ["free8s", "money8s"].every(id => unavailable.includes(id));
  const refresh = () => { void query.refetch(); if (selected) void detail.refetch(); };
  if (!allowed) return null;
  return <section className="admin-matches">
    <header className="am-heading"><div><span className="am-eyebrow">COMPETITION CONTROL</span><h2><Gamepad2 size={22} /> Match center</h2><p>Every match type, its players and linked support in one place.</p></div><button type="button" className="am-button" disabled={query.isFetching || detail.isFetching} onClick={refresh}><RefreshCw size={14} className={query.isFetching || detail.isFetching ? "animate-spin" : ""} />Refresh</button></header>
    <nav className="am-modes" aria-label="Match types">{modes.map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => change({ mode: id, match: "" })}>{label}</button>)}</nav>
    <div className="am-toolbar"><label className="am-search"><Search size={16} /><input aria-label="Search matches" value={search} maxLength={200} placeholder="Search match reference, player or team..." onChange={event => change({ search: event.target.value, match: "" }, true)} /></label><label className="am-filter"><span>Status</span><select aria-label="Match status" value={state} onChange={event => change({ state: event.target.value, match: "" })}>{states.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
    {unavailableMode && <p className="am-unavailable" role="status"><ShieldAlert size={15} />{modes.find(([id]) => id === mode)?.[1]} is not available in this installation yet. Other match types remain available.</p>}
    {mode === "all" && unavailable.length > 0 && <p className="am-unavailable"><ShieldAlert size={15} />Some match sources are not available yet: {unavailable.map(id => modes.find(([key]) => key === id)?.[1] || id).join(", ")}.</p>}
    <div className="am-workspace" data-selected={Boolean(selected)}>
      <aside className="am-directory" aria-label="Matches"><div className="am-list-heading"><strong>{modes.find(([id]) => id === mode)?.[1]}</strong><span>{rows.length} loaded</span></div>
        {query.isError && <div className="am-feedback am-error" role="alert"><ShieldAlert size={18} /><p>{query.error?.message}</p><button className="am-button" onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
        {(query.isPending || searching) && <div className="am-feedback" role="status"><Loader2 size={18} className="animate-spin" />Loading matches...</div>}
        {!query.isPending && !searching && rows.map(row => <button type="button" key={row.id} className="am-match-row" aria-pressed={selected === row.id} onClick={() => change({ match: row.id })}>
          <span className="am-row-top"><span className="am-mode"><Gamepad2 size={12} />{row.mode_label}</span><MatchStatus status={row.status} /></span>
          <strong className="am-match-title">{row.title}<ArrowUpRight size={14} /></strong>
          <span className="am-row-players"><Users size={12} />{row.players.length ? row.players.slice(0, 3).map(player => player.user_name).join(", ") + (row.players.length > 3 ? ` +${row.players.length - 3}` : "") : "Player roster not recorded"}</span>
          <span className="am-row-meta"><span>#{row.record_id.slice(-8).toUpperCase()}</span><span>{date(row.created_date)}</span></span>
          {row.support_cases.length > 0 && <span className="am-support-count"><MessageSquare size={12} />{row.support_cases.length} linked support {row.support_cases.length === 1 ? "case" : "cases"}</span>}
        </button>)}
        {!query.isPending && !searching && !query.isError && !rows.length && !unavailableMode && <div className="am-feedback am-empty"><Search size={24} /><strong>No matches found</strong><p>Try another name, reference, mode or status.</p></div>}
        {query.hasNextPage && !searching && <button className="am-load-more" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}Load next 25 matches</button>}
      </aside>
      <article className="am-detail" aria-label="Match details">
        {!selected && <div className="am-detail-empty"><Gamepad2 size={34} /><h3>Select a match</h3><p>Review its generated maps, players, score and support cases. Open the existing room or support case to take action.</p></div>}
        {selected && <button className="am-mobile-back am-button" onClick={() => change({ match: "" })}><ArrowLeft size={14} />Back to matches</button>}
        {selected && detail.isPending && <div className="am-feedback" role="status"><Loader2 size={20} className="animate-spin" />Loading match details...</div>}
        {selected && detail.isError && <div className="am-feedback am-error" role="alert"><ShieldAlert size={20} /><strong>Match details unavailable</strong><p>{detail.error?.message}</p><button className="am-button" onClick={() => detail.refetch()}>Try again</button></div>}
        {selected && match && <>
          <header className="am-detail-heading"><div className="am-detail-kicker"><span className="am-mode"><Gamepad2 size={13} />{match.mode_label}</span><MatchStatus status={match.status} /></div><h3>{match.title}</h3><p>#{match.record_id} <span>·</span> {date(match.created_date)}</p><div className="am-detail-actions"><Link className="am-button am-open" to={`${match.room_url}?support_view=1`}><ExternalLink size={14} />Open match room</Link>{match.support_cases[0] && <Link className="am-button am-support" to={adminTargetUrl({ tab: "tickets", caseId: match.support_cases[0].id, status: "all" })}><MessageSquare size={14} />View support</Link>}</div></header>
          <div className="am-detail-body"><section className="am-score"><div><span>{match.team_a_name}</span><strong>{match.score_a ?? "—"}</strong></div><span className="am-vs">VS</span><div><span>{match.team_b_name}</span><strong>{match.score_b ?? "—"}</strong></div></section>
            <dl className="am-facts"><div><dt>Game</dt><dd>{match.game_name || "Not recorded"}</dd></div><div><dt>Mode</dt><dd>{supportModeLabel(match.game_mode)}</dd></div><div><dt>Format</dt><dd>{details.team_size || (details.size ? `${details.size}v${details.size}` : details.format || "Not recorded")}</dd></div><div><dt>Series</dt><dd>{details.best_of || details.bestOf ? `Best of ${details.best_of || details.bestOf}` : mapRows.length ? `${mapRows.length} generated ${mapRows.length === 1 ? "map" : "maps"}` : "Not generated"}</dd></div></dl>
            <section className="am-section"><h4><MapIcon size={16} />Generated maps &amp; series order</h4>{mapRows.length ? <ol className="am-maps">{mapRows.map((map, index) => <li key={`${index}:${map.name}`}><span>MAP {index + 1}</span><strong>{map.name}</strong><small>{map.mode}</small>{map.scoreA != null && map.scoreB != null && <b>{map.scoreA} – {map.scoreB}</b>}</li>)}</ol> : <p className="am-note">No maps have been generated or saved for this match yet.</p>}</section>
            <section className="am-section"><h4><Users size={16} />Players <small>{match.players.length}</small></h4>{match.players.length ? <div className="am-roster">{["alpha", "bravo", ""].map(team => { const players = match.players.filter(player => (player.team || "") === team); return players.length ? <div className="am-team" key={team || "unassigned"}><span>{team === "alpha" ? match.team_a_name : team === "bravo" ? match.team_b_name : "Other players"}</span>{players.map(player => <button type="button" key={player.user_id} onClick={() => openAdminPlayer(player.user_id)}><span className="am-avatar">{player.user_name.slice(0, 1).toUpperCase()}</span><strong>{player.user_name}</strong><UserRound size={14} /><span className="sr-only">Open player dossier</span></button>)}</div> : null; })}</div> : <p className="am-note">No player roster was recorded. The match room may contain more information.</p>}</section>
            <section className="am-section"><h4><MessageSquare size={16} />Linked support <small>{match.support_cases.length}</small></h4>{match.support_cases.length ? <div className="am-linked-cases">{match.support_cases.map(support => <Link key={support.id} to={adminTargetUrl({ tab: "tickets", caseId: support.id, status: "all" })}><span className="am-case-icon">{support.kind === "dispute" ? <Flag size={16} /> : <MessageSquare size={16} />}</span><span><strong>{support.title}</strong><small>{support.status.replaceAll("_", " ")}{support.assigned_admin_name ? ` · Helping: ${support.assigned_admin_name}` : " · Unassigned"}</small></span><ArrowUpRight size={15} /></Link>)}</div> : <p className="am-note">No support case is linked to this match.</p>}</section>
            {(details.winner_name || details.winner_id || details.cancel_reason || details.cancellation_reason) && <section className="am-section"><h4><Trophy size={16} />Outcome</h4>{details.winner_name && <p className="am-note">Winner: <strong>{details.winner_name}</strong></p>}{(details.cancel_reason || details.cancellation_reason) && <p className="am-note">{details.cancel_reason || details.cancellation_reason}</p>}</section>}
          </div>
        </>}
      </article>
    </div>
  </section>;
}
