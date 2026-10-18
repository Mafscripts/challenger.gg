import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Award,
  BadgeCheck,
  Ban,
  Camera,
  ChevronRight,
  DollarSign,
  Flame,
  Gamepad2,
  Globe2,
  Medal,
  MessageSquare,
  MonitorPlay,
  Package,
  Pencil,
  Save,
  Shield,
  Settings,
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
import RecentMatchesPanel from "@/components/match/RecentMatchesPanel";
import { matchDateMs } from "@/lib/matchPresentation";
import TeamSummaryCard from "@/components/teams/TeamSummaryCard";
import { teamPurposeFor } from "@/lib/teamPresentation";
import { ScreenshotRankPill, GameRankSettingsLink } from "@/components/profile/ScreenshotRank";
import { base44 } from "@/api/base44Client";
import { getNextRankForElo, getRankForElo, getRankProgress } from "@/lib/ranks";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";
import { activisionIdFor } from "@/lib/activision";
import { normalizeImageSource, prepareImageFile } from "@/lib/images";
import { trophyCountsFor } from "@/lib/trophyCounts";
import { participantBelongsToUser, profileMatchOutcome, profileMatchSideFor, tournamentMatchSideFor } from "@/lib/profileMatchResults";

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
  { label: "Galaxy Drift — Deep Space / Starlight", value: "fx-galaxy" },
  { label: "Diamond Shine — Crystal / Prism", value: "fx-diamond-shine" },
  { label: "Cosmic Nebula — Purple Spiral", value: "fx-cosmic-nebula" },
  { label: "Stellar Rush — Blue / White", value: "fx-stellar-rush" },
  { label: "Prism Mirage — Chromatic", value: "fx-prism-mirage" },
  { label: "Golden Dimension — Amber 3D", value: "fx-golden-dimension" },
  { label: "Tesla Arc — Electric White / Blue", value: "fx-tesla-arc" },
  { label: "Tempest Core — Ocean Storm", value: "fx-tempest-core" },
  { label: "Astral Forge — Nebula Fire", value: "fx-astral-forge" },
  { label: "Celestial Halo — Golden Starfield", value: "fx-celestial-halo" },
  { label: "Violet Cosmos — Purple Starlight", value: "fx-violet-cosmos" },
  { label: "Gold Lightning — Yellow / White", value: "fx-lightning-gold" },
  { label: "Goldflare Lightning — Yellow / Red", value: "fx-lightning-gold-red" },
  { label: "Frostbolt Lightning — Blue / White", value: "fx-lightning-blue-white" },
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

function trophyOverviewFor(user, profile, inventory = [], matches = [], publicCounts) {
  const localCounts = trophyCountsFor(user, profile, inventory, matches);
  const counts = publicCounts ? { ...publicCounts, hosted: publicCounts.hosted || localCounts.hosted } : localCounts;

  return [
    { key: "gold", label: "Gold", value: counts.gold, image: "/assets/trophies/profile/gold.png", tone: "text-yellow-400", tint: "bg-yellow-400/10", border: "group-hover:border-yellow-400/25" },
    { key: "silver", label: "Silver", value: counts.silver, image: "/assets/trophies/profile/silver.png", tone: "text-gray-200", tint: "bg-gray-200/10", border: "group-hover:border-gray-200/20" },
    { key: "bronze", label: "Bronze", value: counts.bronze, image: "/assets/trophies/profile/bronze.png", tone: "text-orange", tint: "bg-orange/10", border: "group-hover:border-orange/25" },
    { key: "premium", label: "Premium", value: counts.premium, image: "/assets/trophies/profile/premium.png", tone: "text-purple-300", tint: "bg-purple-400/10", border: "group-hover:border-purple-300/25" },
    { key: "topfragg", label: "TopFragg", value: counts.topfragg, image: "/assets/trophies/compact/topfragg.png", tone: "text-cyan", tint: "bg-cyan/10", border: "group-hover:border-cyan/25" },
    { key: "hosted", label: "Hosted", value: counts.hosted, image: "/assets/trophies/compact/hosted.png", tone: "text-green", tint: "bg-green/10", border: "group-hover:border-green/25" },
  ];
}

