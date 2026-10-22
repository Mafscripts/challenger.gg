export const MW4_FREE_EIGHTS_RULES_ID = "mw4-free-8s";
export const MW4_FREE_EIGHTS_RULES_URL = `/rules#${MW4_FREE_EIGHTS_RULES_ID}`;

export const mw4FreeEightsRules = [
  { label: "Weapons", text: "Use the following weapon restrictions:", items: [
    "Assault rifles: all allowed except M4, which is banned.",
    "Pistols: .50 GS and Mojave .357 are banned.",
    "Marksman rifles: all banned.",
    "Shotguns: all banned.",
    "LMGs: all banned.",
    "Sniper rifles: allowed with no attachments.",
  ] },
  { label: "Attachments & ammunition", text: "All suppressors and lasers are banned. Hollow Point, Frangible and Apex are banned." },
  { label: "Tactical equipment", text: "Only Concussion is allowed. All other tacticals are banned." },
  { label: "Lethal equipment", text: "Only Grenades and Semtex are allowed. All other lethals are banned." },
  { label: "Perk 1", text: "Only Ghost is allowed. All other Perk 1 options are banned." },
  { label: "Perk 2", text: "Blood Rush, Bomb Squad, Fast Hands and Ninja are allowed. All other Perk 2 options are banned." },
  { label: "Perk 3", text: "Only Battle Hardened is allowed. All other Perk 3 options are banned." },
  { label: "Scorestreaks", text: "All scorestreaks are banned." },
];

export const usesMw4FreeEightsRules = (match) => match?.match_type === "8s" && match?.game_id === "mw4";
