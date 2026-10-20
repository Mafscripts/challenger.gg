import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";

export default function NavbarPlayerSearch({ onSelect }) {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setPlayers([]); setStatus("idle"); return; }
    let active = true;
    setPlayers([]); setStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const response = await base44.functions.invoke("searchMessageRecipients", { query: value });
        if (!response.data?.success) throw new Error("Search unavailable");
        if (active) { setPlayers(response.data.users || []); setStatus("ready"); }
      } catch { if (active) setStatus("error"); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);
  return <section className="nav-player-search" aria-label="Find players">
    <label className="nav-player-search-field"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players…" aria-label="Search Topfragg players" maxLength={100} /></label>
    {query.trim().length >= 2 && <div className="nav-player-search-results" aria-live="polite">
      {status === "loading" ? <p>Searching…</p> : status === "error" ? <p>Search is unavailable. Please try again.</p> : !players.length ? <p>No players found.</p> : players.map((player) => <Link key={player.id} to={`/profile/${encodeURIComponent(player.username || player.id)}`} onClick={onSelect}><span className="nav-player-search-avatar"><PlayerAvatarImage user={player} src={player.avatar_url} /></span><span><strong>{player.name || player.username}</strong><small>@{player.handle || player.username || "player"}</small></span></Link>)}
    </div>}
  </section>;
}
