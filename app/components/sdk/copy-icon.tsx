"use client";

import { useEffect, useRef, useState } from "react";

/** Copy `value` to the clipboard; falls back to a hidden textarea + execCommand. */
async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = value;
    el.setAttribute("readonly", "");
    el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    el.remove();
    return ok;
  }
}

/**
 * Icon-only copy button. Shows a check and a visually hidden "Copied" status for ~1.8s.
 * `size` is the square hit area in px (40 for the hero strip, 28 inside code panels).
 */
export function CopyIcon({
  value,
  size = 28,
  bordered = false,
  label = "Copy",
}: {
  value: string;
  size?: number;
  bordered?: boolean;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const ok = await writeClipboard(value);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={state === "copied" ? "Copied" : label}
      style={{ width: size, height: size }}
      className={`focus-landing relative inline-flex shrink-0 items-center justify-center rounded-[8px] transition-colors ${
        bordered ? "border border-[var(--line)]" : ""
      } ${
        state === "copied"
          ? "text-[var(--ok)]"
          : "text-[var(--dim)] hover:text-[var(--text)]"
      }`}
    >
      {state === "copied" ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 8.5l3.2 3L13 4.5" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
        </svg>
      )}
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
      {state !== "idle" && (
        <span
          aria-hidden
          className={`pointer-events-none absolute right-full mr-2 font-mono text-[11px] whitespace-nowrap ${
            state === "copied" ? "text-[var(--ok)]" : "text-[var(--red)]"
          }`}
        >
          {state === "copied" ? "Copied" : "Copy failed"}
        </span>
      )}
    </button>
  );
}
