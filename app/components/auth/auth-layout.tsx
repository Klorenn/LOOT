"use client";

import Link from "next/link";
import { BrandMark } from "@/components/logo-chest";
import { Chest } from "@/components/chest";
import { CellsCanvas } from "@/components/cells-canvas";
import { NetworkSegmented } from "@/components/network-switch";
import { useNet } from "@/components/network-provider";

const FOOT = [
  ["Help", "#"],
  ["Docs", "#"],
  ["Privacy", "#"],
] as const;

/**
 * Layout de /login y /register: pantalla completa, sin AppNav ni footer.
 * Izquierda: formulario (max 400). Derecha: panel de marca (solo celdas en movimiento).
 * Por debajo de lg el panel de marca se oculta.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { IS_MAINNET } = useNet();
  return (
    <div className="grid min-h-[calc(100vh-var(--network-strip-h))] grid-cols-1 bg-[var(--bg)] lg:grid-cols-[minmax(520px,600px)_1fr]">
      <div className="flex min-h-[calc(100vh-var(--network-strip-h))] flex-col border-[var(--line)] px-6 py-7 sm:px-14 lg:border-r">
        <header className="flex items-center justify-between">
          <Link href="/" className="focus-landing">
            <BrandMark />
          </Link>
          <Link
            href="/"
            className="focus-landing text-[14px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            ← Back to home
          </Link>
        </header>
        <div className="mt-4">
          <NetworkSegmented />
        </div>

        <main id="main" className="mx-auto my-auto w-full max-w-[400px] py-10">
          {children}
        </main>

        <footer className="flex items-center justify-between font-mono text-[12px] text-[var(--dim)]">
          <span className="flex items-center gap-2">
            <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
            {IS_MAINNET ? "Stellar mainnet · real funds" : "Stellar testnet · no real funds"}
          </span>
          <span className="flex gap-4">
            {FOOT.map(([label, href]) => (
              <a key={label} href={href} className="hover:text-[var(--text)]">
                {label}
              </a>
            ))}
          </span>
        </footer>
      </div>

      <aside
        className="relative hidden flex-col items-center justify-center overflow-hidden bg-[var(--s1)] lg:flex"
        aria-label="About Loot"
      >
        <CellsCanvas cx={0.5} />
        <div className="relative z-10 flex flex-col items-center text-center">
          <Chest open={0} className="w-[300px]" />
          <p className="mt-6 text-[22px] font-medium tracking-[-0.02em]">
            Proofs sealed to your address.
          </p>
          <p className="mt-1 text-[22px] font-medium tracking-[-0.02em] text-[var(--muted)]">
            Bound to your address. Each proof works once.
          </p>
        </div>
        <p className="absolute bottom-7 font-mono text-[12px] text-[var(--dim)]">
          Passkeys · OpenZeppelin Relayer · Soroban
        </p>
      </aside>
    </div>
  );
}
