export const VERIFIED_PLAYER_ROLE_NAME = "Verified Player";

function findVerifiedRole(guild) {
  const role = guild.roles.cache.find((item) => item.name === VERIFIED_PLAYER_ROLE_NAME && !item.managed);
  if (!role) throw new Error("The Verified Player role is missing. Run the Topfragg Discord setup.");
  if (!role.editable) throw new Error("Topfragg needs Manage Roles and a bot role above Verified Player.");
  return role;
}

// Only an explicit rules-acceptance interaction may grant community access.
export async function assignVerifiedPlayerRole(member, { role, acceptedRules = false, log = () => {} } = {}) {
  if (!acceptedRules) throw new Error("Accept the community rules using the verification button first.");
  if (member.pending) throw new Error("Complete Discord's membership screening before verifying.");
  if (member.user.bot) return false;
  if (!role) {
    await member.guild.roles.fetch();
    role = findVerifiedRole(member.guild);
  }
  if (member.roles.cache.has(role.id)) return false;
  await member.roles.add(role, "Topfragg community rules accepted via verification button");
  log(`Assigned Verified Player: ${member.id}`);
  return true;
}

// Retained for compatibility: never infer verification from server membership.
export async function syncVerifiedPlayerRoles() {
  return { assigned: 0, failed: 0 };
}
