"use client";

import { useEffect, useRef, useState } from "react";
import { LogoChest, type ChestTint } from "@/components/logo-chest";

/**
 * Loot chest. `open` is the lid hinge angle in degrees (0 closed … 30 open).
 * Closed is rendered on the server (deg 0 = lid flush); with `animate` the angle eases to
 * the new value on the client. The lid only ever rotates via lidMatrix (never CSS transforms).
 * prefers-reduced-motion: jumps to the target without animating.
 */
export function Chest({
  open = 0,
  animate = true,
  duration = 900,
  tint = "proof",
  className,
}: {
  open?: number;
  animate?: boolean;
  duration?: number;
  tint?: ChestTint;
  className?: string;
}) {
  const target = Math.max(0, Math.min(35, open));
  const [deg, setDeg] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!animate || reduce) {
      current.current = target;
      setDeg(target);
      return;
    }
    const from = current.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // inOut
      current.current = from + (target - from) * e;
      setDeg(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate, duration]);

  return <LogoChest className={className} deg={deg} showInside tint={tint} />;
}
