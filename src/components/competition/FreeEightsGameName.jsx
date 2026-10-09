import React from "react";
import { DEFAULT_EIGHTS_GAMES } from "@/lib/freeEightsGames";
export default function FreeEightsGameName({ game = DEFAULT_EIGHTS_GAMES[0], prefix = "" }) {
  return <span>{prefix}{game.name}{game.number && <> <span className={game.color === "green" ? "text-green" : "text-orange"}>{game.number}</span></>}</span>;
}
