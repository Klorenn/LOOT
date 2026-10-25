/** Flat 44px use-case icons: single stroke, no fills, no glow. */
const base = {
  width: 44,
  height: 44,
  viewBox: "0 0 44 44",
  fill: "none",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function IconChest({ color = "var(--proof)" }: { color?: string }) {
  return (
    <svg {...base} stroke={color}>
      <path d="M6 20a14 14 0 0 1 32 0" />
      <rect x="6" y="20" width="32" height="16" rx="2" />
      <path d="M6 26h32" />
      <rect x="19" y="23" width="6" height="7" rx="1" fill={color} stroke="none" />
    </svg>
  );
}

export function IconFlag({ color = "var(--ok)" }: { color?: string }) {
  return (
    <svg {...base} stroke={color}>
      <path d="M10 38V6" />
      <path d="M10 8h24l-5 8 5 8H10" />
    </svg>
  );
}

export function IconKey({ color = "var(--gold)" }: { color?: string }) {
  return (
    <svg {...base} stroke={color}>
      <circle cx="15" cy="22" r="8" />
      <circle cx="15" cy="22" r="2.5" fill={color} stroke="none" />
      <path d="M23 22h17" />
      <path d="M34 22v6" />
      <path d="M40 22v4" />
    </svg>
  );
}
