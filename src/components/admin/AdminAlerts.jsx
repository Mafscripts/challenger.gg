import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BellRing, Check, CheckCheck, CheckCircle2, ChevronDown, Clock3, ExternalLink, FileCheck2, Gamepad2, Info, Layers3, Loader2, MessageSquare, RefreshCw, Search, ShieldAlert, UserRound, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { canAccessAdminPanel, effectiveRoleForUser } from "@/lib/roles";
import { adminTargetUrl, notifyAdminChanged, openAdminPlayer } from "@/lib/adminWorkspace";
import { alertPresentation } from "@/lib/adminAlertPresentation";
import "@/styles/admin-alerts.css";

const views = [
  { id: "needs_review", label: "Needs review", description: "Waiting for staff", Icon: BellRing },
  { id: "reviewed", label: "Reviewed", description: "Already checked by staff", Icon: CheckCheck },
  { id: "all", label: "All alerts", description: "Current requests & history", Icon: Layers3 },
];
const kinds = [
  { id: "all", label: "All types", Icon: Layers3 },
  { id: "calls", label: "Admin requests", Icon: Users },
  { id: "evidence", label: "Evidence", Icon: FileCheck2 },
  { id: "disputes", label: "Disputes", Icon: ShieldAlert },
  { id: "platform", label: "Platform", Icon: BellRing },
];
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Time not recorded";
const closedCase = value => ["closed", "resolved", "rejected"].includes(String(value || "").toLowerCase());
function staffRoom(row) {
  if (!row.match?.available || !row.match.room_url) return null;
  // An alert may only link to a local, known room whose ID matches its record.
  try {
    const url = new URL(row.match.room_url, "https://admin.local");
    const match = url.pathname.match(/^\/(8s-match|xp-match|ranked-match|wagers-match|tournament-match|challenge-a-team)\/([^/]+)$/);
    if (url.origin !== "https://admin.local" || !match || decodeURIComponent(match[2]) !== row.match.id) return null;
    url.searchParams.delete("admin"); url.searchParams.set("support_view", "1");
    return url.pathname + url.search;
  } catch { return null; }
}
function Person({ id, name, children }) {
  return id ? <button type="button" className="aa-person" onClick={() => openAdminPlayer(id)} title="Open player dossier">{children}{name}<ArrowUpRight size={12} /></button> : <strong className="aa-person-label">{children}{name}</strong>;
}
function AlertCard({ row, user, reviewing, onReview, error }) {
  const view = alertPresentation(row), room = staffRoom(row), support = row.case?.available ? row.case : null;
  const mine = row.assigned_staff?.id === user.id, pending = view.status === "needs_review";
  const Icon = view.kind === "evidence" ? FileCheck2 : view.kind === "disputes" ? ShieldAlert : BellRing;
  return <article className="aa-card" data-tone={view.tone} data-kind={view.kind}>
    <div className="aa-card-heading"><span className="aa-kind-icon"><Icon size={22} /></span><div className="aa-title"><div className="aa-badges"><span className="aa-status">{pending ? <Clock3 size={12} /> : <CheckCircle2 size={12} />}{view.statusLabel}</span><span className="aa-kind">{view.kindLabel}</span>{pending && view.priorityLabel !== "Standard" && view.priorityLabel !== "Low priority" && <span className="aa-priority"><ShieldAlert size={12} />{view.priorityLabel}</span>}{row.alert_count > 1 && <span className="aa-combined"><Layers3 size={12} />{row.alert_count} updates combined</span>}</div><h3>{view.title}</h3><p>{view.summary}</p></div><time dateTime={row.latest_date || row.created_date}><Clock3 size={12} />{date(row.latest_date || row.created_date)}</time></div>
    <div className="aa-context-grid"><div className="aa-requester"><span className="aa-field-label">Requested by</span><Person id={row.reporter?.id} name={view.reporterName || "Player not recorded"}><span className="aa-avatar" aria-hidden="true">{(view.reporterName || "?").slice(0, 1).toUpperCase()}</span></Person></div>
      {(row.match || view.matchTitle || view.playersLabel || view.teamsLabel) && <div className="aa-match"><span className="aa-field-label"><Gamepad2 size={12} />{row.match?.mode_label || "Match"}{row.match?.game_name ? ` · ${row.match.game_name}` : ""}</span><strong>{view.matchTitle || view.playersLabel || view.teamsLabel || "Match details unavailable"}</strong>{view.teamsLabel && view.teamsLabel !== view.matchTitle && <small>{view.teamsLabel}</small>}</div>}
      {row.case && <div className="aa-assignment"><span className="aa-field-label">Staff handling this case</span>{view.assignedName ? <span className="aa-assigned" data-mine={mine}><Users size={14} />{mine ? "Assigned to you" : view.assignedName}</span> : <span className="aa-unassigned"><UserRound size={14} />Unassigned</span>}<small>{closedCase(row.case.status) ? "Support case closed" : row.case.available ? "Support case open" : "Support case no longer available"}</small></div>}
      {!pending && (view.reviewedName || row.reviewed_by) && <div className="aa-reviewed-by"><span className="aa-field-label">Reviewed by</span><Person id={row.reviewed_by?.id} name={view.reviewedName || "Staff member"}><CheckCheck size={14} /></Person></div>}
    </div>
    <footer className="aa-card-footer"><div className="aa-actions">{support && <Link className="aa-button aa-case" to={adminTargetUrl({ tab: "tickets", caseId: `${support.kind || "ticket"}:${support.id}`, status: "all" })}><MessageSquare size={15} />Open support case<ArrowUpRight size={13} /></Link>}{room && <Link className="aa-button aa-open" to={room}><ExternalLink size={15} />Open match room</Link>}{pending && <button type="button" className="aa-button aa-review" disabled={Boolean(reviewing)} onClick={() => onReview(row)}>{reviewing === row.group_key ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}{reviewing === row.group_key ? "Saving..." : "Mark as reviewed"}</button>}</div>{pending ? <span className="aa-action-help">{support ? "Reviewing clears this alert. Handle the request in its support case." : room ? "Reviewing clears this alert. Continue in the match room." : "Mark as reviewed after checking this update."}</span> : <span className="aa-action-help"><CheckCircle2 size={12} />Alert reviewed{support && !closedCase(support.status) ? " · Support case still open" : ""}</span>}</footer>
    {error && <p className="aa-row-error" role="alert">{error}</p>}
    <details className="aa-references"><summary><Info size={12} />References &amp; received times<ChevronDown size={12} /></summary><dl><div><dt>First received</dt><dd>{date(row.created_date)}</dd></div><div><dt>Latest update</dt><dd>{date(row.latest_date || row.created_date)}</dd></div><div><dt>Request reference</dt><dd>{row.group_key}</dd></div>{row.case?.id && <div><dt>Support reference</dt><dd>{row.case.id}</dd></div>}{row.match?.id && <div><dt>Match reference</dt><dd>{row.match.id}</dd></div>}</dl></details>
  </article>;
}

