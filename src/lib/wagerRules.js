export const WAGER_PLAY_RULES = [
  {
    value: "controller_only",
    label: "PC + Controller Only",
    shortLabel: "PC + Controller only",
    description: "PC is allowed, but every player must use a controller. Mouse and keyboard input is not allowed.",
  },
  {
    value: "mixed_pc_allowed",
    label: "MNK + Controller",
    shortLabel: "MNK + Controller · PC allowed",
    description: "Mouse and keyboard and controller players may compete. PC is allowed.",
  },
  {
    value: "console_only",
    label: "Console Only",
    shortLabel: "Console only",
    description: "Every player must compete on a supported console. PC is not allowed.",
  },
];

export const wagerPlayRule = (value) => (
  WAGER_PLAY_RULES.find((rule) => rule.value === value) || WAGER_PLAY_RULES[0]
);
