export const supportModeLabel = value => ({ hp: "Hardpoint", hardpoint: "Hardpoint", snd: "Search & Destroy", topfragg: "Topfragg Variant", hijacked: "Hijacked", control: "Control", overload: "Overload" })[value] || value || "Mode pending";
const mapName = map => typeof map === "string" ? map : map?.map_name || map?.name || (typeof map?.map === "string" ? map.map : map?.map?.name) || map?.title || "";
export function supportMatchMaps(match = {}) {
  const candidates = [match.series_maps, match.maps, match.map_series, match.map_sequence, match.selected_maps, match.maps_played];
  const series = candidates.find(value => Array.isArray(value) && value.some(map => mapName(map))) || (match.final_map_name || match.map_name ? [match.final_map_name || match.map_name] : []);
  const bans = Object.entries(match.map_veto?.bans || {}).map(([side, ban]) => ({ name: mapName(ban.map || ban), side, by: ban.captain_name || ban.user_name || ban.vetoed_by_name }));
  if (match.host_banned_map_name) bans.push({ name: match.host_banned_map_name, side: "team_a", by: match.host_name });
  if (match.challenger_banned_map_name) bans.push({ name: match.challenger_banned_map_name, side: "team_b", by: match.challenger_name });
  for (const ban of [...(Array.isArray(match.vetoed_maps) ? match.vetoed_maps : []), ...(Array.isArray(match.banned_maps) ? match.banned_maps : [])]) bans.push({ name: mapName(ban) });
  const key = name => String(name).trim().toLowerCase();
  const rows = series.filter(map => mapName(map)).map((map, index) => {
    const value = typeof map === "object" ? map : {};
    const ban = bans.find(ban => key(ban.name) === key(mapName(map)));
    return { name: mapName(map), mode: supportModeLabel(value.mode || value.game_mode || match.series_modes?.[index] || match.game_mode_display || match.game_mode),
      scoreA: value.team_a_score ?? value.team_alpha_score ?? value.score_alpha, scoreB: value.team_b_score ?? value.team_bravo_score ?? value.score_bravo,
      vetoed: Boolean(ban), vetoBy: ban?.by || (ban?.side === "team_a" ? match.team_a_name || "Team Alpha" : ban?.side === "team_b" ? match.team_b_name || "Team Bravo" : null),
      selected: key(mapName(map)) === key(match.final_map_name || "") };
  });
  for (const ban of bans) if (ban.name && !rows.some(row => key(row.name) === key(ban.name))) rows.push({ name: ban.name, mode: "Vetoed map", vetoed: true, vetoBy: ban.by || (ban.side === "team_a" ? match.team_a_name || "Team Alpha" : ban.side === "team_b" ? match.team_b_name || "Team Bravo" : null) });
  return rows;
}
