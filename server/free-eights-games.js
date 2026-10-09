import crypto from "node:crypto";
import sharp from "sharp";
import { DEFAULT_EIGHTS_GAMES, DEFAULT_EIGHTS_GAME, eightsGameId, eightsGameName } from "../src/lib/freeEightsGames.js";

export const EIGHTS_CONFIG_ID = "free-eights-game-config";
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const label = (value, subject, max = 80) => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail(`${subject} is required (max ${max} characters)`);
  return value.trim();
};
const id = (value, subject) => { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_]{0,39}$/.test(value)) fail(`${subject} needs a unique lowercase ID`); return value; };
const unique = (rows, subject) => { if (new Set(rows.map((row) => row.id)).size !== rows.length) fail(`Duplicate ${subject} ID`); };
function imageUrl(value) {
  if (!value) return "";
  if (typeof value !== "string" || value.length > 2000) fail("Map image URL is too long");
  if (/^\/(assets\/maps\/|api\/public\/free-eights-map-images\/)[a-zA-Z0-9_./-]+$/.test(value) && !value.includes("..")) return value;
  try { const url = new URL(value); if (url.protocol === "https:" && !url.username && !url.password) return url.href; } catch { /* Reject unsupported schemes. */ }
  fail("Use an HTTPS image URL or upload a map image");
}
export function validateEightsGames(input) {
  if (!Array.isArray(input) || !input.length || input.length > 20) fail("Configure between 1 and 20 games");
  const games = input.map((game) => {
    if (!game || typeof game !== "object") fail("Invalid game configuration");
    if (!Array.isArray(game.modes) || !game.modes.length || game.modes.length > 12) fail("Each game needs 1–12 modes");
    const modes = game.modes.map((mode) => {
      if (!mode || typeof mode !== "object") fail("Invalid mode configuration");
      if (!Array.isArray(mode.maps) || !mode.maps.length || mode.maps.length > 40) fail("Each mode needs 1–40 maps");
      const maps = mode.maps.map((map) => { if (!map || typeof map !== "object") fail("Invalid map configuration"); return { name: label(map.name, "Map name"), image: imageUrl(map.image) }; });
      if (new Set(maps.map((map) => map.name.toLowerCase())).size !== maps.length) fail("Duplicate map name in a mode");
      return { id: id(mode.id, "Mode"), name: label(mode.name, "Mode name"), maps };
    });
    unique(modes, "mode");
    if (!Array.isArray(game.formats) || !game.formats.length || game.formats.length > 30) fail("Each game needs 1–30 series formats");
    const formats = game.formats.map((format) => {
      if (!format || typeof format !== "object") fail("Invalid series format");
      if (!Array.isArray(format.modes) || ![1, 3].includes(format.modes.length) || format.modes.some((mode) => !modes.some((row) => row.id === mode))) fail("A format must contain 1 or 3 configured modes");
      return { id: id(format.id, "Format"), name: label(format.name, "Format name"), modes: [...format.modes] };
    });
    unique(formats, "format");
    return { id: id(game.id, "Game"), name: label(game.name, "Game name"), number: game.number ? label(game.number, "Game number", 8) : "", color: game.color === "green" ? "green" : "orange", enabled: game.enabled !== false, modes, formats };
  });
  unique(games, "game");
  if (!games.some((game) => game.id === DEFAULT_EIGHTS_GAME)) fail("Keep Black Ops 7 for existing rooms");
  if (!games.some((game) => game.enabled)) fail("Enable at least one game");
  return games;
}
export async function loadEightsGames(db) {
  const row = await db.mapPool.findUnique({ where: { id: EIGHTS_CONFIG_ID } });
  return row?.metadata?.games || structuredClone(DEFAULT_EIGHTS_GAMES);
}
export async function saveEightsGames(db, input, adminId, version) {
  const games = validateEightsGames(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('topfragg-eights-config'))`;
    const current = await tx.mapPool.findUnique({ where: { id: EIGHTS_CONFIG_ID } });
    if (String(current?.updated_date?.toISOString() || "default") !== String(version)) fail("Settings changed. Reload before saving.", 409);
    const row = await tx.mapPool.upsert({ where: { id: EIGHTS_CONFIG_ID }, create: { id: EIGHTS_CONFIG_ID, metadata: { games } }, update: { metadata: { games } } });
    await tx.adminAction.create({ data: { metadata: { admin_id: adminId, action: "update_free_eights_games", game_ids: games.map((game) => game.id), created_date: new Date().toISOString() } } });
    return { success: true, games, version: row.updated_date.toISOString() };
  });
}
export function eightsLobbySettings(games, body) {
  const game = games.find((row) => row.id === eightsGameId(body.game_id) && row.enabled);
  if (!game) fail("This Free 8s game is unavailable");
  const format = game.formats.find((row) => row.id === (body.series_format || "cdl_bo3"));
  if (!format) fail("Select a configured series format");
  return { game_id: game.id, game_name: eightsGameName(game), game_config: structuredClone(game), series_format: format.id, series_mode_ids: [...format.modes], game_mode: format.modes[0], game_mode_display: format.name, best_of: format.modes.length, team_size: "4v4", required_players_per_team: 4, max_players: 8, maps: [...new Set(format.modes.flatMap((id) => game.modes.find((row) => row.id === id).maps.map((map) => map.name)))] };
}
// Legacy rows without a game belong to BO7; newer games always have an ID.
export async function findEightsStatsRow(db, userId, gameId = DEFAULT_EIGHTS_GAME) {
  const rows = await db.eightsStats.findMany({ where: { metadata: { path: ["user_id"], equals: userId } }, orderBy: { created_date: "desc" } });
  return rows.find((row) => eightsGameId(row.metadata?.game_id) === gameId) || null;
}
export async function uploadEightsMapImage(db, dataUrl) {
  if (typeof dataUrl !== "string" || dataUrl.length > 2_800_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(dataUrl)) fail("Upload a PNG, JPG or WebP up to 2 MB");
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  if (!bytes.length || bytes.length > 2_000_000) fail("Image must be under 2 MB");
  let encoded;
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000 });
    const meta = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format) || (meta.pages || 1) > 1) throw new Error();
    encoded = await image.rotate().resize({ width: 1280, height: 720, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch { fail("This image could not be read"); }
  const key = `free8s-image-${crypto.createHash("sha256").update(encoded).digest("hex")}`;
  await db.mapPool.upsert({ where: { id: key }, create: { id: key, metadata: { image: encoded.toString("base64") } }, update: {} });
  return { success: true, image: `/api/public/free-eights-map-images/${key}` };
}
