const updateMessage = "Co-ed / Switcheroo is being updated. Please try again shortly.";

const unavailable = (cause) => Object.assign(new Error(updateMessage, { cause }), {
  status: 503,
  code: "PARTY_ROOMS_NOT_READY",
});

export function requirePartyRoomStorage(db) {
  if (!db?.partyRoom) {
    throw unavailable(new Error("PartyRoom is missing from the Prisma client. Run prisma generate and restart the API and Discord bot."));
  }
}

export function partyRoomStorageError(error) {
  if (["P2021", "P2022"].includes(error.code) &&
      Object.values(error.meta || {}).some((value) => typeof value === "string" && /\bPartyRoom\b/.test(value))) {
    return unavailable(error);
  }
  return error;
}
