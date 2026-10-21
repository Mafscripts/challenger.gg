import React from "react";
import { monthlyEightsPrizeLabel } from "@/lib/commerce";
import { Shield, Trophy } from "lucide-react";
import { freeEightsMatchCode, freeEightsMatchFormat } from "@/lib/freeEightsRoomIdentity";
import FreeEightsGameName from "@/components/competition/FreeEightsGameName";
import { DEFAULT_EIGHTS_GAMES, eightsGameId } from "@/lib/freeEightsGames";
import MatchRoomHeader, { MatchRoomTitle } from "@/components/match/MatchRoomHeader";

export default function FreeEightsMatchHeader({ match, actions, status, complete, progress }) {
  return (
    <MatchRoomHeader
      label="Free 8s match room" icon={Shield}
      title={<MatchRoomTitle alpha="Team Alpha" bravo="Team Bravo" />}
      subtitle={<FreeEightsGameName game={match.game_config || DEFAULT_EIGHTS_GAMES.find((game) => game.id === eightsGameId(match))} />}
      status={status} complete={complete}
      metadata={[
        { label: "Format", value: freeEightsMatchFormat(match) },
        { label: "Series", value: `Best of ${match.best_of || 3}` },
        { label: "Competition", value: "Free 8s · ELO" },
        { label: "Match ID", value: `#${freeEightsMatchCode(match.id)}` },
      ]}
      actions={actions}
      progress={progress}
      extra={eightsGameId(match) === "bo7" && (
        <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-yellow-300/20 bg-yellow-300/[0.04] px-3 py-2 text-[10px] text-vapor">
          <Trophy className="h-3.5 w-3.5 text-yellow-300" aria-hidden="true" /> #1 Champion ELO
          <strong className="font-mono text-sm text-yellow-300">{monthlyEightsPrizeLabel}</strong>
        </div>
      )}
    />
  );
}
