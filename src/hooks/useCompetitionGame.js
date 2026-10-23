import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";
import { DEFAULT_EIGHTS_GAMES, withMw4Preview } from "@/lib/freeEightsGames";
import { PRIMARY_GAME_ID } from "@/lib/mw4";
import { useFreeEightsGames } from "./useFreeEightsGames";

export default function useCompetitionGame() {
  const [params, setParams] = useSearchParams();
  const query = useFreeEightsGames();
  const games = useMemo(() => withMw4Preview(query.data?.games || DEFAULT_EIGHTS_GAMES).filter(game => game.enabled), [query.data?.games]);
  const game = games.find(entry => entry.id === (params.get("game") || PRIMARY_GAME_ID)) || games[0];
  const setGameId = useCallback(id => setParams(previous => { const next = new URLSearchParams(previous); next.set("game", id); return next; }), [setParams]);
  return { games, game, gameId: game.id, setGameId };
}
