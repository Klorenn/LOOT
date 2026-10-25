"use client";

type Props = {
  open?: boolean;
  size?: "sm" | "lg";
  className?: string;
};

export function ChestVisual({ open = false, size = "lg", className = "" }: Props) {
  const h = size === "lg" ? "h-56" : "h-28";
  return (
    <div
      className={`relative flex ${h} w-full max-w-md items-center justify-center rounded-2xl border border-border ${className}`}
      style={{
        background:
          "radial-gradient(ellipse 60% 50% at 50% 55%, rgba(223, 185, 224, 0.18), transparent 70%), var(--surface)",
      }}
      aria-hidden
    >
      <svg
        viewBox="0 0 120 90"
        className={size === "lg" ? "h-28 w-36" : "h-16 w-20"}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* base */}
        <rect
          x="18"
          y="42"
          width="84"
          height="40"
          rx="4"
          stroke="#DFB9E0"
          strokeWidth="1.5"
        />
        {/* lid */}
        <path
          d={
            open
              ? "M18 42 L18 22 Q60 8 102 22 L102 42"
              : "M18 42 L18 28 Q60 18 102 28 L102 42"
          }
          stroke="#DFB9E0"
          strokeWidth="1.5"
          className="transition-all duration-500 motion-reduce:transition-none"
        />
        {/* lock */}
        <circle
          cx="60"
          cy={open ? 38 : 48}
          r="8"
          stroke="#E8C26A"
          strokeWidth="1.5"
          fill="var(--surface)"
        />
        <circle cx="60" cy={open ? 38 : 48} r="2.5" fill="#E8C26A" />
      </svg>
    </div>
  );
}
