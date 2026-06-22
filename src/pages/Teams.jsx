import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Crown, Plus, Search, Trophy, TrendingUp, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";

const teamInitials = (team) => team?.tag || String(team?.name || "--").slice(0, 2).toUpperCase();
const formatMoney = (value) => `$${Number(value || 0).toLocaleString()}`;

export default function Teams() {
  const [view, setView] = useState("rankings");
  const [teams, setTeams] = useState([]);
  const [membersByTeam, setMembersByTeam] = useState({});
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const teamRows = await base44.entities.Team.filter({}, "ranking", 100).catch(() => []);
      const activeTeams = (teamRows || []).filter((team) => team.is_active !== false);
      setTeams(activeTeams);
      setSelectedTeamId(activeTeams?.[0]?.id || null);

      const memberPairs = await Promise.all(activeTeams.map(async (team) => {
        const members = await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 20).catch(() => []);
        return [team.id, (members || []).filter((member) => member.is_active !== false)];
      }));
      setMembersByTeam(Object.fromEntries(memberPairs));
    } finally {
      setLoading(false);
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
  const wins = selectedTeam?.total_wins || 0;
  const losses = selectedTeam?.total_losses || 0;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Teams</h1>
            <p className="text-vapor text-sm mt-1">Live team rankings and rosters.</p>
          </div>
          <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider">
            <Plus className="w-3.5 h-3.5" /> Create Team
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6">
          <div className="flex gap-2">
            {["rankings", "details"].map((item) => (
              <button
                key={item}
                onClick={() => setView(item)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                  view === item ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground"
                }`}
              >
                {item === "rankings" ? "Team Rankings" : "Team Details"}
              </button>
            ))}
          </div>
          <div className="relative md:ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vapor" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teams..."
              className="w-full md:w-72 pl-10 pr-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">Loading teams...</div>
        ) : teams.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">No teams have been created yet.</div>
        ) : view === "rankings" ? (
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <div className="hidden md:grid grid-cols-7 gap-4 px-5 py-3 border-b border-white/5 text-xs text-vapor uppercase tracking-wider font-semibold">
              <span>Rank</span>
              <span className="col-span-2">Team</span>
              <span>Members</span>
              <span>Region</span>
              <span>Record</span>
              <span>Earnings</span>
            </div>
            <div className="divide-y divide-white/5">
              {filteredTeams.map((team, index) => {
                const members = membersByTeam[team.id] || [];
                return (
                  <motion.div
                    key={team.id}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    className="grid grid-cols-3 md:grid-cols-7 gap-2 md:gap-4 px-5 py-4 items-center cursor-pointer"
                    onClick={() => {
                      setSelectedTeamId(team.id);
                      setView("details");
                    }}
                  >
                    <span className={`text-sm font-bold font-mono ${index < 3 ? "text-orange" : "text-vapor"}`}>#{team.ranking || index + 1}</span>
                    <div className="col-span-2 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan/30 to-orange/30 flex items-center justify-center font-bold font-mono text-sm">
                        {teamInitials(team)}
                      </div>
                      <span className="font-semibold text-sm">{team.name}</span>
                    </div>
                    <span className="text-sm text-vapor hidden md:block">{members.length}</span>
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
                <div className="relative flex items-center gap-6 mb-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan/30 to-orange/30 flex items-center justify-center text-2xl font-black">
                    {teamInitials(selectedTeam)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{selectedTeam.name}</h2>
                    <p className="text-vapor text-sm">
                      Rank #{selectedTeam.ranking || "N/A"} - {wins} wins - Captain {selectedTeam.captain_name}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedMembers.length === 0 ? (
                    <div className="text-sm text-vapor">No active members recorded.</div>
                  ) : selectedMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold font-mono">{member.user_name?.charAt(0) || "?"}</div>
                      <div className="flex-1">
                        <Link to={`/profile/${member.user_name || member.user_id || ""}`} className="font-semibold text-sm hover:text-cyan transition-colors">{member.user_name || "Unnamed member"}</Link>
                        <p className="text-xs text-vapor capitalize">{member.role || "member"}</p>
                      </div>
                      {member.role === "captain" && <Crown className="w-4 h-4 text-orange" />}
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
      </div>
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
