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
    <span tabIndex={0} className={`relative inline-flex h-[26px] shrink-0 cursor-default items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-2 text-[9px] font-bold uppercase tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${toneClass}`}><Icon className={rank.source === "screenshot" ? "h-5 w-5" : "h-3.5 w-3.5"} aria-hidden="true" />{rank.name}</span>
  </BadgeTooltip>;
}
