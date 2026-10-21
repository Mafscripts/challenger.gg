import { randomUUID } from "node:crypto";
import { MATCH_PRESET_LIMIT, normalizeMatchPreset } from "../src/lib/matchPresets.js";

const recordId = (userId) => `match-presets:${userId}`;
const presetsFor = (row) => Array.isArray(row?.metadata?.presets) ? row.metadata.presets : [];

export async function listMatchPresets(db, userId) {
  const row = await db.userSettings.findUnique({ where: { id: recordId(userId) }, select: { metadata: true } });
  return presetsFor(row);
}

export async function saveMatchPreset(db, userId, input) {
  const settings = normalizeMatchPreset(input);
  if (input.id !== undefined && (typeof input.id !== "string" || !/^[a-f0-9-]{36}$/.test(input.id))) {
    throw Object.assign(new Error("Invalid preset ID"), { status: 400 });
  }
  return db.$transaction(async (tx) => {
    // Serialize changes to this user's small settings document, including the
    // first creation. Different accounts never share a lock or a record.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${recordId(userId)}))`;
    const presets = await listMatchPresets(tx, userId);
    if (input.id && !presets.some((preset) => preset.id === input.id)) throw Object.assign(new Error("Preset no longer exists"), { status: 404 });
    const sameName = presets.find((preset) => preset.mode === settings.mode && preset.game_id === settings.game_id
      && preset.name.toLowerCase() === settings.name.toLowerCase());
    if (input.id && sameName && sameName.id !== input.id) throw Object.assign(new Error("That preset name is already in use"), { status: 400 });
    // A retry after a lost response updates the same named preset.
    const existingId = input.id || sameName?.id;
    if (!existingId && presets.length >= MATCH_PRESET_LIMIT) throw Object.assign(new Error(`You can save up to ${MATCH_PRESET_LIMIT} presets. Remove one first.`), { status: 400 });
    const preset = { ...settings, id: existingId || randomUUID() };
    const next = existingId ? presets.map((item) => item.id === existingId ? preset : item) : [...presets, preset];
    const metadata = { user_id: userId, kind: "match_presets", presets: next };
    await tx.userSettings.upsert({ where: { id: recordId(userId) }, create: { id: recordId(userId), metadata }, update: { metadata } });
    return next;
  });
}

export async function deleteMatchPreset(db, userId, presetId) {
  if (!/^[a-f0-9-]{36}$/.test(String(presetId))) throw Object.assign(new Error("Invalid preset ID"), { status: 400 });
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${recordId(userId)}))`;
    const presets = await listMatchPresets(tx, userId);
    const next = presets.filter((preset) => preset.id !== presetId);
    if (next.length !== presets.length) await tx.userSettings.update({ where: { id: recordId(userId) }, data: { metadata: { user_id: userId, kind: "match_presets", presets: next } } });
    return next;
  });
}
