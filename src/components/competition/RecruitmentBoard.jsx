import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { Clock3, Globe2, MessageCircle, Plus, RefreshCw, Shield, UserPlus, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import usePlayTeams from "@/hooks/usePlayTeams";
import { leaderboardQueryOptions } from "@/hooks/useCompetitionLeaderboard";
import { screenshotRanks, screenshotRankFor } from "@/lib/screenshotRanks";
import { recruitmentGames as games, recruitmentModes as modes, recruitmentRegions as regions, recruitmentLanguages as languages, recruitmentAvailability as times, recruitmentLabel as label, recruitmentTeamFits, recruitmentGamesFor } from "@/lib/recruitment";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import UserBadges from "@/components/ui/UserBadges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";

const fieldClass = "w-full min-w-0 rounded-lg border border-white/10 bg-background px-3 py-2.5 text-xs text-white outline-none focus:border-cyan/40";
const buttonClass = "site-hover inline-flex items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-3 py-2.5 text-xs font-bold text-cyan disabled:opacity-40";
const filterKeys = ["kind", "competition", "game_id", "region", "rank", "language", "availability"];
const rankOptions = [{ id: "any", name: "Any game rank" }, ...screenshotRanks.map((rank) => ({ id: rank.id, name: rank.label }))];
const defaultForm = (user) => ({ kind: "player", competition: "xp", game_id: "bo7", region: ["NA", "EU"].includes(user?.region) ? user.region : "any", language: "any", rank: "any", availability: "flexible", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", title: "", description: "", duration: 24, team_id: "" });

function Field({ title, children }) { return <label className="flex min-w-0 flex-col gap-2 text-[11px] font-bold text-vapor">{title}{children}</label>; }
function Choices({ items, ...props }) { return <select {...props} className={fieldClass}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>; }

function PostEditor({ user, existing, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...defaultForm(user), ...existing, duration: 24, team_id: existing?.team_id || "" }));
  const [error, setError] = useState("");
  const teams = usePlayTeams(user.id, form.kind === "team");
  const availableTeams = (teams.data || []).filter((team) => team.captain_id === user.id && recruitmentTeamFits(team, form.competition) && team.members.length < Number(team.roster_size));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = useMutation({ mutationFn: () => base44.recruitment.save(form), onSuccess: onSaved, onError: (error) => setError(error.message) });
  const canUseTeam = Boolean(modes.find((mode) => mode.id === form.competition)?.team);
  return <Dialog open onOpenChange={(open) => { if (!open && !save.isPending) onClose(); }}><DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto border-white/10 bg-card"><DialogHeader><DialogTitle>{existing ? "Edit / renew your call" : "Find your next teammates"}</DialogTitle><DialogDescription>Share what you play and when. Your actual game rank is shown on your player card.</DialogDescription></DialogHeader>
    <form onSubmit={(event) => { event.preventDefault(); setError(""); save.mutate(); }} className="mt-2 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><Field title="I am looking for"><Choices items={[{ id: "player", name: "A team / teammates to play with" }, ...(canUseTeam ? [{ id: "team", name: "Players for my team" }] : [])]} value={form.kind} onChange={(event) => set("kind", event.target.value)} /></Field><Field title="Competition"><Choices items={modes} value={form.competition} onChange={(event) => setForm((current) => ({ ...current, competition: event.target.value, game_id: recruitmentGamesFor(event.target.value).some((game) => game.id === current.game_id) ? current.game_id : "bo7", team_id: "", ...(!modes.find((mode) => mode.id === event.target.value)?.team ? { kind: "player" } : {}) }))} /></Field></div>
      {!canUseTeam && <p className="text-xs leading-5 text-vapor">This mode takes individual entries. Teams are assigned inside the lobby.</p>}
      {form.kind === "team" && <Field title="Team with open roster places"><select required value={form.team_id} onChange={(event) => set("team_id", event.target.value)} className={fieldClass}><option value="" disabled>Select a team you captain</option>{availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.members.length}/{team.roster_size}</option>)}</select><span className="text-[10px] font-normal">{teams.isPending ? "Loading teams…" : "Only compatible teams with open places are available."} <Link to="/teams" className="text-cyan">Manage teams</Link></span>{teams.isError && <button type="button" onClick={() => teams.refetch()} className={buttonClass}>Could not load teams. Retry</button>}</Field>}
      <div className="grid gap-3 sm:grid-cols-3"><Field title="Game"><Choices items={recruitmentGamesFor(form.competition)} value={form.game_id} onChange={(event) => set("game_id", event.target.value)} /></Field><Field title="Region"><Choices items={regions} value={form.region} onChange={(event) => set("region", event.target.value)} /></Field><Field title="Language"><Choices items={languages} value={form.language} onChange={(event) => set("language", event.target.value)} /></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field title="Availability"><Choices items={times} value={form.availability} onChange={(event) => set("availability", event.target.value)} /></Field><Field title="Timezone"><input required maxLength={64} value={form.timezone} onChange={(event) => set("timezone", event.target.value)} placeholder="Europe/Amsterdam" className={fieldClass} /></Field></div>
      {form.kind === "team" && <Field title="Preferred game rank (not a minimum enforced by the website)"><Choices items={rankOptions} value={form.rank} onChange={(event) => set("rank", event.target.value)} /></Field>}
      <Field title="Title"><input required minLength={3} maxLength={80} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Looking for a duo for evening XP matches" className={fieldClass} /></Field>
      <Field title="About your call"><textarea required minLength={10} maxLength={500} rows={4} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Your playstyle, usual times and the teammates you are looking for…" className={fieldClass} /><span className="text-right text-[10px] font-normal">{form.description.length}/500</span></Field>
      <Field title="Keep this call open for"><Choices items={[{ id: 24, name: "1 day" }, { id: 72, name: "3 days" }, { id: 168, name: "7 days" }]} value={form.duration} onChange={(event) => set("duration", Number(event.target.value))} />{form.availability === "now" && <span className="text-[10px] font-normal">Ready now calls expire after 3 hours.</span>}</Field>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={save.isPending} onClick={onClose} className={buttonClass}>Cancel</button><button type="submit" disabled={save.isPending || (form.kind === "team" && !availableTeams.some((team) => team.id === form.team_id))} className={buttonClass}>{save.isPending ? "Saving…" : existing ? "Save & renew" : "Publish call"}</button></div>
    </form>
  </DialogContent></Dialog>;
}

