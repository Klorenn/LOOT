"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Em } from "@/components/app/page-header";
import { InlineAlert } from "@/components/app/inline-alert";
import { AddressQrDialog } from "@/components/address-qr-dialog";
import { CopyButton } from "@/components/copy-button";
import {
  readPrizeBalance,
  readWonChests,
  type WonChestsResult,
} from "@/lib/chain";
import { PRIZE, stroopsToXlm, tokenDecimals, tokenLabel } from "@/lib/config";
import { expertAddress, expertTx, shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";

type Load<T> =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "ok"; v: T }
  | { s: "error"; msg: string };

const errMsg = (e: unknown) =>
  (e as { message?: string })?.message ?? String(e);

export default function WalletPage() {
  const { ready, address, kind, player, disconnect } = useSession();
  const [balance, setBalance] = useState<Load<bigint>>({ s: "idle" });
  const [won, setWon] = useState<Load<WonChestsResult>>({ s: "idle" });
  const [qr, setQr] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!address) return;
    const mine = ++seq.current;
    setBalance({ s: "loading" });
    setWon({ s: "loading" });
    const [b, w] = await Promise.allSettled([
      readPrizeBalance(address),
      readWonChests(address),
    ]);
    if (mine !== seq.current) return; // llegó una recarga más nueva
    setBalance(
      b.status === "fulfilled"
        ? { s: "ok", v: b.value }
        : { s: "error", msg: errMsg(b.reason) },
    );
    setWon(
      w.status === "fulfilled"
        ? { s: "ok", v: w.value }
        : { s: "error", msg: errMsg(w.reason) },
    );
  }, [address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tras un claim: el indexador de eventos del RPC tarda un par de ledgers.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onClaim = () => {
      void refresh();
      t = setTimeout(() => void refresh(), 6000);
    };
    window.addEventListener("chestzk:claimed", onClaim);
    return () => {
      window.removeEventListener("chestzk:claimed", onClaim);
      clearTimeout(t);
    };
  }, [refresh]);

  if (!ready) return <main className="min-h-[60vh]" />;

  if (!address) {
    return (
      <main className="mx-auto max-w-[720px] px-6 py-20">
        <InlineAlert
          tone="dim"
          title="Sin sesión"
          body="Entrá con passkey para ver tu dirección, tu saldo y los cofres que ganaste."
          actions={[{ href: "/enter", label: "Entrar con passkey", primary: true }]}
        />
      </main>
    );
  }

  const kindLabel =
    kind === "passkey"
      ? "Smart wallet con passkey (C…)"
      : player?.kind === "wallet"
        ? "Cuenta G… · Stellar Wallets Kit"
        : "Cuenta G… de demo · solo en este navegador";

  return (
    <main>
      <PageHeader
        eyebrow={<span>{kindLabel}</span>}
        title={
          <>
            Mi <Em>wallet</Em>
          </>
        }
        lead="Tu dirección es la que queda sellada dentro de cada prueba: el premio solo puede ir a ella."
      />

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-6 py-12 lg:grid-cols-[1fr_1.2fr]">
        <section className="flex flex-col gap-6">
          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5">
            <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
              Dirección
            </p>
            <p
              className="mt-3 font-mono text-[22px] tracking-[-0.01em]"
              title={address}
            >
              {shortAddr(address)}
            </p>
            <div className="mt-4 flex flex-wrap items-start gap-2">
              <CopyButton value={address} />
              <button
                type="button"
                onClick={() => setQr(true)}
                className="btn-landing btn-landing-s btn-landing-sm"
              >
                Ver QR
              </button>
              <a
                href={expertAddress(address)}
                target="_blank"
                rel="noreferrer"
                className="btn-landing btn-landing-s btn-landing-sm"
              >
                stellar.expert ↗
              </a>
            </div>
          </div>

          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
                Saldo
              </p>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={balance.s === "loading"}
                className="btn-landing btn-landing-s btn-landing-sm disabled:opacity-50"
              >
                {balance.s === "loading" ? "Actualizando…" : "Actualizar"}
              </button>
            </div>
            <p className="mt-3 font-mono text-[34px] font-medium tracking-[-0.03em] text-[var(--gold)]">
              {balance.s === "ok"
                ? `${stroopsToXlm(balance.v)} ${PRIZE.code}`
                : "—"}
            </p>
            {balance.s === "error" && (
              <p className="mt-2 font-mono text-[12px] text-[var(--red)]">
                No se pudo leer el saldo: {balance.msg.slice(0, 140)}
              </p>
            )}
          </div>

          <div className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-5">
            <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
              Sesión
            </p>
            {!confirmOut ? (
              <button
                type="button"
                onClick={() => setConfirmOut(true)}
                className="btn-landing btn-landing-s mt-3"
              >
                Cerrar sesión
              </button>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-[14px] leading-[1.5] text-[var(--muted)]">
                  Se borra la sesión de este dispositivo.{" "}
                  {player?.kind === "classic" && (
                    <strong className="text-[var(--red)]">
                      Esta cuenta de demo existe solo en este navegador: al
                      cerrar sesión se pierde su clave y no hay forma de
                      recuperarla.{" "}
                    </strong>
                  )}
                  Tu clave secreta de jugador (de ella sale el nullifier de tus
                  pruebas) vive solo en este dispositivo y no sale de él: si
                  limpiás los datos del navegador se pierde.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    className="btn-landing btn-landing-p btn-landing-sm"
                  >
                    Cerrar sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOut(false)}
                    className="btn-landing btn-landing-s btn-landing-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[14px] border border-[var(--line)] bg-[var(--s1)]">
          <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
            <h2 className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
              Cofres ganados
            </h2>
            <span className="font-mono text-[12px] text-[var(--dim)]">
              {won.s === "ok" ? won.v.items.length : "—"}
            </span>
          </header>
          <div className="p-5">
            {won.s === "loading" || won.s === "idle" ? (
              <p className="font-mono text-[13px] text-[var(--dim)]">Leyendo eventos on-chain…</p>
            ) : won.s === "error" ? (
              <InlineAlert
                tone="red"
                title="No se pudo leer el historial"
                body={`El RPC de testnet no respondió: ${won.msg.slice(0, 160)}`}
              />
            ) : won.v.items.length === 0 ? (
              <div className="space-y-3">
                <p className="text-[15px] text-[var(--muted)]">
                  Todavía no ganaste ningún cofre con esta dirección.
                </p>
                <Link href="/explore" className="btn-landing btn-landing-p btn-landing-sm">
                  Explorar cofres →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {won.v.items.map((w) => (
                  <li
                    key={`${w.txHash}-${w.chestId}`}
                    className="flex flex-wrap items-baseline justify-between gap-3 py-3"
                  >
                    <div>
                      <Link
                        href={`/chest/${w.chestId}`}
                        className="font-mono text-[14px] hover:underline"
                      >
                        Chest #{String(w.chestId).padStart(4, "0")}
                      </Link>
                      <p className="font-mono text-[12px] text-[var(--dim)]">
                        {new Date(w.closedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-[14px] text-[var(--gold)]">
                        +{stroopsToXlm(w.prize, tokenDecimals(w.token))}{w.token ? ` ${tokenLabel(w.token)}` : ""}
                      </span>
                      <a
                        href={expertTx(w.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[12px] text-[var(--proof)] underline underline-offset-2"
                      >
                        tx {w.txHash.slice(0, 6)}… ↗
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {won.s === "ok" && (
              <p className="mt-4 font-mono text-[12px] leading-[1.6] text-[var(--dim)]">
                Solo se muestran claims de los últimos ~7 días (ventana de
                eventos del RPC de testnet, desde el ledger{" "}
                {won.v.oldestLedger.toLocaleString()}).
                {won.v.truncated && " La lista se cortó: hay más eventos de los que se leen."}
              </p>
            )}
          </div>
        </section>
      </div>

      <AddressQrDialog address={address} open={qr} onClose={() => setQr(false)} />
    </main>
  );
}
