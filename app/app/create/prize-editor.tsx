"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { FACTORY, PRIZE, stroopsToXlm } from "@/lib/config";
import { ordinal, podium, scheduleError } from "@/lib/factory";
import { parseXlmAmount } from "@/lib/send";

type Mode = "equal" | "podium" | "custom";

const MODES: { id: Mode; label: string }[] = [
  { id: "equal", label: "Equal" },
  { id: "podium", label: "Podium 50 / 30 / 20" },
  { id: "custom", label: "Custom" },
];

/**
 * Premio por lugar, en orden de reclamo: el primero en probar cobra el lugar 1, y así. Emite el
 * calendario en stroops (o null si hay algún error) y un mensaje de error para mostrar.
 */
export function PrizeEditor({
  initialEach,
  initialPlaces,
  onChange,
}: {
  initialEach: string;
  initialPlaces: number;
  onChange: (prizes: bigint[] | null, error: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode>("equal");
  const [places, setPlaces] = useState(String(initialPlaces));
  const [each, setEach] = useState(initialEach);
  const [total, setTotal] = useState("100");
  const [custom, setCustom] = useState<string[]>(["50", "30", "20"]);

  const { prizes, error } = useMemo(() => {
    let list: bigint[] | null = null;
    if (mode === "equal") {
      const n = Number(places);
      const a = parseXlmAmount(each);
      if (!Number.isInteger(n) || n < 1) return { prizes: null, error: "Places must be a whole number, at least 1." };
      if (n > FACTORY.maxPlaces) return { prizes: null, error: `At most ${FACTORY.maxPlaces} places.` };
      if (!a) return { prizes: null, error: "Enter an amount above 0 (up to 7 decimals)." };
      list = Array.from({ length: n }, () => a);
    } else if (mode === "podium") {
      const t = parseXlmAmount(total);
      if (!t) return { prizes: null, error: "Enter a total above 0 (up to 7 decimals)." };
      list = podium(t);
    } else {
      const parsed = custom.map((c) => parseXlmAmount(c));
      if (parsed.some((p) => !p)) return { prizes: null, error: "Every place needs an amount above 0 (up to 7 decimals)." };
      list = parsed as bigint[];
    }
    const bad = scheduleError(list);
    return { prizes: bad ? null : list, error: bad };
  }, [mode, places, each, total, custom]);

  useEffect(() => onChange(prizes, error), [prizes, error, onChange]);

  const shown = useMemo(() => {
    if (mode === "custom") return null;
    const list =
      mode === "equal"
        ? prizes
        : (() => {
            const t = parseXlmAmount(total);
            return t ? podium(t) : null;
          })();
    return list;
  }, [mode, prizes, total]);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">Prize per place</p>
        <div className="inline-flex flex-wrap overflow-hidden rounded-[10px] border border-[var(--line)]">
          {MODES.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`px-3 py-2 font-mono text-[12px] ${
                mode === m.id ? "bg-[var(--s2)] text-[var(--text)]" : "text-[var(--muted)]"
              } ${i ? "border-l border-[var(--line)]" : ""}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 font-mono text-[12px] leading-[1.5] text-[var(--dim)]">
          Places pay in claim order: whoever proves first gets the 1st prize, the next gets the 2nd, and so on.
        </p>
      </div>

      {mode === "equal" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2">
            <span className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">Places</span>
            <Input inputMode="numeric" value={places} onChange={(e) => setPlaces(e.target.value)} className="h-11 rounded-[10px] font-mono" />
          </label>
          <label className="flex flex-col gap-2">
            <span className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">Each (XLM)</span>
            <Input inputMode="decimal" value={each} onChange={(e) => setEach(e.target.value)} className="h-11 rounded-[10px] font-mono" />
          </label>
        </div>
      )}

      {mode === "podium" && (
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[12px] tracking-[0.06em] text-[var(--dim)] uppercase">Total prize (XLM)</span>
          <Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className="h-11 rounded-[10px] font-mono" />
        </label>
      )}

      {mode === "custom" && (
        <div className="space-y-2">
          {custom.map((c, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-12 font-mono text-[12px] text-[var(--dim)]">{ordinal(i + 1)}</span>
              <Input
                inputMode="decimal"
                value={c}
                onChange={(e) => setCustom((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-10 rounded-[10px] font-mono"
                aria-label={`${ordinal(i + 1)} place prize in XLM`}
              />
              <button
                type="button"
                disabled={custom.length <= 1}
                onClick={() => setCustom((l) => l.filter((_, j) => j !== i))}
                className="font-mono text-[12px] text-[var(--dim)] underline underline-offset-2 hover:text-[var(--text)] disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={custom.length >= FACTORY.maxPlaces}
            onClick={() => setCustom((l) => [...l, "1"])}
            className="btn-landing btn-landing-s btn-landing-sm disabled:opacity-40"
          >
            Add place
          </button>
        </div>
      )}

      {shown && (
        <ol className="space-y-1 font-mono text-[13px]">
          {shown.slice(0, 5).map((p, i) => (
            <li key={i} className="flex justify-between border-b border-[var(--line)] py-1.5">
              <span className="text-[var(--dim)]">{ordinal(i + 1)} place</span>
              <span className="text-[var(--gold)]">
                {stroopsToXlm(p)} {PRIZE.code}
              </span>
            </li>
          ))}
          {shown.length > 5 && <li className="py-1.5 text-[var(--dim)]">+ {shown.length - 5} more places</li>}
        </ol>
      )}

      {error && (
        <p className="font-mono text-[12px] text-[var(--red)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