export default function AdminAlerts({ user, onRefresh }) {
  const location = useLocation(), navigate = useNavigate(), client = useQueryClient(), role = effectiveRoleForUser(user);
  const params = new URLSearchParams(location.search);
  const view = views.some(item => item.id === params.get("view")) ? params.get("view") : "needs_review";
  const category = kinds.some(item => item.id === params.get("category")) ? params.get("category") : "all";
  const [search, setSearch] = useState(() => params.get("search") || ""), [term, setTerm] = useState(() => params.get("search") || "");
  const [reviewing, setReviewing] = useState(""), [failure, setFailure] = useState(null), [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  useEffect(() => { setSearch(new URLSearchParams(location.search).get("search") || ""); setFailure(null); setNotice(""); }, [location.search]);
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const allowed = Boolean(user?.id) && canAccessAdminPanel(role);
  const change = (patch, replace = false) => {
    const next = new URLSearchParams(location.search); next.set("tab", "alerts");
    for (const [key, value] of Object.entries(patch)) { if (!value || (key === "category" && value === "all") || (key === "view" && value === "needs_review")) next.delete(key); else next.set(key, value); }
    navigate({ pathname: location.pathname, search: `?${next}` }, { replace, preventScrollReset: true, state: { ...location.state, preserveSectionScroll: true } });
  };
  const query = useInfiniteQuery({ queryKey: ["admin-console", user?.id, role, "alertsDirectory", view, category, term], initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const { data } = await base44.functions.invoke("getAdminAlerts", { view, category, search: term, cursor: pageParam });
      if (!data?.success) throw new Error(data?.error || "Could not load alerts.");
      return data;
    }, getNextPageParam: page => page.next_cursor || undefined, enabled: allowed, staleTime: 15000,
    refetchInterval: view === "needs_review" ? 15000 : false, refetchIntervalInBackground: false, refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap(page => page.rows).map(row => [row.id, row])).values()], [query.data]);
  const first = query.data?.pages[0], counts = first?.counts, searching = term !== search.trim(), filtered = category !== "all" || Boolean(search);
  const unavailable = first?.unavailable_sources?.includes("AdminAlert");
  const review = async row => {
    if (inFlight.current) return;
    inFlight.current = true; setReviewing(row.group_key); setFailure(null); setNotice("");
    try {
      const { data } = await base44.functions.invoke("reviewAdminAlerts", { group_keys: [row.group_key] });
      if (!data?.success) throw new Error(data?.error || "Could not review this alert.");
      if (onRefresh) await onRefresh();
      else { notifyAdminChanged({ skipAdminConsole: true }); await client.invalidateQueries({ queryKey: ["admin-console", user.id, role] }, { cancelRefetch: false }); }
      setNotice(row.case?.available ? "Alert moved to Reviewed. Its support case keeps its current status." : "Alert moved to Reviewed.");
    } catch (error) { setFailure({ key: row.group_key, message: error.message }); }
    finally { setReviewing(""); inFlight.current = false; }
  };
  const reset = () => { setSearch(""); setTerm(""); change({ search: "", category: "all" }); };
  if (!allowed) return <p className="p-6 text-sm text-vapor">Staff access is required to view alerts.</p>;
  return <section className="admin-alerts">
    <div className="aa-heading"><div><h2>{view === "needs_review" ? "Requests that need attention" : view === "reviewed" ? "Reviewed alerts" : "All requests & updates"}</h2><p>New requests first. Repeated updates for the same request are combined.</p></div><button type="button" className="aa-button" disabled={query.isFetching || Boolean(reviewing)} onClick={() => query.refetch()}><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} />Refresh</button></div>
    <nav className="aa-views" aria-label="Alert status">{views.map(({ id, label, description, Icon }) => <button type="button" key={id} data-view={id} aria-pressed={view === id} onClick={() => change({ view: id })}><span className="aa-view-icon"><Icon size={19} /></span><span><strong>{label}</strong><small>{description}</small></span><b>{counts ? counts[id]?.toLocaleString() ?? "—" : "—"}</b></button>)}</nav>
    <div className="aa-toolbar"><nav className="aa-categories" aria-label="Alert categories">{kinds.map(({ id, label, Icon }) => <button type="button" key={id} aria-pressed={category === id} onClick={() => change({ category: id })}><Icon size={14} />{label}{id !== "all" && counts?.categories?.[id] !== undefined && <strong>{counts.categories[id].toLocaleString()}</strong>}</button>)}</nav><label className="aa-search"><Search size={16} /><input aria-label="Search alerts" maxLength={200} value={search} placeholder="Search a player, match or request..." onChange={event => { setSearch(event.target.value); change({ search: event.target.value }, true); }} />{search && <button type="button" aria-label="Clear alert search" onClick={() => { setSearch(""); change({ search: "" }, true); }}><X size={14} /></button>}</label></div>
    <div className="aa-list-summary"><span>{first ? `${first.total.toLocaleString()} ${first.total === 1 ? "request" : "requests"}` : "Loading requests..."}<small><Clock3 size={11} />Newest activity first</small></span>{filtered && <button type="button" onClick={reset}><X size={12} />Clear filters</button>}</div>
    {view === "reviewed" && <p className="aa-review-note"><Info size={15} />Reviewed means staff checked the alert. Open the linked support case to see its outcome or continue helping.</p>}
    {notice && <p className="aa-notice" role="status"><CheckCircle2 size={15} />{notice}<button type="button" onClick={() => change({ view: "reviewed" })}>View reviewed alerts<ArrowUpRight size={12} /></button></p>}
    {query.isPending || searching ? <div className="aa-feedback" role="status"><Loader2 size={18} className="animate-spin" />Loading alerts...</div> : null}
    {(query.isError || unavailable) && <div className="aa-feedback aa-error" role="alert"><ShieldAlert size={20} /><div><strong>Alerts could not be loaded</strong><p>{query.error?.message || "Please try again in a moment."}</p><button type="button" disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div></div>}
    <div className="aa-list">{rows.map(row => <AlertCard key={row.id} row={row} user={user} reviewing={reviewing} onReview={review} error={failure?.key === row.group_key ? failure.message : null} />)}</div>
    {!query.isPending && !query.isError && !unavailable && !searching && !rows.length && <div className="aa-empty">{view === "needs_review" && !filtered ? <CheckCircle2 size={32} /> : <Search size={30} />}<h3>{view === "needs_review" && !filtered ? "No alerts need review" : "No alerts found"}</h3><p>{view === "needs_review" && !filtered ? "New requests will appear here. Previous alerts are kept in Reviewed." : "Try another type, player or status."}</p>{filtered ? <button type="button" className="aa-button" onClick={reset}>Clear filters</button> : view === "needs_review" ? <button type="button" className="aa-button" onClick={() => change({ view: "reviewed" })}>View reviewed alerts<ArrowUpRight size={13} /></button> : null}</div>}
    {!!rows.length && <div className="aa-pagination"><span>{rows.length} of {first?.total?.toLocaleString()} requests loaded</span>{query.hasNextPage && <button type="button" className="aa-button" disabled={query.isFetching || searching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}Load next 25</button>}</div>}
  </section>;
}
