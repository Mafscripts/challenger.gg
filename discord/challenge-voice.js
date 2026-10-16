import { prisma } from "../server/prisma.js";
import { syncFreeEightsVoice } from "./free-eights-voice.js";
import { challengeDiscordConfig, challengeVoiceMatch, challengeVoiceRoster } from "../server/challenge-discord.js";
import { CHALLENGE_ACTIVE } from "../src/lib/challengeRanks.js";

// Reuse Free 8s' ownership checks, permission rules, durable provisioning,
// reconnects and cleanup. The adapter isolates all match and channel state.
export function challengeVoiceDatabase(db) {
  const key = (value, reverse = false) => {
    if (typeof value === "string") return reverse ? value.replace(/^challenge-voice:/, "free8s-voice:").replace(/^challenge-channel:/, "free8s-channel:")
      : value.replace(/^free8s-voice:/, "challenge-voice:").replace(/^free8s-channel:/, "challenge-channel:");
    if (Array.isArray(value)) return value.map((item) => key(item, reverse));
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === "metadata" || name === "data" ? item : key(item, reverse)]));
    return value;
  };
  const args = (input) => ({ ...input, ...(input.where ? { where: key(input.where) } : {}),
    ...(input.data ? { data: { ...input.data, ...(input.data.event_key ? { event_key: key(input.data.event_key) } : {}) } } : {}) });
  const dispatch = Object.fromEntries(["findUnique", "findMany", "create", "update", "updateMany"].map((method) => [method, async (input) => {
    const result = await db.discordEventDispatch[method](args(input));
    return key(result, true);
  }]));
  return {
    user: db.user, discordEventDispatch: dispatch,
    wager: {
      findUnique: async ({ where }) => { const row = await db.challengeMatch.findUnique({ where }); return row && { ...row, metadata: challengeVoiceMatch({ ...row.metadata, status: row.status, id: row.id }) }; },
      findMany: async () => (await db.challengeMatch.findMany({ where: { status: { in: CHALLENGE_ACTIVE } } })).map((row) => ({ ...row, metadata: challengeVoiceMatch({ ...row.metadata, status: row.status, id: row.id }) })),
    },
    wagerParticipant: { findMany: async ({ where }) => {
      const row = await db.challengeMatch.findUnique({ where: { id: where.metadata.equals } });
      return row ? challengeVoiceRoster(row.metadata).map((player) => ({ metadata: player })) : [];
    } },
    $transaction: (callback, options) => db.$transaction((tx) => callback({
      $queryRaw: (strings, ...values) => tx.$queryRaw(strings, ...values.map((value) => key(value))),
    }), options),
  };
}
export const syncChallengeVoice = (guild, { db = prisma, config = challengeDiscordConfig(), ...options } = {}) => syncFreeEightsVoice(guild, {
  db: challengeVoiceDatabase(db), config,
  log: (event, details) => console.info("[Challenge a Team Discord]", event, details), ...options,
});
