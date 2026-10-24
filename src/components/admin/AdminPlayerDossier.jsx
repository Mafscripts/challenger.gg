import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Boxes, CircleAlert, Gamepad2, History, Loader2, RefreshCw, ShieldCheck, Ticket, UserRound, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { canAccessAdminPanel, effectiveRoleForUser } from "@/lib/roles";
import { playerDisplayName } from "@/lib/playerIdentity";
import { adminTargetUrl } from "@/lib/adminWorkspace";
import RoleBadge from "@/components/ui/RoleBadge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "@/styles/admin-player-dossier.css";

const tabs = [["overview", "Overview", UserRound], ["support", "Support", Ticket], ["matches", "Matches", Gamepad2], ["history", "History", History], ["items", "Items", Boxes], ["wallet", "Wallet", Wallet]];
const date = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const label = value => String(value || "Unknown").replaceAll("_", " ");
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
const number = value => Number(value || 0).toLocaleString();
const inactive = status => ["closed", "resolved", "completed", "cancelled", "canceled", "rejected", "finished"].includes(status);

function Empty({ children }) { return <div className="apd-empty"><CircleAlert size={20} /><p>{children}</p></div>; }
function Stat({ title, value }) { return <div className="apd-stat"><span>{title}</span><strong>{value ?? "—"}</strong></div>; }

