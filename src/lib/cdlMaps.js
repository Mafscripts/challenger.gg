// Shared map artwork used by every match room. Keep this name-based so maps
// stored in older matches automatically receive the current artwork.
export const MAP_IMAGES = {
  hacienda: "/assets/maps/hacienda.jpg",
  gridlock: "/assets/maps/gridlock.jpg",
  raid: "/assets/maps/raid.jpg",
  fringe: "/assets/maps/fringe.jpg",
  scar: "/assets/maps/scar.jpg",
  den: "/assets/maps/den.jpg",
  colossus: "/assets/maps/colossus.jpg",
  colosses: "/assets/maps/colossus.jpg",
  sake: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_sake.jpg",
  exposure: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_exposure.jpg",
};

const normalizedMapName = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
export const getMapImage = (mapName) => MAP_IMAGES[normalizedMapName(mapName)] || "";

// CDL 2026 Official Map Pool
export const CDL_2026_MAPS = {
  hp: [
    { id: "hp_sake", name: "Sake", image: getMapImage("Sake") },
    { id: "hp_colossus", name: "Colossus", image: getMapImage("Colossus") },
    { id: "hp_den", name: "Den", image: getMapImage("Den") },
    { id: "hp_scar", name: "Scar", image: getMapImage("Scar") },
    { id: "hp_gridlock", name: "Gridlock", image: getMapImage("Gridlock") },
    { id: "hp_hacienda", name: "Hacienda", image: getMapImage("Hacienda") }
  ],
  snd: [
    { id: "snd_den", name: "Den", image: getMapImage("Den") },
    { id: "snd_gridlock", name: "Gridlock", image: getMapImage("Gridlock") },
    { id: "snd_raid", name: "Raid", image: getMapImage("Raid") },
    { id: "snd_fringe", name: "Fringe", image: getMapImage("Fringe") },
    { id: "snd_sake", name: "Sake", image: getMapImage("Sake") },
    { id: "snd_hacienda", name: "Hacienda", image: getMapImage("Hacienda") }
  ],
  overload: [
    { id: "ol_den", name: "Den", image: getMapImage("Den") },
    { id: "ol_exposure", name: "Exposure", image: getMapImage("Exposure") },
    { id: "ol_scar", name: "Scar", image: getMapImage("Scar") },
    { id: "ol_gridlock", name: "Gridlock", image: getMapImage("Gridlock") }
  ]
};

export const getMapPool = (gameMode) => {
  const modeMap = {
    hp: "hp",
    hardpoint: "hp",
    snd: "snd",
    "search & destroy": "snd",
    "search and destroy": "snd",
    overload: "overload"
  };
  const key = modeMap[gameMode?.toLowerCase()] || "snd";
  return CDL_2026_MAPS[key];
};

export const getMapById = (mapId) => {
  for (const pool of Object.values(CDL_2026_MAPS)) {
    const normalized = normalizedMapName(mapId);
    const map = pool.find(m => m.id === mapId || normalizedMapName(m.name) === normalized);
    if (map) return map;
  }
  return null;
};
