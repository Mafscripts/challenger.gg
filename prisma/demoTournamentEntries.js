import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_PREFIX = "topfragg-open-demo-";
const now = new Date();
const hoursFromNow = (hours) => new Date(now.getTime() + (hours * 60 * 60 * 1000)).toISOString();

const definitions = [
  { slug: "quickfire", name: "Quickfire Open", hours: 1, prize: 75, teamSize: "1v1", maxTeams: 16, registered: 6, mode: "bo1_snd", entryType: "free", entryFee: 0, colors: ["#7b828c", "#30343a"] },
  { slug: "duo-dash", name: "Duo Dash", hours: 2, prize: 250, teamSize: "2v2", maxTeams: 16, registered: 9, mode: "snd_hp_snd", entryType: "free", entryFee: 0, colors: ["#17c8e8", "#26333a"] },
  { slug: "prime-time", name: "Prime Time S&D", hours: 4, prize: 500, teamSize: "2v2", maxTeams: 32, registered: 18, mode: "snd", entryType: "credits", entryFee: 25, colors: ["#a0a6ad", "#26292e"] },
  { slug: "midnight", name: "Midnight Knockout", hours: 7, prize: 1000, teamSize: "4v4", maxTeams: 16, registered: 11, mode: "bo3_hp_overload_snd", entryType: "credits", entryFee: 50, colors: ["#755c94", "#24212c"] },
  { slug: "community", name: "Community Clash", hours: 22, prize: 750, teamSize: "2v2", maxTeams: 32, registered: 14, mode: "snd_hp_snd", entryType: "free", entryFee: 0, colors: ["#5f7d68", "#232a25"] },
  { slug: "weekend", name: "Weekend Warriors", hours: 30, prize: 1500, teamSize: "4v4", maxTeams: 64, registered: 27, mode: "bo3_hp_overload_snd", entryType: "credits", entryFee: 75, colors: ["#a36f36", "#2d261e"] },
  { slug: "elite", name: "Elite Qualifier", hours: 52, prize: 5000, teamSize: "4v4", maxTeams: 128, registered: 41, mode: "bo5_hp_overload_snd_hp_snd", entryType: "credits", entryFee: 100, colors: ["#b89a4d", "#302b1f"] },
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs><rect width="640" height="360" fill="#101216"/><path d="M0 310 230 40l150 130L560 0h80v360H0z" fill="url(#g)" opacity=".78"/><path d="m-30 330 360-280M170 390 570 25" stroke="#fff" stroke-opacity=".08" stroke-width="3"/><text x="34" y="305" fill="#fff" opacity=".9" font-family="Arial,sans-serif" font-size="34" font-weight="800" letter-spacing="3">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

async function findOwner() {
  return prisma.user.findFirst({
    where: {
      OR: [
        { is_admin: true },
        { role: { in: ["ceo", "super_admin", "admin", "moderator"] } },
        { admin_role: { in: ["ceo", "super_admin", "admin", "moderator"] } },
      ],
    },
    orderBy: { created_date: "asc" },
  }) || prisma.user.findFirst({ orderBy: { created_date: "asc" } });
}

async function install() {
  const owner = await findOwner();
  if (!owner) throw new Error("Create a local user before installing the demo tournament entries.");

  for (const definition of definitions) {
    const startDate = hoursFromNow(definition.hours);
    const metadata = {
      name: definition.name,
      title: definition.name,
      description: "Open demo tournament for testing the compact tournament schedule and bracket selection.",
      image_url: svgBanner(definition.name.toUpperCase(), ...definition.colors),
      banner_url: svgBanner(definition.name.toUpperCase(), ...definition.colors),
      game: "Call of Duty",
      game_mode: definition.mode,
      region: "eu",
      team_size: definition.teamSize,
      entry_type: definition.entryType,
      entry_fee: definition.entryFee,
      prize_pool: definition.prize,
      prize_distribution: { first: Math.round(definition.prize * 0.7), second: Math.round(definition.prize * 0.3) },
      max_teams: definition.maxTeams,
      registered_teams: definition.registered,
      format: "single_elimination",
      bracket_type: "single_elimination",
      status: "open",
      registration_start: hoursFromNow(-2),
      registration_end: new Date(new Date(startDate).getTime() - (30 * 60 * 1000)).toISOString(),
      start_date: startDate,
      end_date: new Date(new Date(startDate).getTime() + (5 * 60 * 60 * 1000)).toISOString(),
      created_by: owner.id,
      created_by_name: cleanName(owner),
      invite_only: false,
      is_premium_only: false,
      is_streamer_tournament: false,
      bracket_generated: false,
      registration_locked: false,
      is_demo: true,
      demo_collection: "open-tournament-list",
    };

    await prisma.tournament.upsert({
      where: { id: `${DEMO_PREFIX}${definition.slug}` },
      update: { metadata },
      create: { id: `${DEMO_PREFIX}${definition.slug}`, metadata },
    });
  }

  console.log(JSON.stringify({ success: true, created: definitions.length, ids: definitions.map(({ slug }) => `${DEMO_PREFIX}${slug}`) }, null, 2));
}

async function remove() {
  const result = await prisma.tournament.deleteMany({ where: { id: { startsWith: DEMO_PREFIX } } });
  console.log(JSON.stringify({ success: true, removed: result.count }, null, 2));
}

async function verify() {
  const rows = await prisma.tournament.findMany({ where: { id: { startsWith: DEMO_PREFIX } } });
  const valid = rows.length === definitions.length && rows.every((row) => row.metadata?.status === "open");
  console.log(JSON.stringify({ success: valid, open_entries: rows.length, prize_pools: rows.map((row) => row.metadata?.prize_pool).sort((a, b) => a - b) }, null, 2));
  if (!valid) process.exitCode = 1;
}

try {
  if (process.argv.includes("--remove")) await remove();
  else if (process.argv.includes("--verify")) await verify();
  else await install();
} catch (error) {
  console.error("Could not install open tournament demos:", error.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
