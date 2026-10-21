export const MATCH_PRESET_LIMIT = 12;

// Shared with the API. Store preferences only; never store a team, wallet entry,
// payment permission, map outcome or a match result in a reusable preset.
export function normalizeMatchPreset(input) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Provide match settings");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 48) fail("Give your preset a name of 1–48 characters");
  if (!["wager", "ranked", "xp", "eights", "money8s"].includes(input.mode)) fail("Choose a supported match type");
  if (typeof input.game_id !== "string" || !/^[a-z0-9_-]{1,32}$/.test(input.game_id)) fail("Choose a valid game");
  const eights = ["eights", "money8s"].includes(input.mode);
  if (typeof input.game_mode !== "string" || !/^[a-z0-9_-]{1,64}$/.test(input.game_mode)
    || (!eights && !["snd", "hp", "overload"].includes(input.game_mode))) fail("Choose a valid game mode");
  const sizes = input.mode === "money8s" ? ["4v4"] : input.mode === "eights" ? ["2v2", "3v3", "4v4"] : input.mode === "xp" ? ["1v1", "2v2", "3v3", "4v4", "5v5"] : ["1v1", "2v2", "3v3", "4v4"];
  if (!sizes.includes(input.team_size)) fail("Choose a valid team size");
  if (![1, 3, 5].includes(input.best_of)) fail("Choose BO1, BO3 or BO5");
  if (!["controller_only", "mixed_pc_allowed", "console_only"].includes(input.play_rule)) fail("Choose valid input and platform rules");
  return { name, mode: input.mode, game_id: input.game_id, game_mode: input.game_mode,
    team_size: input.team_size, best_of: input.best_of, play_rule: input.play_rule };
}
