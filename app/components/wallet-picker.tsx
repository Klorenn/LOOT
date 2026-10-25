"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InlineAlert } from "@/components/inline-alert";
import { listWallets, type WalletOption } from "@/lib/wallets-kit";

/** Wallets que no son una extensión: siempre se pueden usar desde el navegador. */
/** (xBull también corre como PWA web, por eso el kit siempre lo reporta disponible.) */
const WEB_IDS = new Set(["albedo", "hot-wallet", "xbull"]);

type Group = 0 | 1 | 2; // 0 detectada · 1 web · 2 no instalada
const groupOf = (w: WalletOption): Group =>
  WEB_IDS.has(w.id) ? 1 : w.isAvailable ? 0 : 2;

const STATUS: Record<Group, string> = {
  0: "detected",
  1: "web wallet",
  2: "not installed",
};

/**
 * Selector de wallets de Loot (reemplaza el modal blanco de Stellar Wallets Kit).
 * Dialog 420px, s1, borde 1px line, sin sombra; en <640px es un bottom sheet.
 * `onSelect` conecta la wallet elegida y devuelve cuando terminó (lanza si falló).
 */
export function WalletPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => Promise<void>;
}) {
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [listErr, setListErr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    setBusy(null);
    setError(null);
    setListErr(false);
    let live = true;
    listWallets()
      .then((l) => live && setWallets(l))
      .catch(() => live && setListErr(true));
    // el foco entra al dialog de inmediato (si no, Esc/flechas irían a la página de atrás)
    const t = setTimeout(() => root.current?.focus(), 0);
    document.body.style.overflow = "hidden";
    return () => {
      live = false;
      clearTimeout(t);
      document.body.style.overflow = "";
      opener.current?.focus?.();
    };
  }, [open]);

  const sorted = useMemo(
    () =>
      wallets
        ? [...wallets].sort(
            (a, b) => groupOf(a) - groupOf(b) || a.name.localeCompare(b.name),
          )
        : null,
    [wallets],
  );

  // cuando llega la lista, el foco pasa a la primera fila habilitada
  useEffect(() => {
    if (!open || !sorted) return;
    const t = setTimeout(
      () => root.current?.querySelector<HTMLElement>("[data-row]:not([disabled])")?.focus(),
      0,
    );
    return () => clearTimeout(t);
  }, [open, sorted]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
      return;
    }
    const focusables = Array.from(
      root.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (e.key === "Tab" && focusables.length) {
      // focus trap
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const rows = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-row]:not([disabled])") ?? [],
      );
      const i = rows.indexOf(document.activeElement as HTMLElement);
      if (rows.length) {
        e.preventDefault();
        const next = e.key === "ArrowDown" ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
        rows[i === -1 ? 0 : next]?.focus();
      }
    }
  }

  async function choose(w: WalletOption) {
    setError(null);
    setBusy(w.id);
    try {
      await onSelect(w.id);
    } catch {
      setError(w.name);
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-[rgba(12,11,16,.72)] sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={root}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wp-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-[14px] outline-none border border-[var(--line)] bg-[var(--s1)] sm:w-[420px] sm:rounded-[14px]"
      >
        <header className="flex items-center justify-between px-5 pt-5">
          <h2
            id="wp-title"
            className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase"
          >
            Connect a Stellar wallet
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={!!busy}
            className="focus-landing -mr-2 flex size-8 items-center justify-center rounded-[8px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
          >
            ✕
          </button>
        </header>
        <p className="px-5 pt-2 pb-4 text-[15px] leading-[1.5] text-[var(--muted)]">
          Uses your G… address. Nothing is signed until you claim.
        </p>

        {error && (
          <div className="px-5 pb-4">
            <InlineAlert
              tone="red"
              title="Wallet not connected"
              body={`Couldn’t connect to ${error}. The request was cancelled or failed.`}
            />
          </div>
        )}

        <ul className="border-t border-[var(--line)]" aria-busy={!sorted && !listErr}>
          {listErr && (
            <li className="px-5 py-6 text-[14px] text-[var(--muted)]">
              Couldn’t load the wallet list. Close and try again.
            </li>
          )}
          {!sorted &&
            !listErr &&
            [0, 1, 2].map((i) => (
              <li key={i} className="h-[60px] border-b border-[var(--line)] bg-[var(--s2)] opacity-40" />
            ))}
          {sorted?.map((w) => {
            const g = groupOf(w);
            const connecting = busy === w.id;
            return (
              <li key={w.id} className="flex items-center border-b border-[var(--line)] last:border-b-0">
                <button
                  type="button"
                  data-row
                  disabled={!!busy}
                  onClick={() => void choose(w)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-5 py-3.5 text-left outline-none hover:bg-[var(--s2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--proof)] disabled:cursor-default disabled:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={w.icon}
                    alt=""
                    width={28}
                    height={28}
                    className="size-7 shrink-0 rounded-[6px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{w.name}</span>
                    {connecting && (
                      <span className="mt-0.5 flex items-center gap-2 font-mono text-[12px] text-[var(--proof)]">
                        <span
                          className="chestzk-spin size-3.5 rounded-full border-2 border-[var(--line)] border-t-[var(--proof)]"
                          aria-hidden
                        />
                        Confirm in {w.name}…
                      </span>
                    )}
                  </span>
                  {!connecting && (
                    <span className="flex items-center gap-2 font-mono text-[12px] text-[var(--dim)]">
                      {g === 0 && (
                        <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />
                      )}
                      <span className={g === 0 ? "text-[var(--ok)]" : ""}>{STATUS[g]}</span>
                    </span>
                  )}
                </button>
                {g === 2 && !connecting && (
                  <a
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-landing btn-landing-s btn-landing-sm mr-4 shrink-0"
                    tabIndex={busy ? -1 : 0}
                  >
                    Install ↗
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center gap-2 border-t border-[var(--line)] px-5 py-3 font-mono text-[12px] text-[var(--dim)]">
          Powered by Stellar Wallets Kit ·{" "}
          <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden /> Testnet
        </footer>
      </div>
    </div>
  );
}
