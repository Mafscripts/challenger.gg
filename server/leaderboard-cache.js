const snapshots = new Map();
const MAX_SNAPSHOTS = 32;
const LIFETIME_MS = 3_000;

// Share concurrent public standings reads. Never cache request/user objects or
// personal API responses here; mutations clear snapshots before replying.
export function readLeaderboardSnapshot(key, read) {
  const cached = snapshots.get(key);
  if (cached && (!cached.expiresAt || cached.expiresAt > Date.now())) return cached.promise;
  const entry = { expiresAt: 0, promise: null };
  entry.promise = Promise.resolve().then(read).then((value) => {
    if (snapshots.get(key) === entry) {
      if (value?.success === false) snapshots.delete(key);
      else entry.expiresAt = Date.now() + LIFETIME_MS;
    }
    return value;
  }).catch((error) => {
    if (snapshots.get(key) === entry) snapshots.delete(key);
    throw error;
  });
  if (snapshots.size >= MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value);
  snapshots.set(key, entry);
  return entry.promise;
}

export const invalidateLeaderboardSnapshots = () => snapshots.clear();
