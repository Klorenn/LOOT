import { cn } from "cn";

const PALETTE = ["var(--proof)", "var(--proof-d)", "var(--gold)", "var(--ok)"];

/** Deterministic permutation of the 4 quadrant colours from the address (FNV-1a). */
function order(seed: string): string[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const pool = [...PALETTE];
  const out: string[] = [];
  while (pool.length) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

const SIZE = {
  xs: "size-4 rounded-[4px]",
  sm: "size-8 rounded-[8px]",
  md: "size-24 rounded-[14px]",
  lg: "size-[120px] rounded-[14px]",
} as const;

/** Geometric 2×2 quadrant avatar. Never a photo or generated image. */
export function Avatar({
  seed = "",
  size = "sm",
  className,
}: {
  seed?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const c = order(seed);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 grid-cols-2 grid-rows-2 overflow-hidden",
        SIZE[size],
        className,
      )}
    >
      {c.map((color, i) => (
        <span key={i} style={{ background: color }} />
      ))}
    </span>
  );
}
