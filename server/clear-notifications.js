export async function clearOwnNotifications(db, userId, { cutoff = new Date(), acknowledgeDispute } = {}) {
  if (!userId) throw Object.assign(new Error("Sign in to remove notifications"), { status: 401 });
  const where = { metadata: { path: ["user_id"], equals: userId }, created_date: { lte: cutoff } };
  if (acknowledgeDispute) {
    const rows = await db.notification.findMany({ where, select: { metadata: true } });
    const disputeIds = [...new Set(rows.filter(row => row.metadata?.type === "dispute").map(row => row.metadata.related_entity_id).filter(Boolean))];
    for (const disputeId of disputeIds) await acknowledgeDispute(disputeId);
  }
  const { count } = await db.notification.deleteMany({ where });
  return { success: true, removed: count };
}
