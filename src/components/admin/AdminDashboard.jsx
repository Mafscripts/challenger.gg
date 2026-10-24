import React from "react";
import { ArrowUpRight, Users, ShieldBan, Clock, UserPlus, Crown, Swords, ShieldCheck, Ticket, BellRing, Trophy, Wallet, Boxes, ScrollText, RotateCcw } from "lucide-react";
import "@/styles/admin-dashboard.css";

const number = (value) => Number(value || 0).toLocaleString();
const money = (value) => Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
const roomTypes = [
  { key: "free8s", label: "Free 8s", tab: "live8s", tone: "cyan" },
  { key: "money8s", label: "Money 8s", tab: "live8s", tone: "green" },
  { key: "xp", label: "XP Matches", tone: "purple" },
  { key: "ranked", label: "Ranked", tab: "ranked", tone: "cyan" },
  { key: "challenge", label: "Challenge a Team", tab: "challenges", tone: "purple" },
  { key: "wagers", label: "Cash Matches", tab: "wagers", tone: "green" },
  { key: "tournament", label: "Tournament matches", tab: "tournamentMatches", tone: "gold" },
];

function Metric({ icon: Icon, label, value, detail, tone, onClick }) {
  return <button type="button" className="ad-metric site-hover" data-tone={tone} onClick={onClick}>
    <span className="ad-metric-heading"><span><Icon size={18} /></span><ArrowUpRight size={14} /></span>
    <span className="ad-metric-label">{label}</span><strong>{number(value)}</strong><small>{detail}</small>
  </button>;
}

function Panel({ id, icon: Icon, title, tone, tab, onSelect, children }) {
  return <section id={id} className="ad-panel" data-tone={tone}>
    <header><h3><Icon size={16} />{title}</h3>{tab && <button type="button" className="ad-open site-hover" onClick={() => onSelect(tab)}>Manage<ArrowUpRight size={13} /></button>}</header>
    {children}
  </section>;
}

function Rows({ rows }) {
  return <dl className="ad-rows">{rows.map(([label, value, tone]) => <div key={label}><dt>{label}</dt><dd data-tone={tone}>{value}</dd></div>)}</dl>;
}

