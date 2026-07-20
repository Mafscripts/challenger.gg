import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_TOURNAMENT_ID = "topfragg-live-demo-tournament";
const DEMO_TEAM_PREFIX = "topfragg-demo-team-";
const DEMO_PLAYER_PREFIX = "topfragg-demo-player-";
const DEMO_MATCH_PREFIX = "topfragg-demo-match-";
const DEMO_PARTICIPANT_PREFIX = "topfragg-demo-participant-";
const DEMO_MEMBER_PREFIX = "topfragg-demo-member-";
const DEMO_NOTIFICATION_ID = "topfragg-demo-tournament-notification";

const staffRoles = ["ceo", "super_admin", "admin", "moderator"];
const now = new Date();
const minutesFromNow = (minutes) => new Date(now.getTime() + (minutes * 60 * 1000)).toISOString();
const hoursFromNow = (hours) => new Date(now.getTime() + (hours * 60 * 60 * 1000)).toISOString();

const teamDefinitions = [
  { seed: 1, name: "Neon Phantoms", tag: "NEON", region: "eu", colors: ["#0fd9ff", "#006bff"] },
  { seed: 2, name: "Arctic Reign", tag: "ARCT", region: "eu", colors: ["#9ae7ff", "#4457ff"] },
  { seed: 3, name: "Obsidian Core", tag: "OBSD", region: "eu", colors: ["#b36cff", "#34156f"] },
  { seed: 4, name: "Crimson Tide", tag: "CRIM", region: "eu", colors: ["#ff456f", "#8d1538"] },
  { seed: 5, name: "Nova Unit", tag: "NOVA", region: "eu", colors: ["#ffb43c", "#e74b17"] },
  { seed: 6, name: "Voltage", tag: "VOLT", region: "eu", colors: ["#f8ed36", "#36ad69"] },
  { seed: 7, name: "Midnight Club", tag: "MNCL", region: "eu", colors: ["#3de1c2", "#142a68"] },
  { seed: 8, name: "Rogue Sector", tag: "ROGU", region: "eu", colors: ["#ff7c35", "#8f294f"] },
];

const demoPlayerNames = [
  "Atlas", "Nyx", "Reign", "Sway", "Kairo", "Flux", "Raze", "Ghost",
  "Vanta", "Echo", "Nova", "Zen", "Blade", "Frost", "Jinx",
];

const cleanName = (user) => (
  user?.display_name
  || user?.full_name
  || user?.username
  || user?.email?.split("@")[0]
  || "TopFragg Admin"
);

const svgBanner = (label, primary, secondary) => {
  const safeLabel = String(label).replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient><radialGradient id="r"><stop stop-color="#ffffff" stop-opacity=".28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="500" fill="#080d16"/><path d="M0 420L550 40l350 210L1290 0h310v500H0z" fill="url(#g)" opacity=".52"/><circle cx="1250" cy="100" r="430" fill="url(#r)"/><path d="M-40 440L700 10M360 520L1110 20M920 540L1550 130" stroke="#fff" stroke-opacity=".07" stroke-width="3"/><text x="90" y="300" fill="#fff" opacity=".9" font-family="Arial, sans-serif" font-size="74" font-weight="800" letter-spacing="10">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const logicalUpsert = (delegate, id, metadata) => delegate.upsert({
  where: { id },
  update: { metadata },
  create: { id, metadata },
});

async function findDemoOwner() {
  const requestedEmail = process.argv.find((argument) => argument.startsWith("--user="))?.slice(7)
    || process.env.DEMO_USER_EMAIL;

  if (requestedEmail) {
    const requested = await prisma.user.findUnique({ where: { email: requestedEmail } });
    if (!requested) throw new Error(`No user found for ${requestedEmail}.`);
    return requested;
  }

  const admin = await prisma.user.findFirst({
    where: {
      OR: [
        { is_admin: true },
        { role: { in: staffRoles } },
        { admin_role: { in: staffRoles } },
      ],
    },
    orderBy: { created_date: "asc" },
  });
  if (admin) return admin;

  const firstUser = await prisma.user.findFirst({ orderBy: { created_date: "asc" } });
  if (!firstUser) throw new Error("Create or register a user before installing the demo tournament.");
  return firstUser;
}

