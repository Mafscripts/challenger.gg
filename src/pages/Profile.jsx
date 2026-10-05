import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Award,
  BadgeCheck,
  Calendar,
  Camera,
  ChevronRight,
  DollarSign,
  Flame,
  Gamepad2,
  Globe2,
  Medal,
  MessageSquare,
  Package,
  Pencil,
  Save,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import RankBadge from "@/components/ui/RankBadge";
import RarityBadge from "@/components/ui/RarityBadge";
import RoleBadge from "@/components/ui/RoleBadge";
import UserBadges from "@/components/ui/UserBadges";
import PageLoader from "@/components/ui/PageLoader";
import { base44 } from "@/api/base44Client";
import { getNextRankForElo, getRankForElo, getRankProgress } from "@/lib/ranks";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";
import { activisionIdFor } from "@/lib/activision";
import { normalizeImageSource, prepareImageFile } from "@/lib/images";

const displayName = (user, profile) => user?.display_name || profile?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "N/A";
const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};
const cleanKey = (value) => String(value || "").trim().toLowerCase();
const hiddenCompetitionTypes = new Set(["8s", "eights", "money8s", "xp"]);
const verifiedNameColors = [
  { label: "Default", value: "" },
  { label: "Crimson Viper", value: "#f87171" },
  { label: "Ghost Silver", value: "#9ca3af" },
  { label: "Solar Gold", value: "#facc15" },
  { label: "Emerald Pulse", value: "#22c55e" },
  { label: "Violet Reign", value: "#a78bfa" },
  { label: "Cobalt Strike", value: "#3b82f6" },
  { label: "Limewire", value: "#84cc16" },
  { label: "Graphite", value: "#6b7280" },
  { label: "Stone", value: "#a8a29e" },
  { label: "Lunar White", value: "#f8fafc" },
];
const premiumNameEffects = [
  { label: "Prism Protocol — Rainbow", value: "fx-prism" },
  { label: "Royal Frost — Purple / White", value: "fx-royal-frost" },
  { label: "Pink Noise — Pink / White", value: "fx-pink-noise" },
  { label: "Solar Circuit — Cyan / Orange", value: "fx-solar-circuit" },
  { label: "Blue Mercury — Blue / Silver", value: "fx-blue-mercury" },
  { label: "Aurora Core — Green / Cyan / Violet", value: "fx-aurora-core" },
  { label: "Emberwave — Orange / Rose", value: "fx-emberwave" },
  { label: "Neon Eclipse — Lime / Cyan / Purple", value: "fx-neon-eclipse" },
];
const allNameColors = [...verifiedNameColors, ...premiumNameEffects];
const inventoryCategoryLabels = {
  weapon_skin: "Weapon Skins",
  knife: "Knife Skins",
  gloves: "Gloves",
  agent: "Avatars",
  sticker: "Stickers",
  patch: "Badges",
  music_kit: "Music Kits",
  cosmetic: "Cosmetics",
};
const rankJourney = [
  { tier: "bronze", label: "Bronze", range: "0 - 599" },
  { tier: "silver", label: "Silver", range: "600 - 1199" },
  { tier: "gold", label: "Gold", range: "1200 - 1799" },
  { tier: "platinum", label: "Platinum", range: "1800 - 2399" },
  { tier: "diamond", label: "Diamond", range: "2400 - 2999" },
  { tier: "master", label: "Master", range: "3000 - 3599" },
  { tier: "pro", label: "Pro", range: "3600 - 4199" },
  { tier: "champion", label: "Champion", range: "4200+" },
];
const socialFields = [
  { key: "discord", label: "Discord" },
  { key: "twitter", label: "Twitter" },
  { key: "x", label: "X" },
  { key: "twitch", label: "Twitch" },
  { key: "youtube", label: "YouTube" },
  { key: "website", label: "Website" },
];

const clampPercent = (value) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const normalizeHandle = (value) => String(value || "").replace(/^@/, "").trim();
const socialUrlFor = (label, value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (label === "Twitter" || label === "X") return `https://x.com/${normalizeHandle(text)}`;
  if (label === "Twitch") return `https://twitch.tv/${normalizeHandle(text)}`;
  if (label === "YouTube") return `https://youtube.com/${normalizeHandle(text)}`;
  return "";
};
const socialLinksFor = (profile, user) => socialFields
  .map((field) => {
    const value = field.key === "discord"
      ? (user?.discord_username || profile?.discord_username || profile?.discord || user?.discord)
      : (profile?.[field.key] || user?.[field.key] || user?.[`${field.key}_url`]);
    return value ? { ...field, value, url: socialUrlFor(field.label, value) } : null;
  })
  .filter(Boolean);
const matchRouteFor = (match) => (
  (match.entry_fee !== undefined || match.amount !== undefined)
    ? `/wagers-match/${match.id}`
    : `/ranked-match/${match.id}`
);
const matchScoreText = (match) => {
  const alpha = match.team_alpha_score ?? match.team_a_score ?? match.reported_score_alpha;
  const bravo = match.team_bravo_score ?? match.team_b_score ?? match.reported_score_bravo;
  if (alpha === undefined || alpha === null || bravo === undefined || bravo === null) return "TBD";
  return `${alpha} - ${bravo}`;
};
const matchResultFor = (match, userId) => {
  if (!match?.winner_id || !userId) return ["Pending", "text-vapor", "border-white/5 bg-background/25"];
  const won = String(match.winner_id) === String(userId);
  return won
    ? ["Win", "text-green", "border-green/25 bg-green/10"]
    : ["Loss", "text-red-300", "border-red-400/20 bg-red-500/10"];
};

const premiumInventoryEffectClass = (item) => {
  const rarity = String(item?.item_rarity || "").toLowerCase();
  if (rarity === "exclusive") return "animate-exclusive-glow exclusive-shimmer border-cyan/30 glow-cyan";
  if (["epic", "legendary", "mythic"].includes(rarity)) return "animate-mythic-glow mythic-shimmer";
  return "";
};

const inventoryBorderClass = (item) => {
  const rarity = String(item?.item_rarity || "").toLowerCase();
  if (rarity === "exclusive") return "border-cyan/30";
  if (rarity === "mythic") return "border-fuchsia-400/30";
  if (rarity === "legendary") return "border-yellow-400/20";
  if (rarity === "epic") return "border-purple-400/20";
  return "border-white/5 hover:border-white/10";
};

