"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { QrTile } from "@/components/qr-tile";
import { expertAddress } from "@/lib/format";

/** Una sola QR: la dirección conectada, en un tile #F5F2EC de 264 px. */
export function ReceivePanel({ address }: { address: string }) {
  const [msg, setMsg] = useState<string | null>(null);

  async function share() {
    setMsg(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Loot address", text: address });
        return;
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setMsg("Address copied");
    } catch {
      setMsg("Select the address above to copy it");
    }
  }

  return (
    <section className="flex flex-col items-center rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-6 text-center">
      <QrTile value={address} id="wallet-qr" size={220} pad={22} />
      <p
        className="mt-6 w-full rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-4 py-3 font-mono text-[13px] leading-[1.7] break-all text-[var(--text)] select-all"
        aria-label="Your full address"
      >
        <span className="text-[var(--proof)]">{address.slice(0, 4)}</span>
        {address.slice(4, -4)}
        <span className="text-[var(--proof)]">{address.slice(-4)}</span>
      </p>
      <div className="mt-4 flex w-full flex-wrap justify-center gap-3">
        <CopyButton value={address} label="Copy address" className="btn-landing btn-landing-p" />
        <button type="button" onClick={() => void share()} className="btn-landing btn-landing-s">
          Share
        </button>
        <a
          href={expertAddress(address)}
          target="_blank"
          rel="noreferrer"
          className="btn-landing btn-landing-s"
        >
          Stellar Expert ↗
        </a>
      </div>
      {msg && (
        <p className="mt-3 font-mono text-[12px] text-[var(--dim)]" role="status">
          {msg}
        </p>
      )}
      <p className="mt-5 text-[13px] leading-[1.5] text-[var(--dim)]">
        Only send XLM on Stellar testnet to this address. Testnet funds have no real value.
      </p>
    </section>
  );
}
