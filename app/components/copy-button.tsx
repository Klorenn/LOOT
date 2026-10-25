"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "manual";

/**
 * Copia `value` al portapapeles. Si `navigator.clipboard` no está (http,
 * iframe, permisos), prueba execCommand sobre un input oculto y, como último
 * recurso, muestra el texto seleccionado para copiarlo a mano.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "btn-landing btn-landing-s btn-landing-sm",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      const el = input.current;
      if (el) {
        el.focus();
        el.select();
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
      }
    }
    setState(ok ? "copied" : "manual");
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setState("idle"), 2000);
    else requestAnimationFrame(() => input.current?.select());
  }, [value]);

  return (
    <span className="relative inline-flex flex-col gap-2">
      <button type="button" onClick={copy} className={className}>
        {state === "copied" ? "Copied ✓" : label}
      </button>
      <input
        ref={input}
        readOnly
        value={value}
        aria-label="Full value"
        tabIndex={state === "manual" ? 0 : -1}
        onFocus={(e) => e.currentTarget.select()}
        className={
          state === "manual"
            ? "h-9 w-[min(80vw,28rem)] rounded-[8px] border border-[var(--line)] bg-[var(--bg)] px-2 font-mono text-[12px]"
            : "pointer-events-none absolute h-px w-px opacity-0"
        }
      />
      {state === "manual" && (
        <span className="font-mono text-[12px] text-[var(--dim)]">
          Your browser blocked the clipboard: copy the selected text.
        </span>
      )}
    </span>
  );
}
