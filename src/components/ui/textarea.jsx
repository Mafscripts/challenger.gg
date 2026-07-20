import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border border-white/[0.06] bg-black/15 px-3.5 py-3 text-base shadow-[inset_0_1px_0_rgba(255,255,255,.02)] placeholder:text-muted-foreground focus-visible:border-cyan/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/10 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
