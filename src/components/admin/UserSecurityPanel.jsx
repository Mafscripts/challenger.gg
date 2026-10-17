import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function UserSecurityPanel({ user, onBanIps, busy }) {
  const query = useQuery({
    queryKey: ["admin-user-security", user.id],
    queryFn: async () => {
      const response = await base44.functions.invoke("getAdminUserSecurity", { user_id: user.id });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not load account security.");
      return response.data;
    }, staleTime: 0, refetchOnWindowFocus: false,
  });
  const security = query.data;
  return <section className="au-security">
    <div className="au-card-heading"><h3><Globe size={15} /> IP &amp; linked accounts</h3>{!!security?.ips.length && <button type="button" disabled={busy} onClick={() => onBanIps(security)} className="au-ip-ban">Ban IPs</button>}</div>
    {query.isPending && <p className="au-hint"><Loader2 size={14} className="animate-spin" /> Loading account security...</p>}
    {query.isError && <p role="alert" className="au-error">{query.error.message} <button onClick={() => query.refetch()}>Retry</button></p>}
    {security && <>
      {!!security.excluded_proxy_ip_count && <p className="au-hint">{security.excluded_proxy_ip_count} Cloudflare proxy {security.excluded_proxy_ip_count === 1 ? "address was" : "addresses were"} excluded from account matching. Only visitor IPs are compared.</p>}
      {security.ips.length ? <div className="au-ip-list">{security.ips.map((ip) => <div key={ip}><code>{ip}</code><span>{security.shared_accounts.some((account) => account.shared_ips.includes(ip)) ? "Shared IP" : "Recorded"}</span></div>)}</div>
        : <p className="au-hint">No public IP recorded yet. An address is saved when this player next signs in or uses an active session.</p>}
      {!security.incoming_ip_captured && <p className="au-diagnostic">This request has no public client IP. Check the production proxy headers and TRUST_PROXY setting.</p>}
      <div className="au-linked-heading"><strong>Accounts on the same IP</strong><span>{security.shared_accounts.length}</span></div>
      {security.shared_accounts.length ? <><p className="au-hint">A shared IP is a review signal. Households and shared networks can also share an address.</p>
        <div className="au-linked-accounts">{security.shared_accounts.map((account) => <Link key={account.id} to={`/profile/${account.username || account.id}`}>
          <span className="au-linked-avatar">{account.name.slice(0, 1).toUpperCase()}</span><span><strong>{account.name}</strong><small>{account.shared_ips.join(", ")}</small></span><span>{account.is_banned ? "Banned" : "View profile"}</span>
        </Link>)}</div></> : <p className="au-hint">{security.ips.length ? "No other accounts share the recorded addresses." : "Linked accounts can be checked once an IP is recorded."}</p>}
      {!!security.history.length && <details className="au-history"><summary>IP history</summary><div>{[...security.history].reverse().map((entry, index) => <p key={`${entry.ip}:${index}`}><code>{entry.ip}</code><time>{entry.date ? new Date(entry.date).toLocaleString() : ""}</time></p>)}</div></details>}
    </>}
  </section>;
}