export default function AdminDashboard({ overview, onSelect, canReset, allowedSections }) {
  if (!overview) return null;
  const { players, matches, operations, support, economy } = overview;
  const allRooms = Object.values(matches);
  const active = allRooms.reduce((total, room) => total + room.active, 0);
  const disputed = allRooms.reduce((total, room) => total + room.disputed, 0);
  const created24h = allRooms.reduce((total, room) => total + room.created_24h, 0);
  const attention = [
    { label: "Open tickets", count: support.open, tab: "tickets", detail: "Support requests and disputes" },
    { label: "Open alerts", count: operations.alerts, tab: "alerts", detail: "Follow up with players" },
    ...(operations.rank_reviews != null ? [{ label: "Rank reviews", count: operations.rank_reviews, tab: "verifyRank", detail: "Screenshots awaiting review" }] : []),
    ...(support.appeals !== null && allowedSections.includes("banAppeals") ? [{ label: "Ban appeals", count: support.appeals, tab: "banAppeals", detail: "Waiting for your response" }] : []),
    ...(economy ? [{ label: "Withdrawals", count: economy.pending_withdrawals, tab: "withdrawals", detail: "Requests awaiting a decision" }] : []),
  ].filter(item => allowedSections.includes(item.tab));
  return <div className="admin-dashboard">
    <div className="ad-heading"><div><p>YOUR PLATFORM</p><h3>Platform at a glance</h3><span>Accounts, access and every competition in one place.</span></div><time dateTime={overview.generated_at}>Updated {new Date(overview.generated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
    {overview.unavailable_match_sources?.length > 0 && <p className="admin-work-context" role="status">Some match data is currently unavailable: {overview.unavailable_match_sources.map(key => roomTypes.find(type => type.key === key)?.label || key).join(", ")}. Available competitions are shown below.</p>}
    <div className="ad-metrics">
      <Metric icon={Users} label="Total users" value={players.total} detail={`${number(players.unrestricted)} without a ban or suspension`} tone="cyan" onClick={() => onSelect("users", { filter: "all" })} />
      <Metric icon={ShieldBan} label="Banned users" value={players.banned} detail={`${number(players.temporary_bans)} temporary · ${number(players.permanent_bans)} permanent`} tone="red" onClick={() => onSelect("users", { filter: "banned" })} />
      <Metric icon={Clock} label="Suspended users" value={players.suspended} detail="Active suspensions, excluding bans" tone="gold" onClick={() => onSelect("users", { filter: "suspended" })} />
      <Metric icon={UserPlus} label="New users · 7 days" value={players.new_7d} detail={`${number(players.new_24h)} joined in the last 24 hours`} tone="green" onClick={() => onSelect("users", { filter: "new" })} />
      <Metric icon={Crown} label="Premium members" value={players.premium} detail="Current memberships, excluding expired" tone="purple" onClick={() => onSelect("users", { filter: "premium" })} />
      <Metric icon={Swords} label="Active match rooms" value={active} detail={`${number(created24h)} matches created in the last 24 hours`} tone="cyan" onClick={() => onSelect("matches", { state: "active" })} />
    </div>

    <section className="ad-attention" aria-labelledby="ad-work-title">
      <div className="ad-section-heading"><h3 id="ad-work-title"><Ticket size={16} />Your support work</h3><span>Open the exact queue you need</span></div>
      <div className="ad-attention-grid">{[
        ["New activity", support.unread ?? 0, "new", "Unread player requests and replies"],
        ["Assigned to me", support.mine ?? 0, "mine", "Cases you are already handling"],
        ["Unassigned", support.waiting ?? 0, "waiting", "Waiting for a staff member"],
        ["Awaiting player", support.awaiting ?? 0, "awaiting", "Cases waiting for the player"],
      ].map(([label, count, view, detail]) => <button type="button" key={view} className="ad-queue site-hover" data-pending={count > 0} onClick={() => onSelect("tickets", { view, status: "open" })}><span><strong>{label}</strong><small>{detail}</small></span><b>{number(count)}</b><ArrowUpRight size={14} /></button>)}</div>
    </section>

    <section className="ad-attention" aria-labelledby="ad-attention-title">
      <div className="ad-section-heading"><h3 id="ad-attention-title"><BellRing size={16} />Needs attention</h3><span>Open queues · click to review</span></div>
      <div className="ad-attention-grid">{attention.map((item) => <button type="button" key={item.tab} className="ad-queue site-hover" data-pending={item.count > 0} onClick={() => onSelect(item.tab, item.tab === "tickets" ? { status: "open", view: "all" } : {})}><span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{number(item.count)}</b><ArrowUpRight size={15} /></button>)}</div>
    </section>

    <div className="ad-details-grid">
      <Panel icon={ShieldCheck} title="Players & moderation" tone="cyan" tab="users" onSelect={onSelect}>
        <Rows rows={[
          ["Registered accounts", number(players.total)], ["Email verified", number(players.verified_email)],
          ["Staff accounts", number(players.staff)], ["New accounts · 30 days", number(players.new_30d)],
          ["Active ban records", number(players.active_ban_records), "red"], ["Blocked IP addresses", number(players.blocked_ips), "red"],
        ]} />
        <p className="ad-note">Banned users are unique accounts. Multiple ban records can belong to one account. Expired bans and suspensions are excluded.</p>
      </Panel>
      <Panel icon={Ticket} title="Support & safety" tone="purple" tab="tickets" onSelect={onSelect}>
        <Rows rows={[
          ["All tickets & disputes", number(support.total)], ["Open", number(support.open), "gold"],
          ["Open match tickets", number(support.match_open)], ["Closed", number(support.closed)],
          ["Open platform alerts", number(operations.alerts)], ["Disputed match rooms", number(disputed), "red"],
        ]} />
      </Panel>
      <Panel icon={Trophy} title="Teams & tournaments" tone="gold" tab="tournaments" onSelect={onSelect}>
        <Rows rows={[
          ["Active teams", number(operations.teams)], ["Pending team invites", number(operations.team_invites)],
          ["All tournaments", number(operations.tournaments)], ["Registration open", number(operations.tournament_registration), "cyan"],
          ["Live tournaments", number(operations.tournament_live), "green"], ["Completed tournaments", number(operations.tournament_completed)],
        ]} />
      </Panel>
      {economy && <Panel icon={Wallet} title="Economy" tone="green" tab="wallets" onSelect={onSelect}>
        <Rows rows={[
          ["Available wallet balances", money(economy.available)], ["Pending wallet balances", money(economy.pending)],
          ["Held in escrow", money(economy.escrow)], ["Player credits", number(economy.credits)],
          ["Pending withdrawals", number(economy.pending_withdrawals)], ["Requested withdrawal amount", money(economy.pending_withdrawal_amount)],
        ]} />
      </Panel>}
    </div>

    <Panel id="ad-competition-overview" icon={Swords} title="Competition overview" tone="cyan">
      <div className="ad-competition" role="table" aria-label="Matches by competition">
        <div className="ad-competition-head" role="row"><span role="columnheader">Competition</span><span role="columnheader">Active</span><span role="columnheader">Completed</span><span role="columnheader">All matches</span></div>
        {roomTypes.map((type) => {
          const room = matches[type.key];
          const cells = <><span role="cell" className="ad-mode" data-tone={type.tone}><i />{type.label}<ArrowUpRight size={13} /></span><strong role="cell" data-tone="cyan">{number(room.active)}</strong><span role="cell">{number(room.completed)}</span><span role="cell">{number(room.total)}</span></>;
          return <button type="button" role="row" key={type.key} className="ad-competition-row site-hover" onClick={() => onSelect("matches", { mode: type.key })}>{cells}</button>;
        })}
      </div>
      <p className="ad-note">Active includes open, scheduled and ongoing rooms. Completed, cancelled and expired rooms are excluded from the active count.</p>
    </Panel>

    <div className="ad-records">
      {allowedSections.includes("marketplace") && <button type="button" className="site-hover" onClick={() => onSelect("marketplace")}><Boxes size={18} /><span><strong>{number(operations.marketplace_items)}</strong><small>Marketplace items</small></span><ArrowUpRight size={14} /></button>}
      {allowedSections.includes("inventory") && <button type="button" className="site-hover" onClick={() => onSelect("inventory")}><Crown size={18} /><span><strong>{number(operations.owned_items)}</strong><small>Player-owned items</small></span><ArrowUpRight size={14} /></button>}
      <button type="button" className="site-hover" onClick={() => onSelect("audit", { source: "admin" })}><ScrollText size={18} /><span><strong>{number(operations.audit_actions)}</strong><small>Staff actions · {number(operations.staff_actions_24h)} in 24h</small></span><ArrowUpRight size={14} /></button>
      <button type="button" className="site-hover" onClick={() => onSelect("audit", { source: "system" })}><ShieldCheck size={18} /><span><strong>{number(operations.system_logs)}</strong><small>System log records</small></span><ArrowUpRight size={14} /></button>
    </div>
    {canReset && <section className="ad-reset"><div><h3><RotateCcw size={17} />Resets & seasons</h3><p>Manage progression, balances and competition seasons.</p></div><button type="button" className="admin-console-button site-hover" onClick={() => onSelect("progression")}>Manage progression<ArrowUpRight size={14} /></button></section>}
  </div>;
}
