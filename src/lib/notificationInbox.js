export function applyNotificationChange(rows, detail = {}) {
  if (detail.clearAll) return [];
  return rows.filter((row) => row.id !== detail.removedId).map((row) => ({
    ...row,
    ...(detail.markAllRead || row.id === detail.readId ? { is_read: true } : {}),
    ...(detail.disputeId && row.related_entity_id === detail.disputeId ? { popup_suppressed: true } : {}),
  }));
}
