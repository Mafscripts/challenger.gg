export function wagerCancellationNotification(wager) {
  const freeEights = wager.match_type === "8s";
  const mode = wager.game_mode_display || wager.game_mode || "Match";
  return {
    title: freeEights ? "Free 8s lobby cancelled" : "Wager refunded",
    message: freeEights ? `${mode} was cancelled.` : `${mode} was cancelled and escrow was returned.`,
    type: "match",
    action_url: freeEights ? "/ranked/8s" : "/wallet",
    related_entity_id: wager.id,
    related_entity_type: "Wager",
  };
}

// Correct legacy Free 8s refund wording on read without deleting notifications
// or changing their timestamps/read state. Identify the competition from the
// stored match, never from a display name shared by paid matches.
export async function normalizeFreeEightsCancellationNotifications(db, notifications) {
  const legacy = notifications.filter((row) => row.title === "Wager refunded"
    && row.related_entity_type === "Wager" && typeof row.related_entity_id === "string" && row.related_entity_id);
  if (!legacy.length) return notifications;
  let matches;
  try {
    matches = await db.wager.findMany({ where: {
      id: { in: [...new Set(legacy.map((row) => row.related_entity_id))] },
      metadata: { path: ["match_type"], equals: "8s" },
    }, select: { id: true, metadata: true } });
  } catch (error) {
    console.warn("[Notifications] Free 8s legacy wording lookup failed", error.code || "lookup-unavailable");
    return notifications;
  }
  const freeMatches = new Map(matches.filter((row) => row.metadata?.match_type === "8s")
    .map((row) => [row.id, { ...row.metadata, id: row.id }]));
  const legacyIds = new Set(legacy.map((row) => row.id));
  return notifications.map((row) => legacyIds.has(row.id) && freeMatches.has(row.related_entity_id)
    ? { ...row, ...wagerCancellationNotification(freeMatches.get(row.related_entity_id)) } : row);
}
