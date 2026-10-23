// Preserve React state identity when polling returns unchanged objects.
// Compare all fields so changes to nested menu data remain visible.
export function retainHeaderSnapshot(current, next) {
  if (current === next) return current;
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}
