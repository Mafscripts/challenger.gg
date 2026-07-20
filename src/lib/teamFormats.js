export const TEAM_ROSTER_FORMATS = [
  { value: 1, label: "Solo", matchLabel: "1v1" },
  { value: 2, label: "Duo", matchLabel: "2v2" },
  { value: 3, label: "Trio", matchLabel: "3v3" },
  { value: 4, label: "Squad", matchLabel: "4v4" },
];

export const normalizeTeamRosterSize = (value, fallback = 4) => {
  const size = Number.parseInt(String(value || fallback), 10);
  return Math.min(4, Math.max(1, Number.isFinite(size) ? size : fallback));
};

export const teamRosterFormat = (value) => {
  const size = normalizeTeamRosterSize(value);
  return TEAM_ROSTER_FORMATS.find((format) => format.value === size)?.label || "Squad";
};

export const matchSizeFormat = (value) => teamRosterFormat(Number.parseInt(String(value || "4v4"), 10));
