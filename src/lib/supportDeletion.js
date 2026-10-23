// Apply only server-confirmed removals, including linked cases deleted together.
export function deletedSupportCaseIds(result) {
  return new Set([
    ...(result.deleted_ticket_ids || []).map(id => `ticket:${id}`),
    ...(result.deleted_dispute_ids || []).map(id => `dispute:${id}`),
  ]);
}
export function removeDeletedSupportCases(current, deleted) {
  if (!current) return current;
  if (current.pages) return { ...current, pages: current.pages.map(page => ({ ...page, rows: page.rows.filter(row => !deleted.has(row.id)) })) };
  return deleted.has(current.id) ? null : current;
}

export function supportCleanupFailureSummary(processed, failures) {
  const groups = new Map();
  for (const failure of failures) groups.set(failure.message, (groups.get(failure.message) || 0) + 1);
  return `${processed} cases processed. ${[...groups].map(([message, count]) => `${count} case${count === 1 ? "" : "s"}: ${message}`).join(" ")}`;
}
