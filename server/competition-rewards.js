import { randomInt, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { validateRewardTemplate, rewardEffect, rewardSeason, REWARD_MODES } from "../src/lib/competitionRewards.js";
import { buildRewardSeasonStandings, loadRewardLedger } from "./competition-reward-ledger.js";
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const stamp = () => new Date().toISOString();
const admin = (actor) => { if (!hasRole(actor, "admin")) fail("Admin access required", 403); };
const activeUser = (user) => user && !user.is_banned && !(Date.parse(user.metadata?.suspended_until || "") > Date.now());
const effectDetails = (reward) => reward && Object.fromEntries(["effect", "value", "sources", "duration_days", "active"].map((key) => [key, reward[key] ?? (key === "sources" ? [] : key === "active" ? true : key === "duration_days" ? 0 : null)]));
const publicItem = (row) => ({ id: row.id, name: row.metadata.name, image_url: row.metadata.image_url || "", description: row.metadata.description || "", rarity: row.metadata.rarity, reward: effectDetails(row.metadata.reward) });
export const defaultRewardSettings = { enabled: false, standard_fee: 10, premium_fee: 5, minimum_fee: 0, tournament_drop_chance: 0 };
export async function rewardSettings(db) {
  if (!db.competitionRewardSettings) return { ...defaultRewardSettings };
  return { ...defaultRewardSettings, ...(await db.competitionRewardSettings.findUnique({ where: { id: "default" } }))?.metadata };
}
export async function rewardTemplates(db, source, selectedIds) {
  const rows = await db.marketplaceItem.findMany({ where: field("unlock_type", "competition_reward"), select: { id: true, metadata: true } });
  return rows.filter((row) => {
    try { validateRewardTemplate({ ...row.metadata.reward, name: row.metadata.name, description: row.metadata.description, image_url: row.metadata.image_url }); }
    catch { return false; }
    return row.metadata.is_active !== false && row.metadata.reward?.active !== false
      && (!source || row.metadata.reward.sources?.includes(source)) && (!selectedIds?.length || selectedIds.includes(row.id));
  });
}
async function audit(tx, actor, type, details) {
  await tx.adminAction.create({ data: { metadata: { admin_id: actor.id, admin_name: actor.display_name || actor.username || actor.id, action_type: type, details, created_date: stamp() } } });
}
async function notice(tx, userId, grant, message) {
  await tx.notification.create({ data: { metadata: { user_id: userId, type: "reward", event: "competition_reward", title: "Your reward is ready", message,
    is_read: false, action_url: `/inventory?reward=${encodeURIComponent(grant.id)}`, related_entity_id: grant.id, related_entity_type: "CompetitionRewardGrant", created_date: stamp() } } });
}
// Call inside a transaction protected by the rewards lock. The unique grant key
// also protects against retries, worker restarts and repeated result callbacks.
export async function grantRandomReward(tx, userId, sourceKey, pool, details = {}) {
  const key = `${sourceKey}:${userId}`;
  const previous = await tx.competitionRewardGrant.findUnique({ where: { grant_key: key } });
  if (previous) return previous;
  if (!pool.length) return null;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!activeUser(user)) return null;
  const chosen = pool[randomInt(pool.length)], item = publicItem(chosen), inventoryId = randomUUID(), grantId = randomUUID();
  const expires = item.reward.duration_days ? new Date(Date.now() + item.reward.duration_days * 86400000).toISOString() : null;
  const grant = await tx.competitionRewardGrant.create({ data: { id: grantId, grant_key: key, user_id: userId, source_key: sourceKey, metadata: {
    kind: "item", item, inventory_id: inventoryId, expires_at: expires, pool_ids: pool.map((row) => row.id), ...details,
  } } });
  await tx.userInventory.create({ data: { id: inventoryId, metadata: { user_id: userId, item_id: chosen.id, item_name: item.name, item_description: item.description,
    item_category: "reward_item", item_rarity: item.rarity, item_image: item.image_url, unlock_type: "competition_reward", unlock_key: key,
    reward_grant_id: grantId, reward_effect: item.reward, reward_expires_at: expires, is_unlocked: true, is_equipped: false, is_tradable: false,
    purchase_method: "competition_reward", acquired_date: stamp() } } });
  await notice(tx, userId, grant, `${details.title || "Competition reward"}: open your cards to reveal your item.`);
  return grant;
}
export async function loadRewardBonuses(db, userIds, mode, at = new Date()) {
  if (!userIds.length || !db.competitionRewardGrant || !(await rewardSettings(db)).enabled) return {};
  const rows = await db.$queryRaw`SELECT i.metadata->>'user_id' AS user_id, g.metadata->'item'->'reward' AS reward, g.metadata->>'expires_at' AS expires_at
    FROM "UserInventory" i JOIN "CompetitionRewardGrant" g ON g.id = i.metadata->>'reward_grant_id' AND g.user_id = i.metadata->>'user_id'
      AND g.metadata->>'inventory_id' = i.id AND g.metadata->>'kind' = 'item'
    WHERE i.metadata->>'user_id' IN (${Prisma.join([...new Set(userIds)])}) AND i.metadata->>'unlock_type' = 'competition_reward' AND g.created_date <= ${at}`;
  const result = {};
  for (const row of rows) {
    const effect = rewardEffect(row.reward?.effect), amount = Number(row.reward?.value);
    if (!effect || effect.mode !== mode || !effect.values.includes(amount) || row.expires_at && Date.parse(row.expires_at) <= +at) continue;
    const bonuses = result[row.user_id] ||= {};
    bonuses[effect.id] = Math.max(bonuses[effect.id] || 0, amount);
  }
  return result;
}
export async function saveRewardTemplate(db, actor, input) {
  admin(actor); const template = validateRewardTemplate(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-competition-rewards'))`;
    const old = input.id ? await tx.marketplaceItem.findUnique({ where: { id: String(input.id) } }) : null;
    if (input.id && old?.metadata.unlock_type !== "competition_reward") fail("Reward template not found");
    if (template.active) {
      const existing = await rewardTemplates(tx);
      if (template.sources.some((source) => existing.filter((row) => row.id !== old?.id && row.metadata.reward.sources.includes(source)).length >= 100)) fail("A drop pool can contain up to 100 active cards. Deactivate an older card first.");
    }
    const metadata = { ...old?.metadata, name: template.name, description: template.description, image_url: template.image_url, rarity: template.rarity,
      category: "reward_item", unlock_type: "competition_reward", reward: effectDetails(template), is_active: template.active, is_available: true,
      show_in_marketplace: true, is_featured: false, is_tradeable: false, is_tradable: false, price_cash: 0, price_credits: 0 };
    const row = old ? await tx.marketplaceItem.update({ where: { id: old.id }, data: { metadata } }) : await tx.marketplaceItem.create({ data: { metadata } });
    await audit(tx, actor, "reward_template_saved", { item_id: row.id, name: template.name, effect: template.effect, value: template.value, sources: template.sources, active: template.active });
    return { success: true, item: publicItem(row) };
  });
}
export async function saveRewardSettings(db, actor, input) {
  admin(actor);
  for (const [key, limit] of [["standard_fee", 10], ["premium_fee", 10], ["minimum_fee", 10], ["tournament_drop_chance", 100]]) if (!Number.isInteger(Number(input[key])) || Number(input[key]) < 0 || Number(input[key]) > limit) fail(`Choose a valid ${key.replaceAll("_", " ")}`);
  if (Number(input.minimum_fee) > Number(input.premium_fee) || Number(input.premium_fee) > Number(input.standard_fee)) fail("Minimum fee must not exceed Premium; Premium must not exceed the standard fee");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-competition-rewards'))`;
    const current = await rewardSettings(tx), metadata = { ...current, enabled: input.enabled === true,
      standard_fee: Number(input.standard_fee), premium_fee: Number(input.premium_fee), minimum_fee: Number(input.minimum_fee), tournament_drop_chance: Number(input.tournament_drop_chance),
      enabled_at: current.enabled_at || (input.enabled ? stamp() : null),
      ...(input.enabled && !current.enabled ? { tournament_scanned_at: stamp(), tournament_enabled_at: stamp() } : {}) };
    await tx.competitionRewardSettings.upsert({ where: { id: "default" }, create: { id: "default", metadata }, update: { metadata } });
    await audit(tx, actor, "reward_settings_saved", metadata);
    return { success: true, settings: metadata };
  });
}
export async function getMyRewardGrants(db, userId) {
  const rows = await db.competitionRewardGrant.findMany({ where: { user_id: userId, revealed_at: null, OR: [field("kind", "item"), field("kind", "premium")] }, orderBy: { created_date: "asc" }, take: 10 });
  return { success: true, grants: rows.map((row) => ({ id: row.id, created_date: row.created_date, title: row.metadata.title || "Your competition reward" })) };
}
export async function getRewardReveal(db, userId, grantId) {
  const row = await db.competitionRewardGrant.findUnique({ where: { id: String(grantId || "") } });
  if (!row || row.user_id !== userId || !["item", "premium"].includes(row.metadata.kind)) fail("Reward not found", 404);
  const ids = row.metadata.pool_ids || [];
  const pool = ids.length ? await db.marketplaceItem.findMany({ where: { id: { in: ids } }, select: { id: true, metadata: true } }) : [];
  const cards = pool.map(publicItem).filter((item) => item.id !== row.metadata.item.id);
  cards.push(row.metadata.item);
  return { success: true, grant: { id: row.id, item: row.metadata.item, title: row.metadata.title, revealed_at: row.revealed_at, expires_at: row.metadata.expires_at }, cards };
}
export async function acknowledgeReward(db, userId, id) {
  const row = await db.competitionRewardGrant.findUnique({ where: { id: String(id || "") } });
  if (!row || row.user_id !== userId) fail("Reward not found", 404);
  if (!row.revealed_at) await db.competitionRewardGrant.updateMany({ where: { id: row.id, user_id: userId, revealed_at: null }, data: { revealed_at: new Date() } });
  return { success: true };
}
async function applyTournamentCredits(tx, tournamentId, userIds, at = new Date()) {
  const bonuses = await loadRewardBonuses(tx, userIds, "tournament", at);
  for (const userId of [...new Set(userIds)].sort()) {
    const amount = bonuses[userId]?.tournament_credit || 0, key = `credit:${tournamentId}:${userId}`;
    if (!amount || await tx.competitionRewardGrant.findUnique({ where: { grant_key: key } })) continue;
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    await tx.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
    await tx.creditTransaction.create({ data: { metadata: { user_id: userId, type: "reward_bonus", amount, reference_id: tournamentId, reference_type: "Tournament", status: "completed", created_date: stamp() } } });
    await tx.competitionRewardGrant.create({ data: { grant_key: key, user_id: userId, source_key: `tournament:${tournamentId}`, revealed_at: new Date(), metadata: { kind: "credit_bonus", amount } } });
  }
}
export async function awardTournamentCreditBonus(db, tournamentId, userIds) {
  if (!db.competitionRewardGrant) return;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-competition-rewards'))`;
    return applyTournamentCredits(tx, tournamentId, userIds);
  });
}
export async function saveRewardCampaign(db, actor, input) {
  admin(actor);
  const name = String(input.name || "").trim(), kind = input.kind;
  if (!name || name.length > 80 || !["wins", "tournament_drop"].includes(kind)) fail("Choose an event name and reward condition");
  const start = new Date(input.starts_at), end = new Date(input.ends_at), target = Number(input.win_target || 1);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end <= new Date() || +end - +start > 366 * 86400000) fail("Choose a valid event window, up to one year");
  if (!Number.isInteger(target) || target < 1 || target > 1000) fail("Choose a win target from 1 to 1,000");
  const competition = kind === "tournament_drop" ? "tournament" : input.competition;
  if (!REWARD_MODES.some((mode) => mode.id === competition)) fail("Choose an event competition");
  const itemIds = [...new Set(Array.isArray(input.item_ids) ? input.item_ids : [])];
  if (!itemIds.length || itemIds.length > 100 || itemIds.some((id) => typeof id !== "string")) fail("Choose the allowed reward cards");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-competition-rewards'))`;
    const pool = await rewardTemplates(tx, kind === "tournament_drop" ? "tournament" : "event", itemIds);
    if (pool.length !== itemIds.length) fail("Every selected item must be active in this drop pool");
    let matchId = "";
    if (kind === "tournament_drop") {
      const rows = await tx.tournamentMatch.findMany({ where: field("tournament_id", String(input.tournament_id || "")), select: { id: true, metadata: true } });
      const allowed = rows.filter((row) => !row.metadata.completed && !["completed", "cancelled", "closed"].includes(row.metadata.status) && (!input.match_id || row.id === input.match_id));
      if (!allowed.length) fail("Choose an upcoming match in this tournament");
      matchId = allowed[randomInt(allowed.length)].id;
    }
    const row = await tx.competitionRewardCampaign.create({ data: { starts_at: start, ends_at: end, metadata: { name, kind, competition, win_target: target,
      item_ids: itemIds, match_id: matchId, tournament_id: input.tournament_id || "", created_by: actor.id } } });
    await audit(tx, actor, "reward_event_created", { campaign_id: row.id, ...row.metadata });
    return { success: true, campaign: row };
  });
}
export async function getAdminRewardOverview(db, actor) {
  admin(actor);
  const [settings, items, campaigns, seasons, grants, tournaments] = await Promise.all([
    rewardSettings(db), db.marketplaceItem.findMany({ where: field("unlock_type", "competition_reward"), orderBy: { created_date: "desc" } }),
    db.competitionRewardCampaign.findMany({ orderBy: { created_date: "desc" }, take: 50 }),
    db.competitionRewardSeason.findMany({ orderBy: { starts_at: "desc" }, take: 12 }),
    db.competitionRewardGrant.findMany({ where: { NOT: { user_id: "system" } }, orderBy: { created_date: "desc" }, take: 30 }),
    db.$queryRaw`SELECT id, metadata->>'name' AS name FROM "Tournament" WHERE COALESCE(metadata->>'status', '') NOT IN ('completed', 'cancelled', 'closed') ORDER BY created_date DESC LIMIT 100`,
  ]);
  return { success: true, settings, items: items.map(publicItem), campaigns, seasons, grants: grants.map((row) => ({ id: row.id, user_id: row.user_id, source_key: row.source_key, created_date: row.created_date, name: row.metadata.item?.name || row.metadata.kind })), tournaments, current: rewardSeason() };
}
export async function getRewardSeasonStandings(db, input = {}) {
  const current = rewardSeason(), stored = input.season_id ? await db.competitionRewardSeason.findUnique({ where: { id: String(input.season_id) } }) : null;
  if (input.season_id && !stored) fail("Season not found", 404);
  const start = stored?.starts_at || current.start, end = stored?.ends_at || current.end;
  const standings = stored?.status === "closed" ? stored.metadata.standings || {} : buildRewardSeasonStandings(await loadRewardLedger(db, start, end), start, end);
  const ids = [...new Set(Object.values(standings).flat().filter((row) => row.kind === "player").map((row) => row.id))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids }, is_banned: false }, select: { id: true, username: true, display_name: true, region: true } }) : [];
  const byId = new Map(users.map((row) => [row.id, row]));
  return { success: true, season: { id: stored?.id || current.id, start, end, status: stored?.status || "open" }, standings: Object.fromEntries(Object.entries(standings).map(([ladder, rows]) => [ladder, rows.filter((row) => row.kind === "team" || byId.has(row.id)).map((row, index) => ({ ...row, place: index + 1, name: row.name || byId.get(row.id)?.display_name || byId.get(row.id)?.username || "Player", username: byId.get(row.id)?.username, region: byId.get(row.id)?.region }))])) };
}
async function grantTeamPremium(tx, row, season) {
  for (const userId of [...new Set(row.player_ids || [])].sort()) {
    const key = `season:${season.id}:challenge:${row.id}:${userId}`;
    if (await tx.competitionRewardGrant.findUnique({ where: { grant_key: key } })) continue;
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId } }); if (!activeUser(user)) continue;
    const existingExpiry = user.is_premium ? Date.parse(user.premium_expires || "") : 0;
    const expiry = new Date(Math.max(Date.now(), existingExpiry || 0)), day = expiry.getUTCDate();
    expiry.setUTCDate(1); expiry.setUTCMonth(expiry.getUTCMonth() + 2);
    const last = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth() + 1, 0)).getUTCDate(); expiry.setUTCDate(Math.min(day, last));
    await tx.user.update({ where: { id: userId }, data: { is_premium: true, premium_expires: expiry } });
    const item = { id: "challenge-season-premium", name: "Two months Premium", description: "Your Challenge a Team roster won the season. Two months of Premium have been added to your account.", image_url: "/assets/default-player-avatar.svg", rarity: "exclusive" };
    const grant = await tx.competitionRewardGrant.create({ data: { grant_key: key, user_id: userId, source_key: `season:${season.id}:challenge`, metadata: { kind: "premium", item, title: `${season.id} · Challenge a Team champions`, premium_expires: expiry.toISOString() } } });
    await tx.premiumMembership.create({ data: { metadata: { user_id: userId, status: "active", source: "challenge_season", reward_grant_id: grant.id, end_date: expiry.toISOString() } } });
    await notice(tx, userId, grant, "Your team won the season. Two months of Premium were added to your account.");
  }
}
async function settleRewardSeason(tx, season) {
  const standings = buildRewardSeasonStandings(await loadRewardLedger(tx, season.starts_at, season.ends_at), season.starts_at, season.ends_at);
  const users = await tx.user.findMany({ where: { is_banned: false }, select: { id: true, is_banned: true, metadata: true } });
  const eligible = new Set(users.filter(activeUser).map((row) => row.id));
  const pools = await rewardTemplates(tx), awards = [];
  for (const [ladder, board] of Object.entries(standings)) {
    const winner = board.find((row) => row.wins > 0 && (row.kind === "team" ? row.player_ids?.some((id) => eligible.has(id)) : eligible.has(row.id)));
    if (!winner) continue;
    if (ladder === "challenge") { await grantTeamPremium(tx, winner, season); awards.push({ ladder, winner_id: winner.id, kind: "premium" }); continue; }
    const source = ladder.split(":")[0], pool = pools.filter((row) => row.metadata.reward?.sources?.includes(source));
    const grant = await grantRandomReward(tx, winner.id, `season:${season.id}:${ladder}`, pool, { title: `${season.id} · #1 ${ladder}`, season_id: season.id, ladder });
    if (grant) awards.push({ ladder, winner_id: winner.id, grant_id: grant.id });
  }
  await tx.competitionRewardSeason.update({ where: { id: season.id }, data: { status: "closed", metadata: { ...season.metadata, settled_at: stamp(), awards,
    standings: Object.fromEntries(Object.entries(standings).map(([ladder, rows]) => [ladder, rows.slice(0, 500)])) } } });
}
async function tournamentDrop(tx, row, pool, sourceKey, title) {
  const winners = [...new Set(row.metadata.reward_winner_user_ids || [])];
  if (!winners.length || !pool.length) return false;
  const users = await tx.user.findMany({ where: { id: { in: winners }, is_banned: false }, select: { id: true, is_banned: true, metadata: true } });
  const eligible = users.filter(activeUser); if (!eligible.length) return false;
  const user = eligible[randomInt(eligible.length)];
  await grantRandomReward(tx, user.id, sourceKey, pool, { title, tournament_match_id: row.id });
  return true;
}
export async function processCompetitionRewards(db) {
  if (!db.competitionRewardSettings) return { success: true, disabled: true };
  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext('topfragg-competition-rewards')) AS acquired`;
    if (!locked.acquired) return { success: true, busy: true };
    const settings = await rewardSettings(tx); if (!settings.enabled) return { success: true, disabled: true };
    const now = new Date(), current = rewardSeason(now);
    // Create missed cycles as well, so an API restart cannot lose a season's prizes.
    let period = rewardSeason(new Date(settings.enabled_at || now));
    while (+period.start <= +current.start) {
      await tx.competitionRewardSeason.upsert({ where: { id: period.id }, create: { id: period.id, starts_at: period.start, ends_at: period.end }, update: {} });
      period = rewardSeason(period.end);
    }
    const due = await tx.competitionRewardSeason.findMany({ where: { status: "open", ends_at: { lte: new Date(+now - 5 * 60000) } }, orderBy: { starts_at: "asc" }, take: 6 });
    for (const season of due) await settleRewardSeason(tx, season);
    const ledgerCache = new Map();
    const campaigns = await tx.competitionRewardCampaign.findMany({ where: { active: true, starts_at: { lte: now } }, orderBy: { created_date: "asc" }, take: 100 });
    for (const campaign of campaigns) {
      const c = campaign.metadata, pool = await rewardTemplates(tx, c.kind === "tournament_drop" ? "tournament" : "event", c.item_ids);
      if (c.kind === "tournament_drop") {
        const row = await tx.tournamentMatch.findUnique({ where: { id: c.match_id } });
        if (row?.metadata.status === "completed" && +new Date(row.metadata.completed_date) >= +campaign.starts_at && +new Date(row.metadata.completed_date) < +campaign.ends_at && await tournamentDrop(tx, row, pool, `event:${campaign.id}`, c.name)) {
          await tx.competitionRewardCampaign.update({ where: { id: campaign.id }, data: { active: false, metadata: { ...c, settled_at: stamp() } } });
        }
      } else {
        const windowEnd = new Date(Math.min(+now, +campaign.ends_at)), cacheKey = `${+campaign.starts_at}:${+windowEnd}`;
        if (!ledgerCache.has(cacheKey)) ledgerCache.set(cacheKey, await loadRewardLedger(tx, campaign.starts_at, windowEnd));
        const ledger = ledgerCache.get(cacheKey);
        const boards = buildRewardSeasonStandings(ledger, campaign.starts_at, campaign.ends_at, { includeTournaments: true });
        const board = c.competition === "free8s" ? Object.entries(boards).filter(([key]) => key.startsWith("free8s:")).flatMap(([, rows]) => rows) : boards[c.competition] || [];
        const wins = new Map(); for (const row of board) wins.set(row.id, (wins.get(row.id) || 0) + row.wins);
        for (const [userId, total] of wins) if (total >= c.win_target) await grantRandomReward(tx, userId, `event:${campaign.id}`, pool, { title: c.name, campaign_id: campaign.id });
      }
      if (+campaign.ends_at + 5 * 60000 <= +now) await tx.competitionRewardCampaign.update({ where: { id: campaign.id }, data: { active: false } });
    }
    // Automatic tournament drops use a saved checkpoint and one draw per match.
    const enabledAt = new Date(settings.tournament_enabled_at || settings.enabled_at || now);
    // Revisit a short overlap: completion and its roster snapshot can be saved
    // in separate statements. Unique draw keys still allow only one decision.
    const since = new Date(Math.max(+enabledAt, +new Date(settings.tournament_scanned_at || enabledAt) - 5 * 60000));
    const matches = await tx.tournamentMatch.findMany({ where: { AND: [field("status", "completed"), { updated_date: { gte: since } }] }, select: { id: true, metadata: true, created_date: true } });
    const pool = await rewardTemplates(tx, "tournament");
    for (const row of matches) {
      const completed = +new Date(row.metadata.completed_date), key = `draw:tournament:${row.id}`;
      if (!Number.isFinite(completed) || completed < +enabledAt || completed > +now || !row.metadata.reward_winner_user_ids?.length || await tx.competitionRewardGrant.findUnique({ where: { grant_key: key } })) continue;
      const manuallyScheduled = campaigns.some((campaign) => campaign.metadata.kind === "tournament_drop" && campaign.metadata.match_id === row.id);
      const won = !manuallyScheduled && randomInt(100) < Number(settings.tournament_drop_chance || 0);
      if (won) await tournamentDrop(tx, row, pool, `tournament:${row.id}`, "Tournament match reward");
      await tx.competitionRewardGrant.create({ data: { grant_key: key, user_id: "system", source_key: `tournament:${row.id}`, revealed_at: now, metadata: { kind: "draw_decision", selected: won } } });
    }
    const championships = await tx.tournamentWin.findMany({ where: { created_date: { gte: since, lte: now } }, select: { created_date: true, metadata: true } });
    for (const win of championships) if (win.metadata.tournament_id && win.metadata.user_ids?.length) await applyTournamentCredits(tx, win.metadata.tournament_id, win.metadata.user_ids, win.created_date);
    await tx.competitionRewardSettings.update({ where: { id: "default" }, data: { metadata: { ...settings, tournament_scanned_at: now.toISOString(), worker_checked_at: now.toISOString() } } });
    return { success: true, seasons_closed: due.length };
  }, { timeout: 60000, maxWait: 15000 });
}
export function startCompetitionRewardWorker(db) {
  let stopped = false, running = null;
  const tick = () => { if (stopped || running) return; running = processCompetitionRewards(db).catch((error) => console.error("[competition-rewards]", error.message)).finally(() => { running = null; }); };
  const timer = setInterval(tick, 60000); timer.unref?.(); tick();
  return async () => { stopped = true; clearInterval(timer); await running; };
}

export async function setRewardCampaignActive(db, actor, input) {
  admin(actor); const id = String(input.id || "");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-competition-rewards'))`;
    const row = await tx.competitionRewardCampaign.findUnique({ where: { id } });
    if (!row) fail("Event not found", 404);
    if (input.active && +row.ends_at <= Date.now()) fail("Create a new event window instead of reopening an expired event");
    await tx.competitionRewardCampaign.update({ where: { id }, data: { active: input.active === true } });
    await audit(tx, actor, "reward_event_toggled", { id, active: input.active === true });
    return { success: true };
  });
}
