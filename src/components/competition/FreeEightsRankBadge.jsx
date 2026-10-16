import React from "react";
import { ChevronsUp, Crown, Shield, Sprout, Swords } from "lucide-react";
import { getFreeEightsSkill } from "@/lib/freeEightsSkill";
import { screenshotRankFor } from "@/lib/screenshotRanks";
import { gameRankEmblems } from "@/components/competition/GameRankEmblem";
import BadgeTooltip from "@/components/ui/BadgeTooltip";

const icons = { newb: Sprout, advanced: ChevronsUp, amateur: Shield, challenger: Swords, topfragger: Crown };

export default function FreeEightsRankBadge({ elo = 0, screenshotRank }) {
  const rank = getFreeEightsSkill(elo, screenshotRank);
  const Icon = rank.source === "screenshot" ? gameRankEmblems[rank.key] : icons[rank.key];
  const description = `${rank.source === "screenshot" ? `Equivalent to ${screenshotRankFor(rank.key).gameLabel}` : "Free 8s rank"} · ${rank.elo} Free 8s ELO.`;
  const toneClass = rank.style.split(" ").find((token) => token.startsWith("text-")) || "text-white";
  return <BadgeTooltip label={rank.name} description={description} icon={Icon} toneClass={toneClass}>
    <span tabIndex={0} className={`relative inline-flex shrink-0 cursor-default items-center gap-2 rounded-lg border py-1 pl-1.5 pr-2.5 text-[10px] font-black uppercase tracking-[0.08em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${rank.style}`}><Icon className={rank.source === "screenshot" ? "h-7 w-7 drop-shadow-[0_0_5px_currentColor]" : "m-1 h-5 w-5"} aria-hidden="true" />{rank.name}</span>
  </BadgeTooltip>;
}
