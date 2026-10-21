import { Prisma } from "@prisma/client";
import { serializeRow } from "./entity.js";
import { isExpiredOpenMatch } from "./matchfinder-expiry.js";
import { xpTeamMatchWhere } from "./lib/xpTeamMatches.js";
import { xpCategoryForSize } from "../src/lib/xpCategories.js";
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const stamp = () => new Date().toISOString();
const name = (user) => user?.display_name || user?.username || user?.full_name || "Player";

export async function activeXPTeamsFor(db, userIds) {
  if (!userIds.length) return [];
  return db.$queryRaw`SELECT t.id, t.metadata FROM "Team" t
    WHERE t.metadata->>'team_type' = 'xp' AND COALESCE(t.metadata->>'is_active', 'true') <> 'false'
      AND (t.metadata->>'captain_id' IN (${Prisma.join(userIds)}) OR EXISTS (SELECT 1 FROM "TeamMember" m
        WHERE m.metadata->>'team_id' = t.id AND COALESCE(m.metadata->>'is_active', 'true') <> 'false'
          AND m.metadata->>'user_id' IN (${Prisma.join(userIds)})))`;
}
export async function assertSingleXPTeam(db, userIds, expectedId) {
  const rows = await activeXPTeamsFor(db, userIds);
  if (rows.some((row) => row.id !== expectedId)) fail("You or a teammate already belong to another XP team. Leave it first, or disband it if you are the captain.");
}
export async function readXPParty(db, teamId, captainId, size, exact = true) {
  const team = serializeRow(await db.team.findUnique({ where: { id: teamId || "" } }));
  if (!team || team.team_type !== "xp" || team.is_active === false) fail("Select an active, dedicated XP team");
  if (team.captain_id !== captainId) fail("Only the XP team captain can enroll this roster");
  const members = (await db.teamMember.findMany({ where: field("team_id", team.id) })).filter((row) => row.metadata.is_active !== false);
  const teamSize = Number(team.roster_size);
  const ids = [...members].sort((a, b) => Number(b.metadata.user_id === captainId) - Number(a.metadata.user_id === captainId)).map((row) => row.metadata.user_id);
  if (![1, 2, 3, 4, 5].includes(teamSize) || (exact ? teamSize !== size : teamSize > size) || members.length !== teamSize || new Set(ids).size !== teamSize || !ids.includes(captainId)) fail(`Select a complete ${exact ? `${size}-player` : "compatible"} XP team. Solo plays 1v1, Duos 2v2, and Teams 3v3 to 5v5.`);
  await assertSingleXPTeam(db, ids, team.id);
  const users = await db.user.findMany({ where: { id: { in: ids } } });
  if (users.length !== ids.length || users.some((user) => user.is_banned || Date.parse(user.metadata?.suspended_until || "") > Date.now())) fail("Every XP team member needs an active account");
  if (users.some((user) => !String(user.activision_id || user.metadata?.activision_id || "").trim())) fail("Every XP team member needs an Activision ID in Settings > Gaming IDs");
  const byId = new Map(users.map((user) => [user.id, user]));
  return { team, size: teamSize, ids, names: ids.map((id) => name(byId.get(id))), users };
}
async function rosterCanChange(tx, teamId) {
  const matches = await tx.xPMatch.findMany({ where: { AND: [xpTeamMatchWhere([teamId]), { NOT: { OR: ["completed", "cancelled", "expired", "closed"].map((status) => field("status", status)) } }] } });
  if (matches.some((row) => !isExpiredOpenMatch(serializeRow(row)))) fail("Finish or cancel your active XP match before changing this roster");
}
async function notice(tx, userId, team, title, message) {
  await tx.notification.create({ data: { metadata: { user_id: userId, title, message, type: "system", is_read: false, action_url: `/teams?team=${encodeURIComponent(team.id)}`, related_entity_id: team.id, related_entity_type: "Team" } } });
}
export async function manageXPTeam(db, actor, input) {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-xp-enrollment'))`;
      const action = String(input.action || "").toLowerCase();
      if (action === "create") {
        await assertSingleXPTeam(tx, [actor.id], "");
        const size = Number(input.roster_size || 1), title = String(input.name || "").trim().slice(0, 40), tag = String(input.tag || "").trim().toUpperCase().slice(0, 6);
        if (!title || !tag || ![1, 2, 3, 4, 5].includes(size)) fail("Choose a team name, tag and roster size from 1 to 5");
        const team = serializeRow(await tx.team.create({ data: { metadata: { name: title, tag, captain_id: actor.id, captain_name: name(actor), region: input.region || actor.region || "na", team_type: "xp", roster_size: size,
          xp_category: xpCategoryForSize(size), banner_url: input.banner_url || "", is_active: true, total_wins: 0, total_losses: 0, total_earnings: 0, ranking: 0, roster_locked: false, created_date: stamp() } } }));
        const member = serializeRow(await tx.teamMember.create({ data: { metadata: { team_id: team.id, team_type: "xp", user_id: actor.id, user_name: name(actor), role: "captain", is_active: true, joined_date: stamp() } } }));
        return { success: true, team, member };
      }
      const rawTeam = await tx.team.findUnique({ where: { id: input.team_id || "" } });
      const team = serializeRow(rawTeam);
      if (!team || team.team_type !== "xp" || team.is_active === false) fail("XP team is no longer active");
      if (action === "respond_invite") {
        const invite = await tx.teamInvite.findUnique({ where: { id: input.invite_id || "" } });
        if (!invite || invite.metadata.team_id !== team.id || invite.metadata.invited_user_id !== actor.id || invite.metadata.status !== "pending") fail("Invite is no longer available");
        const accepted = input.decision === "accept";
        let member;
        if (accepted) {
          await rosterCanChange(tx, team.id);
          await assertSingleXPTeam(tx, [actor.id], team.id);
          const rows = await tx.teamMember.findMany({ where: field("team_id", team.id) });
          const active = rows.filter((row) => row.metadata.is_active !== false);
          if (!active.some((row) => row.metadata.user_id === actor.id) && active.length >= Number(team.roster_size)) fail("XP team roster is full");
          const old = rows.find((row) => row.metadata.user_id === actor.id);
          const metadata = { ...old?.metadata, team_id: team.id, team_type: "xp", user_id: actor.id, user_name: name(actor), role: "member", is_active: true, joined_date: stamp() };
          member = serializeRow(old ? await tx.teamMember.update({ where: { id: old.id }, data: { metadata } }) : await tx.teamMember.create({ data: { metadata } }));
          await notice(tx, team.captain_id, team, "Invite accepted", `${name(actor)} joined ${team.name}.`);
        }
        return { success: true, member, invite: serializeRow(await tx.teamInvite.update({ where: { id: invite.id }, data: { metadata: { ...invite.metadata, status: accepted ? "accepted" : "declined", responded_date: stamp() } } })) };
      }
      await rosterCanChange(tx, team.id);
      const captain = team.captain_id === actor.id;
      if ((action === "kick" || action === "disband") && !captain) fail("Only the captain can manage this XP roster");
      if (action === "leave" && captain) fail("As captain, disband your XP team before switching to another team");
      const members = await tx.teamMember.findMany({ where: field("team_id", team.id) });
      const active = members.filter((row) => row.metadata.is_active !== false);
      const affected = action === "disband" ? active : action === "leave" ? active.filter((row) => row.metadata.user_id === actor.id) : active.filter((row) => row.id === input.member_id && row.metadata.user_id !== team.captain_id);
      if (!affected.length && action !== "disband") fail("Active team member not found");
      for (const row of affected) {
        await tx.teamMember.update({ where: { id: row.id }, data: { metadata: { ...row.metadata, is_active: false, left_date: stamp(), removed_by: actor.id } } });
        if (row.metadata.user_id !== actor.id) await notice(tx, row.metadata.user_id, team, action === "disband" ? "Team disbanded" : "Removed from team", action === "disband" ? `${team.name} was disbanded.` : `You were removed from ${team.name}.`);
      }
      let updated = team;
      if (action === "disband") {
        updated = serializeRow(await tx.team.update({ where: { id: team.id }, data: { metadata: { ...rawTeam.metadata, is_active: false, disbanded_date: stamp(), disbanded_by: actor.id } } }));
        await tx.$executeRaw`UPDATE "TeamInvite" SET metadata = metadata || jsonb_build_object('status', 'cancelled', 'responded_date', ${stamp()}::text) WHERE metadata->>'team_id' = ${team.id} AND metadata->>'status' = 'pending'`;
      }
      return { success: true, team: updated };
    }, { timeout: 15000, maxWait: 15000 });
  } catch (error) { if (error.status === 400) return { success: false, error: error.message }; throw error; }
}