async function removeDemo() {
  await prisma.notification.deleteMany({ where: { id: DEMO_NOTIFICATION_ID } });
  await prisma.tournamentMatch.deleteMany({ where: { id: { startsWith: DEMO_MATCH_PREFIX } } });
  await prisma.tournamentParticipant.deleteMany({ where: { id: { startsWith: DEMO_PARTICIPANT_PREFIX } } });
  await prisma.teamMember.deleteMany({ where: { id: { startsWith: DEMO_MEMBER_PREFIX } } });
  await prisma.team.deleteMany({ where: { id: { startsWith: DEMO_TEAM_PREFIX } } });
  await prisma.tournament.deleteMany({ where: { id: DEMO_TOURNAMENT_ID } });
  await prisma.user.deleteMany({ where: { id: { startsWith: DEMO_PLAYER_PREFIX } } });
  console.log("TopFragg tournament demo removed.");
}

async function verifyDemo() {
  const [tournament, teams, participants, members, matches] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: DEMO_TOURNAMENT_ID } }),
    prisma.team.count({ where: { id: { startsWith: DEMO_TEAM_PREFIX } } }),
    prisma.tournamentParticipant.count({ where: { id: { startsWith: DEMO_PARTICIPANT_PREFIX } } }),
    prisma.teamMember.count({ where: { id: { startsWith: DEMO_MEMBER_PREFIX } } }),
    prisma.tournamentMatch.findMany({
      where: { id: { startsWith: DEMO_MATCH_PREFIX } },
      orderBy: [{ created_date: "asc" }],
    }),
  ]);
  const matchMetadata = matches.map((match) => match.metadata || {});
  const activeMatches = matchMetadata.filter((match) => ["ready", "in_progress"].includes(match.status));
  const valid = Boolean(
    tournament
    && tournament.metadata?.status === "in_progress"
    && teams === 8
    && participants === 8
    && members === 16
    && matches.length === 7
    && activeMatches.length === 2
  );
  console.log(JSON.stringify({
    success: valid,
    status: tournament?.metadata?.status || "missing",
    teams,
    participants,
    players: members,
    matches: matches.length,
    active_matches: activeMatches.length,
  }, null, 2));
  if (!valid) process.exitCode = 1;
}

async function createDemoPlayers() {
  return Promise.all(demoPlayerNames.map((name, index) => {
    const id = `${DEMO_PLAYER_PREFIX}${String(index + 1).padStart(2, "0")}`;
    const username = `tf_demo_${name.toLowerCase()}`;
    return prisma.user.upsert({
      where: { id },
      update: {
        display_name: name,
        full_name: `${name} Demo`,
        region: "eu",
        email_verified: true,
        wager_wins: 8 + ((index * 3) % 18),
        wager_losses: 2 + ((index * 2) % 9),
        xp_level: 12 + index,
        metadata: {
          activision_id: `${name}TF#${1200000 + index}`,
          country: "NL",
          is_demo_user: true,
          badges: index % 4 === 0 ? [{ type: "verified", label: "Verified" }] : [],
        },
      },
      create: {
        id,
        email: `${username}@demo.topfragg.test`,
        username,
        handle: username,
        display_name: name,
        full_name: `${name} Demo`,
        role: "user",
        is_admin: false,
        email_verified: true,
        credits: 0,
        wallet_balance: 0,
        rank: index < 4 ? "diamond" : index < 10 ? "platinum" : "gold",
        division: String((index % 3) + 1),
        xp_level: 12 + index,
        wager_wins: 8 + ((index * 3) % 18),
        wager_losses: 2 + ((index * 2) % 9),
        region: "eu",
        metadata: {
          activision_id: `${name}TF#${1200000 + index}`,
          country: "NL",
          is_demo_user: true,
          badges: index % 4 === 0 ? [{ type: "verified", label: "Verified" }] : [],
        },
      },
    });
  }));
}

function seriesSetup(teamA, teamB, suffix) {
  const higher = teamA.seed <= teamB.seed ? teamA : teamB;
  const lower = higher.id === teamA.id ? teamB : teamA;
  return {
    best_of: 3,
    game_mode: "BO3 SND / HP / SND",
    tournament_game_mode: "snd_hp_snd",
    map_sequence: [
      { game: 1, game_mode: "snd", mode: "Search and Destroy" },
      { game: 2, game_mode: "hp", mode: "Hardpoint" },
      { game: 3, game_mode: "snd", mode: "Search and Destroy" },
    ],
    map_pool: ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Colossus"],
    maps: [
      { game: 1, game_mode: "snd", mode: "Search and Destroy", map: suffix % 2 ? "Raid" : "Hacienda", host_team_id: higher.id, host_team_name: higher.name, host_seed: higher.seed },
      { game: 2, game_mode: "hp", mode: "Hardpoint", map: suffix % 2 ? "Hacienda" : "Gridlock", host_team_id: lower.id, host_team_name: lower.name, host_seed: lower.seed },
      { game: 3, game_mode: "snd", mode: "Search and Destroy", map: suffix % 2 ? "Gridlock" : "Raid", host_team_id: null, host_team_name: "TBD", host_seed: null },
    ],
    first_host_team_id: higher.id,
    first_host_team_name: higher.name,
    first_host_seed: higher.seed,
    map_generation_key: `demo-bo3-round-${suffix}`,
    map_generated_by: "demo-system",
    map_generated_date: now.toISOString(),
  };
}

