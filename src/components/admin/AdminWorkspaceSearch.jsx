import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, Gamepad2, Loader2, Search, Ticket, UserRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { adminTargetUrl, openAdminPlayer } from "@/lib/adminWorkspace";
import { playerDisplayName } from "@/lib/playerIdentity";
import { effectiveRoleForUser } from "@/lib/roles";
import { ticketReporter, ticketTitle } from "@/lib/adminTickets";
import "@/styles/admin-workspace.css";

export default function AdminWorkspaceSearch({ user }) {
  const [open, setOpen] = useState(false), [input, setInput] = useState(""), [search, setSearch] = useState("");
  useEffect(() => {
    const keydown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => { const timer = setTimeout(() => setSearch(input.trim()), 300); return () => clearTimeout(timer); }, [input]);
  const query = useQuery({
    queryKey: ["admin-console", user.id, effectiveRoleForUser(user), "workspaceSearch", search],
    enabled: open && search.length >= 2,
    queryFn: async () => {
      const names = ["players", "support", "matches"];
      const results = await Promise.allSettled([
        base44.functions.invoke("getAdminUsers", { search, include_security: false, include_wallets: false }),
        base44.functions.invoke("getAdminTickets", { search, filter: "all" }),
        base44.functions.invoke("getAdminMatches", { search }),
      ]);
      return Object.fromEntries(results.map((result, index) => [names[index], result.status === "fulfilled" && result.value.data?.success
        ? { rows: result.value.data.rows.slice(0, 5) } : { rows: [], error: "Could not load these results." }]));
    },
    staleTime: 30000, refetchOnWindowFocus: false,
  });
  const pending = input.trim() !== search || query.isFetching;
  const close = () => setOpen(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="admin-console-button"><Search size={15} />Search workspace<kbd>Ctrl K</kbd></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="admin-workspace-search" overlayClassName="aws-overlay">
      <DialogTitle>Find a player, match or support case</DialogTitle><DialogDescription>Search names and references across your staff workspace.</DialogDescription>
      <div className="aws-input"><Search size={19} /><input autoFocus aria-label="Search the admin workspace" value={input} onChange={event => setInput(event.target.value)} placeholder="Player name, match or ticket reference…" />{pending && search.length >= 2 && <Loader2 size={17} className="animate-spin" />}</div>
      {search.length < 2 ? <div className="aws-shortcuts"><p>Quick access</p>{[["New support activity", { tab: "tickets", view: "new", status: "open" }], ["My assigned cases", { tab: "tickets", view: "mine", status: "open" }], ["Active match rooms", { tab: "matches", state: "active" }]].map(([label, target]) => <Link key={label} onClick={close} to={adminTargetUrl(target)}>{label}<ArrowUpRight size={15} /></Link>)}</div>
        : <div className="aws-results" aria-busy={pending}>
          {[["players", "Players", UserRound], ["support", "Support cases", Ticket], ["matches", "Matches", Gamepad2]].map(([key, title, Icon]) => <section key={key}><h3><Icon size={15} />{title}</h3>
            {query.data?.[key].error ? <p role="alert">{query.data[key].error}</p> : !query.data?.[key].rows.length ? <p>{pending ? "Searching…" : "No results found."}</p>
              : query.data[key].rows.map(row => key === "players" ? <button key={row.id} onClick={() => { close(); openAdminPlayer(row.id); }}><span><strong>{playerDisplayName(row)}</strong><small>Open player dossier</small></span><ArrowUpRight size={15} /></button>
                : <Link key={row.id} onClick={close} to={adminTargetUrl(key === "support" ? { tab: "tickets", caseId: row.id } : { tab: "matches", match: row.id })}><span><strong>{key === "support" ? ticketTitle(row) : row.title || row.id}</strong><small>{key === "support" ? ticketReporter(row) : `${row.mode} · ${String(row.status || "").replaceAll("_", " ")}`}</small></span><ArrowUpRight size={15} /></Link>)}
          </section>)}
          {query.isError && <p role="alert">Search could not complete. <button onClick={() => query.refetch()}>Try again</button></p>}
        </div>}
    </DialogContent></Dialog>
  </>;
}