export default function AdminPlayerDossier({ user, initialUserId = null }) {
  const location = useLocation(), navigate = useNavigate(), queryClient = useQueryClient();
  const allowed = canAccessAdminPanel(effectiveRoleForUser(user));
  const urlPlayer = location.pathname.toLowerCase() === "/admin" ? new URLSearchParams(location.search).get("player") : null;
  const [playerId, setPlayerId] = useState(initialUserId || urlPlayer), [section, setSection] = useState("overview");
  useEffect(() => { if (initialUserId) { setPlayerId(initialUserId); setSection("overview"); } }, [initialUserId]);
  useEffect(() => { if (urlPlayer) { setPlayerId(urlPlayer); setSection("overview"); } }, [urlPlayer]);
  useEffect(() => {
    const open = event => { const id = event.detail?.userId; if (typeof id === "string" && id && id.length <= 200) { setPlayerId(id); setSection("overview"); } };
    window.addEventListener("topfragg:admin-player-open", open);
    return () => window.removeEventListener("topfragg:admin-player-open", open);
  }, []);
  const query = useQuery({
    queryKey: ["admin-player-dossier", user?.id, effectiveRoleForUser(user), playerId, section],
    enabled: allowed && Boolean(playerId), staleTime: 30000, refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await base44.functions.invoke("getAdminPlayerDossier", { user_id: playerId, section });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load this player.");
      return response.data;
    },
  });
  const close = () => {
    setPlayerId(null);
    if (urlPlayer) { const params = new URLSearchParams(location.search); params.delete("player"); navigate({ pathname: location.pathname, search: params.toString() }, { replace: true }); }
  };
  const data = query.data;
  const identityData = data || queryClient.getQueryData(["admin-player-dossier", user?.id, effectiveRoleForUser(user), playerId, "overview"]);
  const player = identityData?.player, name = playerDisplayName(player), rows = data?.rows || [];
  if (!allowed) return null;
  const target = options => adminTargetUrl(options);
  return <Dialog open={Boolean(playerId)} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="admin-player-dossier" overlayClassName="apd-overlay">
      <DialogHeader className="apd-header">
        <div className="apd-eyebrow"><ShieldCheck size={13} /> STAFF PLAYER DOSSIER</div>
        <div className="apd-identity">
          <div className="apd-avatar">{player?.avatar_url || player?.profile_picture_url ? <img src={player.avatar_url || player.profile_picture_url} alt="" /> : <UserRound size={27} />}</div>
          <div><DialogTitle>{player ? name : "Player dossier"}</DialogTitle><DialogDescription>{player ? `${player.region || "Region not set"} · Joined ${date(player.account_created_date || player.created_date)}` : "Player details, support, matches and staff history."}</DialogDescription></div>
          {player && <RoleBadge role={player.role} internal />}
        </div>
        {player && <div className="apd-statuses"><span data-tone={player.active_ban ? "danger" : player.active_suspension ? "warning" : "good"}>{player.active_ban ? "Banned" : player.active_suspension ? "Suspended" : "Active account"}</span>{player.active_premium && <span data-tone="gold">Premium</span>}{(player.verified_player || player.is_verified_player) && <span data-tone="good">Verified player</span>}<button type="button" className="apd-refresh" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Refresh player dossier"><RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} /></button></div>}
      </DialogHeader>
      <nav className="apd-tabs" aria-label="Player dossier sections">{tabs.filter(([key]) => key !== "wallet" || identityData?.permissions.wallet).map(([key, title, Icon]) => <button type="button" key={key} aria-current={section === key ? "page" : undefined} onClick={() => setSection(key)}><Icon size={15} />{title}</button>)}</nav>
      <div className="apd-content" key={`${playerId}:${section}`}>
        {query.isPending ? <div className="apd-loading"><Loader2 className="animate-spin" size={22} />Loading {label(section).toLowerCase()}…</div>
          : query.isError ? <div className="apd-error" role="alert"><CircleAlert size={20} /><p>{query.error.message}</p><button type="button" onClick={() => query.refetch()}>Try again</button></div>
            : player && <>
              {data?.unavailable_sources?.length > 0 && <div className="apd-source-notice"><CircleAlert size={16} /><p>Some match history is currently unavailable: {data.unavailable_sources.join(", ")}. Available matches are shown below.</p></div>}
              {section === "overview" && <>
                <div className="apd-section-heading"><h3>Player overview</h3><Link to={target({ tab: "users", search: player.username || name })} onClick={close}>Manage account<ArrowUpRight size={14} /></Link></div>
                <dl className="apd-details"><div><dt>Player name</dt><dd>{name}</dd></div><div><dt>Activision ID</dt><dd>{player.activision_id || "Not set"}</dd></div><div><dt>Account reference</dt><dd className="apd-reference">{player.id}</dd></div>{player.email && <div><dt>Email</dt><dd>{player.email}</dd></div>}{player.active_ban && player.ban_reason && <div className="apd-full"><dt>Ban reason</dt><dd>{player.ban_reason}</dd></div>}{player.active_suspension && <div><dt>Suspended until</dt><dd>{date(player.suspended_until)}</dd></div>}{player.active_premium && <div><dt>Premium expiry</dt><dd>{date(player.premium_expires)}</dd></div>}</dl>
                <div className="apd-stats"><Stat title="Wager record" value={`${number(player.wager_wins)}W / ${number(player.wager_losses)}L`} /><Stat title="Tournament wins" value={number(player.tournament_wins)} /><Stat title="Trophies" value={number(player.trophies)} /><Stat title="XP level" value={number(player.xp_level || 1)} /></div>
                <h3 className="apd-subtitle">Latest recorded statistics</h3><div className="apd-stat-groups">{[["ranked", "Ranked"], ["xp", "XP"], ["eights", "8s"]].map(([key, title]) => { const stats = data.stats?.[key] || {}; return <div key={key}><h4>{title}</h4>{Object.keys(stats).length ? <><strong>{number(stats.wins)}W / {number(stats.losses)}L</strong><p>{stats.elo != null ? `${number(stats.elo)} ELO` : stats.total_xp != null || stats.xp != null ? `${number(stats.total_xp ?? stats.xp)} XP` : label(stats.rank || stats.rank_name || "Unranked")}</p></> : <p>No recorded statistics.</p>}</div>; })}</div>
                <div className="apd-quick-links"><Link to={target({ tab: "tickets", search: name, status: "all" })} onClick={close}><Ticket size={16} />Support search<ArrowUpRight size={14} /></Link><Link to={target({ tab: "matches", search: name })} onClick={close}><Gamepad2 size={16} />Match search<ArrowUpRight size={14} /></Link></div>
              </>}
              {section === "support" && <><div className="apd-section-heading"><h3>Recent support cases</h3><span>Latest {data.limit}</span></div>{rows.length ? <div className="apd-records">{rows.map(row => <Link key={`${row.kind}:${row.id}`} to={target({ tab: "tickets", caseId: `${row.kind}:${row.id}`, status: "all" })} onClick={close}><Ticket size={18} /><div><strong>{label(row.title)}</strong><p>{row.admin_requested ? "Admin requested · " : ""}{row.staff_name ? `Helping: ${row.staff_name}` : "Unassigned"}</p><small>{date(row.updated_date || row.created_date)} · #{row.id.slice(-8).toUpperCase()}</small></div><span className="apd-state" data-closed={inactive(row.status)}>{label(row.status)}</span><ArrowUpRight size={15} /></Link>)}</div> : <Empty>No support cases found for this player.</Empty>}</>}
              {section === "matches" && <><div className="apd-section-heading"><h3>Recent matches</h3><span>Latest {data.limit}</span></div>{rows.length ? <div className="apd-records">{rows.map(row => <Link key={`${row.kind}:${row.id}`} to={target({ tab: "matches", match: `${row.kind}:${row.id}` })} onClick={close}><Gamepad2 size={18} /><div><strong>{row.host_name && row.challenger_name ? `${row.host_name} vs ${row.challenger_name}` : label(row.title)}</strong><p>{label(row.match_type || row.kind)}{row.game ? ` · ${row.game}` : ""}{row.game_mode ? ` · ${row.game_mode}` : ""}</p><small>{date(row.updated_date || row.created_date)} · #{row.id.slice(-8).toUpperCase()}</small></div><span className="apd-state" data-closed={inactive(row.status)}>{label(row.status)}</span><ArrowUpRight size={15} /></Link>)}</div> : <Empty>No matches found for this player.</Empty>}</>}
              {section === "history" && <><div className="apd-section-heading"><h3>Staff history</h3><Link to={target({ tab: "audit", search: player.id })} onClick={close}>Open audit log<ArrowUpRight size={14} /></Link></div>{rows.length ? <ol className="apd-history">{rows.map(row => <li key={row.id}><ShieldCheck size={16} /><div><strong>{label(row.action)}</strong>{row.description && <p>{row.description}</p>}<small>{row.staff_name} · {date(row.created_date)}</small></div></li>)}</ol> : <Empty>No staff actions recorded for this player.</Empty>}</>}
              {section === "items" && <><div className="apd-section-heading"><h3>Recent inventory items</h3><span>Latest {data.limit}</span></div>{rows.length ? <div className="apd-items">{rows.map(row => <div key={row.id}><Boxes size={20} /><div><strong>{row.item_name || row.name || "Inventory item"}</strong><p>{label(row.item_type || row.type || "Item")}{Number(row.quantity) > 1 ? ` · ${number(row.quantity)} owned` : ""}</p><small>{row.is_equipped || row.equipped ? "Equipped" : date(row.created_date)}</small></div></div>)}</div> : <Empty>No inventory items found for this player.</Empty>}</>}
              {section === "wallet" && <><div className="apd-section-heading"><h3>Wallet &amp; transactions</h3><Link to={target({ tab: "wallets", search: player.username || name })} onClick={close}>Wallet management<ArrowUpRight size={14} /></Link></div><div className="apd-stats"><Stat title="Available" value={money(data.wallet?.available_balance)} /><Stat title="Locked" value={money(data.wallet?.locked_balance)} /><Stat title="Pending" value={money(data.wallet?.pending_balance)} /><Stat title="Credits" value={number(player.credits)} /></div>{rows.length ? <ol className="apd-history">{rows.map(row => <li key={row.id}><Wallet size={16} /><div><strong>{label(row.type || "Transaction")} · {money(row.amount)}</strong><p>{row.description || row.reason || label(row.status || "Recorded")}</p><small>{date(row.created_date)}</small></div></li>)}</ol> : <Empty>No wallet transactions found.</Empty>}</>}
            </>}
      </div>
      <footer className="apd-footer"><ShieldCheck size={13} />Read-only overview. Existing permissions apply to every action.</footer>
    </DialogContent>
  </Dialog>;
}
