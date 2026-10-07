import React from "react";
import { Award, ChevronsUp, Crown, Shield, Sprout, Swords } from "lucide-react";
import { getFreeEightsSkill } from "@/lib/freeEightsSkill";

const icons = { newb: Sprout, advanced: ChevronsUp, amateur: Shield, challenger: Swords, topfragger: Crown };

export default function FreeEightsRankBadge({ elo = 0, screenshotRank }) {
  const rank = getFreeEightsSkill(elo, screenshotRank);
  const Icon = rank.source === "screenshot" ? Award : icons[rank.key];
  return <span title={`${rank.source === "screenshot" ? "Screenshot rank" : "Free 8s rank"}: ${rank.name} · ${rank.elo} Free 8s ELO`} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${rank.style}`}><Icon className="h-3 w-3" aria-hidden="true" />{rank.name}</span>;
}
