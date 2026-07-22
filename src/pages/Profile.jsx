import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Award,
  BadgeCheck,
  Calendar,
  Camera,
  ChevronRight,
  Crown,
  DollarSign,
  ExternalLink,
  Flame,
  Gamepad2,
  Globe2,
  Medal,
  Monitor,
  Package,
  Pencil,
  Save,
  Shield,
  Star,
  Swords,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import RankBadge from "@/components/ui/RankBadge";
import RarityBadge from "@/components/ui/RarityBadge";
import RoleBadge from "@/components/ui/RoleBadge";
import UserBadges from "@/components/ui/UserBadges";
import { base44 } from "@/api/base44Client";
import { getNextRankForElo, getRankForElo, getRankProgress } from "@/lib/ranks";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";
import { activisionIdFor } from "@/lib/activision";

const displayName = (user, profile) => user?.display_name || profile?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "N/A";
const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};
const cleanKey = (value) => String(value || "").trim().toLowerCase();
const profileImageMaxBytes = 1.5 * 1024 * 1024;
const verifiedNameColors = [
  { label: "Default", value: "" },
  { label: "Red", value: "#f87171" },
  { label: "Blue", value: "#60a5fa" },
  { label: "Yellow", value: "#facc15" },
  { label: "Green", value: "#22c55e" },
  { label: "Purple", value: "#a78bfa" },
  { label: "Cyan", value: "#22d3ee" },
  { label: "Orange", value: "#fb923c" },
  { label: "Lime", value: "#84cc16" },
  { label: "Teal", value: "#2dd4bf" },
  { label: "White", value: "#f8fafc" },
];
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
    const value = profile?.[field.key] || user?.[field.key] || user?.[`${field.key}_url`];
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

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve("");
  if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file."));
  if (file.size > profileImageMaxBytes) return reject(new Error("Image must be 1.5MB or smaller."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read image file."));
  reader.readAsDataURL(file);
});

const profileTrophyCount = (user, inventory = []) => (
  Number(user?.trophies || 0)
  + (inventory || []).filter((item) => {
    const text = `${item.item_category || ""} ${item.item_name || ""}`.toLowerCase();
    return text.includes("trophy");
  }).length
);

const emptyProfileTrophyCounts = () => ({ gold: 0, silver: 0, bronze: 0, premium: 0, topfragg: 0, hosted: 0 });

