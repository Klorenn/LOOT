"use client";

import { CopyButton } from "@/components/copy-button";

/** Campo de solo lectura en mono (truncado con elipsis) con botón Copy y fallback de selección. */
export function CopyField({
  value,
  display,
  className = "",
}: {
  value: string;
  /** Texto mostrado si difiere del copiado (por ejemplo una URL acortada). */
  display?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--bg)] p-1.5 pl-3.5 ${className}`}
    >
      <span
        className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--text)]"
        title={value}
      >
        {display ?? value}
      </span>
      <CopyButton value={value} className="btn-landing btn-landing-s btn-landing-sm shrink-0" />
    </div>
  );
}
