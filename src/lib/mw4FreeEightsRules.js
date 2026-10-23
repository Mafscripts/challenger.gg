export const MW4_FREE_EIGHTS_RULES_ID = "mw4-free-8s";
export const MW4_FREE_EIGHTS_RULES_URL = `/rules#${MW4_FREE_EIGHTS_RULES_ID}`;

export const mw4FreeEightsRules = [
  { label: "Hardpoint settings", text: "Respawn delay: 3 seconds. Friendly fire: On." },
  { label: "Hijacked settings", text: "Respawn delay: 3 seconds. Friendly fire: On." },
  { label: "Weapons", text: "Use the following weapon restrictions:", items: [
    "Assault rifles: only HAN 86 is allowed. All other assault rifles are banned.",
    "SMGs: only ISO and VEL are allowed. All other SMGs are banned.",
    "Pistols: .50 GS and Mojave .357 are banned.",
    "Marksman rifles: all banned.",
    "Shotguns: all banned.",
    "LMGs: all banned.",
    "Sniper rifles: allowed with no attachments.",
  ] },
  { label: "Attachments & ammunition", text: "All suppressors and lasers are banned. Hollow Point, Frangible and Apex are banned." },
  { label: "Tactical equipment", text: "Only Concussion is allowed. All other tacticals are banned." },
  { label: "Lethal equipment", text: "Only Grenades and Semtex are allowed. All other lethals are banned." },
  { label: "Perk 1", text: "Kill Chain and Resupply are allowed. All other Perk 1 options are banned." },
  { label: "Perk 2", text: "Blood Rush, Bomb Squad, Fast Hands and Ninja are allowed. All other Perk 2 options are banned." },
  { label: "Perk 3", text: "Only Battle Hardened is allowed. All other Perk 3 options are banned." },
  { label: "Scorestreaks", text: "All scorestreaks are banned." },
];

export const usesMw4FreeEightsRules = (match) => match?.match_type === "8s" && match?.game_id === "mw4";
