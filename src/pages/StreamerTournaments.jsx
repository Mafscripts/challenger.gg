import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Clock, Loader2, Monitor, Plus, Radio, Swords, Trophy, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const gameModeOptions = [
  { value: "bo1_snd", label: "BO1 SND" },
  { value: "snd", label: "BO3 Search & Destroy" },
  { value: "hp", label: "BO3 Hardpoint" },
  { value: "overload", label: "BO3 Overload" },
  { value: "snd_hp_snd", label: "BO3 SND / HP / SND" },
  { value: "bo3_hp_overload_snd", label: "BO3 HP / Overload / SND" },
  { value: "bo5_hp_overload_snd_hp_snd", label: "BO5 HP / Overload / SND / HP / SND" },
];
const switchFormatOptions = [
  { value: "4v4", label: "4v4 Switcheroo", hint: "Add duos, then pair two duos per team" },
  { value: "2v2", label: "2v2 Switcheroo", hint: "Add solo names, then pair two players per team" },
];
const defaultForm = {
  name: "",
  description: "",
  game_mode: "snd_hp_snd",
  switch_format: "4v4",
  max_teams: "8",
  start_date: "",
};

const modeLabel = (value) => gameModeOptions.find((option) => option.value === value)?.label || value || "Mode TBD";
const formatDate = (value) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Start TBD";
const isStreamerTournament = (tournament) => Boolean(
  tournament?.is_streamer_tournament
  || ["streamer", "streamer_tournament"].includes(String(tournament?.tournament_type || "").toLowerCase())
  || ["streamer", "streamer_tournament"].includes(String(tournament?.source || "").toLowerCase())
);
const isStreamerUser = (user) => {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  return Boolean(user?.streamer_badge || user?.is_streamer || badges.some((badge) => badge?.type === "streamer"));
};

