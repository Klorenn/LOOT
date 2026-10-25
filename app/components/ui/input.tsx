import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

/** Loot input: h-11, 1px line border, radius 10, proof focus ring (outline, no glow). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[10px] border border-line bg-bg px-3.5 text-[15px] text-text transition-colors outline-none placeholder:text-dim focus-visible:border-proof focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-proof disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red",
        className
      )}
      {...props}
    />
  )
}

export { Input }
