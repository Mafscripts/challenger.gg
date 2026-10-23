import React from "react";
import { Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XP_CATEGORIES, xpCategory } from "@/lib/xpCategories";
import "@/styles/xp-match-controls.css";
import "@/styles/xp-formats.css";
export default function XPFormatSelect({ value, onChange, allowGlobal = false }) {
  const current = value === "global" ? { label: "Global XP" } : xpCategory(value);
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="competition-action-pill competition-game-switch" aria-label="XP competition format"><Users className="h-4 w-4 shrink-0 text-vapor" /><span className="min-w-0"><SelectValue>{current.label}</SelectValue></span></SelectTrigger><SelectContent className="z-[150] rounded-xl border-white/10 bg-[#111821] text-white">
    {(allowGlobal ? [{ id: "global", label: "Global XP" }, ...XP_CATEGORIES] : XP_CATEGORIES).map((entry) => <SelectItem key={entry.id} value={entry.id} textValue={entry.label} className="cursor-pointer focus:!bg-transparent focus:!text-cyan data-[highlighted]:!bg-transparent data-[highlighted]:!text-cyan">{entry.label}</SelectItem>)}
  </SelectContent></Select>;
}