const slot = (team, participant) => ({
  id: team?.id || null,
  name: team?.name || null,
  seed: team?.seed || null,
  participant_id: participant?.id || null,
});

async function createDemo() {
  const owner = await findDemoOwner();
  const ownerName = cleanName(owner);
  const demoPlayers = await createDemoPlayers();
  const rosterUsers = [owner, ...demoPlayers];

  const teams = [];
  const participants = [];

  for (let index = 0; index < teamDefinitions.length; index += 1) {
    const definition = teamDefinitions[index];
    const captain = rosterUsers[index * 2];
    const member = rosterUsers[(index * 2) + 1];
    const captainName = cleanName(captain);
    const memberName = cleanName(member);
    const teamId = `${DEMO_TEAM_PREFIX}${definition.seed}`;
    const participantId = `${DEMO_PARTICIPANT_PREFIX}${definition.seed}`;
    const team = {
      ...definition,
      id: teamId,
      captain,
      captainName,
      member,
      memberName,
      banner_url: svgBanner(definition.tag, definition.colors[0], definition.colors[1]),
    };

    await logicalUpsert(prisma.team, teamId, {
      name: definition.name,
      tag: definition.tag,
      logo_url: "",
      banner_url: team.banner_url,
      captain_id: captain.id,
      captain_name: captainName,
      region: definition.region,
      team_type: "tournament",
      roster_size: 2,
      roster_locked: true,
      total_wins: 4 + (8 - definition.seed),
      total_losses: 1 + (definition.seed % 3),
      total_earnings: 0,
      ranking: definition.seed,
      is_active: true,
      is_demo: true,
    });

    await logicalUpsert(prisma.teamMember, `${DEMO_MEMBER_PREFIX}${definition.seed}-captain`, {
      team_id: teamId,
      user_id: captain.id,
      user_name: captainName,
      role: "captain",
      team_type: "tournament",
      joined_date: minutesFromNow(-240),
      is_active: true,
      is_demo: true,
    });
    await logicalUpsert(prisma.teamMember, `${DEMO_MEMBER_PREFIX}${definition.seed}-member`, {
      team_id: teamId,
      user_id: member.id,
      user_name: memberName,
      role: "member",
      team_type: "tournament",
      joined_date: minutesFromNow(-235),
      is_active: true,
      is_demo: true,
    });

    const participant = {
      id: participantId,
      tournament_id: DEMO_TOURNAMENT_ID,
      team_id: teamId,
      team_name: definition.name,
      captain_id: captain.id,
      captain_name: captainName,
      members: [
        { user_id: captain.id, user_name: captainName, role: "captain" },
        { user_id: member.id, user_name: memberName, role: "member" },
      ],
      roster_locked: true,
      payment_mode: "free",
      entry_type: "free",
      entry_fee_paid: 0,
      paid_member_ids: [],
      seed: definition.seed,
      eliminated: false,
      prize_won: 0,
      registered_date: minutesFromNow(-180 + definition.seed),
      is_demo: true,
    };
    await logicalUpsert(prisma.tournamentParticipant, participantId, participant);
    teams.push(team);
    participants.push(participant);
  }

  const tournamentBanner = svgBanner("SUMMER SHOWDOWN", "#16d8ff", "#ff6b23");
  await logicalUpsert(prisma.tournament, DEMO_TOURNAMENT_ID, {
    name: "TopFragg Summer Showdown — Live Demo",
    title: "TopFragg Summer Showdown — Live Demo",
    description: "A live test tournament with eight Duo teams, real rosters, an active bracket and playable match rooms.",
    image_url: tournamentBanner,
    banner_url: tournamentBanner,
    game_mode: "snd_hp_snd",
    game: "Call of Duty",
    region: "eu",
    team_size: "2v2",
    entry_fee: 0,
    entry_type: "free",
    prize_pool: 0,
    prize_distribution: { first: 0, second: 0 },
    max_teams: 8,
    registered_teams: 8,
    format: "single_elimination",
    bracket_type: "single_elimination",
    status: "in_progress",
    rules: "Demo tournament. BO3 matches require a valid 2-0 or 2-1 result. Higher seed hosts map 1, lower seed hosts map 2 and map 3 is agreed in the match room.",
    maps: ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Colossus"],
    map_pools: {
      snd: ["Hacienda", "Gridlock", "Raid", "Scar", "Den"],
      hp: ["Hacienda", "Gridlock", "Raid", "Scar", "Colossus"],
      overload: ["Scar", "Gridlock", "Den", "Exposure"],
    },
    game_modes: ["snd", "hp", "snd"],
    registration_start: minutesFromNow(-360),
    registration_end: minutesFromNow(-45),
    start_date: minutesFromNow(-20),
    started_date: minutesFromNow(-20),
    end_date: hoursFromNow(4),
    created_by: owner.id,
    created_by_name: ownerName,
    invite_only: false,
    is_premium_only: false,
    is_streamer_tournament: false,
    bracket_generated: true,
    bracket_generated_date: minutesFromNow(-20),
    registration_locked: true,
    is_demo: true,
  });

  const teamBySeed = Object.fromEntries(teams.map((team) => [team.seed, team]));
  const participantBySeed = Object.fromEntries(participants.map((participant) => [participant.seed, participant]));
  const qfPairings = [[1, 8], [4, 5], [2, 7], [3, 6]];
  const completedWinners = { 2: 4, 3: 7 };

  for (let index = 0; index < qfPairings.length; index += 1) {
    const matchNumber = index + 1;
    const [seedA, seedB] = qfPairings[index];
    const teamA = teamBySeed[seedA];
    const teamB = teamBySeed[seedB];
    const completedWinnerSeed = completedWinners[matchNumber];
    const completed = Boolean(completedWinnerSeed);
    const winner = completed ? teamBySeed[completedWinnerSeed] : null;
    const active = matchNumber === 1 || matchNumber === 4;
    const matchId = `${DEMO_MATCH_PREFIX}r1-${matchNumber}`;
    const startDeadline = matchNumber === 1 ? minutesFromNow(15) : minutesFromNow(-2);
    const setup = seriesSetup(teamA, teamB, matchNumber);

    await logicalUpsert(prisma.tournamentMatch, matchId, {
      tournament_id: DEMO_TOURNAMENT_ID,
      round: 1,
      bracket: "winner",
      match_number: matchNumber,
      team_a_id: teamA.id,
      team_a_name: teamA.name,
      team_a_seed: seedA,
      team_a_participant_id: participantBySeed[seedA].id,
      team_a_score: completed ? (winner.id === teamA.id ? 2 : 1) : 0,
      team_b_id: teamB.id,
      team_b_name: teamB.name,
      team_b_seed: seedB,
      team_b_participant_id: participantBySeed[seedB].id,
      team_b_score: completed ? (winner.id === teamB.id ? 2 : 1) : 0,
      winner_id: winner?.id || null,
      winner_name: winner?.name || null,
      next_match_id: `${DEMO_MATCH_PREFIX}r2-${matchNumber <= 2 ? 1 : 2}`,
      next_match_round: 2,
      next_match_number: matchNumber <= 2 ? 1 : 2,
      slot_in_next: matchNumber % 2 === 1 ? "team_a" : "team_b",
      is_final: false,
      match_type: "tournament",
      ...setup,
      assigned_date: minutesFromNow(completed ? -16 : -1),
      scheduled_start_date: active ? minutesFromNow(matchNumber === 1 ? 0 : -17) : minutesFromNow(-16),
      start_deadline: active ? startDeadline : minutesFromNow(-1),
      start_window_minutes: 15,
      status: completed ? "completed" : "ready",
      completed,
      completed_date: completed ? minutesFromNow(-8 - matchNumber) : null,
      scores_confirmed: completed,
      confirmed_score_alpha: completed ? (winner.id === teamA.id ? 2 : 1) : null,
      confirmed_score_bravo: completed ? (winner.id === teamB.id ? 2 : 1) : null,
      confirmed_score_date: completed ? minutesFromNow(-8 - matchNumber) : null,
      confirmed_by: completed ? "demo-system" : null,
      confirmed_by_name: completed ? "Demo System" : null,
      is_demo: true,
    });
  }

  await logicalUpsert(prisma.tournamentMatch, `${DEMO_MATCH_PREFIX}r2-1`, {
    tournament_id: DEMO_TOURNAMENT_ID,
    round: 2,
    bracket: "winner",
    match_number: 1,
    team_a_id: null,
    team_a_name: null,
    team_a_seed: null,
    team_a_participant_id: null,
    team_a_source_match_id: `${DEMO_MATCH_PREFIX}r1-1`,
    team_a_score: 0,
    team_b_id: teamBySeed[4].id,
    team_b_name: teamBySeed[4].name,
    team_b_seed: 4,
    team_b_participant_id: participantBySeed[4].id,
    team_b_source_match_id: `${DEMO_MATCH_PREFIX}r1-2`,
    team_b_score: 0,
    next_match_id: `${DEMO_MATCH_PREFIX}r3-1`,
    next_match_round: 3,
    next_match_number: 1,
    slot_in_next: "team_a",
    is_final: false,
    match_type: "tournament",
    best_of: 3,
    game_mode: "BO3 SND / HP / SND",
    tournament_game_mode: "snd_hp_snd",
    status: "pending",
    completed: false,
    start_window_minutes: 15,
    is_demo: true,
  });

  await logicalUpsert(prisma.tournamentMatch, `${DEMO_MATCH_PREFIX}r2-2`, {
    tournament_id: DEMO_TOURNAMENT_ID,
    round: 2,
    bracket: "winner",
    match_number: 2,
    team_a_id: teamBySeed[7].id,
    team_a_name: teamBySeed[7].name,
    team_a_seed: 7,
    team_a_participant_id: participantBySeed[7].id,
    team_a_source_match_id: `${DEMO_MATCH_PREFIX}r1-3`,
    team_a_score: 0,
    team_b_id: null,
    team_b_name: null,
    team_b_seed: null,
    team_b_participant_id: null,
    team_b_source_match_id: `${DEMO_MATCH_PREFIX}r1-4`,
    team_b_score: 0,
    next_match_id: `${DEMO_MATCH_PREFIX}r3-1`,
    next_match_round: 3,
    next_match_number: 1,
    slot_in_next: "team_b",
    is_final: false,
    match_type: "tournament",
    best_of: 3,
    game_mode: "BO3 SND / HP / SND",
    tournament_game_mode: "snd_hp_snd",
    status: "pending",
    completed: false,
    start_window_minutes: 15,
    is_demo: true,
  });

  await logicalUpsert(prisma.tournamentMatch, `${DEMO_MATCH_PREFIX}r3-1`, {
    tournament_id: DEMO_TOURNAMENT_ID,
    round: 3,
    bracket: "grand_final",
    match_number: 1,
    team_a_id: null,
    team_a_name: null,
    team_a_seed: null,
    team_a_participant_id: null,
    team_a_score: 0,
    team_b_id: null,
    team_b_name: null,
    team_b_seed: null,
    team_b_participant_id: null,
    team_b_score: 0,
    is_final: true,
    match_type: "tournament",
    best_of: 3,
    game_mode: "BO3 SND / HP / SND",
    tournament_game_mode: "snd_hp_snd",
    status: "pending",
    completed: false,
    start_window_minutes: 15,
    is_demo: true,
  });

  await logicalUpsert(prisma.notification, DEMO_NOTIFICATION_ID, {
    user_id: owner.id,
    title: "Your demo tournament match is ready",
    message: `${teamBySeed[1].name} vs ${teamBySeed[8].name}. Open the room and test the BO3 score flow before the start timer expires.`,
    type: "tournament",
    read: false,
    action_url: `/tournament-match/${DEMO_MATCH_PREFIX}r1-1`,
    related_entity_id: `${DEMO_MATCH_PREFIX}r1-1`,
    related_entity_type: "TournamentMatch",
    is_demo: true,
  });

  console.log(JSON.stringify({
    success: true,
    owner: `${ownerName} (${owner.email})`,
    tournament: "TopFragg Summer Showdown — Live Demo",
    tournament_id: DEMO_TOURNAMENT_ID,
    teams: teams.length,
    players: rosterUsers.length,
    active_match: `${DEMO_MATCH_PREFIX}r1-1`,
    tournament_url: `/tournaments?tournament=${DEMO_TOURNAMENT_ID}`,
    match_url: `/tournament-match/${DEMO_MATCH_PREFIX}r1-1`,
  }, null, 2));
}

try {
  if (process.argv.includes("--remove")) await removeDemo();
  else if (process.argv.includes("--verify")) await verifyDemo();
  else await createDemo();
} catch (error) {
  console.error("Could not install the tournament demo:", error.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
