import React from "react";
import { Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XP_CATEGORIES, xpCategory } from "@/lib/xpCategories";
import "@/styles/xp-match-controls.css";
import "@/styles/xp-formats.css";
export default function XPFormatSelect({ value, onChange, allowGlobal = false }) {
  const current = value === "global" ? { label: "Global XP" } : xpCategory(value);
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="xp-team-select-trigger xp-format-select" aria-label="XP competition format"><Users size={16} /><SelectValue>{current.label}</SelectValue></SelectTrigger><SelectContent className="xp-team-select-menu" sideOffset={5}>
    {(allowGlobal ? [{ id: "global", label: "Global XP" }, ...XP_CATEGORIES] : XP_CATEGORIES).map((entry) => <SelectItem key={entry.id} value={entry.id} textValue={entry.label} className="xp-team-select-option xp-format-option"><span><strong>{entry.label}</strong></span></SelectItem>)}
  </SelectContent></Select>;
}
