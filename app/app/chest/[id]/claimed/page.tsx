"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoChest } from "@/components/logo-chest";
import { PageHeader, Em } from "@/components/app/page-header";
import { KV, Mono } from "@/components/app/kv";
import { DEMO_CHEST } from "@/lib/config";
import { loadPlayer } from "@/lib/wallet";

export default function ClaimedPage() {
  const { id } = useParams<{ id: string }>();
  const [deg, setDeg] = useState(0);
  const [tx, setTx] = useState<{ hash?: string; explorer?: string } | null>(
    null,
  );
  const [addr, setAddr] = useState<string>("");

  useEffect(() => {
    setAddr(loadPlayer()?.publicKey || "");
    try {
      const raw = sessionStorage.getItem(`chestzk.claim.${id}`);
      if (raw) setTx(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDeg(30);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0 - 500) / 1600);
      if (t > 0) {
        // power2.inOut approx
        const e =
          t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        setDeg(30 * Math.max(0, e));
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  return (
    <main>
      <PageHeader
        tint="ok"
        eyebrow={
          <span className="inline-flex items-center gap-2 text-[var(--ok)]">
            <span className="size-[6px] rounded-full bg-[var(--ok)]" />
            VERIFIED ON SOROBAN
          </span>
        }
        title={
          <>
            Chest #{String(id).padStart(4, "0")} is <Em tone="ok">yours.</Em>
          </>
        }
        lead="The nullifier is spent. Replaying this proof will revert — bots pay gas for nothing."
        right={
          <LogoChest className="w-[220px] lg:w-[280px]" deg={deg} showInside />
        }
      />

      <div className="mx-auto max-w-[800px] px-6 py-12 text-center">
        <p className="font-mono text-[clamp(40px,6vw,56px)] font-medium tracking-[-0.03em] text-[var(--gold)]">
          +{DEMO_CHEST.prize} CHEST
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/explore" className="btn-landing btn-landing-p">
            Open another chest →
          </Link>
          {tx?.explorer && (
            <a
              href={tx.explorer}
              target="_blank"
              rel="noreferrer"
              className="btn-landing btn-landing-s"
            >
              View on Stellar Expert
            </a>
          )}
          <button
            type="button"
            className="btn-landing btn-landing-s"
            onClick={() => {
              void navigator.clipboard?.writeText(
                tx?.explorer || window.location.href,
              );
            }}
          >
            Share
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 pb-20 lg:grid-cols-2">
        <div>
          <h3 className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
            Receipt
          </h3>
          <KV
            rows={[
              {
                label: "Tx hash",
                value: tx?.hash ? <Mono>{tx.hash}</Mono> : "—",
              },
              { label: "Ledger", value: "testnet" },
              {
                label: "Prover",
                value: addr ? (
                  <span className="text-[var(--proof)]">
                    <Mono>{addr}</Mono>
                  </span>
                ) : (
                  "—"
                ),
              },
              {
                label: "Nullifier",
                value: (
                  <span className="text-[var(--red)]">spent</span>
                ),
              },
              {
                label: "Fee paid by",
                value: "OpenZeppelin Relayer / local channel",
              },
            ]}
          />
        </div>
        <div>
          <h3 className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
            What just happened
          </h3>
          <pre className="mt-3 overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5 font-mono text-[12px] leading-[2] text-[var(--muted)]">
            {`witness(answer, address) → public inputs
prove → π (Groth16 BN254)
relayer.submit(claim)
soroban: pairing check ∧ sender == prover
VERIFIED · prize released`}
          </pre>
        </div>
      </div>
    </main>
  );
}
