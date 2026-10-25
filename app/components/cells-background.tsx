"use client";

import { useEffect, useRef } from "react";

type Props = {
  variant?: "hero" | "footer";
  className?: string;
};

/**
 * Flickering cell grid — hero: radial mask + claim clusters;
 * footer: vertical fade, grey flicker only.
 */
export function CellsBackground({ variant = "hero", className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = 18;
    const G = 4;
    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let a = new Float32Array(0);
    let raf = 0;
    let visible = true;
    let t0 = 0;
    type Cluster = { i: number; j: number; b: number; c: string };
    let clusters: Cluster[] = [];

    const dpr = () => window.devicePixelRatio || 1;

    const resize = () => {
      W = c.clientWidth;
      H = c.clientHeight;
      const D = dpr();
      c.width = Math.max(1, Math.floor(W * D));
      c.height = Math.max(1, Math.floor(H * D));
      ctx.setTransform(D, 0, 0, D, 0, 0);
      cols = Math.ceil(W / S) || 1;
      rows = Math.ceil(H / S) || 1;
      a = new Float32Array(cols * rows);
      for (let i = 0; i < a.length; i++) a[i] = Math.random() * 0.3;
    };

    const heroMask = (px: number, py: number) => {
      const dx = (px - W * 0.72) / (W * 0.62);
      const dy = (py - H * 0.5) / (H * 0.75);
      return Math.max(0, 1 - Math.hypot(dx, dy));
    };

    const drawHero = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      if (!RM && t - t0 > 900) {
        t0 = t;
        clusters.push({
          i: (Math.random() * cols) | 0,
          j: (Math.random() * rows) | 0,
          b: t,
          c: Math.random() < 0.75 ? "138,140,255" : "75,227,160",
        });
      }
      clusters = clusters.filter((k) => t - k.b < 2600);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const k = i * rows + j;
          if (!RM && Math.random() < 0.02) a[k] = Math.random() * 0.35;
          const m = heroMask(i * S, j * S);
          if (m <= 0) continue;
          let col = "166,161,176";
          let al = a[k] * m * 0.55;
          for (const q of clusters) {
            const d = Math.hypot(i - q.i, j - q.j);
            const age = (t - q.b) / 2600;
            const r = age * 6;
            if (Math.abs(d - r) < 1.2) {
              col = q.c;
              al = Math.max(al, (1 - age) * 0.9 * m);
            } else if (d < 1.5 && age < 0.6) {
              col = q.c;
              al = Math.max(al, 0.9 * m);
            }
          }
          ctx.fillStyle = `rgba(${col},${al})`;
          ctx.fillRect(i * S, j * S, S - G, S - G);
        }
      }
    };

    const drawFooter = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const k = i * rows + j;
          if (!RM && Math.random() < 0.015) a[k] = Math.random() * 0.3;
          const m = Math.min(1, (j / rows) * 1.4);
          ctx.fillStyle = `rgba(166,161,176,${a[k] * m * 0.35})`;
          ctx.fillRect(i * S, j * S, S - G, S - G);
        }
      }
    };

    const loop = (t: number) => {
      if (visible && !document.hidden) {
        if (variant === "hero") drawHero(RM ? 0 : t);
        else drawFooter();
      }
      if (!RM) raf = requestAnimationFrame(loop);
    };

    resize();
    if (RM) {
      if (variant === "hero") drawHero(0);
      else drawFooter();
    } else {
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(c);
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(c);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [variant]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={
        className ??
        (variant === "hero"
          ? "pointer-events-none absolute inset-0 h-full w-full"
          : "pointer-events-none absolute inset-0 h-full w-full opacity-55")
      }
    />
  );
}