function countProfileInventoryTrophies(items = []) {
  const counts = emptyProfileTrophyCounts();
  (items || []).forEach((item) => {
    const text = cleanKey([item.item_category, item.item_name, item.unlock_key, item.item_rarity, item.purchase_method].filter(Boolean).join(" "));
    if (item.item_category !== "trophy" && !text.includes("trophy")) return;

    if (text.includes("topfrag") || text.includes("topfragg")) counts.topfragg += 1;
    else if (text.includes("hosted") || text.includes("host trophy")) counts.hosted += 1;
    else if (text.includes("premium")) counts.premium += 1;
    else if (text.includes("gold")) counts.gold += 1;
    else if (text.includes("silver")) counts.silver += 1;
    else if (text.includes("bronze")) counts.bronze += 1;
    else if (item.item_rarity === "exclusive" || item.item_rarity === "mythic") counts.premium += 1;
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
    { key: "gold", label: "Golds", value: counts.gold, icon: Trophy, tone: "text-yellow-400", tint: "bg-yellow-400/10" },
    { key: "silver", label: "Silvers", value: counts.silver, icon: Medal, tone: "text-gray-300", tint: "bg-gray-300/10" },
    { key: "bronze", label: "Bronzes", value: counts.bronze, icon: Award, tone: "text-orange", tint: "bg-orange/10" },
    { key: "premium", label: "Premium", value: counts.premium, icon: Crown, tone: "text-purple-300", tint: "bg-purple-400/10" },
    { key: "topfragg", label: "Topfragg", value: counts.topfragg, icon: Target, tone: "text-cyan", tint: "bg-cyan/10" },
    { key: "hosted", label: "Hosted", value: counts.hosted, icon: Users, tone: "text-green", tint: "bg-green/10" },
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
      setNameColorDraft(userRow?.display_name_color || "");
      setRankedStats(rankedRows[0] || null);
      setXpStats(xpRows[0] || null);
      setWallet(walletRows[0] || null);
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
  const hasStreamerBadge = Boolean(user?.streamer_badge || user?.is_streamer || badges.some((badge) => badge.type === "streamer"));
  const activeNameColor = isOwnProfile ? nameColorDraft : (user?.display_name_color || "");
  const selectedNameColor = verifiedNameColors.some((color) => color.value === activeNameColor)
    ? activeNameColor
    : "";
  const trophyCount = profileTrophyCount(user, inventory);
  const profileTeams = teams.filter((membership) => membership.team && membership.team.is_demo !== true);
  const primaryTeams = profileTeams.map((membership) => membership.team).slice(0, 4);
  const elo = Number(rankedStats?.elo || profile?.elo || 0);
  const nextRank = getNextRankForElo(elo);
  const rankProgress = getRankProgress(elo);
  const xpLevel = Number(xpStats?.level || user?.xp_level || profile?.level || 1);
  const currentXp = Number(xpStats?.current_xp ?? user?.current_xp ?? profile?.current_xp ?? 0);
  const xpToNextLevel = Number(xpStats?.xp_to_next_level || profile?.xp_to_next_level || 1000);
  const xpProgress = clampPercent(Math.round((currentXp / Math.max(1, xpToNextLevel)) * 100));
  const currentStreak = Number(rankedStats?.win_streak || user?.current_win_streak || 0);
  const earnedMoney = Math.max(
    statNumber(wallet?.total_earnings),
    statNumber(user?.lifetime_earnings),
    statNumber(profile?.total_earnings),
    statNumber(user?.total_wager_earnings),
  );
  const mainTeam = profileTeams[0]?.team || null;
  const inventoryPreview = inventory.slice(0, 5);
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
    return item.item_category === "trophy" || text.includes("trophy");
  }).slice(0, 12);

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProfileResult(null);
    try {
      setAvatarDraft(await fileToDataUrl(file));
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
      const profilePatch = {
        user_id: user.id,
        display_name: user.display_name || user.full_name || user.username || user.email,
        username: user.username,
        handle: user.handle || user.username,
        avatar_url: avatarDraft.trim(),
        bio: bioDraft.trim().slice(0, 500),
      };
      if (profile?.id) nextProfile = await base44.entities.PlayerProfile.update(profile.id, profilePatch);
      else nextProfile = await base44.entities.PlayerProfile.create(profilePatch);

      const nextNameColor = verifiedNameColors.some((color) => color.value === nameColorDraft) ? nameColorDraft : "";
      const nextUser = await base44.auth.updateMe({
        display_name_color: isVerifiedPlayer ? nextNameColor : "",
      });
      setProfile(nextProfile);
      setUser((current) => ({ ...current, ...nextUser }));
      setProfileResult({ success: true, message: "Profile saved." });
    } catch (error) {
      setProfileResult({ success: false, message: error.message || "Could not save profile." });
    } finally {
      setProfileSaving(false);
    }
  };

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
    <div className="min-h-screen py-10 sm:py-14">
      <div className="mx-auto max-w-[1560px] px-4 sm:px-6 lg:px-10">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="premium-panel relative mb-8 overflow-hidden rounded-[1.75rem]"
        >
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 opacity-90"
            animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            style={{
              backgroundImage:
                "radial-gradient(circle at 86% 6%, rgba(20,216,255,.14), transparent 28%), radial-gradient(circle at 8% 100%, rgba(255,112,0,.065), transparent 25%), linear-gradient(118deg, rgba(15,20,29,.98) 0%, rgba(24,31,41,.96) 54%, rgba(15,28,34,.95) 100%)",
              backgroundSize: "180% 180%",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/35 to-transparent" />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:p-10 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-10">
            <div className="flex min-w-0 flex-col justify-between gap-9">
              <div className="flex flex-col gap-7 lg:flex-row lg:items-center">
                <div className="relative mx-auto shrink-0 lg:mx-0">
                  <div className="absolute -inset-3 rounded-[2.2rem] bg-gradient-to-br from-cyan/20 via-cyan/5 to-orange/10 blur-xl" />
                  <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-secondary to-background text-4xl font-black shadow-[0_24px_50px_rgba(0,0,0,0.35),0_0_0_1px_rgba(20,216,255,0.22)] sm:h-40 sm:w-40">
                    {avatarDraft || profile?.avatar_url ? (
                      <img src={avatarDraft || profile.avatar_url} alt={name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-cyan">{name.charAt(0)}</span>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-xl bg-card shadow-[0_8px_20px_rgba(0,0,0,.35)]">
                    <span className="h-3 w-3 rounded-full bg-green shadow-[0_0_14px_rgba(0,255,128,0.55)]" />
                  </span>
                </div>

                <div className="min-w-0 flex-1 text-center lg:text-left">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-cyan/80">TopFragg competitor profile</p>
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
                    <h1 className="max-w-full break-words pb-1 text-4xl font-black leading-[1.08] tracking-[-0.04em] text-[#eef1f7] sm:text-5xl" style={selectedNameColor ? { color: selectedNameColor } : undefined}>
                      {name}
                    </h1>
                    <RoleBadge role={user.role || "user"} />
                    <UserBadges user={user} streamerHref={hasStreamerBadge ? `/streamer-tournaments?host=${user.id}` : ""} />
                  </div>
                  <p className="mb-4 text-sm font-medium text-vapor">
                    @{user.handle || profile?.handle || user.username || "player"} <span className="px-2 text-white/20">/</span> {region} <span className="px-2 text-white/20">/</span> Joined {joinedDate}
                  </p>
                  <p className="mx-auto mb-5 max-w-2xl text-sm leading-6 text-white/60 lg:mx-0">
                    {profile?.bio || "Competitive player building a legacy on TopFragg."}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-black tracking-wider ${activisionIdFor(user) ? "border-purple-400/25 bg-purple-400/10 text-purple-300" : "border-orange/20 bg-orange/10 text-orange"}`}>
                      <Gamepad2 className="h-3 w-3 shrink-0" />
                      <span className="shrink-0 uppercase">Activision ID</span>
                      <span className="truncate normal-case">{activisionIdFor(user) || "Not set"}</span>
                    </span>
                    {isOwnProfile && !activisionIdFor(user) && (
                      <Link to="/settings#gaming-ids" className="rounded-md bg-orange px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-background transition-colors hover:bg-orange/90">
                        Add in Settings
                      </Link>
                    )}
                    {primaryTeams.map((team) => (
                      <Link key={team.id} to="/teams" title={`Open ${team.name}`} className="inline-flex items-center gap-1.5 rounded-md border border-orange/20 bg-orange/[0.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-orange transition-colors hover:border-orange/35 hover:bg-orange/10">
                        <Shield className="h-3 w-3" /> Team · {team.tag || team.name}
                      </Link>
                    ))}
                    {socialLinks.map((social) => (
                      social.url ? (
                        <a key={social.key} href={social.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-secondary/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-vapor transition-colors hover:border-cyan/30 hover:text-cyan">
                          {social.label} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span key={social.key} className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-secondary/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-vapor">
                          {social.label}: {social.value}
                        </span>
                      )
                    ))}
                    {isOwnProfile && hasStreamerBadge && (
                      <Link to="/streamer-tournaments" className="inline-flex items-center gap-1 rounded-md border border-blue-400/25 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-500/20">
                        <Monitor className="h-3 w-3" /> Create Streamer Tournament
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
                <HeroSignal label="Record" value={`${wins} - ${losses}`} detail="Wins - Losses" icon={Swords} tone="text-cyan" />
                <HeroSignal label="Win Rate" value={`${winRate}%`} detail="This season" icon={Target} tone="text-green" />
                <HeroSignal label="Teams" value={profileTeams.length} detail="Total teams" icon={Users} tone="text-cyan" />
                <HeroSignal label="Streak" value={currentStreak} detail="Wins in a row" icon={Flame} tone="text-orange" />
                <HeroSignal label="Earnings" value={formatMoney(earnedMoney)} detail="Total earned" icon={DollarSign} tone="text-green" />
              </div>
            </div>

            <div className="grid content-start gap-4 xl:border-l xl:border-white/[0.05] xl:pl-9">
              {isOwnProfile && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileResult(null);
                      setEditingProfile((current) => !current);
                    }}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-[10px] font-black uppercase tracking-wider transition-all ${
                      editingProfile
                        ? "border-cyan/30 bg-cyan/10 text-cyan"
                        : "border-white/10 bg-background/40 text-white hover:border-cyan/25 hover:text-cyan"
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Profile
                  </button>
                </div>
              )}
              <div className="premium-card relative overflow-hidden rounded-2xl p-6">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan/10 blur-3xl" />
                <div className="flex items-center gap-4">
                  <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
                    <RankBadge rank={rank.tier} division={rank.division} size="xl" />
                  </motion.div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-vapor">Competitive rating</p>
                    <p className="mt-1 font-mono text-4xl font-black tracking-tight text-cyan text-glow-cyan">{elo.toLocaleString()}</p>
                    <p className="mt-1 text-sm font-bold text-white">{rank.name || `${rank.tier} ${rank.division || ""}`}</p>
                  </div>
                </div>
                <ProgressBar value={rankProgress} tone="from-cyan via-cyan to-green" className="mt-5" />
                <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-vapor">
                  <span>{rankProgress}% through rank</span>
                  <span>{nextRank ? `Next: ${nextRank.name}` : "Top rank"}</span>
                </div>
              </div>

              <div className="premium-card rounded-2xl p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-cyan" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Level {xpLevel}</span>
                  </div>
                  <span className="font-mono text-xs text-white">{currentXp.toLocaleString()} / {xpToNextLevel.toLocaleString()} XP</span>
                </div>
                <ProgressBar value={xpProgress} tone="from-cyan to-green" />
              </div>
            </div>
          </div>

          {isOwnProfile && editingProfile && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative border-t border-white/5 bg-background/25 p-4 sm:p-5"
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Profile picture URL</span>
                    <input
                      value={avatarDraft}
                      onChange={(event) => setAvatarDraft(event.target.value)}
                      placeholder="https://i.imgur.com/example.png"
                      className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none transition-colors focus:border-cyan/40"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Upload profile picture</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                      className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none transition-colors focus:border-cyan/40"
                    />
                  </label>
                  {isVerifiedPlayer && (
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Verified name color</span>
                      <select
                        value={nameColorDraft}
                        onChange={(event) => setNameColorDraft(event.target.value)}
                        className="w-full rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none transition-colors focus:border-cyan/40"
                      >
                        {verifiedNameColors.map((color) => (
                          <option key={color.label} value={color.value}>{color.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="space-y-1 md:col-span-2 xl:col-span-3">
                    <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Bio</span>
                    <textarea
                      value={bioDraft}
                      onChange={(event) => setBioDraft(event.target.value)}
                      maxLength={500}
                      rows={4}
                      placeholder="Tell players about your playstyle, team role, stream, or tournament history."
                      className="w-full resize-y rounded-lg border border-white/5 bg-secondary px-3 py-2 text-sm outline-none transition-colors focus:border-cyan/40"
                    />
                    <span className="block text-right text-[10px] font-semibold text-vapor">{bioDraft.length}/500</span>
                  </label>
                </div>
                <button
                  onClick={handleSaveProfileVisuals}
                  disabled={profileSaving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan px-5 text-xs font-black uppercase tracking-wider text-background transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  {profileSaving ? <Camera className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
              </div>
              {profileResult && (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${profileResult.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
                  {profileResult.message}
                </div>
              )}
            </motion.div>
          )}
        </motion.section>

        <nav className="mb-8 flex w-full items-center gap-1 overflow-x-auto rounded-2xl bg-white/[0.025] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] sm:w-fit">
          {["overview", "matches", "badges", "inventory", "teams"].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`h-10 whitespace-nowrap rounded-xl px-5 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                tab === item
                  ? "bg-cyan text-background shadow-[0_8px_24px_rgba(20,216,255,.18)]"
                  : "text-vapor hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="space-y-8">
            <TrophyOverview trophies={trophyOverviewCards} items={earnedTrophyItems} />

            <div className="grid gap-6 xl:grid-cols-12 2xl:gap-7">
              <RecentMatchesPanel matches={matches.slice(0, 5)} userId={user.id} className="xl:col-span-4" />
              <RankProgressPanel rank={rank} elo={elo} rankProgress={rankProgress} rankJourneyIndex={rankJourneyIndex} className="xl:col-span-5" />
              <AboutPanel profile={profile} user={user} region={region} joinedDate={joinedDate} socialLinks={socialLinks} className="xl:col-span-3" />
              <InventoryPreview items={inventoryPreview} className="xl:col-span-4" />
              <TeamPanel team={mainTeam} memberships={profileTeams} className="xl:col-span-4" />
              <AchievementsPanel achievements={achievementCards} className="xl:col-span-4" />
            </div>
          </div>
        )}

        {tab === "matches" && <RecentMatchesPanel matches={matches} userId={user.id} expanded />}
        {tab === "badges" && <AchievementsPanel achievements={achievementCards} badges={badges} expanded />}
        {tab === "inventory" && <InventoryShowcase items={inventory} />}
        {tab === "teams" && <TeamsList teams={profileTeams} />}
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
        className={`h-full rounded-full bg-gradient-to-r shadow-[0_0_18px_rgba(20,216,255,.25)] ${tone}`}
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
          const Icon = trophy.icon;
          return (
            <motion.div
              key={trophy.key}
              whileHover={{ y: -5, transition: { duration: 0.1, ease: "easeOut" } }}
              className="premium-card group relative overflow-hidden rounded-2xl p-5"
            >
              <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-70 blur-3xl ${trophy.tint}`} />
              <div className="relative">
                <div className={`mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,.05)] ${trophy.tone}`}>
                  <Icon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                </div>
                <p className="font-mono text-4xl font-black leading-none tracking-tight text-white">{trophy.value}</p>
                <p className="mt-2 truncate text-[10px] font-black uppercase tracking-[0.16em] text-vapor">{trophy.label}</p>
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
    <SectionCard className={`p-5 ${className}`}>
      <SectionHeader title="Recent Matches" action={expanded ? null : "View All"} to="/profile" />
      {matches.length === 0 ? (
        <EmptyPanel icon={Gamepad2} text="No matches found." />
      ) : (
        <div className="space-y-3">
          {matches.map((match) => {
            const [result, resultColor, resultClass] = matchResultFor(match, userId);
            return (
              <motion.div
                key={match.id}
                whileHover={{ x: 4, transition: { duration: 0.1, ease: "easeOut" } }}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/5 bg-background/25 p-3 transition-colors hover:border-cyan/20 hover:bg-cyan/5"
              >
                <span className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase ${resultClass} ${resultColor}`}>
                  {result}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{match.game_mode_display || match.game_mode || match.match_type || "Match"}</p>
                  <p className="truncate text-[11px] text-vapor">{match.final_map_name || match.map_name || "Map pending"} / {formatDate(match.match_completed_date || match.completed_date || match.created_date)}</p>
                </div>
                <Link to={matchRouteFor(match)} className="flex items-center gap-2 font-mono text-sm font-black text-cyan">
                  {matchScoreText(match)}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </SectionCard>
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
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-vapor">Current division</p>
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
              <div className={`relative z-[1] mx-auto mb-3 h-3.5 w-3.5 rounded-full ring-4 ring-background ${current ? "bg-cyan shadow-[0_0_18px_rgba(20,216,255,0.65)]" : active ? "bg-green/90" : "bg-white/15"}`} />
              <p className={`truncate text-[9px] font-black uppercase tracking-[0.08em] ${current ? "text-cyan" : active ? "text-white" : "text-vapor/70"}`}>{step.label}</p>
              <p className="mt-1 truncate text-[8px] text-vapor/60">{step.range}</p>
            </div>
          );
        })}
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
      <SectionHeader title="Current Team" action="View Team" to="/teams" />
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
    <SectionCard className="p-5">
      <SectionHeader title="Teams" />
      {teams.length === 0 ? (
        <EmptyPanel icon={Users} text="No teams joined yet." />
      ) : (
        <div className="space-y-3">
          {teams.map((membership) => (
            <div key={membership.id} className="grid gap-3 rounded-lg border border-white/5 bg-background/25 p-4 md:grid-cols-4 md:items-center">
              <span className="font-bold">{membership.team.name}</span>
              <span className="text-xs font-black uppercase tracking-wider text-cyan">{membership.team.tag || "No tag"}</span>
              <span className="text-xs capitalize text-vapor">{membership.role || "member"}</span>
              <span className="text-xs text-vapor md:text-right"><Calendar className="mr-1 inline h-3 w-3" /> {formatDate(membership.joined_date)}</span>
            </div>
          ))}
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
