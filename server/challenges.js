import { playerAvatarFor } from "./lib/playerAvatars.js";
import { consoleRestrictedFor } from "../src/lib/playerRestrictions.js";
import { prisma } from "./prisma.js";
import { hasRole } from "./roles.js";
import { hasDiscordLink, freeEightsDiscordMembershipJoinError } from "./free-eights-discord.js";
import { challengeVoiceKey, challengeVoiceStatus } from "./challenge-discord.js";
import { loadEightsGames } from "./free-eights-games.js";
import { generateEightsSeries } from "../src/lib/freeEightsGames.js";
import { CHALLENGE_ACTIVE, challengeRoomPath, challengeXpChange } from "../src/lib/challengeRanks.js";
import { containsBlockedLanguage } from "./profanity-filter.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const nameFor = (user) => user.display_name || user.username || user.full_name || "Player";
const flat = (row) => ({ ...row.metadata, id: row.id, status: row.status, created_date: row.created_date.toISOString(), updated_date: row.updated_date.toISOString() });
const member = (match, id) => match.players.some((player) => player.user_id === id);
const staff = (req) => hasRole(req.user, "moderator");
const admin = (req) => hasRole(req.user, "admin");
const roomNotice = (match, title, message) => ({ type: "match", title, message, action_url: challengeRoomPath(match.id), related_entity_type: "ChallengeMatch", related_entity_id: match.id, is_read: false });
const notify = (tx, ids, notice) => tx.notification.createMany({ data: [...new Set(ids)].map((user_id) => ({ metadata: { ...notice, user_id } })) });
const update = (tx, match) => tx.challengeMatch.update({ where: { id: match.id }, data: { status: match.status, metadata: Object.fromEntries(Object.entries(match).filter(([key]) => !["id", "created_date", "updated_date", "status"].includes(key))) } });
const eligibility = (user) => {
  if (!user || user.is_banned || !user.email_verified) fail("Every player needs a verified, active account");
  if (!String(user.metadata?.activision_id || user.activision_id || "").trim()) fail(`${nameFor(user)} needs an Activision ID in Settings`);
  if (!hasDiscordLink(user)) fail(`${nameFor(user)} must connect Discord in Settings`);
};
async function roster(tx, teamId, captainId) {
  const team = await tx.team.findUnique({ where: { id: teamId } });
  if (!team || team.metadata.is_active === false || team.metadata.team_type !== "challenge") fail("Choose a Challenge a Team roster");
  if (team.metadata.captain_id !== captainId) fail("Only the team captain can post or accept for a team", 403);
  const size = Number(team.metadata.roster_size);
  if (![1, 2, 3, 4].includes(size)) fail("Choose a Solo, Duo, Trio or Squad roster");
  const members = (await tx.teamMember.findMany({ where: field("team_id", teamId) })).filter((row) => row.metadata.is_active !== false);
  const ids = members.map((row) => row.metadata.user_id);
  if (ids.length !== size || new Set(ids).size !== size || !ids.includes(captainId)) fail(`This roster needs exactly ${size} active player${size === 1 ? "" : "s"}`);
  const users = await tx.user.findMany({ where: { id: { in: ids } } });
  if (users.length !== size) fail("A roster member is unavailable");
  users.forEach(eligibility);
  return { team: { ...team.metadata, id: team.id }, users, size };
}
async function available(tx, ids, exclude = "") {
  for (const id of [...ids].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`voice-membership:${id}`}))`;
  const matches = await tx.challengeMatch.findMany({ where: { status: { in: CHALLENGE_ACTIVE } } });
  if (matches.some((row) => row.id !== exclude && row.metadata.players.some((player) => ids.includes(player.user_id)))) fail("A player already has an active Challenge a Team match", 409);
  // A player cannot be moved by two voice-enabled modes at the same time.
  const memberships = await tx.wagerParticipant.findMany({ where: { OR: ids.map((id) => field("user_id", id)) } });
  const wagers = await tx.wager.findMany({ where: { OR: [
    { id: { in: memberships.map((row) => row.metadata.wager_id).filter(Boolean) } }, ...ids.map((id) => field("host_id", id)),
  ] } });
  if (wagers.some((row) => row.metadata.match_type === "8s" && !["completed", "cancelled", "expired", "closed"].includes(row.metadata.status))) fail("Finish your Free 8s match before joining Challenge a Team", 409);
}
const playerFor = (user, side, teamId, captain) => ({ user_id: user.id, user_name: nameFor(user), username: user.username || user.id,
  avatar_url: playerAvatarFor(user), activision_id: user.metadata?.activision_id || user.activision_id,
  side, team_id: teamId || "", captain: user.id === captain });
async function standing(tx, kind, id, name) {
  return tx.challengeStanding.upsert({ where: { kind_subject_id: { kind, subject_id: id } },
    create: { kind, subject_id: id, name }, update: { name } });
}
async function startRatings(tx, match) {
  const entities = [];
  for (const side of ["alpha", "bravo"]) {
    const team = match[`${side}_team`];
    if (team) entities.push({ ...(await standing(tx, "team", team.id, team.name)), side });
    // A one-person roster is also a solo performance. Keep its personal ladder
    // in addition to the roster record, without counting it twice in team strength.
    for (const player of match.players.filter((row) => row.side === side && (!row.team_id || match.size === 1))) entities.push({ ...(await standing(tx, "solo", player.user_id, player.user_name)), side, supplementary: Boolean(player.team_id) });
  }
  return entities.map(({ id, kind, subject_id, name, xp, side, supplementary = false }) => ({ id, kind, subject_id, name, xp, side, supplementary }));
}
async function settle(tx, match, score, actor, reason) {
  if (match.status === "completed") return match;
  if (!["in_progress", "awaiting_confirmation", "disputed"].includes(match.status)) fail("Start the match before reporting a result", 409);
  const winner = score.alpha > score.bravo ? "alpha" : "bravo";
  const ratings = match.ratings || [];
  if (!ratings.length) fail("The match has no locked XP snapshot", 409);
  const average = (side) => { const rows = ratings.filter((row) => row.side === side && !row.supplementary); return rows.reduce((sum, row) => sum + row.xp, 0) / rows.length; };
  const changes = [];
  for (const rating of ratings) {
    const current = await tx.challengeStanding.findUnique({ where: { id: rating.id } });
    if (!current) fail("Standing missing; ask an admin to review", 409);
    const won = rating.side === winner;
    const delta = Math.max(-current.xp, challengeXpChange(rating.xp, average(rating.side === "alpha" ? "bravo" : "alpha"), won));
    await tx.challengeStanding.update({ where: { id: rating.id }, data: { xp: { increment: delta }, wins: { increment: won ? 1 : 0 }, losses: { increment: won ? 0 : 1 } } });
    changes.push({ ...rating, delta, won, new_xp: current.xp + delta });
  }
  Object.assign(match, { status: "completed", score, winner, xp_changes: changes, completed_at: new Date().toISOString(), completed_by: actor });
  await update(tx, match);
  await tx.adminAction.create({ data: { metadata: { action_type: "challenge_result", match_id: match.id, actor, reason, score, xp_changes: changes } } });
  await notify(tx, match.players.map((row) => row.user_id), roomNotice(match, "Challenge result confirmed", `${match.alpha_team.name} ${score.alpha}–${score.bravo} ${match.bravo_team?.name || "Solo challengers"}. XP standings updated.`));
  return match;
}
function scoreFor(body, match) {
  const alpha = Number(body.alpha), bravo = Number(body.bravo);
  const target = Math.floor(match.best_of / 2) + 1;
  if (![alpha, bravo].every(Number.isInteger) || Math.max(alpha, bravo) !== target || Math.min(alpha, bravo) < 0 || Math.min(alpha, bravo) >= target) fail(`Enter a completed BO${match.best_of} series score (first to ${target})`);
  return { alpha, bravo };
}
function visible(match, viewer, voice) {
  const access = member(match, viewer.id) || hasRole(viewer, "moderator");
  const { messages, reports, ...publicMatch } = match;
  return { ...publicMatch, messages: access ? messages || [] : [], reports: access ? reports || {} : {}, voice: access ? voice : null, can_manage: hasRole(viewer, "moderator"), can_admin: hasRole(viewer, "admin"), is_member: access && member(match, viewer.id) };
}

export function createChallengeHandlers({ db = prisma, checkMembership = async (user) => {
  const error = await freeEightsDiscordMembershipJoinError("8s", user);
  if (error) fail(error.error, 403);
} } = {}) {
  async function overview(req) {
    const playerFilter = { metadata: { path: ["players"], array_contains: [{ user_id: req.user.id }] } };
    const [openRows, ownRows, teams, members, games] = await Promise.all([
      db.challengeMatch.findMany({ where: { status: { in: staff(req) ? CHALLENGE_ACTIVE : ["open"] } }, orderBy: { created_date: "desc" }, take: 100 }),
      db.challengeMatch.findMany({ where: staff(req) ? {} : playerFilter, orderBy: { created_date: "desc" }, take: 100 }),
      db.team.findMany({ where: field("team_type", "challenge") }),
      db.teamMember.findMany({ where: field("user_id", req.user.id) }),
      loadEightsGames(db),
    ]);
    const own = new Set(members.filter((row) => row.metadata.is_active !== false).map((row) => row.metadata.team_id));
    const orderBy = [{ xp: "desc" }, { wins: "desc" }, { subject_id: "asc" }];
    const [teamStandings, soloStandings, myStandings] = await Promise.all([
      db.challengeStanding.findMany({ where: { kind: "team" }, orderBy, take: 100 }),
      db.challengeStanding.findMany({ where: { kind: "solo" }, orderBy, take: 100 }),
      db.challengeStanding.findMany({ where: { OR: [{ kind: "solo", subject_id: req.user.id }, { kind: "team", subject_id: { in: [...own] } }] } }),
    ]);
    const rows = [...new Map([...openRows, ...ownRows].map((row) => [row.id, row])).values()].sort((a, b) => b.created_date - a.created_date);
    const ids = [...new Set(rows.flatMap((row) => [row.metadata.alpha_team?.id, row.metadata.bravo_team?.id]).filter(Boolean))];
    const listedRatings = await db.challengeStanding.findMany({ where: { kind: "team", subject_id: { in: ids } } });
    const teamXp = new Map(listedRatings.map((row) => [row.subject_id, row.xp]));
    return { success: true, matches: rows.map(flat).filter((match) => match.status === "open" || member(match, req.user.id) || staff(req)).map((match) => ({ ...visible(match, req.user, null), alpha_xp: teamXp.get(match.alpha_team.id) || 0, bravo_xp: teamXp.get(match.bravo_team?.id) || 0 })),
      teams: teams.filter((row) => own.has(row.id) && row.metadata.is_active !== false).map((row) => ({ ...row.metadata, id: row.id })),
      standings: { teams: teamStandings, solos: soloStandings }, my_standings: myStandings, games, voice_enabled: challengeVoiceStatus({ players: [], status: "open" }, null).enabled };
  }
  async function room(req) {
    const row = await db.challengeMatch.findUnique({ where: { id: String(req.body.match_id || "") } });
    if (!row) fail("Challenge not found", 404);
    const match = flat(row);
    const ids = match.players.map((player) => player.user_id);
    const teamIds = [match.alpha_team?.id, match.bravo_team?.id].filter(Boolean);
    const [state, users, standings] = await Promise.all([
      db.discordEventDispatch.findUnique({ where: { event_key: challengeVoiceKey(match.id) } }),
      db.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true, admin_role: true, is_admin: true, metadata: true, is_premium: true, premium_expires: true, discord_username: true } }),
      db.challengeStanding.findMany({ where: { OR: [{ kind: "solo", subject_id: { in: ids } }, { kind: "team", subject_id: { in: teamIds } }] } }),
    ]);
    // Match tables receive public presentation fields only, never account details.
    const profiles = new Map(users.map((user) => [user.id, {
      ...Object.fromEntries(["avatar_url", "display_name_color", "badges", "verified_player", "is_verified_player", "streamer_badge", "is_streamer", "force_stream_required", "monitor_cam_required", "twitter", "twitch", "youtube", "website"].filter((key) => user.metadata?.[key] !== undefined).map((key) => [key, user.metadata[key]])),
      avatar_url: playerAvatarFor(user), console_restricted: consoleRestrictedFor(user), role: user.role, admin_role: user.admin_role, is_admin: user.is_admin, is_premium: user.is_premium, premium_expires: user.premium_expires, discord_username: user.discord_username,
    }]));
    match.players = match.players.map((player) => ({ ...player, ...profiles.get(player.user_id) }));
    match.standings = standings.map(({ kind, subject_id, xp, wins, losses }) => ({ kind, subject_id, xp, wins, losses }));
    return { success: true, match: visible(match, req.user, challengeVoiceStatus(match, state?.metadata)) };
  }
  async function mutate(req) {
    const action = String(req.body.action || "");
    if (Number(req.body.amount || req.body.stake || req.body.entry_fee || 0) !== 0) fail("Money stakes are disabled for Challenge a Team");
    let approvedUsers = [];
    if (["create", "join"].includes(action)) {
      if (action === "create" || req.body.join_as === "team") approvedUsers = (await roster(db, String(req.body.team_id || ""), req.user.id)).users;
      else { const user = await db.user.findUnique({ where: { id: req.user.id } }); eligibility(user); approvedUsers = [user]; }
      await Promise.all(approvedUsers.map(checkMembership));
    }
    const games = action === "create" ? await loadEightsGames(db) : null;
    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-challenge-ladder'))`;
      const approved = new Map(approvedUsers.map((user) => [user.id, user.discord_user_id]));
      const checkApproved = (users) => { if (users.some((user) => approved.get(user.id) !== user.discord_user_id)) fail("Your roster or Discord link changed. Try again.", 409); };
      if (action === "create") {
        const { team, users, size } = await roster(tx, String(req.body.team_id || ""), req.user.id);
        checkApproved(users); await available(tx, users.map((user) => user.id));
        const game = games.find((row) => row.id === req.body.game_id && row.enabled);
        const format = game?.formats.find((row) => row.id === req.body.format_id);
        if (!game || !format) fail("Choose an available game and series format");
        const row = await tx.challengeMatch.create({ data: { status: "open", metadata: {
          host_id: req.user.id, size, best_of: format.modes.length, game_id: game.id, game_name: `${game.name} ${game.number}`, game_config: game,
          series_mode_ids: format.modes, format_name: format.name, alpha_team: { id: team.id, name: team.name, captain_id: req.user.id }, bravo_team: null,
          players: users.map((user) => playerFor(user, "alpha", team.id, req.user.id)), reports: {}, messages: [], stakes_enabled: false,
        } } });
        const match = flat(row);
        await notify(tx, [req.user.id], roomNotice(match, "Challenge posted", `Your ${size}v${size} challenge is open. Teams and solo players can accept.`));
        return { success: true, match };
      }
      const row = await tx.challengeMatch.findUnique({ where: { id: String(req.body.match_id || "") } });
      if (!row) fail("Challenge not found", 404);
      const match = flat(row);
      const me = match.players.find((player) => player.user_id === req.user.id);
      if (action === "join") {
        if (me) return { success: true, match, already_joined: true };
        if (match.status !== "open") fail("This challenge is no longer open", 409);
        const opposition = match.players.filter((player) => player.side === "bravo");
        let users, team = null;
        if (req.body.join_as === "team") {
          const selected = await roster(tx, String(req.body.team_id || ""), req.user.id);
          if (selected.size !== match.size) fail(`Choose a complete ${match.size}-player roster`);
          if (opposition.length) fail("Solo players have already joined this side", 409);
          users = selected.users; team = selected.team;
          if (team.id === match.alpha_team.id) fail("You cannot challenge your own team");
        } else if (req.body.join_as === "solo") {
          if (match.bravo_team || opposition.length >= match.size) fail("The opposing side is full", 409);
          const user = await tx.user.findUnique({ where: { id: req.user.id } }); eligibility(user); users = [user];
        } else fail("Choose Join as solo or Join as team");
        checkApproved(users);
        if (users.some((user) => member(match, user.id))) fail("A selected player is already in this match", 409);
        await available(tx, users.map((user) => user.id), match.id);
        match.players.push(...users.map((user) => playerFor(user, "bravo", team?.id, team ? req.user.id : opposition.length ? "" : req.user.id)));
        if (team) match.bravo_team = { id: team.id, name: team.name, captain_id: req.user.id };
        if (match.players.length === match.size * 2) match.status = "ready_check";
        await update(tx, match);
        await notify(tx, [match.host_id], roomNotice(match, "Challenge accepted", `${team?.name || nameFor(req.user)} joined your challenge.`));
      } else if (action === "leave") {
        if (!me || me.team_id) fail("Only solo challengers can leave. Team captains can cancel an open lobby.", 403);
        if (!["open", "ready_check"].includes(match.status)) fail("The roster is locked", 409);
        match.players = match.players.filter((player) => player.user_id !== req.user.id);
        const solos = match.players.filter((player) => player.side === "bravo");
        if (!solos.some((player) => player.captain) && solos[0]) solos[0].captain = true;
        match.status = "open"; await update(tx, match);
      } else if (action === "start") {
        if (!me?.captain && !staff(req)) fail("Only a captain or staff can start", 403);
        if (match.status !== "ready_check") fail("Both sides must be full", 409);
        const users = await tx.user.findMany({ where: { id: { in: match.players.map((player) => player.user_id) } } });
        if (users.length !== match.size * 2) fail("A player is unavailable"); users.forEach(eligibility);
        for (const side of ["alpha", "bravo"]) if (match[`${side}_team`]) {
          const team = match[`${side}_team`]; const current = await roster(tx, team.id, team.captain_id);
          if (current.users.map((user) => user.id).sort().join() !== match.players.filter((player) => player.side === side).map((player) => player.user_id).sort().join()) fail("A team roster changed. Cancel and repost this challenge.", 409);
        }
        const state = await tx.discordEventDispatch.findUnique({ where: { event_key: challengeVoiceKey(match.id) } });
        const voice = challengeVoiceStatus(match, state?.metadata);
        if (!voice.enabled || !voice.configured || !voice.fresh || voice.players.some((player) => player.status !== "in_waiting_room")) fail("Every player must join this lobby’s Discord waiting room before starting", 409);
        match.ratings = await startRatings(tx, match); match.series_maps = generateEightsSeries(match);
        match.status = "in_progress"; match.started_at = new Date().toISOString(); await update(tx, match);
        await notify(tx, match.players.map((player) => player.user_id), roomNotice(match, "Challenge started", "Your maps are ready. Discord is moving each side into its own voice channel."));
      } else if (action === "report" || action === "resolve") {
        if (action === "resolve" ? !staff(req) : !me?.captain) fail("Only captains can report; staff can resolve disputes", 403);
        if (!["in_progress", "awaiting_confirmation", "disputed", "completed"].includes(match.status)) fail("This match is not awaiting a result", 409);
        if (match.status === "completed") return { success: true, match };
        const score = scoreFor(req.body, match);
        if (action === "resolve") { const reason = String(req.body.reason || "").trim(); if (reason.length < 5) fail("Give a reason for the staff decision"); await settle(tx, match, score, req.user.id, reason); }
        else {
          if (match.status === "disputed") fail("Staff must resolve this score conflict", 409);
          match.reports[me.side] = { ...score, by: req.user.id };
          const a = match.reports.alpha, b = match.reports.bravo;
          if (a && b && a.alpha === b.alpha && a.bravo === b.bravo) await settle(tx, match, score, req.user.id, "Both captains agreed");
          else { match.status = a && b ? "disputed" : "awaiting_confirmation"; await update(tx, match);
            await notify(tx, match.players.filter((player) => player.captain && player.side !== me.side).map((player) => player.user_id), roomNotice(match, match.status === "disputed" ? "Challenge score disputed" : "Confirm challenge result", `Reported score: ${score.alpha}–${score.bravo}. Open the room to review.`)); }
          if (match.status === "disputed") {
            const staffUsers = await tx.user.findMany({ where: { OR: [{ role: { in: ["moderator", "admin", "super_admin", "ceo"] } }, { admin_role: { in: ["moderator", "admin", "super_admin", "ceo"] } }] } });
            await notify(tx, staffUsers.filter((user) => !user.is_banned).map((user) => user.id), roomNotice(match, "Challenge dispute needs review", `${match.alpha_team.name} and ${match.bravo_team?.name || "Solo challengers"} reported different scores.`));
          }
        }
      } else if (action === "cancel") {
        const captain = me?.captain && ["open", "ready_check"].includes(match.status);
        if (!captain && !staff(req)) fail("Only a captain can cancel an open lobby; contact staff after starting", 403);
        if (["completed", "cancelled"].includes(match.status)) fail("This match is already closed", 409);
        const reason = String(req.body.reason || "").trim(); if (reason.length < 5) fail("Give a cancellation reason");
        match.status = "cancelled"; match.cancel_reason = reason; await update(tx, match);
        await tx.adminAction.create({ data: { metadata: { action_type: "challenge_cancel", match_id: match.id, actor: req.user.id, reason } } });
        await notify(tx, match.players.map((player) => player.user_id), roomNotice(match, "Challenge cancelled", reason));
      } else if (action === "revert") {
        if (!admin(req)) fail("Admin access required to revert XP", 403);
        if (match.status !== "completed" || !match.xp_changes?.length) fail("No completed result to revert", 409);
        const reason = String(req.body.reason || "").trim(); if (reason.length < 5) fail("Give a revert reason");
        // Protect later rating history: correct this result before any affected
        // standing has been used in a newer match, including an active match.
        const others = await tx.challengeMatch.findMany({ where: { id: { not: match.id } } });
        const affected = new Set(match.xp_changes.map((change) => change.id));
        if (others.some((other) => other.metadata.started_at > match.started_at && other.status !== "cancelled" && other.metadata.ratings?.some((rating) => affected.has(rating.id)))) fail("A newer match uses this result. Revert those results first.", 409);
        for (const change of match.xp_changes) {
          const current = await tx.challengeStanding.findUnique({ where: { id: change.id } });
          if (!current || current.xp - change.delta < 0 || current.wins < (change.won ? 1 : 0) || current.losses < (change.won ? 0 : 1)) fail("Standing changed; review this result before reverting", 409);
          await tx.challengeStanding.update({ where: { id: change.id }, data: { xp: { decrement: change.delta }, wins: { decrement: change.won ? 1 : 0 }, losses: { decrement: change.won ? 0 : 1 } } });
        }
        await tx.adminAction.create({ data: { metadata: { action_type: "challenge_revert", match_id: match.id, actor: req.user.id, reason, score: match.score, changes: match.xp_changes } } });
        match.status = "disputed"; match.xp_changes = []; match.score = null; match.winner = null; match.reports = {}; match.completed_at = null; match.voice_retired = true; await update(tx, match);
        await notify(tx, match.players.map((player) => player.user_id), roomNotice(match, "Challenge result reverted", "An admin reversed the result and XP. Staff will correct the score."));
      } else if (action === "kick") {
        if (!staff(req)) fail("Staff access required", 403);
        if (!["open", "ready_check"].includes(match.status)) fail("Only open rosters can be edited", 409);
        const target = match.players.find((player) => player.user_id === req.body.user_id);
        if (!target || target.team_id) fail("Remove solo challengers only; cancel a match to replace a full team");
        match.players = match.players.filter((player) => player !== target);
        const side = match.players.filter((player) => player.side === "bravo"); if (side[0] && !side.some((player) => player.captain)) side[0].captain = true;
        match.status = "open"; await update(tx, match);
        await tx.adminAction.create({ data: { metadata: { action_type: "challenge_kick", match_id: match.id, actor: req.user.id, target_user_id: target.user_id } } });
      } else if (action === "chat") {
        if (!me && !staff(req)) fail("Only players and staff can use room chat", 403);
        if (["completed", "cancelled"].includes(match.status)) fail("Room chat is closed", 409);
        const text = String(req.body.message || "").trim(); if (!text || text.length > 1000 || containsBlockedLanguage(text)) fail("Enter an appropriate message (up to 1000 characters)");
        const last = (match.messages || []).findLast((message) => message.user_id === req.user.id);
        if (last && Date.now() - Date.parse(last.at) < 1500) fail("Please slow down", 429);
        match.messages = [...(match.messages || []), { id: crypto.randomUUID(), user_id: req.user.id, user_name: nameFor(req.user), staff: staff(req), sender_role: ["ceo", "super_admin", "admin", "moderator"].find((role) => hasRole(req.user, role)) || "user", sender_avatar_url: req.user.avatar_url || "", text, at: new Date().toISOString() }].slice(-100); await update(tx, match);
      } else fail("Unknown Challenge a Team action");
      return { success: true, match };
    }, { timeout: 20000, maxWait: 10000 });
  }
  async function activity(req) {
    const userId = String(req.body.user_id || req.user.id);
    const own = userId === req.user.id;
    const rows = await db.challengeMatch.findMany({ where: { ...(!own ? { status: "completed" } : {}), metadata: { path: ["players"], array_contains: [{ user_id: userId }] } }, orderBy: { created_date: "desc" }, take: 100 });
    return { success: true, matches: rows.map(flat).filter((match) => member(match, userId) && (own || match.status === "completed")).map((match) => {
      const side = match.players.find((player) => player.user_id === userId).side;
      return { id: match.id, match_type: "challenge", entity_type: "challenge", activity_source: "challenge", status: match.status, created_date: match.created_date, completed_date: match.completed_at,
        host_id: match.host_id, host_name: match.alpha_team.name, challenger_name: match.bravo_team?.name || "Solo challengers", team_size: `${match.size}v${match.size}`, game_mode_display: match.format_name,
        profile_side: side, profile_result: match.status === "completed" ? match.winner === side ? "win" : "loss" : "pending",
        team_alpha_score: match.score?.alpha, team_bravo_score: match.score?.bravo };
    }) };
  }
  return { getChallengeOverview: overview, getChallengeRoom: room, getChallengeActivity: activity, challengeAction: mutate };
}
export const challengeHandlers = createChallengeHandlers();
