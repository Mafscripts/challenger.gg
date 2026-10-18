import { prisma } from "../server/prisma.js";
import { syncFreeEightsVoice } from "./free-eights-voice.js";
import { partyDiscordConfig, partyVoiceMatch, partyVoiceRoster, PARTY_ROOM_LIFETIME_MS } from "../server/party-voice.js";
import { flattenPartyRoom } from "../server/party-rooms.js";

// Adapt the existing durable channel ownership and cleanup system. Party
// rooms have separate keys, so they cannot mutate other modes' channels.
export function partyVoiceDatabase(db) {
  const key = (value, reverse = false) => {
    if (typeof value === "string") return reverse ? value.replace(/^party-voice:/, "free8s-voice:").replace(/^party-channel:/, "free8s-channel:")
      : value.replace(/^free8s-voice:/, "party-voice:").replace(/^free8s-channel:/, "party-channel:");
    if (Array.isArray(value)) return value.map((item) => key(item, reverse));
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, name === "metadata" || name === "data" ? item : key(item, reverse)]));
    return value;
  };
  const args = (input) => ({ ...input, ...(input.where ? { where: key(input.where) } : {}),
    ...(input.data ? { data: { ...input.data, ...(input.data.event_key ? { event_key: key(input.data.event_key) } : {}) } } : {}) });
  const dispatch = Object.fromEntries(["findUnique", "findMany", "create", "update", "updateMany"].map((method) => [method, async (input) => key(await db.discordEventDispatch[method](args(input)), true)]));
  return { user: db.user, discordEventDispatch: dispatch,
    wager: {
      findUnique: async ({ where }) => { const row = await db.partyRoom.findUnique({ where }); return row && { ...row, metadata: partyVoiceMatch(flattenPartyRoom(row)) }; },
      findMany: async () => (await db.partyRoom.findMany({ where: { status: { not: "closed" }, updated_date: { gte: new Date(Date.now() - PARTY_ROOM_LIFETIME_MS) } } })).map((row) => ({ ...row, metadata: partyVoiceMatch(flattenPartyRoom(row)) })),
    },
    wagerParticipant: { findMany: async ({ where }) => {
      const row = await db.partyRoom.findUnique({ where: { id: where.metadata.equals } });
      return row ? partyVoiceRoster(flattenPartyRoom(row)).map((player) => ({ metadata: player })) : [];
    } },
    $transaction: (callback, options) => db.$transaction((tx) => callback({ $queryRaw: (strings, ...values) => tx.$queryRaw(strings, ...values.map((value) => key(value))) }), options),
  };
}
export const syncPartyVoice = (guild, { db = prisma, config = partyDiscordConfig(), ...options } = {}) => syncFreeEightsVoice(guild, {
  db: partyVoiceDatabase(db), config, log: (event, details) => console.info("[Co-ed / Switcheroo Discord]", event, details), ...options,
});
