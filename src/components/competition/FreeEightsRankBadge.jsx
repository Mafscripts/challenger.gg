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
    <span tabIndex={0} aria-label={rank.name} className={`relative inline-flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${toneClass}`}><Icon className={rank.source === "screenshot" ? "h-7 w-7" : "h-5 w-5"} aria-hidden="true" /></span>
  </BadgeTooltip>;
}
