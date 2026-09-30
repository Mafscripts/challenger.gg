import React from "react";
import { Gamepad2, Keyboard, MonitorCheck, MonitorX } from "lucide-react";
import { wagerPlayRule } from "@/lib/wagerRules";

export default function MatchAccessBadges({ playRule, className = "" }) {
  const rule = wagerPlayRule(playRule);
  const InputIcon = rule.value === "mixed_pc_allowed" ? Keyboard : Gamepad2;
  const PcIcon = rule.pcAllowed ? MonitorCheck : MonitorX;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <span className="inline-flex items-center gap-2 rounded-lg border border-cyan/15 bg-cyan/[0.055] px-2.5 py-2">
        <InputIcon className="h-3.5 w-3.5 shrink-0 text-cyan" />
        <span>
          <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-vapor">Allowed input</span>
          <span className="mt-0.5 block text-[10px] font-black text-white">{rule.inputLabel}</span>
        </span>
      </span>
      <span className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-2 ${rule.pcAllowed ? "border-green/15 bg-green/[0.055]" : "border-orange/20 bg-orange/[0.06]"}`}>
        <PcIcon className={`h-3.5 w-3.5 shrink-0 ${rule.pcAllowed ? "text-green" : "text-orange"}`} />
        <span>
          <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-vapor">PC players</span>
          <span className={`mt-0.5 block text-[10px] font-black ${rule.pcAllowed ? "text-green" : "text-orange"}`}>{rule.pcAllowed ? "Allowed" : "Not allowed"}</span>
        </span>
      </span>
    </div>
  );
}
