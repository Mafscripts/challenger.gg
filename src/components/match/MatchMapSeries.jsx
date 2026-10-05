import React from "react";
import { Map as MapIcon } from "lucide-react";
import { getMapImage } from "@/lib/cdlMaps";

const mapName = (map) => typeof map === "string" ? map : (map?.map || map?.name || "Map pending");
const mapMode = (map, fallback) => typeof map === "string" ? fallback : (map?.mode || map?.game_mode_display || fallback);
const mapHost = (map, fallback) => typeof map === "string" ? fallback : (map?.host_team_name || map?.host_name || fallback);

export default function MatchMapSeries({
  maps = [],
  title = "Map Series",
  mode = "Search and Destroy",
  host = "TBD",
  bestOf,
  compact = false,
  emptyText = "Maps are being generated.",
}) {
  const visibleMaps = (Array.isArray(maps) ? maps : [maps]).filter(Boolean);
  const columns = visibleMaps.length <= 1 ? "sm:grid-cols-1" : visibleMaps.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <section className={`dark-focus dark-media h-full rounded-xl border border-white/[0.09] bg-[#202833] ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white">
          <MapIcon className="h-4 w-4 text-cyan" /> {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {bestOf ? <span className="rounded-lg border border-cyan/20 bg-cyan/[0.07] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan">BO{bestOf} · {mode}</span> : null}
          {host ? <span className="rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2 text-[9px] font-bold text-vapor">Host <strong className="ml-1 text-white">{host}</strong></span> : null}
        </div>
      </div>

      <div className={`mt-4 grid gap-2 ${columns}`}>
        {visibleMaps.length === 0 ? (
          <div className="rounded-lg border border-white/[0.06] bg-black/15 p-4 text-sm text-vapor">{emptyText}</div>
        ) : visibleMaps.map((map, index) => {
          const name = mapName(map);
          const image = getMapImage(name);
          const mapNumber = typeof map === "string" ? index + 1 : (map?.game || map?.number || index + 1);
          const currentHost = mapHost(map, host);

          return (
            <article key={`${name}-${mapNumber}`} className={`group relative isolate overflow-hidden rounded-xl border border-white/[0.1] bg-black/25 shadow-[0_12px_28px_rgba(0,0,0,0.2)] ${compact ? "min-h-[126px]" : "min-h-[156px]"}`}>
              {image ? <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" /> : null}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070b11] via-[#070b11]/45 to-[#070b11]/60" />
              <div className={`relative flex h-full flex-col justify-between ${compact ? "min-h-[126px] p-3" : "min-h-[156px] p-3.5"}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-md border border-cyan/25 bg-[#07121b]/85 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-cyan backdrop-blur-sm">Map {mapNumber}</span>
                  <span className="max-w-[68%] truncate rounded-md border border-white/15 bg-[#080c12]/80 px-2 py-1 text-[7px] font-black uppercase tracking-wider text-white/85 backdrop-blur-sm">{mapMode(map, mode)}</span>
                </div>
                <div>
                  <h3 className={`${compact ? "text-base" : "text-lg"} inline-block max-w-full truncate rounded-md border border-white/10 bg-[#080c12]/85 px-2 py-1 font-black leading-none text-white shadow-lg backdrop-blur-sm`} title={name}>{name}</h3>
                  {currentHost ? <p className="mt-1.5 w-fit max-w-full truncate rounded-md border border-white/10 bg-[#080c12]/80 px-2 py-1 text-[9px] text-white/75 backdrop-blur-sm">Host <strong className="ml-1 text-cyan">{currentHost}</strong></p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
