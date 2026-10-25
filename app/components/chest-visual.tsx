"use client";

import { LogoChest } from "@/components/logo-chest";
import { cn } from "cn";

type Props = {
  open?: boolean;
  size?: "sm" | "lg";
  className?: string;
};

/** App-flow chest — sealed by default; slight hinge when open. */
export function ChestVisual({ open = false, size = "lg", className = "" }: Props) {
  return (
    <div
      className={cn(
        "relative flex w-full max-w-md items-center justify-center",
        size === "lg" ? "h-56" : "h-28",
        className,
      )}
      aria-hidden
    >
      <LogoChest
        open={open ? 0.55 : 0}
        className={size === "lg" ? "h-44 w-40" : "h-24 w-20"}
      />
    </div>
  );
}
