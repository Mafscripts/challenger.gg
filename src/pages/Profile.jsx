import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Award, Calendar, Crown, Flame, Shield, Swords, Trophy, Users } from "lucide-react";
import RankBadge from "@/components/ui/RankBadge";
import RarityBadge from "@/components/ui/RarityBadge";
import RoleBadge from "@/components/ui/RoleBadge";
import { base44 } from "@/api/base44Client";
import { getRankForElo } from "@/lib/ranks";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";

const displayName = (user, profile) => user?.display_name || profile?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "N/A";
const formatMoney = (value) => `$${Number(value || 0).toLocaleString()}`;

export default function Profile() {
  const { username } = useParams();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [rankedStats, setRankedStats] = useState(null);
  const [xpStats, setXpStats] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    loadProfile();
  }, [username]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      let userRow = null;
      const authUser = await base44.auth.me().catch(() => null);
      if (username) {
        const byUsername = await base44.entities.User.filter({ username }, "-created_date", 1).catch(() => []);
        userRow = byUsername[0] || await base44.entities.User.get(username).catch(() => null);
        if (!userRow && authUser && (username === authUser.username || username === authUser.id)) {
          userRow = await bootstrapCurrentUser({ email: authUser.email }).catch(() => authUser);
        }
      } else {
        userRow = await bootstrapCurrentUser({ email: authUser?.email }).catch(() => authUser);
      }

      setUser(userRow);
      if (!userRow?.id) return;

      if (authUser?.id === userRow.id) {
        userRow = await bootstrapCurrentUser({ email: authUser.email, username: userRow.username }).catch(() => userRow);
        setUser(userRow);
      }

      const [
        profileRows,
        rankedRows,
        xpRows,
        inventoryRows,
        teamMemberRows,
        hostedWagers,
        challengedWagers,
        hostedRanked,
        challengedRanked,
      ] = await Promise.all([
        base44.entities.PlayerProfile.filter({ user_id: userRow.id }, "-created_date", 1).catch(() => []),
        base44.entities.RankedStats.filter({ user_id: userRow.id }, "-season", 1).catch(() => []),
        base44.entities.XPStats.filter({ user_id: userRow.id }, "-season", 1).catch(() => []),
        base44.entities.UserInventory.filter({ user_id: userRow.id }, "-acquired_date", 20).catch(() => []),
        base44.entities.TeamMember.filter({ user_id: userRow.id }, "-joined_date", 20).catch(() => []),
        base44.entities.Wager.filter({ host_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.Wager.filter({ challenger_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.RankedMatch.filter({ host_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.RankedMatch.filter({ challenger_id: userRow.id }, "-created_date", 20).catch(() => []),
      ]);

      setProfile(profileRows[0] || null);
      setRankedStats(rankedRows[0] || null);
      setXpStats(xpRows[0] || null);
      setInventory(inventoryRows || []);

      const loadedTeams = await Promise.all((teamMemberRows || []).map(async (membership) => {
        const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
        return { ...membership, team };
      }));
      setTeams(loadedTeams.filter((row) => row.team));

      const combinedMatches = [...hostedWagers, ...challengedWagers, ...hostedRanked, ...challengedRanked]
        .filter((match, index, list) => list.findIndex((item) => item.id === match.id) === index)
        .sort((a, b) => new Date(b.match_completed_date || b.completed_date || b.accepted_date || b.created_date || 0) - new Date(a.match_completed_date || a.completed_date || a.created_date || 0))
        .slice(0, 8);
      setMatches(combinedMatches);
    } finally {
      setLoading(false);
    }
  };

  const name = displayName(user, profile);
  const rank = getRankForElo(rankedStats?.elo || profile?.elo || 0);
  const wins = rankedStats?.wins ?? user?.wager_wins ?? profile?.total_wins ?? 0;
  const losses = rankedStats?.losses ?? user?.wager_losses ?? profile?.total_losses ?? 0;
  const totalMatches = wins + losses;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
  const badges = useMemo(() => user?.badges || [], [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-vapor mx-auto mb-4" />
          <h1 className="text-2xl font-black mb-2">Profile Not Found</h1>
          <Link to="/leaderboards" className="text-cyan hover:underline">Back to leaderboards</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="glass rounded-xl border border-white/5 p-8 mb-6 relative overflow-hidden">
          <div className="relative flex flex-col md:flex-row items-start gap-6">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan/30 to-orange/30 border-2 border-white/10 flex items-center justify-center text-3xl font-black overflow-hidden">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" /> : name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-2xl font-black">{name}</h1>
                <RoleBadge role={user.role || "user"} />
                {user.is_premium && (
                  <span className="px-2 py-0.5 rounded bg-orange/10 text-orange text-[10px] font-mono font-bold flex items-center gap-1">
                    <Crown className="w-3 h-3" /> PREMIUM
                  </span>
                )}
              </div>
              <p className="text-vapor text-sm mb-3">
                {user.handle || profile?.handle || user.username || user.email} - {profile?.country || user.region || "Region N/A"} - Joined {formatDate(profile?.account_created_date || user.account_created_date || user.created_date)}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <RankBadge rank={rank.tier} division={rank.division} size="sm" />
                  <span className="text-sm font-mono text-cyan font-bold">{Number(rankedStats?.elo || profile?.elo || 0).toLocaleString()} ELO</span>
                </div>
                <span className="text-sm text-vapor">Level {xpStats?.level || user.xp_level || profile?.level || 1}</span>
                {teams[0]?.team && (
                  <Link to="/teams" className="text-sm text-cyan hover:underline flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> {teams[0].team.name}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {["overview", "matches", "badges", "inventory", "teams"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                tab === item ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard icon={Swords} label="Record" value={`${wins}-${losses}`} color="text-cyan" />
              <StatCard icon={Trophy} label="Win Rate" value={`${winRate}%`} color="text-green" />
              <StatCard icon={Flame} label="Streak" value={rankedStats?.win_streak || user.current_win_streak || 0} color="text-orange" />
              <StatCard icon={Award} label="Earnings" value={formatMoney(user.total_wager_earnings || profile?.total_earnings)} color="text-purple-400" />
            </div>
            <div className="glass rounded-xl border border-white/5 p-5">
              <h3 className="font-bold text-sm mb-3">Bio</h3>
              <p className="text-sm text-vapor">{profile?.bio || "No bio has been added yet."}</p>
            </div>
          </div>
        )}

        {tab === "matches" && (
          <List title="Recent Matches" empty="No matches found." rows={matches} render={(match) => (
            <div className="px-5 py-4 grid md:grid-cols-5 gap-3 items-center">
              <span className="font-semibold text-sm">{match.game_mode_display || match.game_mode || "Match"}</span>
              <span className="text-xs text-vapor">{match.final_map_name || "Map pending"}</span>
              <span className="text-xs text-vapor">{match.status || "unknown"}</span>
              <span className="text-xs text-vapor">{formatDate(match.match_completed_date || match.completed_date || match.created_date)}</span>
              <Link to={(match.entry_fee !== undefined || match.amount !== undefined) ? `/wagers-match/${match.id}` : `/ranked-match/${match.id}`} className="text-xs text-cyan hover:underline md:text-right">Open</Link>
            </div>
          )} />
        )}

        {tab === "badges" && (
          <List title="Badges" empty="No badges earned yet." rows={badges} render={(badge) => (
            <div className="px-5 py-4 flex items-center gap-3">
              <Award className="w-4 h-4 text-yellow-400" />
              <span className="font-semibold text-sm">{badge.name}</span>
              <span className="text-xs text-vapor">{badge.type}</span>
            </div>
          )} />
        )}

        {tab === "inventory" && (
          <List title="Inventory" empty="No inventory items found." rows={inventory} render={(item) => (
            <div className="px-5 py-4 flex items-center gap-3">
              {item.item_image && <img src={item.item_image} alt={item.item_name} className="w-10 h-10 rounded object-cover" />}
              <div className="flex-1">
                <p className="font-semibold text-sm">{item.item_name}</p>
                <p className="text-xs text-vapor">{item.item_category}</p>
              </div>
              <RarityBadge rarity={item.item_rarity || "common"} />
            </div>
          )} />
        )}

        {tab === "teams" && (
          <List title="Teams" empty="No teams joined yet." rows={teams} render={(membership) => (
            <div className="px-5 py-4 grid md:grid-cols-4 gap-3 items-center">
              <span className="font-semibold text-sm">{membership.team.name}</span>
              <span className="text-xs text-vapor">{membership.team.tag}</span>
              <span className="text-xs text-vapor capitalize">{membership.role}</span>
              <span className="text-xs text-vapor md:text-right"><Calendar className="w-3 h-3 inline mr-1" /> {formatDate(membership.joined_date)}</span>
            </div>
          )} />
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="glass rounded-xl p-5 border border-white/5">
      <Icon className={`w-5 h-5 ${color} mb-3`} />
      <p className={`text-2xl font-black font-mono ${color}`}>{value}</p>
      <p className="text-[10px] text-vapor uppercase tracking-wider">{label}</p>
    </motion.div>
  );
}

function List({ title, rows, empty, render }) {
  return (
    <div className="glass rounded-xl border border-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-bold text-sm">{title}</h3>
        <span className="text-xs text-vapor">{rows.length} rows</span>
      </div>
      <div className="divide-y divide-white/5">
        {rows.length === 0 ? <div className="px-5 py-8 text-center text-sm text-vapor">{empty}</div> : rows.map((row, index) => (
          <div key={row.id || index}>{render(row)}</div>
        ))}
      </div>
    </div>
  );
}
