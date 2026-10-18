import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown, CreditCard, KeyRound, Loader2, ScrollText, Search, Server, ShieldAlert, Swords, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { effectiveRoleForUser } from "@/lib/roles";
import "@/styles/admin-audit.css";

const labels = { wallet_adjust: "Balance adjusted", account_deleted: "Account deleted", delete_ticket: "Ticket deleted", role_change: "Account role changed",
  eights_team_edit: "8s teams updated", free_eights_player_kicked: "Player removed from Free 8s", match_result_override: "Match result overridden", free_eights_result_reverted: "Free 8s result reverted",
  screenshot_rank_review: "Game rank reviewed", challenge_result: "Challenge result recorded", challenge_revert: "Challenge result reverted",
  challenge_cancel: "Challenge cancelled", challenge_kick: "Player removed from challenge", update_free_eights_games: "8s games & maps updated",
  user_vpn_access_allowed: "VPN access approved", user_vpn_access_removed: "VPN exception removed" };
const readable = (value) => String(value || "Event").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
  .replace(/\b(xp|ip|elo|ceo)\b/gi, (word) => word.toUpperCase()).replace(/^./, (letter) => letter.toUpperCase());
const eventName = (row) => Object.hasOwn(labels, row.action_code) ? labels[row.action_code] : readable(row.action_code);
const eventStyle = (row) => {
  if (/delet|ban|suspend|suspension|kick/.test(row.action_code)) return { Icon: /delet/.test(row.action_code) ? Trash2 : ShieldAlert, tone: "danger" };
  if (/wallet|credit|money|withdraw|premium|purchase/.test(row.action_code)) return { Icon: CreditCard, tone: "economy" };
  if (/role|password|rank_review|vpn_access/.test(row.action_code)) return { Icon: KeyRound, tone: "access" };
  if (/match|eights|8s|challenge|tournament|ranked/.test(row.action_code)) return { Icon: Swords, tone: "match" };
  return { Icon: row.source === "system" ? Server : Activity, tone: "neutral" };
};
const timestamp = (date) => new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
function dayLabel(value) {
  const date = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function AuditDetails({ row, user }) {
  const role = effectiveRoleForUser(user);
  const query = useQuery({
    queryKey: ["admin-console", user.id, role, "auditEntry", row.source, row.record_id],
    queryFn: async () => {
      const response = await base44.functions.invoke("getAdminAuditEntry", { source: row.source, id: row.record_id });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load event details.");
      return response.data.details;
    }, staleTime: 60000, refetchOnWindowFocus: false,
  });
  return <div className="al-details" id={`audit-details-${row.id}`}>
    <div className="al-details-heading"><strong>Event details</strong><span>{row.source === "admin" ? "Admin action" : "System log"} &middot; {timestamp(row.created_date)}</span></div>
    <dl className="al-references"><div><dt>Event reference</dt><dd>{row.record_id}</dd></div>{row.actor_id && <div><dt>Staff / actor reference</dt><dd>{row.actor_id}</dd></div>}{row.target_id && <div><dt>Target reference</dt><dd>{row.target_id}</dd></div>}</dl>
    {query.isPending && <p className="al-feedback" role="status"><Loader2 size={14} className="animate-spin" /> Loading details...</p>}
    {query.isError && <p className="al-feedback al-error" role="alert">{query.error.message} <button onClick={() => query.refetch()}>Try again</button></p>}
    {query.data && <div className="al-recorded-values"><h4>Recorded values</h4><dl>{Object.entries(query.data).map(([key, value]) => value !== null && value !== "" && <div key={key}>
      <dt>{readable(key)}</dt><dd>{typeof value === "object" ? <details><summary>{Array.isArray(value) ? `${value.length} entries` : "View values"}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
        : <span>{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</span>}</dd>
    </div>)}</dl></div>}
  </div>;
}

export default function AuditLog({ user }) {
  const [source, setSource] = useState("all");
  const [period, setPeriod] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [expanded, setExpanded] = useState(null);
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const role = effectiveRoleForUser(user);
  const query = useInfiniteQuery({
    queryKey: ["admin-console", user.id, role, "auditLog", source, period, debounced],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const response = await base44.functions.invoke("getAdminAuditLogs", { source, period, search: debounced, cursor: pageParam });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load the audit log.");
      return response.data;
    }, getNextPageParam: (page) => page.next_cursor || undefined,
    staleTime: 30000, refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap((page) => page.rows).map((row) => [row.id, row])).values()], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const searching = search.trim() !== debounced;
  return <section className="admin-audit">
    <header className="al-heading"><div><span className="al-eyebrow">ACTIVITY &amp; ACCOUNTABILITY</span><h2><ScrollText size={21} /> Audit Log</h2><p>A record of staff actions and platform events.</p></div>
      <div className="al-search"><Search size={16} /><input aria-label="Search the audit log" value={search} placeholder="Search action, staff, player or reference..." onChange={(event) => { setSearch(event.target.value); setExpanded(null); }} />{search && <button aria-label="Clear audit search" onClick={() => setSearch("")}><X size={14} /></button>}</div>
    </header>
    <div className="al-toolbar"><div className="al-source-filter" aria-label="Audit source">{[["all", "All events"], ["admin", "Admin actions"], ["system", "System logs"]].map(([value, label]) => <button key={value} aria-pressed={source === value} onClick={() => { setSource(value); setExpanded(null); }}>{label}</button>)}</div>
      <div className="al-period"><label htmlFor="audit-period">Period</label><select id="audit-period" value={period} onChange={(event) => { setPeriod(event.target.value); setExpanded(null); }}><option value="all">All time</option><option value="day">Last 24 hours</option><option value="week">Last 7 days</option><option value="month">Last 30 days</option></select></div>
    </div>
    <div className="al-results"><strong>{total.toLocaleString()} {total === 1 ? "event" : "events"}</strong><span>Newest first</span></div>
    <div className="al-column-heading"><span>Activity</span><span>Performed by</span><span>Target</span><span>Time</span><span /></div>
    <div>{rows.map((row, index) => {
      const { Icon, tone } = eventStyle(row);
      const open = expanded === row.id;
      const target = row.target_name || (row.target_id ? `${readable(row.target_kind)} #${row.target_id.slice(-8)}` : "Platform");
      return <React.Fragment key={row.id}>
        {(!index || dayLabel(rows[index - 1].created_date) !== dayLabel(row.created_date)) && <h3 className="al-day">{dayLabel(row.created_date)}</h3>}
        <article className="al-event" data-open={open}>
          <div className="al-event-grid"><div className="al-activity"><span className="al-event-icon" data-tone={tone}><Icon size={17} /></span><div><div className="al-action-heading"><strong>{eventName(row)}</strong><span className="al-source" data-source={row.source}>{row.source === "admin" ? "Admin" : "System"}</span></div><p>{row.description || "No description was recorded. Open details to inspect the event."}</p></div></div>
            <div className="al-actor"><span className="al-person-icon">{row.source === "system" && row.actor_name === "System" ? <Server size={12} /> : row.actor_name.slice(0, 1).toUpperCase()}</span>{row.actor_username ? <Link to={`/profile/${encodeURIComponent(row.actor_username)}`}>{row.actor_name}</Link> : <span>{row.actor_name}</span>}</div>
            <div className="al-target">{row.target_username ? <Link to={`/profile/${encodeURIComponent(row.target_username)}`}>{target}</Link> : <span>{target}</span>}</div>
            <time dateTime={row.created_date} title={new Date(row.created_date).toLocaleString()}>{new Date(row.created_date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>
            <button className="al-expand" aria-expanded={open} aria-controls={`audit-details-${row.id}`} aria-label={`${open ? "Hide" : "View"} details for ${eventName(row)}`} onClick={() => setExpanded(open ? null : row.id)}><span>Details</span><ChevronDown size={14} /></button>
          </div>
          {open && <AuditDetails row={row} user={user} />}
        </article>
      </React.Fragment>;
    })}</div>
    {(query.isPending || searching) && <p role="status" className="al-feedback"><Loader2 size={15} className="animate-spin" /> Loading events...</p>}
    {query.isError && <div role="alert" className="al-feedback al-error"><span>{query.error?.message || "Could not load audit events."}</span><button disabled={query.isFetching} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()}>Try again</button></div>}
    {!query.isPending && !searching && !query.isError && !rows.length && <div className="al-empty"><ScrollText size={28} /><strong>No events found</strong><p>Try another search or choose a different period.</p></div>}
    {!!rows.length && <footer className="al-footer"><p>{rows.length} of {total.toLocaleString()} events loaded</p>{query.hasNextPage && <button disabled={query.isFetching || searching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />} Load next 25</button>}</footer>}
  </section>;
}
