"use client";

import Link from "next/link";
import { useNet } from "@/components/network-provider";

/** Franja roja si la config de mainnet está incompleta pero mainnet está activa (no puede operar). */
export function ConfigBanner() {
  const { CONFIG_INCOMPLETE, CONFIG_ISSUES, IS_MAINNET } = useNet();
  if (!IS_MAINNET || !CONFIG_INCOMPLETE) return null;
  return (
    <div
      role="alert"
      className="relative z-[300] w-full bg-[var(--red)] px-4 py-2 text-center font-mono text-[12px] font-medium text-white"
    >
      Mainnet configuration incomplete: missing or invalid {CONFIG_ISSUES.join(", ")}. Chest creation and claims are disabled.
    </div>
  );
}

/** Franja dorada permanente mientras mainnet esté activa: fondos reales. */
export function MainnetStrip() {
  const { IS_MAINNET } = useNet();
  if (!IS_MAINNET) return null;
  return (
    <div role="status" className="w-full bg-[var(--gold)] px-4 py-1 text-center font-mono text-[12px] font-medium text-[#14110a]">
      MAINNET · real funds · Beta · Scanned with Kuyfi (black-box, 0 findings) · not a formal audit ·{" "}
      <Link href="/network" className="underline underline-offset-2">
        details
      </Link>
    </div>
  );
}

export const TRANSCRIPT_URL =
  "https://github.com/Klorenn/LOOT/blob/main/circuits/ceremony/release-2026-10-26/TRANSCRIPT.md";

/** Honestidad sobre el trusted setup (solo mainnet): 1 contribuyente + beacon del ledger de Stellar. */
export function TrustedSetupNote({ className = "" }: { className?: string }) {
  const { IS_MAINNET } = useNet();
  if (!IS_MAINNET) return null;
  return (
    <p className={`text-[13px] leading-[1.5] text-[var(--dim)] ${className}`}>
      Trusted setup: 1 contributor + a Stellar ledger beacon (not pre-announced).{" "}
      <a href={TRANSCRIPT_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-[var(--text)]">
        See the transcript
      </a>
      .
    </p>
  );
}

/** Aviso de beta (solo mainnet): honesto, un escaneo black-box no es una auditoría formal. `compact` para el footer. */
export function BetaNotice({ compact = false }: { compact?: boolean }) {
  const { IS_MAINNET, CAPS } = useNet();
  if (!IS_MAINNET) return null;
  if (compact) {
    return (
      <p className="font-mono text-[12px] text-[var(--gold)]">
        Beta · Scanned with Kuyfi (black-box, 0 findings) · not a formal audit · use only what you can afford to lose
        {" · "}
        <a href={TRANSCRIPT_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          trusted setup
        </a>
      </p>
    );
  }
  return (
    <div
      role="note"
      className="rounded-[10px] border border-[var(--line)] bg-[var(--s1)] p-4 text-[14px] leading-[1.55] text-[var(--muted)]"
      style={{ borderLeftWidth: 3, borderLeftColor: "var(--gold)" }}
    >
      <p className="font-medium text-[var(--text)]">Beta · Scanned with Kuyfi (black-box, 0 findings) · not a formal audit</p>
      <p className="mt-1">
        These are real funds on Stellar mainnet. The Kuyfi scan is automated and black-box, not a formal audit, and covers the testnet
        deployment; the mainnet verifier uses new ceremony keys (scan pending).{" "}
        <Link href="/network" className="underline underline-offset-2">
          Live network facts
        </Link>
        . Limits while in beta:{" "}
        {Number.isFinite(CAPS.maxPrizePerPlaceXlm) ? `${CAPS.maxPrizePerPlaceXlm} XLM per claim` : "no per-claim cap"},{" "}
        {Number.isFinite(CAPS.maxTotalPrizeXlm) ? `${CAPS.maxTotalPrizeXlm} XLM per chest in total` : "no total cap"}.
      </p>
      <TrustedSetupNote className="mt-2" />
    </div>
  );
}
