import React, { useId } from "react";
import { Award, ChevronsUp, Crown, Shield, Sprout, Swords } from "lucide-react";
import { getFreeEightsSkill } from "@/lib/freeEightsSkill";
import BadgeTooltip from "@/components/ui/BadgeTooltip";

const icons = { newb: Sprout, advanced: ChevronsUp, amateur: Shield, challenger: Swords, topfragger: Crown };

export default function FreeEightsRankBadge({ elo = 0, screenshotRank }) {
  const tooltipId = useId();
  const rank = getFreeEightsSkill(elo, screenshotRank);
  const Icon = rank.source === "screenshot" ? Award : icons[rank.key];
  const description = `${rank.source === "screenshot" ? "Game rank" : "Free 8s rank"} · ${rank.elo} Free 8s ELO.`;
  const toneClass = rank.style.split(" ").find((token) => token.startsWith("text-")) || "text-white";
  return <span tabIndex={0} aria-describedby={tooltipId} className={`group/badge relative inline-flex shrink-0 cursor-default items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${rank.style}`}><Icon className="h-3 w-3" aria-hidden="true" />{rank.name}<BadgeTooltip id={tooltipId} label={rank.name} description={description} icon={Icon} toneClass={toneClass} /></span>;
}
