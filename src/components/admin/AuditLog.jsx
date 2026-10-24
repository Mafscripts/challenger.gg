import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, ChevronDown, Clock3, Code2, CreditCard, FileText, Gamepad2, Globe, Info, KeyRound, Loader2, MessageSquare, RefreshCw, ScrollText, Search, Server, ShieldAlert, Trash2, UserRound, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { canAccessAdminPanel, effectiveRoleForUser } from "@/lib/roles";
import { adminAlertDestination, adminTargetUrl, openAdminPlayer } from "@/lib/adminWorkspace";
import { auditEventPresentation, auditHumanValue, auditReadableLabel } from "@/lib/adminAuditPresentation";
import "@/styles/admin-audit.css";

const categories = [
  { id: "all", label: "All activity", Icon: Activity },
  { id: "support", label: "Support", Icon: MessageSquare },
  { id: "players", label: "Players & access", Icon: Users },
  { id: "competition", label: "Matches & tournaments", Icon: Gamepad2 },
  { id: "economy", label: "Money & rewards", Icon: CreditCard },
  { id: "platform", label: "Website & settings", Icon: Globe },
  { id: "system", label: "System", Icon: Server },
];
const categoryFor = value => categories.find(category => category.id === value) || categories[0];
const validSource = value => ["admin", "system"].includes(value) ? value : "all";
const validPeriod = value => ["day", "week", "month"].includes(value) ? value : "all";
const validCategory = value => categories.some(category => category.id === value) ? value : "all";
const isDate = value => value && Number.isFinite(new Date(value).getTime());
const timestamp = value => isDate(value) ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Time not recorded";
const clock = value => isDate(value) ? new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
const isReference = value => typeof value === "string" && (/^c[a-z0-9]{20,}$/i.test(value) || /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value));
const humanName = (value, fallback) => {
  const clean = typeof value === "string" ? auditHumanValue(value) : "";
  return clean && clean !== "the record" && !isReference(clean) ? clean : fallback;
};
const humanSubject = value => {
  const subject = humanName(value, "");
  return /^[a-z]+(?:_[a-z]+)+$/.test(subject) ? auditReadableLabel(subject) : subject;
};
const isDeleted = row => row.context?.record_available === false || /^(delete_ticket|account_deleted|marketplace_delete|deleteTournament|tournament_deleted)$/.test(row.action_code);
const toneIcon = (row, presentation) => {
  if (presentation.tone === "danger") return /delet/i.test(row.action_code) ? Trash2 : ShieldAlert;
  if (presentation.tone === "success") return CheckCircle2;
  if (presentation.category === "economy") return CreditCard;
  if (presentation.category === "players") return KeyRound;
  return categoryFor(presentation.category).Icon;
};
function dayLabel(value) {
  if (!isDate(value)) return "Date not recorded";
  const date = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function Actor({ row }) {
  const name = humanName(row.actor_name, row.source === "system" ? "System" : "Staff member not recorded");
  return <span className="al-actor"><UserRound size={13} aria-hidden="true" /><span className="al-context-label">By</span>{row.actor_id && row.actor_id !== "system" ? <button type="button" className="admin-player-link" onClick={() => openAdminPlayer(row.actor_id)}>{name}</button> : <strong>{name}</strong>}</span>;
}
function targetInfo(row, context = row.context || {}) {
  const kind = String(row.target_kind || "").toLowerCase();
  const playerId = context.player_id || (/^(user|account|player)$/.test(kind) ? row.target_id : null);
  const subject = humanSubject(context.subject);
  const player = humanName(context.player_name || (/^(user|account|player)$/.test(kind) ? row.target_name : ""), "");
  if (player && playerId && row.action_code !== "account_deleted") return { label: player, playerId, kind: "Player" };
  const name = subject || (row.target_name === row.target_id ? "" : humanName(row.target_name, ""));
  if (/ticket|dispute/.test(kind)) return { label: name || "Support case", kind: "Case" };
  if (/match|wager|challenge/.test(kind) || context.match_id) return { label: name || humanName(context.match_name, "Match"), kind: "Match" };
  if (/tournament/.test(kind)) return { label: name || "Tournament", kind: "Tournament" };
  if (/user|account|player/.test(kind)) return { label: name || "Player account", kind: "Player" };
  return { label: name || (kind === "record" || !kind ? "Website" : auditReadableLabel(row.target_kind)), kind: "For" };
}
function Target({ row, context = row.context || {} }) {
  const target = targetInfo(row, context);
  const subject = humanSubject(context.subject);
  return <><span className="al-target"><span className="al-context-label">{target.kind}</span>{target.playerId ? <button type="button" className="admin-player-link" onClick={() => openAdminPlayer(target.playerId)}>{target.label}</button> : <strong>{target.label}</strong>}</span>{subject && subject !== target.label && <span className="al-subject"><span className="al-context-label">{row.category === "support" ? "Case" : "Subject"}</span><strong>{subject}</strong></span>}</>;
}
function ContextActions({ row, context }) {
  const target = targetInfo(row, context), removed = isDeleted({ ...row, context });
  const kind = String(row.target_kind || "").toLowerCase();
  const support = !removed && /ticket|dispute/.test(kind) && row.target_id;
  const matchId = context.match_id || (/match|wager|challenge/.test(kind) && !removed ? row.target_id : null);
  const match = matchId ? adminAlertDestination({ match_id: matchId, match_type: context.match_type }).url : null;
  return <div className="al-context-actions">
    {target.playerId && <button type="button" onClick={() => openAdminPlayer(target.playerId)}><UserRound size={14} />Player dossier<ArrowUpRight size={12} /></button>}
    {support && <Link to={adminTargetUrl({ tab: "tickets", caseId: `${/dispute/.test(kind) ? "dispute" : "ticket"}:${row.target_id}`, status: "all" })}><MessageSquare size={14} />Open support case<ArrowUpRight size={12} /></Link>}
    {match && <Link to={match}><Gamepad2 size={14} />{match.startsWith("/admin?") ? "Find match" : "Open match room"}<ArrowUpRight size={12} /></Link>}
    {!removed && /tournament/.test(kind) && !/match/.test(kind) && row.target_id && <Link to={`/tournaments/${encodeURIComponent(row.target_id)}`}><Gamepad2 size={14} />Open tournament<ArrowUpRight size={12} /></Link>}
  </div>;
}
function AuditDetails({ row, user }) {
  const role = effectiveRoleForUser(user);
  const query = useQuery({
    queryKey: ["admin-console", user.id, role, "auditEntry", row.source, row.record_id],
    queryFn: async () => {
      const { data } = await base44.functions.invoke("getAdminAuditEntry", { source: row.source, id: row.record_id });
      if (!data?.success) throw new Error(data?.error || "Could not load this activity.");
      return data;
    }, staleTime: 60000, refetchOnWindowFocus: false,
  });
  const context = { ...row.context, ...query.data?.context };
  const details = query.data?.details || {}, presentation = auditEventPresentation(row, details, context);
  const legacyDeletedCase = row.action_code === "delete_ticket" && !context.subject && !context.player_name;
  return <div className="al-details" id={`audit-details-${row.id}`}>
    <div className="al-details-heading"><h4><FileText size={16} />What happened</h4><span><Clock3 size={13} />{timestamp(row.created_date)}</span></div>
    <p className="al-explanation">{presentation.summary}</p>
    <div className="al-detail-people"><Actor row={row} /><Target row={row} context={context} />{presentation.outcome && <span className="al-outcome" data-tone={presentation.tone}><CheckCircle2 size={13} />{presentation.outcome}</span>}</div>
    {query.isPending && <p className="al-feedback" role="status"><Loader2 size={15} className="animate-spin" />Loading the recorded details...</p>}
    {query.isError && <div className="al-feedback al-error" role="alert"><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()}>Try again</button></div>}
    {query.data && <>
      {!!presentation.changes?.length && <section className="al-changes" aria-label="Changes"><h5>Changes</h5><div className="al-change-columns"><span>Changed field</span><span>Before</span><span>After</span></div>{presentation.changes.map((change, index) => <div className="al-change" key={`${change.label}:${index}`}><strong>{change.label}</strong><span className="al-before">{change.before}</span><ArrowRight size={15} aria-hidden="true" /><span className="al-after">{change.after}</span></div>)}</section>}
      {!!presentation.facts?.length && <dl className="al-facts">{presentation.facts.map((fact, index) => <div key={`${fact.label}:${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
      {presentation.reason && <section className="al-reason"><h5><MessageSquare size={14} />Reason</h5><p>{presentation.reason}</p></section>}
      {legacyDeletedCase && <p className="al-history-note"><Info size={15} />This older entry did not save the player name or case title. Those details cannot be recovered from the deleted case.</p>}
      <ContextActions row={row} context={context} />
      <details className="al-technical"><summary><Code2 size={15} /><span>Technical details</span><small>References and the original record</small><ChevronDown size={14} /></summary><div><p>Use these references when investigating an issue. Sensitive values are hidden.</p><dl><div><dt>Event reference</dt><dd>{row.record_id}</dd></div>{row.actor_id && <div><dt>Staff reference</dt><dd>{row.actor_id}</dd></div>}{row.target_id && <div><dt>Record reference</dt><dd>{row.target_id}</dd></div>}</dl><pre>{JSON.stringify(details, null, 2)}</pre></div></details>
    </>}
  </div>;
}

export default function AuditLog({ user }) {
  const location = useLocation(), navigate = useNavigate(), client = useQueryClient();
  const params = new URLSearchParams(location.search), role = effectiveRoleForUser(user);
  const source = validSource(params.get("source")), period = validPeriod(params.get("period")), category = validCategory(params.get("category")), action = params.get("action") || "";
  const [search, setSearch] = useState(() => params.get("search") || ""), [debounced, setDebounced] = useState(() => params.get("search") || ""), [expanded, setExpanded] = useState(null);
  useEffect(() => { setSearch(new URLSearchParams(location.search).get("search") || ""); setExpanded(null); }, [location.search]);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const change = (patch, replace = false) => {
    const next = new URLSearchParams(location.search); next.set("tab", "audit");
    for (const [key, value] of Object.entries(patch)) { if (!value || value === "all") next.delete(key); else next.set(key, value); }
    navigate({ pathname: location.pathname, search: `?${next}` }, { replace, preventScrollReset: true, state: { ...location.state, preserveSectionScroll: true } });
  };
  const query = useInfiniteQuery({
    queryKey: ["admin-console", user?.id, role, "auditLog", source, period, debounced, action, category],
    enabled: Boolean(user?.id) && canAccessAdminPanel(role), initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const { data } = await base44.functions.invoke("getAdminAuditLogs", { source, period, action, category, search: debounced, cursor: pageParam });
      if (!data?.success) throw new Error(data?.error || "Could not load the activity history.");
      return data;
    }, getNextPageParam: page => page.next_cursor || undefined, staleTime: 30000, refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap(page => page.rows).map(row => [row.id, row])).values()], [query.data]);
  const first = query.data?.pages[0], total = first?.total, searching = search.trim() !== debounced;
  const filtered = Boolean(action || search || source !== "all" || period !== "all" || category !== "all");
  const reset = () => { setSearch(""); setDebounced(""); change({ source: "all", period: "all", category: "all", action: "", search: "" }); };
  const refresh = () => { void query.refetch(); if (expanded) void client.invalidateQueries({ queryKey: ["admin-console", user.id, role, "auditEntry"] }, { cancelRefetch: false }); };
  return <section className="admin-audit">
    <header className="al-heading"><div><span className="al-eyebrow">STAFF ACTIVITY</span><h2><ScrollText size={22} />Activity history</h2><p>Who took action, what changed and why. Open an activity for the full explanation.</p></div><button type="button" className="al-refresh" disabled={query.isFetching || searching} onClick={refresh}><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} />Refresh</button></header>
    <nav className="al-categories" aria-label="Activity categories">{categories.map(({ id, label, Icon }) => <button type="button" key={id} data-category={id} aria-pressed={category === id} onClick={() => change({ category: id })}><Icon size={16} aria-hidden="true" /><span>{label}</span>{first?.categories?.[id] !== undefined && <strong>{first.categories[id].toLocaleString()}</strong>}</button>)}</nav>
    <div className="al-toolbar"><label className="al-search"><Search size={17} aria-hidden="true" /><input aria-label="Search the audit log" value={search} placeholder="Search a player, staff member or activity..." onChange={event => { setSearch(event.target.value); change({ search: event.target.value }, true); }} />{search && <button type="button" aria-label="Clear audit search" onClick={() => { setSearch(""); change({ search: "" }, true); }}><X size={14} /></button>}</label><div className="al-filter-fields"><label>Recorded by<select aria-label="Event source" value={source} onChange={event => change({ source: event.target.value })}><option value="all">Staff & system</option><option value="admin">Staff actions</option><option value="system">System events</option></select></label><label>Period<select id="audit-period" aria-label="Activity period" value={period} onChange={event => change({ period: event.target.value })}><option value="all">All time</option><option value="day">Last 24 hours</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option></select></label></div></div>
    <div className="al-results"><div><strong>{total === undefined ? "Loading activity" : `${total.toLocaleString()} ${total === 1 ? "activity" : "activities"}`}</strong><span><ArrowDown size={11} />Newest first</span>{action && <span className="al-active-action">{auditReadableLabel(action)}</span>}</div>{filtered && <button type="button" onClick={reset}><X size={12} />Clear filters</button>}</div>
    <div className="al-feed">{rows.map((row, index) => {
      const presentation = auditEventPresentation(row, {}, row.context || {}), Icon = toneIcon(row, presentation), open = expanded === row.id;
      return <React.Fragment key={row.id}>{(!index || dayLabel(rows[index - 1].created_date) !== dayLabel(row.created_date)) && <h3 className="al-day"><CalendarDays size={13} />{dayLabel(row.created_date)}</h3>}<article className="al-event" data-open={open} data-tone={presentation.tone}>
        <div className="al-card-top"><span className="al-event-icon" data-tone={presentation.tone}><Icon size={19} aria-hidden="true" /></span><div className="al-story"><div className="al-action-heading"><h4>{presentation.title}</h4><span className="al-category-label" data-category={presentation.category}>{categoryFor(presentation.category).label}</span>{row.source === "system" && presentation.category !== "system" && <span className="al-system-label">Automatic</span>}</div><p>{presentation.summary}</p><div className="al-people"><Actor row={row} /><Target row={row} /></div></div><div className="al-card-controls"><time dateTime={row.created_date} title={timestamp(row.created_date)}><Clock3 size={12} />{clock(row.created_date)}</time><button type="button" className="al-expand" aria-expanded={open} aria-controls={`audit-details-${row.id}`} aria-label={`${open ? "Hide" : "View"} details for ${presentation.title}`} onClick={() => setExpanded(open ? null : row.id)}>{open ? "Close details" : "View details"}<ChevronDown size={14} /></button></div></div>
        {open && <AuditDetails row={row} user={user} />}
      </article></React.Fragment>;
    })}</div>
    {(query.isPending || searching) && <p role="status" className="al-feedback"><Loader2 size={16} className="animate-spin" />Loading activity...</p>}
    {query.isError && <div role="alert" className="al-feedback al-error"><p>{query.error?.message || "Could not load activity."}</p><button type="button" disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
    {!query.isPending && !searching && !query.isError && !rows.length && <div className="al-empty"><Search size={28} /><h3>No activity found</h3><p>Try another player, category or period.</p>{filtered && <button type="button" onClick={reset}>Clear filters</button>}</div>}
    {!!rows.length && <footer className="al-footer"><p>{rows.length} of {total?.toLocaleString() || "—"} activities loaded</p>{query.hasNextPage && <button type="button" disabled={query.isFetching || searching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}Load next 25</button>}</footer>}
  </section>;
}