function InviteDialog({ post, user, onClose }) {
  const teams = usePlayTeams(user.id);
  const cache = useQueryClient();
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");
  const available = (teams.data || []).filter((team) => team.captain_id === user.id && recruitmentTeamFits(team, post.competition)
    && team.members.length < Number(team.roster_size) && !team.members.some((member) => member.user_id === post.user_id));
  const invite = useMutation({ mutationFn: async () => {
    const result = await base44.functions.invoke("manageTeam", { action: "invite", team_id: teamId, user_id: post.user_id });
    if (!result.data?.success) throw new Error(result.data?.error || "Invitation could not be sent");
  }, onSuccess: () => { toast({ title: "Team invitation sent", description: "The player can review and accept it from Teams." }); void cache.invalidateQueries({ queryKey: ["play-teams", user.id] }); onClose(); }, onError: (error) => setError(error.message) });
  return <Dialog open onOpenChange={(open) => { if (!open && !invite.isPending) onClose(); }}><DialogContent className="border-white/10 bg-card"><DialogHeader><DialogTitle>Invite {post.player?.name}</DialogTitle><DialogDescription>Choose a compatible team you captain. The player decides whether to accept.</DialogDescription></DialogHeader><select aria-label="Invite to team" value={teamId} onChange={(event) => setTeamId(event.target.value)} className={fieldClass}><option value="" disabled>Select your team</option>{available.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.members.length}/{team.roster_size}</option>)}</select>{teams.isPending ? <p className="text-xs text-vapor">Loading teams…</p> : !available.length && <Link to="/teams" className="text-xs text-cyan">No compatible open roster. Manage your teams</Link>}{teams.isError && <button onClick={() => teams.refetch()} className={buttonClass}>Retry loading teams</button>}{error && <p role="alert" className="text-xs text-red-400">{error}</p>}<button disabled={!available.some((team) => team.id === teamId) || invite.isPending} onClick={() => invite.mutate()} className={buttonClass}>{invite.isPending ? "Sending…" : "Send team invitation"}</button></DialogContent></Dialog>;
}

