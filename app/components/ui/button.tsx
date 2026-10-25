import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Loot buttons — flat, no shadow/glow.
 * default = primary (bg text / color bg), secondary|outline = 1px line border,
 * sizes: default h-11 px-5 15px; sm h-9 px-3.5 14px (nav).
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] border border-transparent text-[15px] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-proof disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-text text-bg hover:bg-white",
        secondary:
          "border-line bg-transparent text-text hover:border-[#44414f]",
        outline:
          "border-line bg-transparent text-text hover:border-[#44414f]",
        ghost: "text-muted-foreground hover:bg-s1 hover:text-text",
        destructive:
          "border-red/40 bg-transparent text-red hover:border-red",
        link: "h-auto px-0 text-text underline underline-offset-4 hover:text-white",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-[14px]",
        xs: "h-7 px-2.5 text-[13px]",
        lg: "h-12 px-6",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-xs": "size-7",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
