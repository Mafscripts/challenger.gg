export const VERIFIED_PLAYER_ROLE_NAME = "Verified Player";

function findVerifiedRole(guild) {
  const role = guild.roles.cache.find((item) => item.name === VERIFIED_PLAYER_ROLE_NAME && !item.managed);
  if (!role) throw new Error("The Verified Player role is missing. Run the Topfragg Discord setup.");
  if (!role.editable) throw new Error("Topfragg needs Manage Roles and a bot role above Verified Player.");
  return role;
}

// Server membership grants this community role; website linking is optional.
export async function assignVerifiedPlayerRole(member, { role, log = () => {} } = {}) {
  if (member.user.bot) return false;
  if (!role) {
    await member.guild.roles.fetch();
    role = findVerifiedRole(member.guild);
  }
  if (member.roles.cache.has(role.id)) return false;
  await member.roles.add(role, "Topfragg automatic verification on server membership");
  log(`Assigned Verified Player: ${member.id}`);
  return true;
}

// Recover joins missed while offline and retry unsuccessful assignments.
export async function syncVerifiedPlayerRoles(guild, { log = () => {} } = {}) {
  await guild.roles.fetch();
  const role = findVerifiedRole(guild);
  let after;
  let assigned = 0;
  let failed = 0;
  do {
    const members = await guild.members.list({ limit: 1000, ...(after ? { after } : {}) });
    for (const member of members.values()) {
      try {
        if (await assignVerifiedPlayerRole(member, { role, log })) assigned++;
      } catch (error) {
        failed++;
        log(`Verified Player assignment failed for ${member.id}: ${error.message}`);
      }
    }
    if (members.size < 1000) break;
    const next = [...members.keys()].reduce((max, id) => BigInt(id) > BigInt(max) ? id : max);
    if (after && BigInt(next) <= BigInt(after)) throw new Error("Discord member pagination did not advance.");
    after = next;
  } while (after);
  return { assigned, failed };
}
