import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, CheckCircle, Crown, Image as ImageIcon, LogOut, Plus, Search, Trash2, Trophy, TrendingUp, UserMinus, UserPlus, Users, X, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const teamInitials = (team) => team?.tag || String(team?.name || "--").slice(0, 2).toUpperCase();
const formatMoney = (value) => `$${Number(value || 0).toLocaleString()}`;
const teamTypeLabel = (team) => ({ "8s": "8s", wager: "Wager", tournament: "Tournament", general: "General" }[team?.team_type || "8s"] || "8s");
const teamBannerMaxBytes = 1.5 * 1024 * 1024;
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve("");
  if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file."));
  if (file.size > teamBannerMaxBytes) return reject(new Error("Image must be 1.5MB or smaller."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read image file."));
  reader.readAsDataURL(file);
});

export default function Teams() {
  const [view, setView] = useState("my_teams");
  const [currentUser, setCurrentUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [membersByTeam, setMembersByTeam] = useState({});
  const [pendingInvites, setPendingInvites] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [teamForm, setTeamForm] = useState({ name: "", tag: "", region: "na", team_type: "8s", roster_size: 4, banner_url: "" });
  const [teamBannerDraft, setTeamBannerDraft] = useState("");

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const userData = await base44.auth.me().catch(() => null);
      setCurrentUser(userData);
      if (!userData?.id) {
        setPendingInvites([]);
        setTeams([]);
        setMembersByTeam({});
        setSelectedTeamId(null);
        return;
      }

      const [teamRows, invites, memberships] = await Promise.all([
        base44.entities.Team.filter({}, "ranking", 100).catch(() => []),
        base44.entities.TeamInvite.filter({ invited_user_id: userData.id, status: "pending" }, "-created_date", 50).catch(() => []),
        base44.entities.TeamMember.filter({ user_id: userData.id }, "-joined_date", 100).catch(() => []),
      ]);
      setPendingInvites(invites || []);

      const activeMembershipTeamIds = new Set((memberships || [])
        .filter((membership) => membership.is_active !== false)
        .map((membership) => String(membership.team_id)));
      const myTeams = (teamRows || []).filter((team) => (
        team.is_active !== false
        && (String(team.captain_id || "") === String(userData.id) || activeMembershipTeamIds.has(String(team.id)))
      ));
      setTeams(myTeams);
      setSelectedTeamId((current) => (myTeams.some((team) => team.id === current) ? current : myTeams?.[0]?.id || null));

      const memberPairs = await Promise.all(myTeams.map(async (team) => {
        const members = await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 20).catch(() => []);
        return [team.id, (members || []).filter((member) => member.is_active !== false)];
      }));
      setMembersByTeam(Object.fromEntries(memberPairs));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async (event) => {
    event.preventDefault();
    if (!currentUser?.id) {
      toast({ title: "Login required", description: "Please log in to create a team.", variant: "destructive" });
      return;
    }

    const name = teamForm.name.trim();
    const tag = teamForm.tag.trim().toUpperCase();
    if (!name || !tag) {
      toast({ title: "Missing team info", description: "Team name and tag are required.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const response = await base44.functions.invoke("manageTeam", {
        action: "create",
        name,
        tag: tag.slice(0, 6),
        region: teamForm.region,
        team_type: teamForm.team_type,
        roster_size: Number(teamForm.roster_size || 4),
        banner_url: teamForm.banner_url.trim(),
      });
      if (!response.data?.success) {
        toast({ title: "Team creation failed", description: response.data?.error || "Could not create team.", variant: "destructive" });
        return;
      }
      const team = response.data.team;

      toast({ title: "Team created", description: `${team.name} is ready.` });
      setTeamForm({ name: "", tag: "", region: "na", team_type: "8s", roster_size: 4, banner_url: "" });
      setCreateOpen(false);
      await loadTeams();
      setSelectedTeamId(team.id);
      setView("details");
    } catch (error) {
      toast({ title: "Team creation failed", description: error.message || "Could not create team.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const filteredTeams = useMemo(() => (
    teams.filter((team) => {
      const haystack = `${team.name} ${team.tag} ${team.region || ""}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    })
  ), [teams, search]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || filteredTeams[0] || teams[0];
  const selectedMembers = selectedTeam ? (membersByTeam[selectedTeam.id] || []) : [];
  const selectedMembership = selectedMembers.find((member) => member.user_id === currentUser?.id);
  const isSelectedCaptain = selectedTeam?.captain_id === currentUser?.id;
  const wins = selectedTeam?.total_wins || 0;
  const losses = selectedTeam?.total_losses || 0;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  useEffect(() => {
    setTeamBannerDraft(selectedTeam?.banner_url || "");
  }, [selectedTeam?.id, selectedTeam?.banner_url]);

  const runTeamAction = async (payload, successTitle) => {
    setBusyAction(payload.action);
    try {
      const response = await base44.functions.invoke("manageTeam", payload);
      if (!response.data?.success) {
        toast({ title: "Team action failed", description: response.data?.error || "Could not update team.", variant: "destructive" });
        return false;
      }
      toast({ title: successTitle });
      await loadTeams();
      return true;
    } catch (error) {
      toast({ title: "Team action failed", description: error.message || "Could not update team.", variant: "destructive" });
      return false;
    } finally {
      setBusyAction("");
    }
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    if (!selectedTeam || !inviteIdentifier.trim()) return;
    const ok = await runTeamAction({
      action: "invite",
      team_id: selectedTeam.id,
      identifier: inviteIdentifier.trim(),
    }, "Invite sent");
    if (ok) setInviteIdentifier("");
  };

  const handleInviteResponse = async (invite, decision) => {
    await runTeamAction({
      action: "respond_invite",
      team_id: invite.team_id,
      invite_id: invite.id,
      decision,
    }, decision === "accept" ? "Invite accepted" : "Invite declined");
  };

  const handleCreateBannerFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imageUrl = await fileToDataUrl(file);
      setTeamForm((current) => ({ ...current, banner_url: imageUrl }));
    } catch (error) {
      toast({ title: "Image failed", description: error.message || "Could not read image.", variant: "destructive" });
    } finally {
      event.target.value = "";
    }
  };

  const handleTeamBannerFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setTeamBannerDraft(await fileToDataUrl(file));
    } catch (error) {
      toast({ title: "Image failed", description: error.message || "Could not read image.", variant: "destructive" });
    } finally {
      event.target.value = "";
    }
  };

  const handleUpdateTeamBanner = async () => {
    if (!selectedTeam || !isSelectedCaptain) return;
    await runTeamAction({
      action: "update_assets",
      team_id: selectedTeam.id,
      banner_url: teamBannerDraft.trim(),
    }, "Team banner saved");
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">My Teams</h1>
            <p className="text-vapor text-sm mt-1">Manage the teams you captain or belong to.</p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5" /> Create Team
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          <div className="flex gap-2">
            {["my_teams", "details"].map((item) => (
              <button
                key={item}
                onClick={() => setView(item)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                  view === item ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground"
                }`}
              >
                {item === "my_teams" ? "My Teams" : "Team Details"}
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vapor" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search my teams..."
              className="w-full md:w-72 pl-10 pr-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">Loading teams...</div>
        ) : (
          <>
          {pendingInvites.length > 0 && (
            <div className="glass rounded-xl border border-cyan/10 p-4 mb-6">
              <p className="text-xs text-vapor uppercase tracking-wider mb-3">Pending Invites</p>
              <div className="space-y-2">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg bg-white/[0.02] border border-white/5 p-3">
                    <div>
                      <p className="font-semibold text-sm">{invite.team_name}</p>
                      <p className="text-xs text-vapor">{teamTypeLabel(invite)} team invite from {invite.invited_by_name || "Captain"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleInviteResponse(invite, "accept")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-green/10 text-green text-xs font-bold">
                        <CheckCircle className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button onClick={() => handleInviteResponse(invite, "decline")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-500/10 text-red-400 text-xs font-bold">
                        <XCircle className="w-3.5 h-3.5" /> Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {teams.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">You are not on any teams yet. Create a team or accept an invite to see it here.</div>
          ) : view === "my_teams" ? (
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <div className="hidden md:grid grid-cols-6 gap-4 px-5 py-3 border-b border-white/5 text-xs text-vapor uppercase tracking-wider font-semibold">
              <span className="col-span-2">Team</span>
              <span>Members</span>
              <span>Region</span>
              <span>Record</span>
              <span>Earnings</span>
            </div>
            <div className="divide-y divide-white/5">
              {filteredTeams.map((team) => {
                const members = membersByTeam[team.id] || [];
                return (
                  <motion.div
                    key={team.id}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-4 px-5 py-4 items-center cursor-pointer"
                    onClick={() => {
                      setSelectedTeamId(team.id);
                      setView("details");
                    }}
                  >
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan/30 to-orange/30 flex items-center justify-center font-bold font-mono text-sm">
                        {teamInitials(team)}
                      </div>
                      <span className="font-semibold text-sm">{team.name}</span>
                    </div>
                    <span className="text-sm text-vapor hidden md:block">{teamTypeLabel(team)} / {members.length}/{team.roster_size || "-"}</span>
                    <span className="text-xs text-vapor hidden md:block uppercase">{team.region || "N/A"}</span>
                    <span className="text-sm font-mono hidden md:block">{team.total_wins || 0}-{team.total_losses || 0}</span>
                    <span className="text-sm font-mono text-green hidden md:block">{formatMoney(team.total_earnings)}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
          ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass rounded-xl border border-cyan/10 p-8 relative overflow-hidden">
                {selectedTeam.banner_url && (
                  <img
                    src={selectedTeam.banner_url}
                    alt={`${selectedTeam.name} banner`}
                    className="absolute inset-0 z-0 h-full w-full object-cover opacity-20"
                  />
                )}
                <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-obsidian/40" />
                <div className="relative z-10 flex items-center gap-6 mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan/30 to-orange/30 flex items-center justify-center text-2xl font-black">
                    {teamInitials(selectedTeam)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{selectedTeam.name}</h2>
                    <p className="text-vapor text-sm">
                      {teamTypeLabel(selectedTeam)} - {selectedMembers.length}/{selectedTeam.roster_size || "-"} roster - Captain {selectedTeam.captain_name}
                    </p>
                  </div>
                </div>

                <div className="relative z-10 space-y-3">
                  {selectedMembers.length === 0 ? (
                    <div className="text-sm text-vapor">No active members recorded.</div>
                  ) : selectedMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-4 rounded-lg border border-white/10 bg-secondary/70 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
                      <div className="w-10 h-10 rounded-lg bg-background/80 flex items-center justify-center text-xs font-bold font-mono text-cyan">{member.user_name?.charAt(0) || "?"}</div>
                      <div className="flex-1">
                        <Link to={`/profile/${member.user_name || member.user_id || ""}`} className="font-semibold text-sm text-white hover:text-cyan transition-colors">{member.user_name || "Unnamed member"}</Link>
                        <p className="text-xs text-vapor capitalize">{member.role || "member"}</p>
                      </div>
                      {member.role === "captain" && <Crown className="w-4 h-4 text-orange" />}
                      {isSelectedCaptain && member.role !== "captain" && (
                        <button
                          onClick={() => runTeamAction({ action: "kick", team_id: selectedTeam.id, member_id: member.id }, "Player kicked")}
                          disabled={Boolean(busyAction)}
                          className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          title="Kick player"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass rounded-xl border border-white/5 p-5">
                <h3 className="font-bold text-sm mb-4">Team Stats</h3>
                <div className="space-y-3">
                  {[
                    { label: "Members", value: selectedMembers.length },
                    { label: "Type", value: teamTypeLabel(selectedTeam) },
                    { label: "Roster Size", value: selectedTeam.roster_size || "-" },
                    { label: "Team Wins", value: wins },
                    { label: "Team Losses", value: losses },
                    { label: "Win Rate", value: `${winRate}%` },
                    { label: "Earnings", value: formatMoney(selectedTeam.total_earnings) },
                  ].map((stat) => (
                    <div key={stat.label} className="flex justify-between">
                      <span className="text-xs text-vapor">{stat.label}</span>
                      <span className="text-sm font-mono font-bold">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedTeam && selectedMembership && (
                <div className="glass rounded-xl border border-white/5 p-5">
                  <h3 className="font-bold text-sm mb-4">Team Management</h3>
                  {isSelectedCaptain && (
                    <div className="mb-5 rounded-lg border border-white/5 bg-secondary/30 p-3">
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan">
                        <ImageIcon className="h-3.5 w-3.5" /> Team Banner
                      </h4>
                      <div className="space-y-3">
                        <input
                          value={teamBannerDraft}
                          onChange={(event) => setTeamBannerDraft(event.target.value)}
                          placeholder="https://i.imgur.com/team-banner.png"
                          className="w-full px-3 py-2 bg-background/60 rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                        />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleTeamBannerFile}
                          className="w-full px-3 py-2 bg-background/60 rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleUpdateTeamBanner}
                          disabled={Boolean(busyAction)}
                          className="inline-flex items-center gap-2 rounded-lg bg-cyan/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan disabled:opacity-50"
                        >
                          <Camera className="h-3.5 w-3.5" /> Save Banner
                        </button>
                      </div>
                    </div>
                  )}
                  {isSelectedCaptain && (
                    <form onSubmit={handleInvite} className="space-y-3 mb-4">
                      <label className="block">
                        <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Invite Player</span>
                        <input
                          value={inviteIdentifier}
                          onChange={(event) => setInviteIdentifier(event.target.value)}
                          className="w-full px-3 py-2 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                          placeholder="Username, email, or user ID"
                        />
                      </label>
                      <button disabled={Boolean(busyAction) || !inviteIdentifier.trim()} className="inline-flex items-center gap-2 px-4 py-2 bg-cyan/10 text-cyan text-xs font-bold rounded-lg disabled:opacity-50">
                        <UserPlus className="w-3.5 h-3.5" /> Invite
                      </button>
                    </form>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => runTeamAction({ action: "leave", team_id: selectedTeam.id }, "Left team")}
                      disabled={Boolean(busyAction)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-vapor text-xs font-bold rounded-lg hover:bg-white/10 disabled:opacity-50"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Leave Team
                    </button>
                    {isSelectedCaptain && (
                      <button
                        onClick={() => runTeamAction({ action: "disband", team_id: selectedTeam.id }, "Team disbanded")}
                        disabled={Boolean(busyAction)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 text-xs font-bold rounded-lg hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Disband
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="glass rounded-xl border border-white/5 p-5">
                <h3 className="font-bold text-sm mb-4">Signals</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Signal icon={Trophy} label="Wins" value={wins} />
                  <Signal icon={TrendingUp} label="Rate" value={`${winRate}%`} />
                  <Signal icon={Users} label="Roster" value={selectedMembers.length} />
                  <Signal icon={Crown} label="Captain" value={selectedTeam.captain_name || "N/A"} />
                </div>
              </div>
            </div>
          </div>
          )}
          </>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCreateOpen(false)}>
          <motion.form
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onSubmit={handleCreateTeam}
            onClick={(event) => event.stopPropagation()}
            className="glass rounded-2xl border border-white/10 w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black">Create Team</h2>
                <p className="text-xs text-vapor mt-0.5">Start a roster with yourself as captain.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5 text-vapor" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Team Name</span>
                <input
                  value={teamForm.name}
                  onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                  maxLength={40}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                  placeholder="Team name"
                />
              </label>
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Team Tag</span>
                <input
                  value={teamForm.tag}
                  onChange={(event) => setTeamForm((current) => ({ ...current, tag: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) }))}
                  maxLength={6}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none font-mono uppercase"
                  placeholder="TAG"
                />
              </label>
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Team Banner URL</span>
                <input
                  value={teamForm.banner_url}
                  onChange={(event) => setTeamForm((current) => ({ ...current, banner_url: event.target.value }))}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                  placeholder="https://i.imgur.com/team-banner.png"
                />
              </label>
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Upload Team Banner</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCreateBannerFile}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Region</span>
                <select
                  value={teamForm.region}
                  onChange={(event) => setTeamForm((current) => ({ ...current, region: event.target.value }))}
                  className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                >
                  <option value="na">NA</option>
                  <option value="eu">EU</option>
                  <option value="asia">Asia</option>
                  <option value="oce">OCE</option>
                  <option value="sa">SA</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Team Type</span>
                  <select
                    value={teamForm.team_type}
                    onChange={(event) => setTeamForm((current) => ({ ...current, team_type: event.target.value }))}
                    className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                  >
                    <option value="8s">8s</option>
                    <option value="wager">Wager</option>
                    <option value="tournament">Tournament</option>
                    <option value="general">General</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-vapor mb-2 block uppercase tracking-wider">Roster Size</span>
                  <select
                    value={teamForm.roster_size}
                    onChange={(event) => setTeamForm((current) => ({ ...current, roster_size: Number(event.target.value) }))}
                    className="w-full px-4 py-3 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-5 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="px-5 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider disabled:opacity-50">
                {creating ? "Creating..." : "Create Team"}
              </button>
            </div>
          </motion.form>
        </div>
      )}
    </div>
  );
}

function Signal({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-secondary/50 border border-white/5 p-3">
      <Icon className="w-4 h-4 text-cyan mb-2" />
      <p className="text-xs text-vapor uppercase">{label}</p>
      <p className="text-sm font-bold truncate">{value}</p>
    </div>
  );
}