const profileTrophyCount = (user, inventory = []) => (
  Number(user?.trophies || 0)
  + (inventory || []).filter((item) => {
    const text = `${item.item_category || ""} ${item.item_name || ""}`.toLowerCase();
    return text.includes("trophy") && !text.includes("invit") && !text.includes("champion");
  }).length
);

const emptyProfileTrophyCounts = () => ({ gold: 0, silver: 0, bronze: 0, premium: 0, topfragg: 0, hosted: 0 });

function countProfileInventoryTrophies(items = []) {
  const counts = emptyProfileTrophyCounts();
  (items || []).forEach((item) => {
    const text = cleanKey([item.item_category, item.item_name, item.unlock_key, item.item_rarity, item.purchase_method].filter(Boolean).join(" "));
    if (item.item_category !== "trophy" && !text.includes("trophy")) return;
    if (text.includes("invit") || text.includes("champion")) return;

    if (text.includes("topfrag") || text.includes("topfragg")) counts.topfragg += 1;
    else if (text.includes("hosted") || text.includes("host trophy")) counts.hosted += 1;
    else if (text.includes("premium")) counts.premium += 1;
    else if (text.includes("gold")) counts.gold += 1;
    else if (text.includes("silver")) counts.silver += 1;
    else if (text.includes("bronze")) counts.bronze += 1;
    else if (item.item_rarity === "exclusive" || item.item_rarity === "mythic") return;
    else if (item.item_rarity === "legendary" || item.item_rarity === "epic") counts.gold += 1;
    else if (item.item_rarity === "rare") counts.silver += 1;
    else counts.bronze += 1;
  });
  return counts;
}

function trophyOverviewFor(user, profile, inventory = [], matches = []) {
  const inventoryCounts = countProfileInventoryTrophies(inventory);
  const hostedBase = statNumber(user?.hosted_count ?? user?.hosted_trophies ?? profile?.hosted_count ?? profile?.hosted_trophies);
  const hostedMatches = matches.filter((match) => String(match.host_id || "") === String(user?.id || "")).length;
  const counts = {
    gold: statNumber(user?.gold_count ?? profile?.gold_count) + inventoryCounts.gold,
    silver: statNumber(user?.silver_count ?? profile?.silver_count) + inventoryCounts.silver,
    bronze: statNumber(user?.bronze_count ?? profile?.bronze_count) + inventoryCounts.bronze,
    premium: statNumber(user?.premium_count ?? user?.premium_trophies ?? profile?.premium_count ?? profile?.premium_trophies) + inventoryCounts.premium,
    topfragg: statNumber(user?.topfragg_count ?? user?.topfrag_count ?? user?.topfragg_trophies ?? profile?.topfragg_count ?? profile?.topfrag_count ?? profile?.topfragg_trophies) + inventoryCounts.topfragg,
    hosted: hostedBase + inventoryCounts.hosted + (hostedBase || inventoryCounts.hosted ? 0 : hostedMatches),
  };

  return [
    { key: "gold", label: "Gold", value: counts.gold, image: "/assets/trophies/compact/gold.png", tone: "text-yellow-400", tint: "bg-yellow-400/10", border: "group-hover:border-yellow-400/25" },
    { key: "silver", label: "Silver", value: counts.silver, image: "/assets/trophies/compact/silver.png", tone: "text-gray-200", tint: "bg-gray-200/10", border: "group-hover:border-gray-200/20" },
    { key: "bronze", label: "Bronze", value: counts.bronze, image: "/assets/trophies/compact/bronze.png", tone: "text-orange", tint: "bg-orange/10", border: "group-hover:border-orange/25" },
    { key: "premium", label: "Premium", value: counts.premium, image: "/assets/trophies/compact/premium.png", tone: "text-purple-300", tint: "bg-purple-400/10", border: "group-hover:border-purple-300/25" },
    { key: "topfragg", label: "TopFragg", value: counts.topfragg, image: "/assets/trophies/compact/topfragg.png", tone: "text-cyan", tint: "bg-cyan/10", border: "group-hover:border-cyan/25" },
    { key: "hosted", label: "Hosted", value: counts.hosted, image: "/assets/trophies/compact/hosted.png", tone: "text-green", tint: "bg-green/10", border: "group-hover:border-green/25" },
  ];
}

