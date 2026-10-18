export function partyWheelFrame(spin, count, now, offset = 0, reducedMotion = false) {
  if (!spin || count < 1) return { progress: 0, rotation: 0, finished: false };
  const started = Date.parse(spin.started_at), duration = Number(spin.duration_ms);
  if (!Number.isFinite(started) || !(duration > 0)) return { progress: 0, rotation: 0, finished: false };
  const progress = Math.max(0, Math.min(1, (now + offset - started) / duration));
  const index = spin.scope === "all_teams" ? spin.landing_index : spin.entries?.findIndex((entry) => entry.id === spin.selected_id);
  const target = Number.isInteger(index) && index >= 0 && index < count ? index : 0;
  const rotation = (360 * (spin.turns || 6) + 360 - (target + .5) * (360 / count))
    * (reducedMotion ? Number(progress === 1) : 1 - (1 - progress) ** 4);
  return { progress, rotation, finished: progress === 1 };
}

// Opening an old draw must never replay a fanfare or a celebration.
export function partyWheelIsLive(spin, now, offset = 0) {
  return Boolean(spin && now + offset < Date.parse(spin.started_at) + spin.duration_ms);
}
