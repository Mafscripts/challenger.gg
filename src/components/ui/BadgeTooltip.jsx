import React from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function BadgeTooltip({ children, label, description, icon: Icon, toneClass = "text-white", placement = "top", enabled = true }) {
  if (!enabled) return children;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={placement}
          sideOffset={8}
          collisionPadding={12}
          hideWhenDetached
          className="pointer-events-none z-[200] w-40 max-w-[calc(100vw-24px)] rounded-lg border border-white/[0.12] bg-[#111821] px-3 py-2.5 text-left text-foreground shadow-[0_14px_36px_rgba(0,0,0,.65)]"
        >
          <span className={`mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider ${toneClass}`}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {label}
          </span>
          <span className="block break-words text-[11px] font-medium normal-case leading-snug tracking-normal text-vapor">{description}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
