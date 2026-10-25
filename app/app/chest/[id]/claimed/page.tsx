"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoChest } from "@/components/logo-chest";
import { CellsBackground } from "@/components/cells-background";
import { Em } from "@/components/app/page-header";
import { KV, Mono } from "@/components/app/kv";
import { loadPlayer } from "@/lib/wallet";

type ClaimTx = {
  hash?: string;
  explorer?: string;
  nullifierHex?: string;
  ledger?: number | string;
};

function shortAddr(a: string) {
  if (a.length < 10) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export default function ClaimedPage() {
  const { id } = useParams<{ id: string }>();
  const chestId = String(id).padStart(4, "0");
  const [deg, setDeg] = useState(0);
  const [tx, setTx] = useState<ClaimTx | null>(null);
  const [addr, setAddr] = useState("");
  const [prizeLabel, setPrizeLabel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setAddr(loadPlayer()?.publicKey || "");
    fetch(`/api/chests/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m?.prizeLabel) setPrizeLabel(m.prizeLabel);
      })
      .catch(() => {});
    try {
      const raw = sessionStorage.getItem(`chestzk.claim.${id}`);
      if (raw) setTx(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
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
        const e =
          t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        setDeg(30 * Math.max(0, e));
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  const prover = addr ? shortAddr(addr) : "your address";
  const amountDisplay = prizeLabel ? `+${prizeLabel}` : "+—";
  const txHash = tx?.hash;
  const nullifier = tx?.nullifierHex
    ? `${tx.nullifierHex.slice(0, 6)}…${tx.nullifierHex.slice(-4)}`
    : null;

  // Visita directa o refresh en otra pestaña: no hay claim guardado, no se afirma nada.
  if (loaded && !txHash) {
    return (
      <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[var(--muted)]">
          No claim is recorded in this browser session, so we can&apos;t confirm a
          prize for chest #{chestId}. Your wallet lists every chest you won.
        </p>
        <Link href="/wallet" className="btn-landing btn-landing-p">
          Mi wallet
        </Link>
        <Link href={`/chest/${id}`} className="btn-landing btn-landing-s">
          Back to the chest
        </Link>
      </main>
    );
  }

  return (
    <main>
      {/* Centered verified hero — matches proto / Figma claimed screen */}
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          data-cells-tint="ok"
          aria-hidden
        >
          <CellsBackground variant="hero" className="!absolute inset-0 h-full" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-[720px] flex-col items-center px-6 pt-16 pb-14 text-center">
          <LogoChest
            className="w-[200px] lg:w-[280px]"
            deg={deg}
            showInside
          />

          <p className="mt-10 flex items-center gap-2 font-mono text-[13px] tracking-[0.08em] text-[var(--ok)] uppercase">
            <span
              className="size-[6px] rounded-full bg-[var(--ok)]"
              aria-hidden
            />
            VERIFIED ON SOROBAN
          </p>

          <h1 className="mt-4 text-[clamp(40px,6vw,64px)] leading-[1.02] font-semibold tracking-[-0.04em]">
            Chest #{chestId} is <Em tone="ok">yours.</Em>
          </h1>

          <p className="mt-5 max-w-[36rem] text-[18px] leading-[1.55] text-[var(--muted)]">
            Your proof verified for{" "}
            <span className="font-mono text-[var(--text)]">{prover}</span> and
            the prize was released. The nullifier is now spent, so this chest
            can never pay again.
          </p>

          <p className="mt-10 font-mono text-[clamp(40px,6vw,56px)] font-medium tracking-[-0.03em] text-[var(--gold)]">
            {amountDisplay}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/explore" className="btn-landing btn-landing-p">
              Open another chest →
            </Link>
            {tx?.explorer ? (
              <a
                href={tx.explorer}
                target="_blank"
                rel="noreferrer"
                className="btn-landing btn-landing-s"
              >
                View on Stellar Expert
              </a>
            ) : (
              <a
                href="https://stellar.expert/explorer/testnet"
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
      </header>

      <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-12 px-6 py-16 lg:grid-cols-2 lg:gap-16">
        <div>
          <h3 className="font-mono text-[12px] tracking-[0.1em] text-[var(--dim)] uppercase">
            Receipt
          </h3>
          <KV
            rows={[
              {
                label: "Tx hash",
                value: txHash ? <Mono>{txHash}</Mono> : "—",
              },
              {
                label: "Ledger",
                value: tx?.ledger ? `#${tx.ledger}` : "—",
              },
              {
                label: "Prover",
                value: (
                  <span className="text-[var(--proof)]">
                    {addr ? <Mono>{addr}</Mono> : "—"}
                  </span>
                ),
              },
              {
                label: "Nullifier",
                value: (
                  <span className="text-[var(--red)]">
                    {nullifier ? `${nullifier} · spent` : "—"}
                  </span>
                ),
              },
              {
                label: "Fee paid by",
                value: "OpenZeppelin Relayer",
              },
            ]}
          />
        </div>

        <div>
          <h3 className="font-mono text-[12px] tracking-[0.1em] text-[var(--dim)] uppercase">
            What just happened
          </h3>
          <div className="mt-3 overflow-x-auto rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5 font-mono text-[12.5px] leading-[2] text-[var(--muted)]">
            <p>
              <span className="text-[var(--dim)]">01</span> witness(answer,{" "}
              {prover}, chest={chestId})
            </p>
            <p>
              <span className="text-[var(--dim)]">02</span> groth16.prove → π
              (BN254)
            </p>
            <p>
              <span className="text-[var(--dim)]">03</span>{" "}
              relayer.submit(claim(π, nullifier))
            </p>
            <p>
              <span className="text-[var(--dim)]">04</span> soroban bn254 pairing
              check · sender == prover
            </p>
            <p className="mt-1 text-[var(--ok)]">
              VERIFIED nullifier stored · {prizeLabel || "prize"} → {prover}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
