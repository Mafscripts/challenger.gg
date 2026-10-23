// Publish each list as soon as it arrives; one slow competition must not hold
// the selected competition behind its loading state.
export async function loadMatchfinderSources(api, onSource) {
  const sources = [
    ["xp", () => api.entities.XPMatch.filterFresh({ status: "open", matchfinder_visible: true }, "-created_date", 100)],
    ["elo", () => api.entities.RankedMatch.filterFresh({ status: "open", matchfinder_visible: true }, "-created_date", 100)],
    ["wagers", () => api.entities.Wager.filterFresh({ status: "open", matchfinder_visible: true }, "-created_date", 100)],
    ["tournaments", () => api.entities.Tournament.filterFresh({}, "start_date", 100)],
  ];
  await Promise.all(sources.map(async ([key, load]) => {
    let rows;
    try { rows = await load(); } catch { rows = []; }
    onSource(key, rows || []);
  }));
}
