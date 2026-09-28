import React from "react";
import { Check, X, Target, Zap, Shield } from "lucide-react";
import { getMapImage, getMapPool } from "@/lib/cdlMaps";

export default function MapVetoVertical({ wager, ranked = false, compact = false }) {
  const maps = getMapPool(wager?.game_mode) || getMapPool("snd");
  const hostBannedMap = wager?.host_banned_map_name;
  const challengerBannedMap = wager?.challenger_banned_map_name;
  const finalMap = wager?.final_map_name;
  const Icon = wager?.game_mode === "snd" ? Target : wager?.game_mode === "hp" ? Shield : Zap;

  if (ranked) {
    if (compact) {
      return (
        <section className="dark-focus dark-media h-full rounded-xl border border-white/[0.09] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white"><Icon className="h-4 w-4 text-cyan" /> Ranked Map</h2>
            <span className="rounded-lg border border-cyan/20 bg-cyan/[0.07] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan">BO1 · {wager?.game_mode_display || wager?.game_mode || "Ranked"}</span>
          </div>
          {finalMap ? (
            <div className="group relative isolate min-h-[156px] overflow-hidden rounded-xl border border-white/[0.1] bg-black/25">
              {getMapImage(finalMap) ? <img src={getMapImage(finalMap)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]" /> : null}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070b11] via-[#070b11]/40 to-[#070b11]/55" />
              <div className="relative flex min-h-[156px] flex-col justify-between p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md border border-cyan/25 bg-[#07121b]/85 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-cyan backdrop-blur-sm">Selected map</span>
                  <span className="rounded-md border border-green/25 bg-[#07140f]/85 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-green backdrop-blur-sm">Ready to play</span>
                </div>
                <h3 className="w-fit max-w-full truncate rounded-md border border-white/10 bg-[#080c12]/85 px-2.5 py-1.5 text-xl font-black leading-none text-white shadow-lg backdrop-blur-sm">{finalMap}</h3>
              </div>
            </div>
          ) : <p className="flex min-h-[156px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/15 p-5 text-center text-sm text-vapor">Map will be revealed when both rosters are full</p>}
        </section>
      );
    }

    return (
      <section className="dark-focus dark-media rounded-xl border border-white/[0.09] p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]"><Icon className="h-4 w-4 text-cyan" /> Ranked Map</h3><span className="rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 text-[9px] font-black uppercase text-cyan">BO1</span></div>
        {finalMap ? <VisualMap name={finalMap} label="Randomly selected" status="Play map" /> : <p className="rounded-xl border border-white/5 bg-background/30 p-5 text-center text-sm text-vapor">Selecting map...</p>}
      </section>
    );
  }

  const visibleMaps = maps.filter((map) => [hostBannedMap, challengerBannedMap, finalMap].includes(map.name));
  return (
    <section className="dark-focus dark-media rounded-xl border border-white/[0.09] p-5">
      <div className="mb-4 flex items-center gap-2"><Icon className="h-4 w-4 text-cyan" /><h3 className="text-xs font-black uppercase tracking-[0.16em]">CDL 2026 Map Veto</h3></div>
      <div className="grid gap-2 sm:grid-cols-3">
        {visibleMaps.map((map) => {
          const isHostBanned = map.name === hostBannedMap;
          const isChallengerBanned = map.name === challengerBannedMap;
          const isFinal = map.name === finalMap;
          const status = isFinal ? "Selected" : isHostBanned ? "Vetoed by Alpha" : "Vetoed by Bravo";
          return <VisualMap key={map.id} name={map.name} image={map.image} label={status} status={isFinal ? "Play map" : "Vetoed"} muted={!isFinal} tone={isFinal ? "green" : isHostBanned ? "cyan" : "orange"} />;
        })}
        {visibleMaps.length === 0 ? <p className="rounded-xl border border-white/5 bg-background/30 p-5 text-center text-sm text-vapor sm:col-span-3">Map veto is pending.</p> : null}
      </div>
    </section>
  );
}

function VisualMap({ name, image, label, status, muted = false, tone = "green" }) {
  const toneClass = tone === "cyan" ? "text-cyan border-cyan/25" : tone === "orange" ? "text-orange border-orange/25" : "text-green border-green/25";
  const mapImage = image || getMapImage(name);
  return (
    <article className={`group relative isolate min-h-[142px] overflow-hidden rounded-xl border bg-black/25 ${toneClass}`}>
      {mapImage ? <img src={mapImage} alt="" loading="lazy" decoding="async" className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035] ${muted ? "grayscale opacity-60" : ""}`} /> : null}
      <div className="absolute inset-0 bg-gradient-to-t from-[#070b11] via-[#070b11]/45 to-[#070b11]/60" />
      <div className="relative flex min-h-[142px] flex-col justify-between p-3">
        <div className="flex items-center justify-between gap-2"><span className="rounded-md border border-white/10 bg-[#080c12]/85 px-2 py-1 text-[8px] font-black uppercase tracking-wider backdrop-blur-sm">{label}</span>{muted ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}</div>
        <div><h4 className="w-fit max-w-full truncate rounded-md border border-white/10 bg-[#080c12]/85 px-2 py-1 text-lg font-black leading-none text-white backdrop-blur-sm">{name}</h4><p className="mt-1.5 text-[8px] font-black uppercase tracking-wider">{status}</p></div>
      </div>
    </article>
  );
}
