import React from "react";
import { Gamepad2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FreeEightsGameName from "./FreeEightsGameName";

export default function CompetitionGameSelect({ games, value, onChange }) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label="Switch game" className="competition-action-pill competition-game-switch"><Gamepad2 className="h-4 w-4 shrink-0 text-vapor" /><span className="min-w-0"><SelectValue /></span></SelectTrigger>
    <SelectContent className="z-[150] rounded-xl border-white/10 bg-[#111821] text-white">
      {games.map(game => <SelectItem key={game.id} value={game.id} className="cursor-pointer focus:!bg-transparent focus:!text-cyan data-[highlighted]:!bg-transparent data-[highlighted]:!text-cyan"><FreeEightsGameName game={game} /></SelectItem>)}
    </SelectContent>
  </Select>;
}
