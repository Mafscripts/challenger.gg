// CDL 2026 Official Map Pool
export const CDL_2026_MAPS = {
  hp: [
    { id: "hp_sake", name: "Sake", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_sake.jpg" },
    { id: "hp_colossus", name: "Colossus", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_colossus.jpg" },
    { id: "hp_den", name: "Den", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_den.jpg" },
    { id: "hp_scar", name: "Scar", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_scar.jpg" },
    { id: "hp_gridlock", name: "Gridlock", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_gridlock.jpg" },
    { id: "hp_hacienda", name: "Hacienda", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_hacienda.jpg" }
  ],
  snd: [
    { id: "snd_den", name: "Den", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_den.jpg" },
    { id: "snd_gridlock", name: "Gridlock", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_gridlock.jpg" },
    { id: "snd_raid", name: "Raid", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_raid.jpg" },
    { id: "snd_fringe", name: "Fringe", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_fringe.jpg" },
    { id: "snd_sake", name: "Sake", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_sake.jpg" },
    { id: "snd_hacienda", name: "Hacienda", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_hacienda.jpg" }
  ],
  overload: [
    { id: "ol_den", name: "Den", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_den.jpg" },
    { id: "ol_exposure", name: "Exposure", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_exposure.jpg" },
    { id: "ol_scar", name: "Scar", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_scar.jpg" },
    { id: "ol_gridlock", name: "Gridlock", image: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_gridlock.jpg" }
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
    const map = pool.find(m => m.id === mapId || m.name === mapId);
    if (map) return map;
  }
  return null;
};