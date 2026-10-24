const timeZoneValidity = new Map();

export function isValidTournamentTimeZone(value) {
  if (typeof value !== "string" || !value || value.length > 100) return false;
  if (timeZoneValidity.has(value)) return timeZoneValidity.get(value);
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(0);
    timeZoneValidity.set(value, true);
    return true;
  } catch {
    timeZoneValidity.set(value, false);
    return false;
  }
}

export function resolvedBrowserTimeZone() {
  try {
    const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTournamentTimeZone(value) ? value : "UTC";
  } catch {
    return "UTC";
  }
}

export function resolveTournamentTimeZone(value = "local") {
  return value !== "local" && isValidTournamentTimeZone(value) ? value : resolvedBrowserTimeZone();
}

const explicitTimestamp = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([Zz]|[+-]\d{2}:?\d{2})$/;

// Tournament writers store UTC ISO timestamps. A legacy wall-clock value with
// no offset has no known origin; do not reinterpret it in each viewer's zone.
export function tournamentTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? value : NaN;
  if (typeof value !== "string") return NaN;
  const raw = value.trim();
  const match = raw.match(explicitTimestamp);
  if (!match) return NaN;
  const [, year, month, day, hour, minute, second] = match;
  const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days[Number(month) - 1]
    || Number(hour) > 23 || Number(minute) > 59 || Number(second || 0) > 59) return NaN;
  return Date.parse(raw.replace(/[Tt ]/, "T").replace(/z$/, "Z"));
}

const formatters = new Map();
const formatterFor = (timeZone) => {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-GB", {
      timeZone, weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset",
    }));
  }
  return formatters.get(timeZone);
};

export function tournamentTimeParts(value, { timeZone } = {}) {
  const zoneName = resolveTournamentTimeZone(timeZone);
  const timestamp = tournamentTimestamp(value);
  if (!Number.isFinite(timestamp)) return {
    valid: false, dateLabel: "To be announced", timeLabel: "", zoneLabel: "", zoneName,
    iso: "", month: "", day: "", weekday: "", year: "",
  };
  const date = new Date(timestamp);
  const parts = Object.fromEntries(formatterFor(zoneName).formatToParts(date)
    .filter(({ type }) => type !== "literal").map(({ type, value: part }) => [type, part]));
  return {
    valid: true,
    dateLabel: `${parts.day} ${parts.month} ${parts.year}`,
    timeLabel: `${parts.hour}:${parts.minute}`,
    zoneLabel: parts.timeZoneName.replace(/^GMT[+-]0(?::00)?$/, "GMT"),
    zoneName,
    iso: date.toISOString(),
    month: parts.month,
    day: parts.day,
    weekday: parts.weekday,
    year: parts.year,
  };
}

export function formatTournamentTime(value, { timeZone, full = false } = {}) {
  const parts = tournamentTimeParts(value, { timeZone });
  if (!parts.valid) return parts.dateLabel;
  return `${full ? `${parts.weekday}, ` : ""}${parts.dateLabel}, ${parts.timeLabel}`;
}