export default function StreamerTournaments() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const hostFilter = searchParams.get("host");

  useEffect(() => {
    loadStreamerTournaments();
  }, []);

  const loadStreamerTournaments = async () => {
    setLoading(true);
    try {
      const [currentUser, rows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Tournament.filterFresh({}, "-created_date", 250).catch(() => []),
      ]);
      setUser(currentUser);
      setTournaments((rows || []).filter(isStreamerTournament));
    } catch (error) {
      toast({ title: "Streamer tournaments unavailable", description: error.message || "Could not load streamer tournaments.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const visibleTournaments = useMemo(() => (
    tournaments
      .filter((tournament) => !hostFilter || String(tournament.host_id || tournament.created_by || "") === String(hostFilter))
      .sort((a, b) => new Date(b.created_date || b.start_date || 0) - new Date(a.created_date || a.start_date || 0))
  ), [hostFilter, tournaments]);
  const canPost = isStreamerUser(user);

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canPost) {
      toast({ title: "Streamer badge required", description: "Only streamer accounts can post streamer tournaments.", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Add a tournament name before posting.", variant: "destructive" });
      return;
    }

    setPosting(true);
    try {
      const response = await base44.functions.invoke("createStreamerTournament", {
        ...form,
        team_size: form.switch_format,
        max_teams: Number(form.max_teams || 8),
        start_date: form.start_date ? new Date(form.start_date).toISOString() : undefined,
      });
      if (!response.data?.success) {
        toast({ title: "Post failed", description: response.data?.error || "Could not post streamer tournament.", variant: "destructive" });
        return;
      }
      toast({ title: "Streamer tournament posted", description: `${form.name} lobby is live.` });
      setForm(defaultForm);
      navigate(`/streamer-tournament/${response.data.tournament.id}`);
    } catch (error) {
      toast({ title: "Post failed", description: error.message || "Could not post streamer tournament.", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading streamer tournaments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-[1500px] px-4 lg:px-6">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-blue-400/25 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-300">
              <Monitor className="h-3.5 w-3.5" /> Streamer Badge
            </div>
            <h1 className="text-3xl font-black tracking-tight">Streamer Switcheroos</h1>
            <p className="mt-1 text-sm text-vapor">Public streamer-hosted lobbies with manual names, random teams, live brackets, and separate chat moderation.</p>
          </div>
          <Link to="/tournaments" className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-secondary px-4 py-2 text-xs font-black uppercase tracking-wider text-vapor hover:border-cyan/25 hover:text-cyan">
            Official Tournaments <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="glass rounded-xl border border-white/5 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-blue-400/25 bg-blue-500/10 text-blue-300">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider">Post Switcheroo Lobby</h2>
                <p className="text-xs text-vapor">Streamer badge required.</p>
              </div>
            </div>

            {!canPost && (
              <div className="mb-4 rounded-lg border border-orange/20 bg-orange/10 px-4 py-3 text-sm text-orange">
                Viewers can browse and chat, but only streamer accounts can post new streamer tournaments.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Tournament name</span>
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  disabled={!canPost || posting}
                  maxLength={80}
                  className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/35 disabled:opacity-50"
                  placeholder="Friday Switcheroo 8s"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  disabled={!canPost || posting}
                  maxLength={500}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/35 disabled:opacity-50"
                  placeholder="Stream rules, schedule, entry info, or team draw notes."
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Mode</span>
                  <select
                    value={form.game_mode}
                    onChange={(event) => updateForm("game_mode", event.target.value)}
                    disabled={!canPost || posting}
                    className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/35 disabled:opacity-50"
                  >
                    {gameModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Switch format</span>
                  <select
                    value={form.switch_format}
                    onChange={(event) => updateForm("switch_format", event.target.value)}
                    disabled={!canPost || posting}
                    className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/35 disabled:opacity-50"
                  >
                    {switchFormatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <span className="block text-[10px] font-semibold text-vapor">{switchFormatOptions.find((option) => option.value === form.switch_format)?.hint}</span>
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Max teams</span>
                  <input
                    type="number"
                    min="2"
                    max="64"
                    value={form.max_teams}
                    onChange={(event) => updateForm("max_teams", event.target.value)}
                    disabled={!canPost || posting}
                    className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/35 disabled:opacity-50"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Start time</span>
                  <input
                    type="datetime-local"
                    value={form.start_date}
                    onChange={(event) => updateForm("start_date", event.target.value)}
                    disabled={!canPost || posting}
                    className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/35 disabled:opacity-50"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={!canPost || posting}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan px-4 text-xs font-black uppercase tracking-wider text-background disabled:opacity-50"
              >
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                Post Switcheroo Lobby
              </button>
            </form>
          </section>

          <section className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-wider">Live Streamer Lobbies</h2>
              <span className="text-xs text-vapor">{visibleTournaments.length} showing</span>
            </div>
            {visibleTournaments.length === 0 ? (
              <div className="glass rounded-xl border border-white/5 px-5 py-12 text-center">
                <Monitor className="mx-auto mb-3 h-10 w-10 text-vapor/30" />
                <p className="text-sm text-vapor">No streamer tournaments posted yet.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {visibleTournaments.map((tournament) => (
                  <Link
                    key={tournament.id}
                    to={`/streamer-tournament/${tournament.id}`}
                    className="glass group rounded-xl border border-white/5 p-5 transition-colors hover:border-blue-400/25 hover:bg-blue-500/[0.03]"
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black">{tournament.name}</p>
                        <p className="mt-1 truncate text-xs text-vapor">Hosted by {tournament.host_name || tournament.created_by_name || "Streamer"}</p>
                      </div>
                      <span className="shrink-0 rounded border border-blue-400/25 bg-blue-500/10 px-2 py-1 text-[10px] font-black uppercase text-blue-300">
                        Streamer
                      </span>
                    </div>
                    <p className="mb-5 line-clamp-2 min-h-[2.5rem] text-sm text-vapor">
                      {tournament.description || "Streamer-hosted switcheroo lobby."}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <InfoPill icon={Swords} label="Mode" value={modeLabel(tournament.game_mode)} />
                      <InfoPill icon={Users} label="Teams" value={`${tournament.registered_teams || 0}/${tournament.max_teams || 0}`} />
                      <InfoPill icon={Trophy} label="Format" value={tournament.switch_format || tournament.team_size || "4v4"} />
                      <InfoPill icon={Clock} label="Starts" value={formatDate(tournament.start_date)} />
                    </div>
                    <div className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan group-hover:text-white">
                      Open Lobby <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function InfoPill({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-white/5 bg-background/25 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-vapor">
        <Icon className="h-3.5 w-3.5 text-blue-300" /> {label}
      </div>
      <p className="truncate font-bold text-white">{value}</p>
    </div>
  );
}
