"use client";

import { CellsBackground } from "@/components/cells-background";

type Props = {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  right?: React.ReactNode;
  /** cells tint: proof | ok | red */
  tint?: "proof" | "ok" | "red";
  className?: string;
};

export function PageHeader({
  eyebrow,
  title,
  lead,
  right,
  tint = "proof",
  className = "",
}: Props) {
  return (
    <header
      className={`relative overflow-hidden border-b border-[var(--line)] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        data-cells-tint={tint}
        aria-hidden
      >
        <CellsBackground variant="hero" className="!absolute inset-0 h-full" />
      </div>
      <div className="relative z-10 mx-auto flex max-w-[1200px] flex-col gap-8 px-6 pt-[72px] pb-14 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-[640px]">
          <p className="font-mono text-[13px] tracking-[0.06em] text-[var(--dim)]">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-[clamp(40px,6vw,64px)] leading-[1] font-semibold tracking-[-0.04em]">
            {title}
          </h1>
          {lead && (
            <p className="mt-5 text-[18px] leading-[1.55] text-[var(--muted)]">
              {lead}
            </p>
          )}
        </div>
        {right && <div className="shrink-0 lg:pb-1">{right}</div>}
      </div>
    </header>
  );
}

/** Accent word helpers for H1 */
export function Em({
  children,
  tone = "proof",
}: {
  children: React.ReactNode;
  tone?: "proof" | "ok" | "red" | "gold";
}) {
  const c =
    tone === "ok"
      ? "var(--ok)"
      : tone === "red"
        ? "var(--red)"
        : tone === "gold"
          ? "var(--gold)"
          : "var(--proof)";
  return <em className="not-italic" style={{ color: c }}>{children}</em>;
}
