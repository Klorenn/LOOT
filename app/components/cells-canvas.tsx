"use client";

import { useEffect, useRef } from "react";

/**
 * Page-header cells background (app screens). Absolutely positioned canvas, aria-hidden.
 * `cx` = mask centre x (0..1); `tint` = rgb of the rippling claim clusters
 * (proof 138,140,255 default · ok 75,227,160 on success · red 255,92,97 on attack/errors).
 * Pauses when off-screen or the tab is hidden; reduced motion draws one static frame.
 */
export function CellsCanvas({
  cx = 0.72,
  tint = "138,140,255",
  className = "",
}: {
  cx?: number;
  tint?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext("2d");
    if (!c || !x) return;
    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const S = 18;
    const G = 4;
    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let a = new Float32Array(0);
    let t0 = 0;
    let clusters: { i: number; j: number; b: number; c: string }[] = [];
    let raf = 0;
    let visible = true;

    const mask = (px: number, py: number) => {
      const dx = (px - W * cx) / (W * 0.62);
      const dy = (py - H * 0.5) / (H * 0.9);
      return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
    };

    const resize = () => {
      const D = window.devicePixelRatio || 1;
      W = c.clientWidth;
      H = c.clientHeight;
      c.width = Math.max(1, Math.floor(W * D));
      c.height = Math.max(1, Math.floor(H * D));
      x.setTransform(D, 0, 0, D, 0, 0);
      cols = Math.ceil(W / S) || 1;
      rows = Math.ceil(H / S) || 1;
      a = new Float32Array(cols * rows).map(() => Math.random() * 0.3);
      if (RM) draw(0);
    };

    function draw(t: number) {
      x!.clearRect(0, 0, W, H);
      if (!RM && t - t0 > 900) {
        t0 = t;
        clusters.push({
          i: (Math.random() * cols) | 0,
          j: (Math.random() * rows) | 0,
          b: t,
          c: Math.random() < 0.75 ? tint : "75,227,160",
        });
      }
      clusters = clusters.filter((k) => t - k.b < 2600);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const k = i * rows + j;
          if (!RM && Math.random() < 0.02) a[k] = Math.random() * 0.35;
          const m = mask(i * S, j * S);
          if (m <= 0) continue;
          let col = "166,161,176";
          let al = a[k] * m * 0.55;
          for (const q of clusters) {
            const dd = Math.hypot(i - q.i, j - q.j);
            const age = (t - q.b) / 2600;
            const r = age * 6;
            if (Math.abs(dd - r) < 1.2) {
              col = q.c;
              al = Math.max(al, (1 - age) * 0.9 * m);
            } else if (dd < 1.5 && age < 0.6) {
              col = q.c;
              al = Math.max(al, 0.9 * m);
            }
          }
          x!.fillStyle = `rgba(${col},${al})`;
          x!.fillRect(i * S, j * S, S - G, S - G);
        }
      }
    }

    const loop = (t: number) => {
      if (visible && !document.hidden) draw(t);
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(c);
    if (!RM) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      io.disconnect();
    };
  }, [cx, tint]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
