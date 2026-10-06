import React from "react";
import MatchChat from "@/components/match/MatchChat";

export default function MatchRoomChat({ conversationId, matchType, teamAPlayers = [], teamBPlayers = [], inputActions = null, heightClass = "h-[520px] xl:h-[680px]", pollIntervalMs = 1000, messageLimit = 100 }) {
  return (
    <MatchChat
      conversationId={conversationId}
      matchType={matchType}
      accent="orange"
      teamAPlayerIds={teamAPlayers}
      teamBPlayerIds={teamBPlayers}
      teamAColor="orange"
      teamBColor="cyan"
      live
      compact
      sticky={false}
      heightClass={heightClass}
      pollIntervalMs={pollIntervalMs}
      messageLimit={messageLimit}
      inputActions={inputActions}
    />
  );
}
