import React from "react";
import { ChevronsUp, Crown, Shield, Sprout, Swords } from "lucide-react";
import { getFreeEightsRank, normalizeFreeEightsElo } from "@/lib/freeEightsRanks";

const icons = { newb: Sprout, advanced: ChevronsUp, amateur: Shield, challenger: Swords, topfragger: Crown };

export default function FreeEightsRankBadge({ elo = 0 }) {
  const rank = getFreeEightsRank(elo);
  const Icon = icons[rank.key];
  return <span title={`Free 8s: ${rank.name} · ${normalizeFreeEightsElo(elo)} ELO`} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${rank.style}`}><Icon className="h-3 w-3" aria-hidden="true" />{rank.name}</span>;
}
