import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, ExternalLink, ShieldCheck } from "lucide-react";
import { wagerPlayRule } from "@/lib/wagerRules";

const commonRules = [
  "No Stretch Defuse.",
  "Kill cams must be on!",
  "Use the official map veto and play the maps shown in this room.",
  "Report the final result within 10 minutes and keep video evidence for disputes.",
  "Intentional disconnects or leaving an active match result in a forfeit.",
];

const rulesFor = ({ matchType, gameMode, playRule, customRules }) => {
  const mode = String(gameMode || "").toLowerCase();
  const rules = [...commonRules];

  if (mode.includes("hardpoint") || mode === "hp") {
    rules.push("Hardpoint disconnect: reset below 150 combined score; at 150 or higher, play the map out.");
  }
  if (mode.includes("search") || mode === "snd") {
    rules.push("Search & Destroy disconnect: end the game and resume from the point where play stopped.");
  }
  if (matchType === "ranked") {
    rules.push("Leaving a ranked match in progress gives an automatic loss and ELO penalty.");
  }
  if (matchType === "wager") {
    rules.push(wagerPlayRule(playRule).description);
    rules.push("Wager funds remain in escrow until matching results are confirmed or staff resolves a dispute.");
  }
  if (matchType === "tournament") {
    rules.push("Follow the published bracket, hosting order, roster and check-in requirements.");
  }
  if (customRules) rules.push(customRules);

  return [...new Set(rules)].slice(0, 8);
};

export default function MatchRulesPanel({ matchType = "wager", gameMode, playRule = "", customRules = "" }) {
  const rules = rulesFor({ matchType, gameMode, playRule, customRules });

  return (
    <section className="dark-focus dark-media rounded-xl border border-cyan/20 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan">Competitive standards</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-black">
            <BookOpen className="h-4 w-4 text-cyan" /> Match Rules
          </h2>
        </div>
        <Link to="/rules" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-wider text-cyan hover:underline">
          All rules <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule} className="flex items-start gap-2 rounded-lg border border-white/5 bg-background/30 px-3 py-2.5 text-xs leading-5 text-vapor">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
            <span>{rule}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
