"use client";

import { useEffect, useRef, useState } from "react";
import { HANDLE_HINT, HANDLE_RE, setHandle, skipHandle } from "@/lib/handle";

/**
 * "Pick a name?": se muestra una vez por dirección tras conectar una wallet G (kit o demo) que
 * todavía no tiene nombre. "Skip for now" lo recuerda para no insistir (se puede fijar desde Profile).
 */
export function HandlePrompt({
  address,
  onClose,
}: {
  address: string | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!address) return;
    opener.current = document.activeElement as HTMLElement | null;
    setValue("");
    setErr(null);
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      opener.current?.focus?.();
    };
  }, [address]);

  if (!address) return null;

  function save() {
    const h = value.trim().toLowerCase();
    if (!HANDLE_RE.test(h)) return setErr(HANDLE_HINT);
    setHandle(address!, h);
    onClose();
  }
  function skip() {
    skipHandle(address!);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return skip();
    if (e.key === "Tab") {
      const f = Array.from(
        root.current?.querySelectorAll<HTMLElement>("input, button:not([disabled])") ?? [],
      );
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[310] flex items-end justify-center bg-[rgba(12,11,16,.72)] sm:items-center">
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hp-title"
        onKeyDown={onKeyDown}
        className="w-full rounded-t-[14px] border border-[var(--line)] bg-[var(--s1)] p-6 sm:w-[420px] sm:rounded-[14px]"
      >
        <h2 id="hp-title" className="text-[22px] font-semibold tracking-[-0.02em]">
          Pick a name?
        </h2>
        <p className="mt-2 text-[15px] leading-[1.5] text-[var(--muted)]">
          Shown instead of your address. You can change it later in Profile.
        </p>
        <label htmlFor="hp-handle" className="mt-5 block text-[14px] font-medium">
          Choose a name
        </label>
        <div
          className={`mt-2 flex h-11 items-center rounded-[10px] border bg-[var(--bg)] px-3.5 focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-[var(--proof)] ${
            err ? "border-[var(--red)]" : "border-[var(--line)]"
          }`}
        >
          <span className="font-mono text-[15px] text-[var(--dim)]">@</span>
          <input
            ref={input}
            id="hp-handle"
            value={value}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            placeholder="keeper"
            onChange={(e) => {
              setValue(e.target.value);
              setErr(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className="ml-1 w-full bg-transparent font-mono text-[15px] outline-none placeholder:text-[var(--dim)]"
          />
        </div>
        {err && <p className="mt-2 text-[13px] text-[var(--red)]">{err}</p>}
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={save} className="btn-landing btn-landing-p flex-1">
            Save name
          </button>
          <button type="button" onClick={skip} className="btn-landing btn-landing-s">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