export default function Profile() {
  const { username } = useParams();
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [rankedStats, setRankedStats] = useState(null);
  const [xpStats, setXpStats] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [animatedNameTrialActive, setAnimatedNameTrialActive] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [publicTrophyCounts, setPublicTrophyCounts] = useState(null);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [avatarDraft, setAvatarDraft] = useState("");
  const [bannerDraft, setBannerDraft] = useState("");
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [nameColorDraft, setNameColorDraft] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileResult, setProfileResult] = useState(null);

  useEffect(() => {
    let active = true;
    loadProfile(() => active);
    return () => { active = false; };
  }, [username]);

  const loadProfile = async (isActive) => {
    setLoading(true);
    setHistoryLoading(true);
    setEditingProfile(false);
    setUser(null);
    setProfile(null);
    setRankedStats(null);
    setInventory([]);
    setPublicTrophyCounts(null);
    setTeams([]);
    setMatches([]);
    setWallet(null);
    setXpStats(null);
    setAnimatedNameTrialActive(false);
    try {
      let userRow = null;
      const authUser = await base44.auth.me().catch(() => null);
      if (!isActive()) return;
      setCurrentUser(authUser);
      if (username) {
        if (authUser && (username === authUser.username || username === authUser.id)) {
          userRow = authUser;
        } else {
          const byUsername = await base44.entities.User.filter({ username }, "-created_date", 1).catch(() => []);
          userRow = byUsername[0] || await base44.entities.User.get(username).catch(() => null);
        }
      } else {
        userRow = authUser;
      }

      if (!isActive()) return;
      setUser(userRow);
      if (!userRow?.id) return;

      const isOwn = authUser?.id === userRow.id;
      if (authUser) {
        void base44.profile.trophyCounts([userRow.id])
          .then((counts) => { if (isActive()) setPublicTrophyCounts(counts[userRow.id] || null); })
          .catch(() => {});
      }

      const [
        profileRows,
        rankedRows,
        xpRows,
      ] = await Promise.all([
        base44.entities.PlayerProfile.filter({ user_id: userRow.id }, "-created_date", 1).catch(() => []),
        base44.entities.RankedStats.filter({ user_id: userRow.id }, "-season", 1).catch(() => []),
        base44.entities.XPStats.filter({ user_id: userRow.id }, "-season", 1).catch(() => []),
      ]);

      if (!isActive()) return;
      const loadedProfile = profileRows[0] || null;
      setProfile(loadedProfile);
      setAvatarDraft(loadedProfile?.avatar_url || userRow?.avatar_url || "");
      setBannerDraft(loadedProfile?.banner_url || "");
      setBioDraft(loadedProfile?.bio || "");
      setNameColorDraft(userRow?.display_name_color || loadedProfile?.display_name_color || "");
      setRankedStats(rankedRows[0] || null);
      setXpStats(xpRows[0] || null);

      // The header and stats can render while match history and teams finish.
      setLoading(false);
      if (isOwn) {
        const bootstrap = !userRow.username || !loadedProfile
          ? bootstrapCurrentUser({ user: authUser, email: authUser?.email }).catch(() => null)
          : Promise.resolve(null);
        bootstrap.then(async (updatedUser) => {
          if (!isActive()) return;
          if (updatedUser) setUser(updatedUser);
          const [freshProfileRows, walletRows, inventoryRows] = await Promise.all([
            updatedUser && !loadedProfile
              ? base44.entities.PlayerProfile.filterFresh({ user_id: userRow.id }, "-created_date", 1).catch(() => [])
              : Promise.resolve([]),
            base44.entities.Wallet.filter({ user_id: userRow.id }, "-created_date", 1).catch(() => []),
            base44.entities.UserInventory.filter({ user_id: userRow.id }, "-acquired_date", 200).catch(() => []),
          ]);
          if (!isActive()) return;
          if (freshProfileRows[0]) setProfile(freshProfileRows[0]);
          setWallet(walletRows[0] || null);
          setInventory(inventoryRows || []);
        }).catch(() => {});
        base44.functions.invoke("getAnimatedNameFreeTrialStatus", {})
          .then((response) => { if (isActive()) setAnimatedNameTrialActive(Boolean(response?.data?.trial?.active)); })
          .catch(() => {});
      }
      const [
        teamMemberRows,
        hostedWagers,
        challengedWagers,
        wagerParticipants,
        hostedRanked,
        challengedRanked,
        hostedXp,
        challengedXp,
        tournamentParticipants,
      ] = await Promise.all([
        base44.entities.TeamMember.filter({ user_id: userRow.id }, "-joined_date", 100).catch(() => []),
        base44.entities.Wager.filter({ host_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.Wager.filter({ challenger_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.WagerParticipant.filter({ user_id: userRow.id }, "-joined_date", 20).catch(() => []),
        base44.entities.RankedMatch.filter({ host_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.RankedMatch.filter({ challenger_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.XPMatch.filter({ host_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.entities.XPMatch.filter({ challenger_id: userRow.id }, "-created_date", 20).catch(() => []),
        base44.profile.tournamentParticipants(userRow.id).catch(() => []),
      ]);
      if (!isActive()) return;

      const loadedTeams = await Promise.all((teamMemberRows || []).filter((membership) => membership.is_active !== false).map(async (membership) => {
        const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
        return { ...membership, team };
      }));
      if (!isActive()) return;
      setTeams(loadedTeams.filter((row) => (
        row.team && !hiddenCompetitionTypes.has(String(row.team.team_type || "").toLowerCase())
      )));

      const knownWagerIds = new Set([...hostedWagers, ...challengedWagers].map((wager) => String(wager.id)));
      const participantWagerIds = [...new Set((wagerParticipants || []).map((participant) => participant?.wager_id).filter(Boolean))]
        .filter((id) => !knownWagerIds.has(String(id)));
      const participantWagers = await Promise.all(participantWagerIds.map((id) => (
        base44.entities.Wager.get(id).catch(() => null)
      )));
      const participantRowsByWager = new Map();
      (wagerParticipants || []).forEach((participant) => {
        if (!participant?.wager_id) return;
        const rows = participantRowsByWager.get(String(participant.wager_id)) || [];
        rows.push(participant);
        participantRowsByWager.set(String(participant.wager_id), rows);
      });
      const enrichWagerResult = (wager) => {
        if (!wager) return wager;
        return {
          ...wager,
          profile_side: profileMatchSideFor(wager, userRow.id, { wagerParticipants: participantRowsByWager.get(String(wager.id)) || [] }),
          profile_result: profileMatchOutcome(wager, userRow.id, { wagerParticipants: participantRowsByWager.get(String(wager.id)) || [] }),
        };
      };

      const userTournamentParticipants = (tournamentParticipants || []).filter((participant) => (
        participantBelongsToUser(participant, userRow.id)
      ));
      const tournamentIds = [...new Set(userTournamentParticipants.map((participant) => participant.tournament_id).filter(Boolean))];
      const tournamentMatchRows = (await Promise.all(tournamentIds.map((tournamentId) => (
        base44.entities.TournamentMatch.filter({ tournament_id: tournamentId }, "-created_date", 100).catch(() => [])
      )))).flat()
        .filter((match) => tournamentMatchSideFor(match, userTournamentParticipants))
        .map((match) => ({ ...match, match_type: "tournament", profile_side: tournamentMatchSideFor(match, userTournamentParticipants), profile_result: profileMatchOutcome(match, userRow.id, { tournamentParticipants: userTournamentParticipants }) }));

      const combinedMatches = [
        ...hostedWagers.map(enrichWagerResult),
        ...challengedWagers.map(enrichWagerResult),
        ...participantWagers.filter(Boolean).map(enrichWagerResult),
        ...hostedRanked.map((match) => ({ ...match, match_type: match.match_type || "ranked", profile_result: profileMatchOutcome(match, userRow.id) })),
        ...challengedRanked.map((match) => ({ ...match, match_type: match.match_type || "ranked", profile_result: profileMatchOutcome(match, userRow.id) })),
        ...hostedXp.map((match) => ({ ...match, match_type: match.match_type || "xp", profile_result: profileMatchOutcome(match, userRow.id) })),
        ...challengedXp.map((match) => ({ ...match, match_type: match.match_type || "xp", profile_result: profileMatchOutcome(match, userRow.id) })),
        ...tournamentMatchRows,
      ]
        .filter((match) => !["cancelled", "canceled", "expired"].includes(cleanKey(match.status)))
        .filter((match, index, list) => list.findIndex((item) => item.id === match.id) === index)
        .sort((a, b) => matchDateMs(b) - matchDateMs(a))
        .slice(0, 50);
      if (!isActive()) return;
      setMatches(combinedMatches);
    } catch (error) {
      console.error("Could not load profile", error);
    } finally {
      if (isActive()) {
        setLoading(false);
        setHistoryLoading(false);
      }
    }
  };

  const name = displayName(user, profile);
  const rank = getRankForElo(rankedStats?.elo || profile?.elo || 0);
  const rankedWins = Number(rankedStats?.wins ?? 0);
  const rankedLosses = Number(rankedStats?.losses ?? 0);
  const xpMatchesPlayed = Number(rankedStats?.matches_played ?? 0);
  const hasXpMatches = xpMatchesPlayed > 0 || rankedWins + rankedLosses > 0;
  const wagerWins = Number(user?.wager_wins ?? 0);
  const wagerLosses = Number(user?.wager_losses ?? 0);
  const wins = Math.max(Number(profile?.total_wins ?? 0), rankedWins + wagerWins, rankedWins, wagerWins);
  const losses = Math.max(Number(profile?.total_losses ?? 0), rankedLosses + wagerLosses, rankedLosses, wagerLosses);
  const totalMatches = wins + losses;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
  const badges = useMemo(() => (Array.isArray(user?.badges) ? user.badges : []).filter((badge) => badge?.type !== "challengers"), [user]);
  const isOwnProfile = Boolean(currentUser?.id && user?.id && currentUser.id === user.id);
  const isVerifiedPlayer = Boolean(user?.verified_player || user?.is_verified_player || badges.some((badge) => badge.type === "verified_player"));
  const isPremium = Boolean(user?.is_premium && (!user?.premium_expires || new Date(user.premium_expires).getTime() > Date.now()));
  const canUseAnimatedEffects = isPremium || animatedNameTrialActive;
  const canUseNameColor = isVerifiedPlayer || canUseAnimatedEffects;
  const availableNameColors = canUseAnimatedEffects ? allNameColors : verifiedNameColors;
  const hasStreamerBadge = Boolean(user?.streamer_badge || user?.is_streamer || badges.some((badge) => badge.type === "streamer"));
  const activeNameColor = isOwnProfile
    ? nameColorDraft
    : (user?.display_name_color || profile?.display_name_color || "");
  const selectedNameColor = allNameColors.some((color) => color.value === activeNameColor)
    ? activeNameColor
    : "";
  const trophyCount = profileTrophyCount(user, inventory);
  const profileTeams = [...new Map(teams.filter((membership) => membership.team && membership.team.is_active !== false && membership.team.is_demo !== true).map((membership) => [String(membership.team.id), membership])).values()];
  const elo = Number(rankedStats?.elo || profile?.elo || 0);
  const nextRank = getNextRankForElo(elo);
  const rankProgress = getRankProgress(elo);
  const topfraggRankLabel = hasXpMatches ? (rank.name || `${rank.tier} ${rank.division || ""}`).trim() : "Unranked";
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
    { label: "Ranked", value: topfraggRankLabel, icon: Medal, tone: "text-cyan" },
  ];
  const trophyOverviewCards = trophyOverviewFor(user, profile, inventory, matches, publicTrophyCounts);
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
    if (!isOwnProfile || !user?.id || bannerLoading || profileSaving) return;
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
        banner_url: normalizeImageSource(bannerDraft),
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
    { id: "teams", label: isOwnProfile ? "My Teams" : "Teams", icon: Users },
  ];

  return (
    <div className="profile-page min-h-screen py-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <section className="profile-hero relative overflow-hidden rounded-2xl border border-white/10 bg-card">
          {bannerDraft && <img src={bannerDraft} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35" />}
          <div className="profile-hero-shade pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan via-orange to-transparent" />
          <div className="relative flex min-h-[240px] flex-col justify-start gap-7 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between lg:p-8">
            <div className="flex min-w-0 flex-1 flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
              <div className="relative shrink-0">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-cyan/25 bg-secondary font-heading text-4xl font-black text-cyan shadow-[0_14px_35px_rgba(0,0,0,.3)] sm:h-36 sm:w-36">
                  {avatarDraft || profile?.avatar_url ? <img src={avatarDraft || profile.avatar_url} alt={name} className="h-full w-full object-cover" /> : name.charAt(0)}
                </div>
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan">TopFragg competitor</p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 data-name-effect={selectedNameColor || undefined} className={`player-name-wrap min-w-0 break-words font-heading text-4xl font-black leading-tight text-white sm:text-5xl ${selectedNameColor ? "player-name-color" : ""}`} style={selectedNameColor ? { "--player-name-color": selectedNameColor } : undefined}>{name}</h1>
                  {user.is_banned && !(Date.parse(user.ban_expires ?? user.metadata?.ban_expires) <= Date.now()) && (
                    <span title="This account is banned" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#ff3b3b]">
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />BANNED
                    </span>
                  )}
                  <RoleBadge role={user.role || "user"} />
                  <ScreenshotRankPill rank={user.screenshot_rank} />
                  <UserBadges user={user} streamerHref={hasStreamerBadge ? `/streamer-tournaments?host=${user.id}` : ""} />
                </div>
                <p className="mt-2 max-w-2xl text-sm text-vapor">{profile?.bio || "No bio added yet."}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-md border border-cyan/20 bg-cyan/10 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-cyan">{activisionIdFor(user) || "Activision ID not set"}</span>
                  <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-vapor">{region}</span>
                  <span className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-wider text-vapor">Joined {joinedDate}</span>
                </div>
                {socialLinks.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="Player socials">
                  {socialLinks.map((social) => social.url ? (
                    <a key={social.key} href={social.url} target="_blank" rel="noreferrer" className="profile-social-pill"><Globe2 className="h-3.5 w-3.5" />{social.label}<ChevronRight className="h-3 w-3" /></a>
                  ) : <span key={social.key} className="profile-social-pill"><MessageSquare className="h-3.5 w-3.5" />{social.label}: {social.value}</span>)}
                </div>}
              </div>
            </div>

            <div className="w-full shrink-0 lg:w-[360px]">
              <div className="rounded-xl border border-cyan/15 bg-cyan/[0.045] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="font-mono text-[8px] font-black uppercase tracking-[0.18em] text-vapor">TopFragg rank</p><p className="mt-1 text-sm font-black text-white">{topfraggRankLabel}</p></div>
                  {hasXpMatches ? <RankBadge rank={rank.tier} size="sm" showLabel={false} animated={false} /> : <span className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.04] font-mono text-lg font-black text-vapor">?</span>}
                </div>
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold"><span className="text-cyan">{elo.toLocaleString()} ELO</span><span className="text-vapor">{!hasXpMatches ? "Play Ranked to get placed" : nextRank ? `Next: ${nextRank.name}` : "Highest rank reached"}</span></div>
                  <div role="progressbar" aria-label="TopFragg rank progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hasXpMatches ? rankProgress : 0} className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan" style={{ width: `${hasXpMatches ? rankProgress : 0}%` }} /></div>
                  {hasXpMatches && nextRank && <p className="mt-2 text-[11px] text-vapor">{Math.max(0, nextRank.min - elo).toLocaleString()} ELO to {nextRank.name}</p>}
                </div>
                <ProfileTrophyCount trophies={trophyOverviewCards} total={trophyCount} />
              </div>
              <div className="mt-3 flex gap-2">
                {isOwnProfile ? (
                  <>
                    <button type="button" onClick={() => { setProfileResult(null); setEditingProfile((current) => !current); }} className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-[9px] font-black uppercase tracking-wider ${editingProfile ? "border-cyan/30 bg-cyan/10 text-cyan" : "border-white/10 bg-black/20 text-white hover:border-cyan/30 hover:text-cyan"}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit profile
                    </button>
                    <Link to="/settings" className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 text-[9px] font-black uppercase tracking-wider text-white hover:border-cyan/30 hover:text-cyan">
                      <Settings className="h-3.5 w-3.5" /> Settings
                    </Link>
                  </>
                ) : currentUser?.id ? (
                  <Link to={`/messages?compose=${encodeURIComponent(user.id)}`} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-3 text-[9px] font-black uppercase tracking-wider text-cyan"><MessageSquare className="h-3.5 w-3.5" /> Message</Link>
                ) : null}
              </div>
              {isOwnProfile && <Link to="/settings#settings-overlay" className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-cyan"><MonitorPlay size={15} />Your Twitch player overlay<ChevronRight size={13} /></Link>}
            </div>
          </div>

          {isOwnProfile && editingProfile && (
            <div className="relative border-t border-white/10 bg-black/10 p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Profile picture URL</span><input value={avatarDraft} onChange={(event) => setAvatarDraft(event.target.value)} onBlur={() => { try { setAvatarDraft(normalizeImageSource(avatarDraft)); } catch { /* Save displays validation. */ } }} placeholder="https://i.imgur.com/example.png" className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40" /></label>
                  <label className="space-y-1"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Upload profile picture</span><input type="file" accept="image/*" onChange={handleAvatarFile} className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40" /></label>
                  <label className="space-y-1"><span className="text-xs font-bold text-vapor">Upload profile banner</span><input type="file" accept="image/*" disabled={bannerLoading || profileSaving} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBannerLoading(true); setProfileResult(null); try { setBannerDraft(await prepareImageFile(file)); } catch (error) { setProfileResult({ success: false, message: error.message || "Could not load banner." }); } finally { setBannerLoading(false); } }} className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40 disabled:opacity-50" /><span role="status" className="block text-xs text-vapor">{bannerLoading ? "Preparing banner..." : "Wide images work best · max 8MB"}</span></label>
                  {bannerDraft && <button type="button" disabled={bannerLoading || profileSaving} onClick={() => setBannerDraft("")} className="justify-self-start text-xs font-bold text-cyan hover:underline disabled:opacity-50">Remove banner</button>}
                  {canUseNameColor && <label className="space-y-1"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">{canUseAnimatedEffects ? (isPremium ? "Premium name effect" : "Free trial animated effect") : "Verified name color"}</span><select value={nameColorDraft} onChange={(event) => setNameColorDraft(event.target.value)} className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40">{verifiedNameColors.map((color) => <option key={color.label} value={color.value}>{color.label}</option>)}{canUseAnimatedEffects && <optgroup label="Animated name effects">{premiumNameEffects.map((color) => <option key={color.label} value={color.value}>{color.label}</option>)}</optgroup>}</select></label>}
                  <label className="space-y-1 md:col-span-2 xl:col-span-3"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Bio</span><textarea value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} maxLength={500} rows={3} className="w-full resize-y rounded-lg border border-white/10 bg-secondary px-3 py-2 text-sm outline-none focus:border-cyan/40" /><span className="block text-right text-[9px] text-vapor">{bioDraft.length}/500</span></label>
                </div>
                <button onClick={handleSaveProfileVisuals} disabled={profileSaving || bannerLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan px-5 text-[10px] font-black uppercase tracking-wider text-background disabled:opacity-50">{profileSaving ? <Camera className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />} Save</button>
              </div>
              {profileResult && <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${profileResult.success ? "border-green/20 bg-green/10 text-green" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>{profileResult.message}</div>}
            </div>
          )}
        </section>

        {isOwnProfile && <GameRankSettingsLink />}

        <nav className="arena-tabs mt-4 grid grid-cols-4" aria-label="Profile sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className="arena-tab relative flex min-h-12 items-center justify-center gap-2 px-2 text-[9px] font-black transition-colors sm:text-[10px]">
              <Icon className="hidden h-3.5 w-3.5 sm:block" /> {label}
            </button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className="mt-5 space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ProfileStatCard icon={Swords} label="Career results" value={totalMatches.toLocaleString()} tone="text-orange" />
              <ProfileStatCard icon={Target} label="Career record" value={`${wins}W - ${losses}L`} tone="text-green" />
              <ProfileStatCard icon={Flame} label="Career win rate" value={`${winRate}%`} tone="text-cyan" />
              <ProfileStatCard icon={DollarSign} label="Lifetime earnings" value={formatMoney(earnedMoney)} tone="text-green" />
            </div>
            <SeasonRecordPanel rankedStats={rankedStats} />
            <RecentMatchesPanel key={user.id} matches={matches} userId={user.id} loading={historyLoading} onViewAll={() => setTab("matches")} />
          </div>
        )}

        {tab === "statistics" && (
          <div className="mt-5 space-y-6">
            <XpProgressPanel xpStats={xpStats} user={user} />
            <RankProgressPanel rank={rank} rankLabel={topfraggRankLabel} elo={elo} rankProgress={hasXpMatches ? rankProgress : 0} rankJourneyIndex={hasXpMatches ? rankJourneyIndex : -1} />
            <TrophyOverview trophies={trophyOverviewCards} items={earnedTrophyItems} />
            <div className="grid gap-6 xl:grid-cols-2"><AchievementsPanel achievements={achievementCards} badges={badges} expanded /><AboutPanel profile={profile} user={user} region={region} joinedDate={joinedDate} socialLinks={socialLinks} /></div>
          </div>
        )}
        {tab === "matches" && <div className="mt-5"><RecentMatchesPanel key={user.id} matches={matches} userId={user.id} loading={historyLoading} expanded /></div>}
        {tab === "teams" && <div className="mt-5"><TeamsList key={user.id} teams={profileTeams} loading={historyLoading} profileUserId={user.id} isOwnProfile={isOwnProfile} /></div>}
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
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-vapor">{label}</p>
          <p className="mt-1 truncate font-heading text-lg font-black text-white sm:text-xl">{value}</p>
        </div>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-cyan via-orange to-transparent transition-transform duration-300 group-hover:scale-x-100" />
    </div>
  );
}

function ProfileTrophyCount({ trophies = [], total = 0 }) {
  const visibleTrophies = trophies.filter((trophy) => ["gold", "silver", "bronze", "premium"].includes(trophy.key));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/15 px-2 py-2 lg:flex-nowrap">
      <div className="mr-1 shrink-0">
        <p className="font-mono text-[8px] font-black uppercase tracking-[0.16em] text-vapor">Trophy count</p>
        <p className="mt-0.5 font-mono text-sm font-black leading-none text-white">{total}</p>
      </div>
      {visibleTrophies.map((trophy) => (
        <div key={trophy.key} className={`flex h-9 shrink-0 items-center gap-1 rounded-lg border border-white/[0.08] px-1.5 ${trophy.tint}`} title={`${trophy.label}: ${trophy.value}`}>
          <img src={trophy.image} alt={`${trophy.label} trophy`} className="h-7 w-7 object-contain drop-shadow-[0_3px_5px_rgba(0,0,0,.45)]" loading="lazy" decoding="async" />
          <span className={`font-mono text-[10px] font-black ${trophy.tone}`}>{trophy.value}</span>
        </div>
      ))}
    </div>
  );
}

function ProfileSectionTitle({ title, count }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-1.5 w-1.5 shrink-0 bg-orange" />
      <h2 className="font-heading text-sm font-black text-white">{title}</h2>
      <span className="h-px flex-1 bg-white/10" />
      {count && <span className="text-[10px] font-bold uppercase tracking-wider text-vapor">{count}</span>}
    </div>
  );
}

function SeasonRecordPanel({ rankedStats }) {
  const wins = Math.max(0, statNumber(rankedStats?.wins));
  const losses = Math.max(0, statNumber(rankedStats?.losses));
  const decided = wins + losses;
  const played = Math.max(statNumber(rankedStats?.matches_played), decided);
  const winRate = decided ? Math.round(wins / decided * 100) : 0;
  const currentStreak = Math.max(0, statNumber(rankedStats?.win_streak));
  const seasonLabel = rankedStats?.season ? `Season ${rankedStats.season}` : "No ranked season yet";
  return (
    <section>
      <ProfileSectionTitle title="Ranked season" count="Ranked matches only" />
      <div className="profile-season rounded-xl border border-white/10 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div><h3 className="font-black text-white">{seasonLabel}</h3><p className="mt-1 text-xs text-vapor">Separate from your career totals across competitions.</p></div>
          {currentStreak > 0 && <span className="inline-flex items-center gap-2 rounded-full border border-orange/20 bg-orange/10 px-3 py-1.5 text-xs font-bold text-orange"><Flame className="h-3.5 w-3.5" />{currentStreak} win streak</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[{ label: "Played", value: played, tone: "text-white" }, { label: "Wins", value: wins, tone: "text-green" }, { label: "Losses", value: losses, tone: "text-red-300" }, { label: "Win rate", value: `${winRate}%`, tone: "text-cyan" }].map((stat) => <div key={stat.label}><p className="text-[10px] font-bold uppercase tracking-wider text-vapor">{stat.label}</p><p className={`mt-1 text-xl font-black tabular-nums ${stat.tone}`}>{stat.value}</p></div>)}
        </div>
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

function RankProgressPanel({ rank, rankLabel, elo, rankProgress, rankJourneyIndex, className = "" }) {
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
                <p className="mt-1 text-lg font-black text-cyan">{rankLabel || rank.name || `${rank.tier} ${rank.division || ""}`}</p>
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
          const current = rankLabel !== "Unranked" && step.tier === rank.tier;
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

function TeamsList({ teams, loading = false, profileUserId, isOwnProfile }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const categories = [{ id: "all", label: "All teams" }, { id: "tournament", label: "Tournaments" }, { id: "wager", label: "Wagers" }, { id: "ranked", label: "Ranked" }, { id: "general", label: "General" }];
  const captainTeams = teams.filter(({ team }) => String(team.captain_id || "") === String(profileUserId));
  const filtered = teams.filter(({ team }) => {
    const captain = String(team.captain_id || "") === String(profileUserId);
    const purpose = teamPurposeFor(team);
    return (typeFilter === "all" || purpose.icon === typeFilter)
      && (roleFilter === "all" || (roleFilter === "captain" ? captain : !captain))
      && `${team.name || ""} ${team.tag || ""} ${team.region || ""} ${purpose.label}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  return (
    <section className="team-collection">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan">Competitive rosters</p><h2 className="mt-1 text-2xl font-black text-white">{isOwnProfile ? "My teams" : "Player teams"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-vapor">Each team has its own competition and roster. Open a team for results, or go straight to its players.</p></div>
        {isOwnProfile && <Link to="/teams?create=general" className="competition-action-pill team-collection-create"><Users className="h-4 w-4" />Create team</Link>}
      </div>
      <div className="mb-5 flex flex-wrap gap-2 text-xs text-vapor"><span className="team-summary-badge">{loading ? "…" : teams.length} teams</span><span className="team-summary-badge"><Shield className="h-3.5 w-3.5 text-orange" />Captain of {loading ? "…" : captainTeams.length}</span><span className="team-summary-badge">Member of {loading ? "…" : teams.length - captainTeams.length}</span></div>
      <div className="team-collection-toolbar mb-5">
        <div className="profile-mode-filters flex flex-wrap gap-2" aria-label="Filter teams by competition">
          {categories.map((category) => <button key={category.id} type="button" aria-pressed={typeFilter === category.id} onClick={() => setTypeFilter(category.id)} className="competition-action-pill profile-mode-pill">{category.label}<span className="profile-mode-count">{category.id === "all" ? teams.length : teams.filter(({ team }) => teamPurposeFor(team).icon === category.id).length}</span></button>)}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1"><span className="sr-only">Search teams by name, tag or region</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by team name, tag or region..." className="arena-field w-full rounded-xl border border-white/10 bg-background px-4 py-3 text-sm" /></label>
          <label><span className="sr-only">Filter by team role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="arena-field h-full w-full rounded-xl border border-white/10 bg-background px-4 py-3 text-sm sm:w-48"><option value="all">All roles</option><option value="captain">Captain</option><option value="member">Member</option></select></label>
        </div>
      </div>
      {loading ? <div role="status" className="rounded-xl border border-white/10 bg-card p-6 text-sm text-vapor">Loading teams...</div>
        : filtered.length === 0 ? <div className="rounded-xl border border-white/10 bg-card p-6"><EmptyPanel icon={Users} text={teams.length === 0 ? "No teams joined yet." : "No teams match these filters."} />{teams.length > 0 && <button type="button" onClick={() => { setSearch(""); setTypeFilter("all"); setRoleFilter("all"); }} className="mt-3 text-sm font-bold text-cyan hover:underline">Clear filters</button>}</div>
        : <><p className="mb-3 text-xs text-vapor">Showing {filtered.length} of {teams.length} teams</p><div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((membership) => <TeamSummaryCard key={membership.team.id} team={membership.team} membership={membership} profileUserId={profileUserId} isOwnProfile={isOwnProfile} />)}</div></>}
    </section>
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
