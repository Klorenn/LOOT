import { CAPS, CONFIG_INCOMPLETE, CONFIG_ISSUES, IS_MAINNET } from "@/lib/config";

/** Franja roja arriba de todo si la config de mainnet está incompleta (la app no puede operar). */
export function ConfigBanner() {
  if (!CONFIG_INCOMPLETE) return null;
  return (
    <div
      role="alert"
      className="relative z-[300] w-full bg-[var(--red)] px-4 py-2 text-center font-mono text-[12px] font-medium text-white"
    >
      Mainnet configuration incomplete: missing or invalid {CONFIG_ISSUES.join(", ")}. Chest creation and claims are disabled.
    </div>
  );
}

/** Aviso de beta sin auditar (solo mainnet). `compact` para el footer. */
export function BetaNotice({ compact = false }: { compact?: boolean }) {
  if (!IS_MAINNET) return null;
  if (compact) {
    return (
      <p className="font-mono text-[12px] text-[var(--gold)]">
        Beta · unaudited contracts · use only what you can afford to lose
      </p>
    );
  }
  return (
    <div
      role="note"
      className="rounded-[10px] border border-[var(--line)] bg-[var(--s1)] p-4 text-[14px] leading-[1.55] text-[var(--muted)]"
      style={{ borderLeftWidth: 3, borderLeftColor: "var(--gold)" }}
    >
      <p className="font-medium text-[var(--text)]">Beta — unaudited contracts</p>
      <p className="mt-1">
        These are real funds on Stellar mainnet. The contracts have not been audited. Limits while in beta:{" "}
        {Number.isFinite(CAPS.maxPrizePerPlaceXlm) ? `${CAPS.maxPrizePerPlaceXlm} XLM per claim` : "no per-claim cap"},{" "}
        {Number.isFinite(CAPS.maxTotalPrizeXlm) ? `${CAPS.maxTotalPrizeXlm} XLM per chest in total` : "no total cap"}.
      </p>
    </div>
  );
}
