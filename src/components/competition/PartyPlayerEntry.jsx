import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Info, Plus, Search, UserRound, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partyCapacity } from "@/lib/partyWheel";

const emptyPlayer = () => ({ name: "", user_id: null });
function GenderSelect({ value, onChange, disabled }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger className="party-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">♂ Male</SelectItem><SelectItem value="female">♀ Female</SelectItem></SelectContent></Select>;
}

export function PartyPlayerLookup({ label, value, onChange, disabled, excludeIds = [] }) {
  const id = useId(), input = useRef(null);
  const [open, setOpen] = useState(false), [players, setPlayers] = useState([]), [status, setStatus] = useState("idle"), [active, setActive] = useState(-1);
  const query = value.name.trim();
  useEffect(() => {
    setActive(-1); setPlayers([]);
    if (!open || value.user_id || value.guest || query.length < 2) { setStatus("idle"); return; }
    let current = true;
    setStatus("loading");
    const timer = setTimeout(async () => {
      try { const result = await base44.party.searchPlayers(query); if (current) { setPlayers(result.players || []); setActive(-1); setStatus("ready"); } }
      catch { if (current) setStatus("error"); }
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [query, value.user_id, value.guest, open]);
  const choices = players.filter((player) => !excludeIds.includes(player.id));
  const show = open && !disabled && !value.user_id && !value.guest && query.length > 0;
  const choose = (player) => {
    onChange(player ? { name: player.name, user_id: player.id, username: player.username, avatar_url: player.avatar_url } : { name: query, user_id: null, guest: true });
    setOpen(false); setActive(-1);
  };
  return <div className="party-player-lookup" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="party-lookup-label">{label}</label>
    <div className={`party-lookup-field ${value.user_id ? "is-linked" : ""}`}>
      {value.user_id ? <Check aria-hidden="true" /> : <Search aria-hidden="true" />}
      <input id={id} ref={input} role="combobox" aria-expanded={show} aria-autocomplete="list" aria-controls={`${id}-results`} aria-activedescendant={show && active >= 0 ? `${id}-option-${active}` : undefined} autoComplete="off" value={value.name} required maxLength={32} disabled={disabled} placeholder="Search a player or enter a guest…" onFocus={() => setOpen(true)} onChange={(event) => { onChange({ name: event.target.value, user_id: null }); setOpen(true); }} onKeyDown={(event) => {
        if (!show) return;
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((previous) => (previous + 1) % (choices.length + 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActive((previous) => previous <= 0 ? choices.length : previous - 1); }
        if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
        if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(choices[active] || null); }
      }} />
      {value.name && <button type="button" disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onChange(emptyPlayer()); setOpen(true); input.current?.focus(); }}><X /></button>}
    </div>
    {value.user_id && <p className="party-lookup-note"><Check />Website account selected</p>}
    {value.guest && <p className="party-lookup-note is-guest"><UserRound />Guest · no account needed</p>}
    {show && <div className="party-lookup-results" id={`${id}-results`} role="listbox" aria-label="Website players or guest">
      <p className="party-lookup-status" role="status">{query.length < 2 ? "Type at least 2 characters to find an account" : status === "loading" ? "Searching website players…" : status === "error" ? "Search unavailable. You can still add a guest." : choices.length ? "Website players" : "No matching account found"}</p>
      {choices.map((player, index) => <button type="button" role="option" aria-selected={active === index} id={`${id}-option-${index}`} key={player.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(player)}><span className="party-lookup-avatar">{player.avatar_url ? <img src={player.avatar_url} alt="" /> : <UserRound />}</span><span><strong>{player.name}</strong><small>{player.username ? `@${player.username}` : "Website account"}</small></span><Check className="party-lookup-check" /></button>)}
      <button type="button" role="option" aria-selected={active === choices.length} id={`${id}-option-${choices.length}`} className="party-lookup-guest" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(null)}><span className="party-lookup-avatar"><Plus /></span><span><strong>Use “{query}” as a guest</strong><small>No website account required</small></span></button>
    </div>}
  </div>;
}

export function PartyAddPlayers({ room, disabled, act }) {
  const [player, setPlayer] = useState(emptyPlayer), [gender, setGender] = useState("male"), [names, setNames] = useState("");
  const full = room.players.length >= partyCapacity(room);
  const excluded = room.players.map((entry) => entry.user_id).filter(Boolean);
  return <div className="party-add-players"><div className="party-entry-heading"><span><UserRound />Add a solo player</span><BadgeTooltip label="Solo players" icon={UserRound} toneClass="text-cyan" description="No duo partner needed. Choose a website player or enter a guest name. The wheel places solos into teams and keeps fixed duos together. For Co-ed, choose the player's gender."><button type="button" className="party-icon-button" aria-label="How solo players and fixed duos work"><Info /></button></BadgeTooltip></div><form onSubmit={async (event) => { event.preventDefault(); if (await act("add", { players: [{ name: player.name, user_id: player.user_id, gender }] })) setPlayer(emptyPlayer()); }}>
    <PartyPlayerLookup label="Player name" value={player} onChange={setPlayer} disabled={disabled || full} excludeIds={excluded} />
    <div className="party-actions mt-3">{room.mode === "coed" && <GenderSelect value={gender} onChange={setGender} disabled={disabled} />}<button className="party-button party-primary" disabled={disabled || full || !player.name.trim()}><Plus />Add solo player</button></div>
    <p className="party-muted">Website player or guest · no duo partner needed.</p>
  </form><details className="party-bulk-guests"><summary>Add multiple guests<ChevronDown /></summary><form onSubmit={async (event) => { event.preventDefault(); const values = names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean); if (await act("add", { names: values, gender })) setNames(""); }}><label className="party-label">Guest names<textarea className="party-field" rows={3} value={names} onChange={(event) => setNames(event.target.value)} maxLength={2400} placeholder={"One guest per line"} disabled={disabled || full} /></label><button className="party-button" disabled={disabled || full || !names.trim()}><Plus />Add guests</button></form></details></div>;
}

export function PartyAddDuo({ room, disabled, act }) {
  const [players, setPlayers] = useState(() => [emptyPlayer(), emptyPlayer()]), [genders, setGenders] = useState(["male", "female"]);
  const excluded = room.players.map((entry) => entry.user_id).filter(Boolean);
  const update = (index, value) => setPlayers((previous) => previous.map((player, i) => i === index ? value : player));
  return <details className="party-add-duo"><summary><Users />Add a fixed duo<ChevronDown /></summary><p className="party-muted">Choose website players or enter guests. Both players stay together when teams are drawn.</p><form onSubmit={async (event) => { event.preventDefault(); if (await act("add_duo", { players: players.map((player, index) => ({ name: player.name, user_id: player.user_id, gender: genders[index] })) })) setPlayers([emptyPlayer(), emptyPlayer()]); }}>
    {players.map((player, index) => <div className="party-duo-input" key={index}><PartyPlayerLookup label={`Player ${index + 1}`} value={player} onChange={(value) => update(index, value)} disabled={disabled} excludeIds={[...excluded, ...players.filter((_, i) => i !== index).map((entry) => entry.user_id).filter(Boolean)]} />{room.mode === "coed" && <label className="party-label">Gender<GenderSelect value={genders[index]} onChange={(value) => setGenders((previous) => previous.map((gender, i) => i === index ? value : gender))} disabled={disabled} /></label>}</div>)}
    <button className="party-button party-primary" disabled={disabled || players.some((player) => !player.name.trim()) || partyCapacity(room) - room.players.length < 2}><Plus />Add duo</button>
  </form></details>;
}
