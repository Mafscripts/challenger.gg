import { notificationCutoff } from "../src/lib/notificationRetention.js";

// Bounded batches keep a large backlog from holding a long delete lock.
export async function purgeExpiredNotifications(db, { now = Date.now(), batchSize = 1000, maxBatches = 10 } = {}) {
  const cutoff = notificationCutoff(now);
  let deleted = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await db.notification.findMany({
      where: { created_date: { lte: cutoff } }, orderBy: { created_date: "asc" },
      select: { id: true }, take: batchSize,
    });
    if (!rows.length) break;
    const result = await db.notification.deleteMany({ where: {
      id: { in: rows.map((row) => row.id) }, created_date: { lte: cutoff },
    } });
    deleted += result.count;
    if (rows.length < batchSize) break;
  }
  return deleted;
}

export function startNotificationRetentionWorker(purge, { intervalMs = 60000, onError = console.error } = {}) {
  let running = null;
  const tick = () => {
    if (!running) running = Promise.resolve().then(purge)
      .catch((error) => onError("[Notification retention] Cleanup failed; will retry", error.message))
      .finally(() => { running = null; });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return async () => { clearInterval(timer); await running; };
}