export default function Profile() {
  const { username } = useParams();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [rankedStats, setRankedStats] = useState(null);
  const [xpStats, setXpStats] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [avatarDraft, setAvatarDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [nameColorDraft, setNameColorDraft] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileResult, setProfileResult] = useState(null);

  useEffect(() => {
    loadProfile();
  }, [username]);

  const loadProfile = async () => {
    setLoading(true);
    setEditingProfile(false);
    setWallet(null);
    setXpStats(null);
    try {
      let userRow = null;
      const authUser = await base44.auth.me().catch(() => null);
      setCurrentUser(authUser);
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
        walletRows,
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
        base44.entities.Wallet.filter({ user_id: userRow.id }, "-created_date", 1).catch(() => []),
        base44.entities.UserInventory.filter({ user_id: userRow.id }, "-acquired_date", 200).catch(() => []),
        base44.entities.TeamMember.filter({ user_id: userRow.id }, "-joined_date", 20).catch(() => []),
        base44.entities.Wager.filter({ host_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.Wager.filter({ challenger_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.RankedMatch.filter({ host_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.RankedMatch.filter({ challenger_id: userRow.id }, "-created_date", 20).catch(() => []),
      ]);

      const loadedProfile = profileRows[0] || null;
      setProfile(loadedProfile);
      setAvatarDraft(loadedProfile?.avatar_url || userRow?.avatar_url || "");
      setBioDraft(loadedProfile?.bio || "");
      setNameColorDraft(userRow?.display_name_color || loadedProfile?.display_name_color || "");
      setRankedStats(rankedRows[0] || null);
      setXpStats(xpRows[0] || null);
      setWallet(walletRows[0] || null);
      setInventory(inventoryRows || []);

      const loadedTeams = await Promise.all((teamMemberRows || []).map(async (membership) => {
        const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
        return { ...membership, team };
      }));
      setTeams(loadedTeams.filter((row) => (
        row.team && !hiddenCompetitionTypes.has(String(row.team.team_type || "").toLowerCase())
      )));

      const combinedMatches = [...hostedWagers, ...challengedWagers, ...hostedRanked, ...challengedRanked]
        .filter((match) => !hiddenCompetitionTypes.has(String(match.match_type || "").toLowerCase()))
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
  const rankedWins = Number(rankedStats?.wins ?? 0);
  const rankedLosses = Number(rankedStats?.losses ?? 0);
  const wagerWins = Number(user?.wager_wins ?? 0);
  const wagerLosses = Number(user?.wager_losses ?? 0);
  const wins = Math.max(Number(profile?.total_wins ?? 0), rankedWins + wagerWins, rankedWins, wagerWins);
  const losses = Math.max(Number(profile?.total_losses ?? 0), rankedLosses + wagerLosses, rankedLosses, wagerLosses);
  const totalMatches = wins + losses;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
  const badges = useMemo(() => user?.badges || [], [user]);
  const isOwnProfile = Boolean(currentUser?.id && user?.id && currentUser.id === user.id);
  const isVerifiedPlayer = Boolean(user?.verified_player || user?.is_verified_player || badges.some((badge) => badge.type === "verified_player"));
  const isPremium = Boolean(user?.is_premium && (!user?.premium_expires || new Date(user.premium_expires).getTime() > Date.now()));
  const canUseNameColor = isVerifiedPlayer || isPremium;
  const availableNameColors = isPremium ? allNameColors : verifiedNameColors;
  const hasStreamerBadge = Boolean(user?.streamer_badge || user?.is_streamer || badges.some((badge) => badge.type === "streamer"));
  const activeNameColor = isOwnProfile
    ? nameColorDraft
    : (user?.display_name_color || profile?.display_name_color || "");
  const selectedNameColor = allNameColors.some((color) => color.value === activeNameColor)
    ? activeNameColor
    : "";
  const trophyCount = profileTrophyCount(user, inventory);
  const profileTeams = teams.filter((membership) => membership.team && membership.team.is_demo !== true);
  const elo = Number(rankedStats?.elo || profile?.elo || 0);
  const nextRank = getNextRankForElo(elo);
  const rankProgress = getRankProgress(elo);
  const currentStreak = Number(rankedStats?.win_streak || user?.current_win_streak || 0);
  const earnedMoney = Math.max(
    statNumber(wallet?.total_earnings),
    statNumber(user?.lifetime_earnings),
    statNumber(profile?.total_earnings),
    statNumber(user?.total_wager_earnings),
  );
  const socialLinks = socialLinksFor(profile, user);
  const joinedDate = formatDate(profile?.account_created_date || user?.account_created_date || user?.created_date);
  const region = profile?.country || user?.region || "Region N/A";
  const rankJourneyIndex = Math.max(0, rankJourney.findIndex((step) => step.tier === rank.tier));
  const achievementCards = [
    { label: "Win Streak", value: currentStreak, icon: Flame, tone: "text-orange" },
    { label: "Trophy Case", value: trophyCount, icon: Trophy, tone: "text-green" },
    { label: "Verified", value: isVerifiedPlayer ? "Yes" : "No", icon: BadgeCheck, tone: "text-green" },
    { label: "Ranked", value: rank.name || `${rank.tier} ${rank.division || ""}`.trim(), icon: Medal, tone: "text-cyan" },
  ];
  const trophyOverviewCards = trophyOverviewFor(user, profile, inventory, matches);
  const earnedTrophyItems = inventory.filter((item) => {
    const text = `${item.item_category || ""} ${item.item_name || ""}`.toLowerCase();
    return (item.item_category === "trophy" || text.includes("trophy")) && !text.includes("invit") && !text.includes("champion");
  }).slice(0, 12);

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProfileResult(null);
    try {
      setAvatarDraft(await prepareImageFile(file));
    } catch (error) {
      setProfileResult({ success: false, message: error.message || "Could not load image." });
    } finally {
      event.target.value = "";
    }
  };

  const handleSaveProfileVisuals = async () => {
    if (!isOwnProfile || !user?.id) return;
    setProfileSaving(true);
    setProfileResult(null);
    try {
      let nextProfile = profile;
      const normalizedAvatar = normalizeImageSource(avatarDraft);
      const nextNameColor = availableNameColors.some((color) => color.value === nameColorDraft) ? nameColorDraft : "";
      const profilePatch = {
        user_id: user.id,
        display_name: user.display_name || user.full_name || user.username || user.email,
        username: user.username,
        handle: user.handle || user.username,
        avatar_url: normalizedAvatar,
        bio: bioDraft.trim().slice(0, 500),
        display_name_color: canUseNameColor ? nextNameColor : "",
      };
      const nextUser = await base44.auth.updateMe({
        display_name_color: canUseNameColor ? nextNameColor : "",
      });
      if (profile?.id) nextProfile = await base44.entities.PlayerProfile.update(profile.id, profilePatch);
      else nextProfile = await base44.entities.PlayerProfile.create(profilePatch);
      setProfile(nextProfile);
      setUser((current) => ({ ...current, ...nextUser, display_name_color: canUseNameColor ? nextNameColor : "" }));
      window.dispatchEvent(new CustomEvent("topfragg:profile-updated", { detail: { avatarUrl: nextProfile?.avatar_url || "", displayNameColor: canUseNameColor ? nextNameColor : "" } }));
      setProfileResult({ success: true, message: "Profile saved." });
    } catch (error) {
      setProfileResult({ success: false, message: error.message || "Could not save profile." });
    } finally {
      setProfileSaving(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading profile" />;
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

  const tabs = [
    { id: "overview", label: "Overview", icon: Gamepad2 },
    { id: "statistics", label: "Statistics", icon: Target },
    { id: "matches", label: "Match History", icon: Swords },
    { id: "teams", label: "My Teams", icon: Users },
  ];

  return (
    <div className="min-h-screen py-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-card">
          {profile?.banner_url && <img src={profile.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_5%,rgba(20,216,255,.1),transparent_28%),radial-gradient(circle_at_15%_100%,rgba(255,110,0,.1),transparent_26%),linear-gradient(90deg,rgba(10,16,25,.97),rgba(12,18,28,.78))]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan via-orange to-transparent" />
          <div className="relative flex min-h-[210px] flex-col justify-end gap-7 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between lg:p-8">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              <div className="relative shrink-0">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-cyan/25 bg-secondary font-heading text-3xl font-black text-cyan shadow-[0_14px_35px_rgba(0,0,0,.3)] sm:h-28 sm:w-28">
                  {avatarDraft || profile?.avatar_url ? <img src={avatarDraft || profile.avatar_url} alt={name} className="h-full w-full object-cover" /> : name.charAt(0)}
                </div>
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-4 border-card bg-green" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 data-name-effect={selectedNameColor || undefined} className={`max-w-full shrink-0 break-words font-heading text-3xl font-black leading-none text-white sm:text-4xl ${selectedNameColor ? "player-name-color" : ""}`} style={selectedNameColor ? { "--player-name-color": selectedNameColor } : undefined}>{name}</h1>
                  <RoleBadge role={user.role || "user"} />
                  <UserBadges user={user} streamerHref={hasStreamerBadge ? `/streamer-tournaments?host=${user.id}` : ""} />
                </div>
                <p className="mt-2 max-w-2xl text-sm text-vapor">{profile?.bio || "No bio added yet."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-md border border-cyan/20 bg-cyan/10 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-cyan">{activisionIdFor(user) || "Activision ID not set"}</span>
                  <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-vapor">{region}</span>
                  <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-vapor">Joined {joinedDate}</span>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-[310px]">
              <div className="mb-5 flex justify-start gap-2 lg:justify-end">
                {isOwnProfile ? (
                  <button type="button" onClick={() => { setProfileResult(null); setEditingProfile((current) => !current); }} className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[9px] font-black uppercase tracking-wider ${editingProfile ? "border-cyan/30 bg-cyan/10 text-cyan" : "border-white/10 bg-black/20 text-white hover:border-cyan/30 hover:text-cyan"}`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit profile
                  </button>
                ) : currentUser?.id ? (
                  <Link to={`/messages?compose=${encodeURIComponent(user.id)}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-3 text-[9px] font-black uppercase tracking-wider text-cyan"><MessageSquare className="h-3.5 w-3.5" /> Message</Link>
                ) : null}
              </div>
              <div className="flex items-end justify-between gap-4">
                <div><p className="font-mono text-[8px] font-black uppercase tracking-[0.18em] text-vapor">Competitive rating</p><p className="mt-1 font-mono text-lg font-black text-cyan">{elo.toLocaleString()} ELO</p></div>
                <p className="text-right text-xs font-black text-white">{rank.name || `${rank.tier} ${rank.division || ""}`}</p>
              </div>
              <ProgressBar value={rankProgress} tone="from-cyan to-orange" className="mt-3 h-1.5" />
              <div className="mt-2 flex justify-between font-mono text-[8px] font-bold uppercase tracking-wider text-vapor"><span>{rankProgress}% progress</span><span>{nextRank ? `Next ${nextRank.name}` : "Top rank"}</span></div>
            </div>
          </div>

          {isOwnProfile && editingProfile && (
            <div className="relative border-t border-white/10 bg-black/10 p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Profile picture URL</span><input value={avatarDraft} onChange={(event) => setAvatarDraft(event.target.value)} onBlur={() => { try { setAvatarDraft(normalizeImageSource(avatarDraft)); } catch { /* Save displays validation. */ } }} placeholder="https://i.imgur.com/example.png" className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40" /></label>
                  <label className="space-y-1"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Upload profile picture</span><input type="file" accept="image/*" onChange={handleAvatarFile} className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40" /></label>
                  {canUseNameColor && <label className="space-y-1"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">{isPremium ? "Premium name effect" : "Verified name color"}</span><select value={nameColorDraft} onChange={(event) => setNameColorDraft(event.target.value)} className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40">{verifiedNameColors.map((color) => <option key={color.label} value={color.value}>{color.label}</option>)}{isPremium && <optgroup label="Premium animated effects">{premiumNameEffects.map((color) => <option key={color.label} value={color.value}>{color.label}</option>)}</optgroup>}</select></label>}
                  <label className="space-y-1 md:col-span-2 xl:col-span-3"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Bio</span><textarea value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} maxLength={500} rows={3} className="w-full resize-y rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40" /><span className="block text-right text-[9px] text-vapor">{bioDraft.length}/500</span></label>
                </div>
                <button onClick={handleSaveProfileVisuals} disabled={profileSaving} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan px-5 text-[10px] font-black uppercase tracking-wider text-background disabled:opacity-50">{profileSaving ? <Camera className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />} Save</button>
              </div>
              {profileResult && <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${profileResult.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>{profileResult.message}</div>}
            </div>
          )}
        </section>

        <nav className="mt-4 grid grid-cols-4 overflow-hidden rounded-xl border border-white/10 bg-card">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`relative flex min-h-12 items-center justify-center gap-2 border-r border-white/[0.06] px-2 text-[9px] font-black uppercase tracking-wider transition-colors last:border-r-0 sm:text-[10px] ${tab === id ? "bg-cyan/[0.07] text-cyan" : "text-vapor hover:bg-white/[0.03] hover:text-white"}`}>
              <Icon className="hidden h-3.5 w-3.5 sm:block" /> {label}
              {tab === id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan" />}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="mt-5 space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ProfileStatCard icon={Trophy} label="Rank" value={rank.name || rank.tier} tone="text-orange" />
              <ProfileStatCard icon={Target} label="Record" value={`${wins}W - ${losses}L`} tone="text-green" />
              <ProfileStatCard icon={Flame} label="Win ratio" value={`${winRate}%`} tone="text-cyan" />
              <ProfileStatCard icon={DollarSign} label="Lifetime earnings" value={formatMoney(earnedMoney)} tone="text-green" />
            </div>
            <PlayerOverviewPanel user={user} profile={profile} name={name} rank={rank} elo={elo} wins={wins} losses={losses} earnedMoney={earnedMoney} trophies={trophyOverviewCards} socialLinks={socialLinks} />
            <SeasonRecordPanel rankedStats={rankedStats} wins={wins} losses={losses} winRate={winRate} currentStreak={currentStreak} earnedMoney={earnedMoney} />
            <RecentMatchesPanel matches={matches.slice(0, 6)} userId={user.id} />
          </div>
        )}

        {tab === "statistics" && (
          <div className="mt-5 space-y-6">
            <XpProgressPanel xpStats={xpStats} user={user} />
            <RankProgressPanel rank={rank} elo={elo} rankProgress={rankProgress} rankJourneyIndex={rankJourneyIndex} />
            <TrophyOverview trophies={trophyOverviewCards} items={earnedTrophyItems} />
            <div className="grid gap-6 xl:grid-cols-2"><AchievementsPanel achievements={achievementCards} badges={badges} expanded /><AboutPanel profile={profile} user={user} region={region} joinedDate={joinedDate} socialLinks={socialLinks} /></div>
          </div>
        )}
        {tab === "matches" && <div className="mt-5"><RecentMatchesPanel matches={matches} userId={user.id} expanded /></div>}
        {tab === "teams" && <div className="mt-5"><TeamsList teams={profileTeams} /></div>}
      </div>
    </div>
  );
}

function SectionCard({ children, className = "" }) {
  return (
    <div className={`premium-panel relative overflow-hidden rounded-3xl ${className}`}>
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
}

function ProfileStatCard({ icon: Icon, label, value, tone = "text-cyan" }) {
  return (
    <div className="group relative min-h-[86px] overflow-hidden rounded-xl border border-white/10 bg-card px-4 py-4 sm:px-5">
      <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-white/[0.035] to-transparent" />
      <div className="relative flex h-full items-center gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/10"><Icon className={`h-4 w-4 ${tone}`} /></span>
        <div className="min-w-0">
          <p className="font-mono text-[8px] font-black uppercase tracking-[0.18em] text-vapor">{label}</p>
          <p className="mt-1 truncate font-heading text-lg font-black text-white sm:text-xl">{value}</p>
        </div>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-cyan via-orange to-transparent transition-transform duration-300 group-hover:scale-x-100" />
    </div>
  );
}

function PlayerOverviewPanel({ user, profile, name, rank, elo, wins, losses, earnedMoney, trophies, socialLinks }) {
  return (
    <section>
      <ProfileSectionTitle title="Player overview" count="1 player" />
      <div className="overflow-hidden rounded-xl border border-white/10 bg-card">
        <div className="hidden grid-cols-[minmax(180px,1.35fr)_minmax(130px,.9fr)_70px_75px_90px_minmax(190px,1.2fr)_90px] border-b border-white/[0.07] bg-white/[0.025] px-5 py-3 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-vapor lg:grid">
          <span>Player</span><span>Gamertag</span><span>Record</span><span>ELO</span><span>Earnings</span><span>Trophies</span><span>Socials</span>
        </div>
        <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(180px,1.35fr)_minmax(130px,.9fr)_70px_75px_90px_minmax(190px,1.2fr)_90px] lg:items-center lg:gap-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-cyan/20 bg-cyan/10 font-black text-cyan">
              {profile?.avatar_url || user?.avatar_url ? <img src={profile?.avatar_url || user?.avatar_url} alt="" className="h-full w-full object-cover" /> : name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p data-name-effect={user?.display_name_color || undefined} style={user?.display_name_color ? { "--player-name-color": user.display_name_color } : undefined} className={`truncate text-sm font-black text-white ${user?.display_name_color ? "player-name-color" : ""}`}>{name}</p>
              <p className="mt-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-vapor">{rank.name || rank.tier}</p>
            </div>
          </div>
          <div className="min-w-0 lg:px-1"><p className="mb-1 font-mono text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">Gamertag</p><span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1 font-mono text-[10px] text-white"><Gamepad2 className="h-3 w-3 text-cyan" /><span className="truncate">{activisionIdFor(user) || user?.handle || user?.username || "Not set"}</span></span></div>
          <ProfileTableValue label="Record" value={`${wins}-${losses}`} />
          <ProfileTableValue label="ELO" value={elo.toLocaleString()} tone="text-cyan" />
          <ProfileTableValue label="Earnings" value={formatMoney(earnedMoney)} tone="text-green" />
          <div>
            <p className="mb-2 font-mono text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">Trophies</p>
            <div className="flex flex-wrap items-center gap-2">
              {(trophies || []).map((trophy) => (
                <span key={trophy.key} aria-label={`${trophy.label}: ${trophy.value}`} className={`group/trophy relative inline-flex cursor-default items-center gap-1 rounded-md p-1 transition-all duration-200 hover:-translate-y-0.5 hover:bg-current/10 ${trophy.tone}`}>
                  <img src={trophy.image} alt={trophy.label} className="h-5 w-5 object-contain" />
                  <span className="font-mono text-[9px] font-black">{trophy.value}</span>
                  <span className="pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-1/2 z-[70] -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border border-white/[0.12] bg-[#111821] px-2.5 py-2 text-[10px] font-bold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,.65)] transition-all duration-150 group-hover/trophy:visible group-hover/trophy:translate-y-0 group-hover/trophy:opacity-100">{trophy.label}: {trophy.value}</span>
                </span>
              ))}
            </div>
          </div>
          <div><p className="mb-1 font-mono text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">Socials</p>{socialLinks.length > 0 ? <div className="flex flex-wrap gap-1.5">{socialLinks.slice(0, 3).map((social) => social.url ? <a key={social.key} href={social.url} target="_blank" rel="noreferrer" className="text-[9px] font-black uppercase text-cyan hover:text-orange">{social.label}</a> : <span key={social.key} className="text-[9px] font-black uppercase text-vapor">{social.label}</span>)}</div> : <span className="text-xs text-vapor">—</span>}</div>
        </div>
      </div>
    </section>
  );
}

function ProfileTableValue({ label, value, tone = "text-white" }) {
  return <div><p className="mb-1 font-mono text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">{label}</p><p className={`font-mono text-xs font-black ${tone}`}>{value}</p></div>;
}

function ProfileSectionTitle({ title, count }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-1.5 w-1.5 shrink-0 bg-orange" />
      <h2 className="font-heading text-sm font-black text-white">{title}</h2>
      <span className="h-px flex-1 bg-white/10" />
      {count && <span className="font-mono text-[8px] font-bold uppercase tracking-wider text-vapor">{count}</span>}
    </div>
  );
}

function SeasonRecordPanel({ rankedStats, wins, losses, winRate, currentStreak, earnedMoney }) {
  const played = statNumber(rankedStats?.matches_played) || wins + losses;
  const seasonLabel = "October 2026";
  return (
    <section>
      <ProfileSectionTitle title="Season record" count={rankedStats ? "Live season" : "No season data"} />
      <div className="overflow-hidden rounded-xl border border-white/10 bg-card">
        <div className="grid grid-cols-[minmax(120px,1.4fr)_repeat(4,minmax(52px,.55fr))] border-b border-white/[0.07] bg-white/[0.025] px-4 py-3 font-mono text-[8px] font-black uppercase tracking-[0.14em] text-vapor sm:grid-cols-[minmax(180px,1.8fr)_repeat(5,minmax(70px,.6fr))] sm:px-5">
          <span>Season</span><span>Played</span><span>Wins</span><span>Losses</span><span>Win %</span><span className="hidden sm:block">Earnings</span>
        </div>
        <div className="grid grid-cols-[minmax(120px,1.4fr)_repeat(4,minmax(52px,.55fr))] items-center px-4 py-4 text-xs sm:grid-cols-[minmax(180px,1.8fr)_repeat(5,minmax(70px,.6fr))] sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-black text-white">{seasonLabel}</p>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-green/20 bg-green/10 px-1.5 py-0.5 font-mono text-[7px] font-black uppercase tracking-wider text-green">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
              </span>
              Live
            </span>
          </div>
          <span className="font-mono font-black text-white">{played}</span>
          <span className="font-mono font-black text-green">{wins}</span>
          <span className="font-mono font-black text-red-300">{losses}</span>
          <span className="font-mono font-black text-cyan">{winRate}%</span>
          <span className="hidden font-mono font-black text-green sm:block">{formatMoney(earnedMoney)}</span>
        </div>
        {currentStreak > 0 && <div className="border-t border-white/[0.06] px-4 py-2 font-mono text-[8px] font-black uppercase tracking-wider text-orange sm:px-5">Current streak: {currentStreak} wins</div>}
      </div>
    </section>
  );
}

function SectionHeader({ title, action, to }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h3 className="text-base font-black tracking-tight text-white">{title}</h3>
      {action && to && (
        <Link to={to} className="group inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan transition-colors hover:text-white">
          {action} <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

function ProgressBar({ value, tone = "from-cyan to-green", className = "" }) {
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-black/25 shadow-[inset_0_1px_3px_rgba(0,0,0,.35)] ${className}`}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${clampPercent(value)}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`h-full rounded-full bg-gradient-to-r shadow-[0_0_18px_rgba(210,214,220,.16)] ${tone}`}
      />
    </div>
  );
}

function HeroSignal({ icon: Icon, label, value, detail, tone = "text-cyan" }) {
  return (
    <motion.div whileHover={{ y: -4, transition: { duration: 0.1, ease: "easeOut" } }} className="premium-card group relative overflow-hidden rounded-2xl p-4 sm:p-5">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-current opacity-[0.055] blur-2xl ${tone}`} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.035]">
          <Icon className={`h-4 w-4 ${tone}`} />
        </span>
      </div>
      <p className="font-mono text-2xl font-black leading-none tracking-tight text-white sm:text-3xl">{value}</p>
      {detail && <p className="mt-2 text-[11px] font-medium text-vapor">{detail}</p>}
    </motion.div>
  );
}

function TrophyOverview({ trophies, items = [] }) {
  return (
    <SectionCard className="p-6 sm:p-8">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-yellow-400">
            <Trophy className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Legacy collection</span>
          </div>
          <h3 className="text-2xl font-black tracking-tight text-white">Trophy cabinet</h3>
          <p className="mt-1 text-sm text-vapor">Every finish, event, and milestone earned on TopFragg.</p>
        </div>
        <Link to="/inventory" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.045] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)] hover:bg-cyan/10 hover:text-cyan">
          View Collection <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {trophies.map((trophy) => {
          return (
            <motion.div
              key={trophy.key}
              whileHover={{ y: -5, transition: { duration: 0.1, ease: "easeOut" } }}
              className={`premium-card group relative min-h-[250px] overflow-hidden rounded-2xl border border-white/[0.06] p-4 transition-colors ${trophy.border}`}
            >
              <div className={`pointer-events-none absolute left-1/2 top-14 h-32 w-32 -translate-x-1/2 rounded-full opacity-50 blur-3xl ${trophy.tint}`} />
              <div className="relative flex h-full flex-col items-center text-center">
                <div className="flex h-40 w-full items-center justify-center">
                  <img
                    src={trophy.image}
                    alt={`${trophy.label} trophy`}
                    loading="lazy"
                    decoding="async"
                    className="h-36 w-36 object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:scale-[1.06]"
                  />
                </div>
                <div className="mt-auto w-full rounded-xl border border-white/[0.055] bg-black/15 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
                  <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${trophy.tone}`}>{trophy.label}</p>
                  <p className="mt-1 font-mono text-3xl font-black leading-none tracking-tight text-white">{trophy.value}</p>
                  <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.13em] text-vapor">Trophies earned</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="mt-7 border-t border-white/[0.06] pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan">Tournament history</p>
              <h4 className="mt-1 text-lg font-black text-white">Earned tournament trophies</h4>
            </div>
            <span className="rounded-lg bg-white/[0.04] px-3 py-1.5 font-mono text-xs font-black text-vapor">{items.length} shown</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="premium-card flex min-w-0 items-center gap-3 rounded-2xl p-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-yellow-400/15 bg-yellow-400/[0.06] text-yellow-400">
                  {item.item_image ? <img src={item.item_image} alt="" className="h-full w-full object-cover" /> : <Trophy className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-white">{item.item_name || "Tournament Trophy"}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-medium text-vapor">{item.source_tournament_name || `Placement #${item.tournament_placement || "-"}`}</span>
                  <span className="mt-1 block text-[9px] font-black uppercase tracking-wider text-yellow-400/80">Earned {formatDate(item.acquired_date)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function RecentMatchesPanel({ matches, userId, className = "", expanded = false }) {
  return (
    <section className={className}>
      <ProfileSectionTitle title={expanded ? "Match history" : "Recent matches"} count={`${matches.length} ${matches.length === 1 ? "match" : "matches"}`} />
      {matches.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-5"><EmptyPanel icon={Gamepad2} text="No matches found." /></div>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => {
            const [result, resultColor, resultClass] = matchResultFor(match, userId);
            return (
              <div
                key={match.id}
                className={`group grid min-h-[68px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 bg-card px-4 py-3 transition-colors hover:border-cyan/25 hover:bg-cyan/[0.035] sm:grid-cols-[38px_minmax(0,1fr)_90px_80px_118px] ${result === "Win" ? "border-l-green" : result === "Loss" ? "border-l-red-400" : "border-l-cyan"} border-l-2`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-lg border ${resultClass}`}><Swords className={`h-4 w-4 ${resultColor}`} /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white transition-colors group-hover:text-orange">{match.game_mode_display || match.game_mode || match.match_type || "Match"}</p>
                  <p className="mt-1 truncate font-mono text-[8px] uppercase tracking-wider text-vapor">{formatDate(match.match_completed_date || match.completed_date || match.created_date)} · {match.final_map_name || match.map_name || "Map pending"}</p>
                </div>
                <p className="hidden font-mono text-xs font-black text-white sm:block">{matchScoreText(match)}</p>
                <span className={`hidden rounded-md border px-2 py-1 text-center text-[9px] font-black uppercase sm:block ${resultClass} ${resultColor}`}>{result}</span>
                <Link to={matchRouteFor(match)} className="inline-flex items-center justify-end gap-1 font-mono text-[9px] font-black uppercase tracking-wider text-cyan transition-colors hover:text-orange">View match <ChevronRight className="h-3.5 w-3.5" /></Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RankProgressPanel({ rank, elo, rankProgress, rankJourneyIndex, className = "" }) {
  return (
    <SectionCard className={`p-6 sm:p-7 ${className}`}>
      <SectionHeader title="Rank Progress" action="Leaderboard" to="/leaderboards" />
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-cyan/[0.075] via-white/[0.025] to-transparent p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-cyan/10 blur-3xl" />
        <div className="relative grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}>
            <RankBadge rank={rank.tier} division={rank.division} size="xl" />
          </motion.div>
          <div>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-vapor">Current rank</p>
                <p className="mt-1 text-lg font-black text-cyan">{rank.name || `${rank.tier} ${rank.division || ""}`}</p>
              </div>
              <p className="font-mono text-2xl font-black tracking-tight text-white">{elo.toLocaleString()} <span className="text-[10px] tracking-[0.12em] text-vapor">ELO</span></p>
            </div>
            <ProgressBar value={rankProgress} tone="from-cyan via-cyan to-green" />
            <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-vapor">
              <span>Division progress</span>
              <span className="font-mono text-green">{Math.max(0, rankProgress)}%</span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative grid grid-cols-4 gap-y-5 sm:grid-cols-8 sm:gap-2">
        <div className="pointer-events-none absolute left-[6%] right-[6%] top-[7px] hidden h-px bg-gradient-to-r from-green/50 via-cyan/25 to-white/10 sm:block" />
        {rankJourney.map((step, index) => {
          const active = index <= rankJourneyIndex;
          const current = step.tier === rank.tier;
          return (
            <div key={step.tier} className="relative text-center">
              <div className={`relative z-[1] mx-auto mb-3 h-3.5 w-3.5 rounded-full ring-4 ring-background ${current ? "bg-cyan shadow-[0_0_18px_rgba(210,214,220,0.38)]" : active ? "bg-green/90" : "bg-white/15"}`} />
              <p className={`truncate text-[9px] font-black uppercase tracking-[0.08em] ${current ? "text-cyan" : active ? "text-white" : "text-vapor/70"}`}>{step.label}</p>
              <p className="mt-1 truncate text-[8px] text-vapor/60">{step.range}</p>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function XpProgressPanel({ xpStats, user }) {
  const level = statNumber(xpStats?.level || user?.xp_level || 1);
  const currentXp = statNumber(xpStats?.current_xp);
  const totalXp = statNumber(xpStats?.total_xp);
  const xpTarget = Math.max(1, statNumber(xpStats?.xp_to_next_level) || 1000);
  const progress = clampPercent((currentXp / xpTarget) * 100);

  return (
    <SectionCard className="p-6 sm:p-7">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-300">Your progression</p>
          <h2 className="mt-1 font-heading text-xl font-black text-white">Level {level}</h2>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-300/10 text-purple-300"><Sparkles className="h-6 w-6" /></span>
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <p className="font-mono text-2xl font-black text-white">{currentXp.toLocaleString()} <span className="text-sm text-vapor">XP</span></p>
        <div className="text-right"><p className="text-xs text-vapor">{xpTarget.toLocaleString()} needed</p><p className="mt-1 font-mono text-[9px] font-black uppercase tracking-wider text-purple-300">{totalXp.toLocaleString()} total XP</p></div>
      </div>
      <ProgressBar value={progress} tone="from-purple-400 to-cyan" className="mt-3 h-2" />
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-green/15 bg-green/5 p-3"><p className="text-[9px] font-black uppercase text-vapor">Win</p><p className="mt-1 font-mono font-black text-green">+150 XP</p></div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[9px] font-black uppercase text-vapor">Played</p><p className="mt-1 font-mono font-black text-white">+50 XP</p></div>
      </div>
    </SectionCard>
  );
}

function AboutPanel({ profile, user, region, joinedDate, socialLinks, className = "" }) {
  const rows = [
    ["Country", region],
    ["Favorite Game", profile?.favorite_game || user?.favorite_game || "N/A"],
    ["Play Style", profile?.play_style || user?.play_style || "N/A"],
    ["Joined", joinedDate],
  ];
  return (
    <SectionCard className={`p-5 ${className}`}>
      <SectionHeader title="About Me" />
      <p className="mb-5 text-sm leading-6 text-vapor">{profile?.bio || "Competitive gamer and platform player. No bio has been added yet."}</p>
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-b-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-vapor">{label}</span>
            <span className="min-w-0 truncate text-right text-xs font-bold text-white">{value}</span>
          </div>
        ))}
      </div>
      {socialLinks.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {socialLinks.map((social) => (
            social.url ? (
              <a key={social.key} href={social.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-secondary/60 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan hover:border-cyan/30">
                <Globe2 className="h-3 w-3" /> {social.label}
              </a>
            ) : (
              <span key={social.key} className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-secondary/60 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-vapor">
                <Globe2 className="h-3 w-3" /> {social.label}
              </span>
            )
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function InventoryPreview({ items, className = "" }) {
  return (
    <SectionCard className={`p-5 ${className}`}>
      <SectionHeader title="Inventory Preview" action="View Inventory" to="/inventory" />
      {items.length === 0 ? (
        <EmptyPanel icon={Package} text="No inventory items found." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 xl:grid-cols-5">
          {items.map((item) => (
            <InventoryMiniCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function TeamPanel({ team, memberships, className = "" }) {
  return (
    <SectionCard className={`p-5 ${className}`}>
      <SectionHeader title="Current Team" action="View Team" to={team?.id ? `/teams?team=${encodeURIComponent(team.id)}` : "/teams"} />
      {!team ? (
        <EmptyPanel icon={Users} text="No active team found." />
      ) : (
        <div>
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/10 text-xl font-black text-cyan">
              {team.tag || String(team.name || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black">{team.name}</p>
              <p className="text-xs text-vapor">{team.team_type || "general"} / {team.region || "N/A"}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <TeamStat label="Wins" value={team.total_wins || 0} />
            <TeamStat label="Losses" value={team.total_losses || 0} />
            <TeamStat label="Roster" value={team.roster_size || memberships.length || "-"} />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function AchievementsPanel({ achievements, badges = [], className = "", expanded = false }) {
  return (
    <SectionCard className={`p-5 ${className}`}>
      <SectionHeader title="Achievements" action={expanded ? null : "View All"} to="/profile" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {achievements.map((achievement) => (
          <motion.div
            key={achievement.label}
            whileHover={{ y: -4, transition: { duration: 0.1, ease: "easeOut" } }}
            className="relative overflow-hidden rounded-xl border border-white/5 bg-secondary/60 p-4 text-center transition-colors hover:border-cyan/20 hover:bg-secondary/80"
          >
            <achievement.icon className={`mx-auto mb-3 h-7 w-7 ${achievement.tone}`} />
            <p className="font-mono text-xl font-black text-white">{achievement.value}</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-vapor">{achievement.label}</p>
          </motion.div>
        ))}
      </div>
      {expanded && badges.length > 0 && (
        <div className="mt-5 space-y-3">
          {badges.map((badge) => (
            <div key={`${badge.type}-${badge.name}`} className="flex items-center gap-3 rounded-lg border border-white/5 bg-background/25 p-3">
              <UserBadges badges={[badge]} showForceStream={false} />
              {!["verified_player", "streamer"].includes(badge.type) && (
                <>
                  <Award className="h-4 w-4 text-yellow-300" />
                  <span className="text-sm font-bold">{badge.name}</span>
                  <span className="text-xs text-vapor">{badge.type}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {expanded && badges.length === 0 && (
        <div className="mt-5">
          <EmptyPanel icon={Star} text="No badges earned yet." />
        </div>
      )}
    </SectionCard>
  );
}

function InventoryShowcase({ items }) {
  return (
    <SectionCard className="p-5">
      <SectionHeader title="Inventory" />
      {items.length === 0 ? (
        <EmptyPanel icon={Package} text="No inventory items found." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <InventoryFullCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function TeamsList({ teams }) {
  return (
    <SectionCard className="p-5 sm:p-6">
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan">Competitive rosters</p>
        <h3 className="mt-1 text-xl font-black text-white">Teams</h3>
        <p className="mt-1 text-sm text-vapor">Open a team to view its roster, results and tournaments.</p>
      </div>
      {teams.length === 0 ? (
        <EmptyPanel icon={Users} text="No teams joined yet." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((membership) => {
            const team = membership.team;
            const initials = String(team.tag || team.name || "TF").slice(0, 3).toUpperCase();
            const typeLabel = ({ wager: "Wager", tournament: "Tournament", general: "General" })[team.team_type] || "Team";
            return (
              <Link key={membership.id} to={`/teams?team=${encodeURIComponent(team.id)}`} className="group relative min-h-56 overflow-hidden rounded-2xl border border-white/10 bg-background/40 p-5 transition-all hover:-translate-y-1 hover:border-cyan/35 hover:shadow-[0_18px_45px_rgba(0,0,0,0.3)]">
                {team.banner_url && <img src={team.banner_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15 transition-all duration-300 group-hover:scale-105 group-hover:opacity-25" />}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan/[0.08] via-card/85 to-orange/[0.06]" />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan/20 bg-cyan/10 font-mono text-lg font-black text-cyan shadow-lg">
                      {team.logo_url ? <img src={team.logo_url} alt="" className="h-full w-full object-cover" /> : initials}
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-vapor">{typeLabel}</span>
                  </div>
                  <div className="mt-5 min-w-0">
                    <h4 className="truncate text-xl font-black text-white transition-colors group-hover:text-cyan">{team.name}</h4>
                    <p className="mt-1 font-mono text-xs font-black uppercase tracking-[0.16em] text-cyan">{team.tag || "No tag"}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-xs text-vapor">
                    <span className="inline-flex items-center gap-1.5 capitalize"><Shield className="h-3.5 w-3.5 text-orange" /> {membership.role || "member"}</span>
                    <span className="inline-flex items-center gap-1.5 uppercase"><Globe2 className="h-3.5 w-3.5 text-cyan" /> {team.region || "Global"}</span>
                    <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatDate(membership.joined_date)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4 text-xs font-black uppercase tracking-wider text-cyan">
                    View team <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function InventoryMiniCard({ item }) {
  return (
    <motion.div whileHover={{ y: -4, transition: { duration: 0.1, ease: "easeOut" } }} className={`relative overflow-hidden rounded-lg border bg-secondary/60 ${premiumInventoryEffectClass(item)} ${inventoryBorderClass(item)}`}>
      <div className="aspect-square bg-secondary">
        {item.item_image ? (
          <img src={item.item_image} alt={item.item_name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-8 w-8 text-vapor/30" />
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-bold">{item.item_name}</p>
        <p className="truncate text-[9px] uppercase tracking-wider text-vapor">{item.item_rarity || "common"}</p>
      </div>
    </motion.div>
  );
}

function InventoryFullCard({ item }) {
  return (
    <motion.div
      whileHover={{ y: -5, transition: { duration: 0.1, ease: "easeOut" } }}
      className={`group relative overflow-hidden rounded-xl border bg-secondary/60 transition-all ${premiumInventoryEffectClass(item)} ${inventoryBorderClass(item)}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
        {item.item_image ? (
          <img src={item.item_image} alt={item.item_name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-12 w-12 text-vapor/30" />
          </div>
        )}
        <div className="absolute left-3 top-3">
          <RarityBadge rarity={item.item_rarity || "common"} />
        </div>
      </div>
      <div className="p-4">
        <h4 className="truncate text-sm font-black">{item.item_name}</h4>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-vapor">
          {inventoryCategoryLabels[item.item_category] || item.item_category || "Cosmetic"}
        </p>
      </div>
    </motion.div>
  );
}

function TeamStat({ label, value }) {
  return (
    <div className="rounded-lg border border-white/5 bg-background/25 p-3 text-center">
      <p className="font-mono text-lg font-black text-white">{value}</p>
      <p className="text-[9px] font-black uppercase tracking-wider text-vapor">{label}</p>
    </div>
  );
}

function EmptyPanel({ icon: Icon, text }) {
  return (
    <div className="rounded-lg border border-white/5 bg-background/25 px-5 py-8 text-center">
      <Icon className="mx-auto mb-3 h-9 w-9 text-vapor/30" />
      <p className="text-sm text-vapor">{text}</p>
    </div>
  );
}
