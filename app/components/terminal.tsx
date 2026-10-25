"use client";

import { useEffect, useRef } from "react";

type Line = { t: string; msg: string };

/**
 * Terminal de Loot (panel s1, borde 1px, radio 14). Misma API que components/app/terminal.tsx
 * pero con líneas que parten palabra larga (hashes) y scroll vertical que sigue al final:
 * ninguna línea se pierde. La altura mínima es 330px y crece hasta 460px.
 */
export function Terminal({
  label,
  status,
  lines,
  tone = "proof",
  borderTone,
  className = "",
}: {
  label: React.ReactNode;
  status: string;
  lines: Line[];
  tone?: "proof" | "red" | "ok";
  borderTone?: "proof" | "red" | "ok" | "line";
  className?: string;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const dot =
    tone === "red" ? "var(--red)" : tone === "ok" ? "var(--ok)" : "var(--proof)";
  const border =
    borderTone === "red"
      ? "border-[var(--red)]"
      : borderTone === "ok"
        ? "border-[var(--ok)]"
        : borderTone === "proof"
          ? "border-[var(--proof)]"
          : "border-[var(--line)]";

  return (
    <section
      className={`flex h-[460px] flex-col overflow-hidden rounded-[14px] border bg-[var(--s1)] ${border} ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <p className="flex items-center gap-2 font-mono text-[12px] tracking-[0.04em]">
          <span
            className="size-[6px] shrink-0 rounded-full"
            style={{ background: dot }}
            aria-hidden
          />
          {label}
        </p>
        <span className="font-mono text-[12px] text-[var(--dim)]">{status}</span>
      </header>
      <div
        ref={body}
        role="log"
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.65]"
      >
        {lines.length === 0 ? (
          <p className="text-[var(--dim)]">idle</p>
        ) : (
          lines.map((l, i) => (
            <p
              key={`${l.t}-${i}`}
              className="break-words text-[var(--text)] [overflow-wrap:anywhere]"
            >
              <span className="text-[var(--dim)]">{l.t}</span> {l.msg}
            </p>
          ))
        )}
      </div>
    </section>
  );
}
