// API polling returns new objects even for unchanged data. Keep the previous
// reference to avoid rerendering trees and restarting effects unnecessarily.
export function retainDataSnapshot(current, next) {
  if (current === next) return current;
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}
