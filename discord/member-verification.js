import { MessageFlags } from "discord.js";

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

export async function handleVerificationInteraction(interaction, {
  assign = assignVerifiedPlayerRole,
  timeoutMs = 12_000,
  log = () => {},
} = {}) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let timer;
  try {
    await Promise.race([
      (async () => {
        const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
        return assign(member, { acceptedRules: true, log });
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Verification timed out"), { code: "VERIFICATION_TIMEOUT" })), timeoutMs);
      }),
    ]);
    await interaction.editReply("✅ Rules accepted! You now have Verified Player access. Welcome to Topfragg — find your squad in general!");
  } catch (error) {
    log(`Verification failed for ${interaction.user.id}: ${error.code || "unknown"} ${error.message}`);
    const message = error.code === "VERIFICATION_TIMEOUT"
      ? "⏳ Discord is taking too long to confirm your role. Check whether the channels unlocked; if not, try the verification button again shortly."
      : /membership screening/i.test(error.message)
        ? "📜 Complete Discord’s server rules screening first, then click Accept Rules & Verify again."
        : error.code === 50013 || /Manage Roles|role is missing/i.test(error.message)
          ? "⚠️ I cannot assign Verified Player. Staff need to check that the role exists and that the bot has Manage Roles with its role above Verified Player."
          : "⚠️ Verification could not be confirmed. Please try again shortly or contact staff if this keeps happening.";
    // Editing the deferred response removes Discord's thinking indicator.
    // A follow-up would leave the original response pending indefinitely.
    await interaction.editReply(message);
  } finally {
    clearTimeout(timer);
  }
}