export default function RecruitmentBoard({ mine = false }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => Object.fromEntries(filterKeys.map((key) => [key, params.get(key)]).filter(([, value]) => value)), [params]);
  const clearFilters = () => setParams((current) => { const next = new URLSearchParams(current); filterKeys.forEach((key) => next.delete(key)); return next; }, { replace: true });
  const [clock, setClock] = useState(Date.now());
  const [editor, setEditor] = useState(null);
  const [invite, setInvite] = useState(null);
  const [moderating, setModerating] = useState(null);
  const [reason, setReason] = useState("");
  const query = useInfiniteQuery({ queryKey: ["recruitment", user?.id, mine, filters], initialPageParam: null,
    queryFn: ({ pageParam }) => base44.recruitment.list({ ...filters, mine, cursor: pageParam }),
    getNextPageParam: (page) => page.next_cursor || undefined, enabled: Boolean(user?.id), staleTime: 30_000, refetchOnWindowFocus: true, retry: false });
  const refresh = () => cache.invalidateQueries({ queryKey: ["recruitment"] });
  const close = useMutation({ mutationFn: ({ post, reason }) => base44.recruitment.close(post.id, reason), onSuccess: () => { setModerating(null); setReason(""); void refresh(); }, onError: (error) => toast({ title: "Could not close post", description: error.message, variant: "destructive" }) });
  const allRows = useMemo(() => query.data?.pages.flatMap((page) => page.posts) || [], [query.data?.pages]);
  const rows = mine ? allRows : allRows.filter((post) => Date.parse(post.expires_at) > clock);
  useEffect(() => {
    if (mine) return;
    const expiry = Math.min(...allRows.map((post) => Date.parse(post.expires_at)).filter((value) => value > clock));
    if (!Number.isFinite(expiry)) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(2147483647, Math.max(100, expiry - Date.now() + 50)));
    return () => window.clearTimeout(timer);
  }, [mine, clock, allRows]);
  // Text and filters render first. Reuse the existing batched avatar endpoint,
  // one request per displayed page, without blocking the recruitment listing.
  const avatarBuckets = useMemo(() => [...new Map((query.data?.pages || []).map((page) => {
    const ids = [...new Set(page.posts.map((post) => post.user_id))].sort();
    return [ids.join("|"), ids];
  })).values()], [query.data?.pages]);
  const avatarPages = useQueries({ queries: avatarBuckets.map((ids) => {
    return { ...leaderboardQueryOptions, queryKey: ["leaderboard-avatars", user?.id, ids.join("|")], enabled: Boolean(user?.id && ids.length),
      queryFn: async () => { const result = await base44.functions.invoke("getLeaderboardAvatars", { user_ids: ids }); if (!result.data?.success) throw new Error("Could not load player images"); return result.data.avatars || {}; } };
  }) });
  const avatars = Object.assign({}, ...avatarPages.map((page) => page.data || {}));
  const canModerate = query.data?.pages[0]?.can_moderate;
  const filter = (key, value) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  return <section className="space-y-5" aria-label="Teammate recruitment">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{mine ? "Your recruitment calls" : "Find your next squad"}</h2><p className="mt-1 text-xs text-vapor">{mine ? "Edit, renew or close your calls. Filled team rosters are hidden from the board." : "Players looking for a squad and teams with open places. Times are shown in each poster's timezone."}</p></div><div className="flex gap-2"><button type="button" disabled={query.isFetching} onClick={refresh} className={buttonClass} aria-label="Refresh recruitment"><RefreshCw className="h-4 w-4" /></button><button type="button" onClick={() => setEditor({})} className={buttonClass}><Plus className="h-4 w-4" />New call</button></div></div>
    {!mine && <div className="grid gap-3 rounded-xl border border-white/10 bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field title="Looking for"><Choices items={[{ id: "", name: "Players & teams" }, { id: "player", name: "Players seeking teammates" }, { id: "team", name: "Teams seeking players" }]} value={filters.kind || ""} onChange={(event) => filter("kind", event.target.value)} /></Field>
      <Field title="Competition"><Choices items={[{ id: "", name: "All competitions" }, ...modes]} value={filters.competition || ""} onChange={(event) => filter("competition", event.target.value)} /></Field>
      <Field title="Game"><Choices items={[{ id: "", name: "All games" }, ...games]} value={filters.game_id || ""} onChange={(event) => filter("game_id", event.target.value)} /></Field>
      <Field title="Region"><Choices items={regions} value={filters.region || "any"} onChange={(event) => filter("region", event.target.value)} /></Field>
      <Field title="Game rank / preferred rank"><Choices items={rankOptions} value={filters.rank || "any"} onChange={(event) => filter("rank", event.target.value)} /></Field>
      <Field title="Language"><Choices items={languages} value={filters.language || "any"} onChange={(event) => filter("language", event.target.value)} /></Field>
      <Field title="Availability"><Choices items={[{ id: "", name: "Any availability" }, ...times]} value={filters.availability || ""} onChange={(event) => filter("availability", event.target.value)} /></Field>
      <button type="button" onClick={clearFilters} className={`${buttonClass} self-end`}>Clear filters</button>
    </div>}
    {query.isPending ? <p className="rounded-xl border border-white/10 p-8 text-center text-sm text-vapor">Loading recruitment calls…</p> : query.isError ? <button onClick={() => query.refetch()} className={buttonClass}>Could not load calls. Retry</button> : !rows.length ? <div className="rounded-2xl border border-dashed border-cyan/20 bg-card px-5 py-12 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-cyan" /><h3 className="font-black">{mine ? "You haven't posted a call yet" : "No calls match these filters"}</h3><p className="mt-2 text-xs text-vapor">Try another filter or publish what you are looking for.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{rows.map((post) => {
      const own = post.user_id === user?.id;
      const rank = screenshotRankFor(post.kind === "team" ? post.rank : post.player?.screenshot_rank);
      return <article key={post.id} className="flex min-w-0 flex-col rounded-2xl border border-cyan/20 bg-card p-5">
        <div className="flex items-start gap-3"><Link to={`/profile/${encodeURIComponent(post.player?.username || post.user_id)}`} className="flex h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-cyan/20 bg-background"><PlayerAvatarImage user={post.player} src={avatars[post.user_id] || post.player?.avatar_url} /></Link><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-wider text-cyan">{post.kind === "team" ? "Team looking for players" : "Player looking for teammates"}</p><h3 className="mt-1 break-words text-base font-black">{post.title}</h3><p className="mt-1 text-xs text-vapor">{post.player?.name} · {label(games, post.game_id)} · {label(modes, post.competition)}</p></div>{post.status !== "open" && <span className="rounded border border-white/10 px-2 py-1 text-[9px] font-bold uppercase text-vapor">{post.status}</span>}</div>
        <UserBadges user={post.player} badges={post.player?.badges} className="mt-3" />
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-vapor">{post.description}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-vapor"><span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] px-2 py-1.5"><Globe2 className="h-3 w-3 text-cyan" />{label(regions, post.region)} · {label(languages, post.language)}</span><span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.07] px-2 py-1.5"><Clock3 className="h-3 w-3 text-cyan" />{label(times, post.availability)} · {post.timezone}</span>{rank && <span className={`rounded-lg border px-2 py-1.5 ${rank.style}`}>{post.kind === "team" ? "Preferred: " : "Game rank: "}{rank.label}</span>}</div>
        {post.team ? <Link to={`/teams?team=${encodeURIComponent(post.team.id)}`} className="site-hover mt-3 flex items-center gap-2 rounded-lg border border-cyan/15 px-3 py-2.5 text-xs text-cyan"><Shield className="h-4 w-4" /><strong className="min-w-0 flex-1 break-words">{post.team.name}</strong><span>{post.team.filled}/{post.team.roster_size} · {post.team.open_spots} open</span></Link> : post.kind === "player" && <Link to={`/profile/${encodeURIComponent(post.player?.username || post.user_id)}`} className="site-hover mt-3 rounded-lg px-2 py-2 text-[10px] text-cyan">{post.player?.team_count || 0} team memberships · View profile & stats →</Link>}
        {own && post.moderation_reason && <p className="mt-3 text-xs text-orange">Staff: {post.moderation_reason}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">{own ? <>{!["removed", "filled"].includes(post.status) && <button onClick={() => setEditor(post)} className={buttonClass}>Edit / renew</button>}{post.status === "open" || post.status === "filled" ? <button disabled={close.isPending} onClick={() => close.mutate({ post })} className={buttonClass}>Close call</button> : null}</> : <><Link to={`/messages?compose=${encodeURIComponent(post.user_id)}`} className={buttonClass}><MessageCircle className="h-3.5 w-3.5" />{post.kind === "team" ? "Message captain" : "Message player"}</Link>{post.kind === "player" && modes.find((mode) => mode.id === post.competition)?.team && <button onClick={() => setInvite(post)} className={buttonClass}><UserPlus className="h-3.5 w-3.5" />Invite to team</button>}{canModerate && <button onClick={() => { setModerating(post); setReason(""); }} className={buttonClass}>Moderate</button>}</>}<span className="ml-auto text-[10px] text-vapor">Expires {new Date(post.expires_at).toLocaleString([], { timeZone: post.timezone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
      </article>;
    })}</div>}
    {avatarPages.some((page) => page.isError) && <button onClick={() => avatarPages.forEach((page) => { if (page.isError) void page.refetch(); })} className={buttonClass}>Reload player images</button>}
    {query.hasNextPage && <button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()} className={`${buttonClass} w-full`}>{query.isFetchingNextPage ? "Loading…" : "Load more calls"}</button>}
    {editor && <PostEditor user={user} existing={editor.id ? editor : null} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void refresh(); setParams((current) => { const next = new URLSearchParams(current); next.set("view", "mine"); return next; }, { replace: true }); toast({ title: "Your call is live" }); }} />}
    {invite && <InviteDialog post={invite} user={user} onClose={() => setInvite(null)} />}
    {moderating && <Dialog open onOpenChange={(open) => { if (!open && !close.isPending) setModerating(null); }}><DialogContent className="border-white/10 bg-card"><DialogHeader><DialogTitle>Remove recruitment call</DialogTitle><DialogDescription>The owner receives your reason. This action is recorded for staff.</DialogDescription></DialogHeader><textarea aria-label="Reason for removal" minLength={5} maxLength={160} value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass} placeholder="Explain why this call needs to be removed" /><button disabled={reason.trim().length < 5 || close.isPending} onClick={() => close.mutate({ post: moderating, reason })} className={buttonClass}>Remove call</button></DialogContent></Dialog>}
  </section>;
}
