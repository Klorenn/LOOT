"use client";

import Link from "next/link";
import { CellsCanvas } from "@/components/cells-canvas";
import { CopyField } from "@/components/copy-field";
import { QrTile } from "@/components/qr-tile";
import { expertAddress } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function ReceivePage() {
  const { address } = useSession();
  if (!address) return null;
  const kind = address.startsWith("C") ? "Passkey smart account" : "Stellar account";

  return (
    <main>
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <div className="pointer-events-none absolute inset-0 opacity-50" aria-hidden>
          <CellsCanvas cx={0.9} />
        </div>
        <div className="relative z-10 mx-auto max-w-[1200px] px-6 pt-[72px] pb-14">
          <p className="font-mono text-[13px] tracking-[0.06em] text-[var(--dim)]">Receive</p>
          <h1 className="mt-4 text-[clamp(40px,6vw,64px)] leading-[1] font-semibold tracking-[-0.04em]">
            Receive <em className="not-italic text-[var(--proof)]">XLM</em>
          </h1>
          <p className="mt-5 max-w-[640px] text-[18px] leading-[1.55] text-[var(--muted)]">
            Show this QR or share your address to get paid. It encodes your {kind.toLowerCase()} address.
          </p>
        </div>
      </header>

      <div className="mx-auto flex max-w-[480px] flex-col items-center px-6 py-14 text-center">
        <QrTile value={address} id="qr-address" size={260} />
        <p
          className="mt-8 w-full font-mono text-[13px] leading-[1.7] break-all text-[var(--text)] select-all"
          aria-label="Your full address"
        >
          {address}
        </p>
        <CopyField value={address} className="mt-5 w-full text-left" />
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <a
            href={expertAddress(address)}
            target="_blank"
            rel="noreferrer"
            className="btn-landing btn-landing-s btn-landing-sm"
          >
            Stellar Expert ↗
          </a>
          <Link href="/send" className="btn-landing btn-landing-s btn-landing-sm">
            Send XLM
          </Link>
        </div>
        <p className="mt-6 text-[13px] leading-[1.5] text-[var(--dim)]">
          Only send XLM on Stellar testnet to this address. Testnet funds have no real value.
        </p>
      </div>
    </main>
  );
}
