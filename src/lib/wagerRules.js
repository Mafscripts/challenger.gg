export const WAGER_PLAY_RULES = [
  {
    value: "controller_only",
    label: "Controller Only",
    shortLabel: "Controller only",
    description: "Controllers are required. Mouse and keyboard input is not allowed.",
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
