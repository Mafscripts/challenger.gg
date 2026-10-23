import { prisma } from "../server/prisma.js";

const ACTIVE_TOURNAMENT_STATUSES = new Set(["open", "registration", "waiting", "available", "in_progress", "started", "live"]);
// Team Captain is staff-assigned. Website team ownership must never turn a
// new Discord member into a community captain automatically.
const MANAGED_ROLES = ["Premium", "Tournament Participant"];
const flat = (row) => ({ ...(row?.metadata || {}), ...row });

const isPremium = (user, now) => {
  if (!user?.is_premium) return false;
  const expiresAt = new Date(user.premium_expires || 0).getTime();
  return !expiresAt || expiresAt > now;
};

const memberUserIds = (participant) => [
  participant?.user_id,
  participant?.captain_id,
  ...(Array.isArray(participant?.members) ? participant.members.map((member) => member?.user_id) : []),
].filter(Boolean).map(String).filter((value, index, values) => values.indexOf(value) === index);

export async function syncManagedDiscordRoles(guild, log = () => {}, { db = prisma } = {}) {
  await guild.roles.fetch();
  const now = Date.now();
  const [users, tournamentRows, participantRows] = await Promise.all([
    db.user.findMany({
      where: { discord_user_id: { not: null } },
      select: { id: true, discord_user_id: true, is_premium: true, premium_expires: true },
    }),
    db.tournament.findMany({ orderBy: { updated_date: "desc" }, take: 200 }),
    db.tournamentParticipant.findMany({ orderBy: { updated_date: "desc" }, take: 500 }),
  ]);

  const activeTournamentIds = new Set(tournamentRows.map(flat)
    .filter((tournament) => ACTIVE_TOURNAMENT_STATUSES.has(String(tournament.status || "open").toLowerCase()))
    .map((tournament) => String(tournament.id)));
  const participantIds = new Set();
  participantRows.map(flat)
    .filter((participant) => activeTournamentIds.has(String(participant.tournament_id || "")))
    .forEach((participant) => memberUserIds(participant).forEach((id) => participantIds.add(id)));

  const roles = new Map(MANAGED_ROLES.map((name) => [
    name,
    guild.roles.cache.find((role) => role.name === name && !role.managed),
  ]));

  for (const user of users) {
    const member = await guild.members.fetch(user.discord_user_id).catch(() => null);
    if (!member) continue;
    const shouldHave = {
      Premium: isPremium(user, now),
      "Tournament Participant": participantIds.has(String(user.id)),
    };
    for (const name of MANAGED_ROLES) {
      const role = roles.get(name);
      if (!role?.editable) continue;
      const hasRole = member.roles.cache.has(role.id);
      if (shouldHave[name] && !hasRole) {
        await member.roles.add(role, `Topfragg automatic ${name} role`).catch(() => null);
        log(`Assigned ${name}: ${member.user.tag}`);
      }
      if (!shouldHave[name] && hasRole) {
        await member.roles.remove(role, `Topfragg automatic ${name} role`).catch(() => null);
        log(`Removed ${name}: ${member.user.tag}`);
      }
    }
  }
}
