"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InlineAlert } from "@/components/inline-alert";
import { IconSmartAccountKit as PasskeyGlyph } from "@/components/stack-logos";
import { isPhone, listWallets, WC_PROJECT_ID, WC_WALLET_ID, wcEnabled, WrongNetworkError, type WalletOption } from "@/lib/wallets-kit";
import { MAINNET_PASSKEY_NOTE } from "@/lib/passkey-policy";
import { useNet } from "@/components/network-provider";

/** Wallets web: no hay nada que instalar (xBull también corre como PWA). */
const WEB_IDS = new Set(["albedo", "hot-wallet", "xbull"]);
/** Apps móviles: en el sheet de móvil van en su propia grilla; las extensiones de escritorio se ocultan. */
const MOBILE_IDS = new Set(["lobstr", "onekey", "bitget", "hana"]);
const WALLET_INFO_URL = "https://stellar.org/ecosystem/wallets";
const LAST_KEY = "chestzk.lastWallet";

type View =
  | { kind: "list" }
  | { kind: "connecting"; wallet: WalletOption }
  | { kind: "rejected"; wallet: WalletOption }
  | { kind: "network"; wallet: WalletOption; network: string; checking?: boolean };

const isDetected = (w: WalletOption) => w.isAvailable && !WEB_IDS.has(w.id);

/**
 * Selector de wallets de Loot sobre Stellar Wallets Kit (no usa authModal). Dialog 420px,
 * bottom sheet en <640px. `onSelect(id)` conecta ("passkey" = cuenta con passkey) y lanza si falla;
 * WrongNetworkError = conectó, pero la wallet está en otra red (no se guarda sesión).
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
  const { NETWORK_LABEL, NETWORK_LC, IS_MAINNET } = useNet();
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [listErr, setListErr] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const attempt = useRef(0);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    setView({ kind: "list" });
    setMoreOpen(false);
    setListErr(false);
    setMobile(window.matchMedia("(max-width: 639px)").matches);
    try {
      setLast(localStorage.getItem(LAST_KEY));
    } catch {
      setLast(null);
    }
    let live = true;
    listWallets()
      .then((l) => live && setWallets(l))
      .catch(() => live && setListErr(true));
    const t = setTimeout(() => root.current?.focus(), 0);
    document.body.style.overflow = "hidden";
    return () => {
      live = false;
      clearTimeout(t);
      document.body.style.overflow = "";
      opener.current?.focus?.();
    };
  }, [open]);

  const groups = useMemo(() => {
    const byLast = (a: WalletOption, b: WalletOption) =>
      (b.id === last ? 1 : 0) - (a.id === last ? 1 : 0) || a.name.localeCompare(b.name);
    // WalletConnect genérico no se lista: en teléfonos se ofrece como "LOBSTR (mobile app)"; el módulo
    // `lobstr` del kit es la extensión de escritorio y en un teléfono nunca se detecta.
    // Freighter no detectado no se esconde en "More wallets": va arriba como fila propia (ver freighterRow).
    const all = (wallets ?? []).filter(
      (w) => w.id !== WC_WALLET_ID && !(isPhone() && w.id === "lobstr" && !w.isAvailable) && !(w.id === "freighter" && !w.isAvailable),
    );
    const detected = all.filter(isDetected).sort(byLast);
    const web = all.filter((w) => WEB_IDS.has(w.id)).sort(byLast);
    const apps = all.filter((w) => MOBILE_IDS.has(w.id) && !isDetected(w) && !WEB_IDS.has(w.id)).sort(byLast);
    const more = all
      .filter((w) => !isDetected(w) && !WEB_IDS.has(w.id))
      .filter((w) => !mobile) // móvil: las apps van arriba y las extensiones de escritorio se ocultan
      .sort(byLast);
    return { detected, web, apps, more };
  }, [wallets, last, mobile]);

  // isPlatformWrapper: la wallet que nos abrió se autoselecciona
  useEffect(() => {
    if (!open || !wallets || view.kind !== "list") return;
    // la wallet que nos abrió (isPlatformWrapper del kit, o el navegador interno de LOBSTR) se autoselecciona
    const inLobstr = /lobstr/i.test(navigator.userAgent);
    const w = wallets.find((x) => x.isPlatformWrapper && x.isAvailable) ?? (inLobstr ? wallets.find((x) => x.id === "lobstr" && x.isAvailable) : undefined);
    if (w) void choose(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wallets]);

  async function choose(w: WalletOption) {
    const mine = ++attempt.current;
    setView({ kind: "connecting", wallet: w });
    try {
      await onSelect(w.id);
      try {
        if (w.id !== "passkey") localStorage.setItem(LAST_KEY, w.id);
      } catch {
        /* ignorado */
      }
    } catch (e) {
      if (mine !== attempt.current) return; // cancelado mientras tanto
      if (e instanceof WrongNetworkError) setView({ kind: "network", wallet: w, network: e.networkName });
      else setView({ kind: "rejected", wallet: w });
    }
  }

  async function recheck(w: WalletOption, network: string) {
    setView({ kind: "network", wallet: w, network, checking: true });
    await choose(w);
  }

  if (!open) return null;

  const busy = view.kind === "connecting";

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (view.kind === "connecting") attempt.current++;
      onClose();
      return;
    }
    const focusables = Array.from(
      root.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? [],
    );
    if (e.key === "Tab" && focusables.length) {
      const first = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const rows = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-row]:not([disabled])") ?? []);
      const i = rows.indexOf(document.activeElement as HTMLElement);
      if (rows.length) {
        e.preventDefault();
        const next = e.key === "ArrowDown" ? (i + 1) % rows.length : (i - 1 + rows.length) % rows.length;
        rows[i === -1 ? 0 : next]?.focus();
      }
    }
  }

  const row =
    "flex min-h-[44px] w-full min-w-0 items-center gap-3 px-5 py-2.5 text-left outline-none hover:bg-[var(--s2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--proof)] disabled:cursor-default disabled:opacity-60";
  const label = "px-5 pt-4 pb-2 font-mono text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase";

  const Icon = ({ w, size = 28 }: { w: WalletOption; size?: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={w.icon} alt="" width={size} height={size} className="shrink-0 rounded-[6px]" style={{ width: size, height: size }} />
  );

  const Row = ({ w, status, dot }: { w: WalletOption; status: string; dot?: boolean }) => (
    <li className="border-t border-[var(--line)] first:border-t-0">
      <button type="button" data-row disabled={busy} onClick={() => void choose(w)} className={row}>
        <Icon w={w} />
        <span className="min-w-0 flex-1 text-[15px] font-medium">
          {w.name}
          {w.id === last && <span className="ml-2 font-mono text-[11px] font-normal text-[var(--dim)]">last used</span>}
        </span>
        <span className="flex items-center gap-2 font-mono text-[12px] text-[var(--dim)]">
          {dot && <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden />}
          <span className={dot ? "text-[var(--ok)]" : ""}>{status}</span>
        </span>
      </button>
    </li>
  );

  // LOBSTR en un teléfono: por WalletConnect si hay projectId; si no, instrucciones (no una página de
  // instalación para una wallet que la persona ya tiene).
  const phoneLobstr = (() => {
    if (!isPhone() || !IS_MAINNET) return null;
    if (wcEnabled()) {
      const wc = (wallets ?? []).find((w) => w.id === WC_WALLET_ID);
      if (!wc) return null;
      const opt: WalletOption = { ...wc, id: WC_WALLET_ID, name: "LOBSTR (mobile app)", icon: "https://stellar.creit.tech/wallet-icons/lobstr.png" };
      return (
        <>
          <p className={label}>Mobile app</p>
          <ul className="border-y border-[var(--line)]">
            <Row w={opt} status="WalletConnect" />
          </ul>
        </>
      );
    }
    if (WC_PROJECT_ID) return null;
    return (
      <>
        <p className={label}>LOBSTR (mobile app)</p>
        <div className="mx-5 mb-3 rounded-[10px] border border-[var(--line)] bg-[var(--bg)] p-3 text-[13px] leading-[1.5] text-[var(--muted)]" role="note">
          Using LOBSTR on your phone? Open this site inside the LOBSTR app&apos;s browser, then connect from there. We can&apos;t
          detect the app from a regular mobile browser.
        </div>
      </>
    );
  })();

  // Freighter sin detectar (extensión no instalada o navegador sin ella): siempre visible, con una
  // salida clara. En el teléfono, Freighter corre en su propio navegador interno.
  const freighterMissing = (wallets ?? []).find((w) => w.id === "freighter" && !w.isAvailable);
  const freighterRow = freighterMissing ? (
    <>
      <p className={label}>Freighter</p>
      <ul className="border-y border-[var(--line)]">
        <li>
          <a href={freighterMissing.url} target="_blank" rel="noopener noreferrer" className={`${row} min-h-[56px]`}>
            <Icon w={freighterMissing} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">Freighter</span>
              <span className="block text-[13px] text-[var(--muted)]">
                {isPhone()
                  ? "Not detected in this browser. Open this site inside the Freighter app's browser."
                  : "Not detected. Install the extension, then reload this page."}
              </span>
            </span>
            <span className="text-[var(--dim)]" aria-hidden>
              ↗
            </span>
          </a>
        </li>
      </ul>
    </>
  ) : null;

  const passkeyOption = {
    id: "passkey",
    name: "Passkey",
    icon: "",
    url: "",
    isAvailable: true,
    isPlatformWrapper: false,
    type: "passkey",
  } satisfies WalletOption;

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
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-[14px] border border-[var(--line)] bg-[var(--s1)] outline-none sm:w-[420px] sm:rounded-[14px]"
      >
        <header className="flex items-start justify-between px-5 pt-5">
          <div>
            <h2 id="wp-title" className="text-[20px] font-semibold tracking-[-0.02em]">
              Connect a wallet
            </h2>
            <p className="mt-1 flex items-center gap-2 font-mono text-[12px] text-[var(--dim)]">
              <span className="size-[6px] rounded-full bg-[var(--ok)]" aria-hidden /> Stellar {NETWORK_LC}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              attempt.current++;
              onClose();
            }}
            className="focus-landing -mr-2 flex size-8 items-center justify-center rounded-[8px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </header>

        {view.kind === "list" && (
          <>
            <p className="px-5 pt-2 pb-4 text-[15px] leading-[1.5] text-[var(--muted)]">
              Pick how you sign. Nothing is signed until you claim or send.
            </p>

            {IS_MAINNET ? (
              <p className="mx-5 mb-3 rounded-[10px] border border-[var(--line)] bg-[var(--bg)] p-3 text-[13px] leading-[1.5] text-[var(--muted)]" role="note">
                {MAINNET_PASSKEY_NOTE}
              </p>
            ) : (
              <>
            <p className={label}>Recommended</p>
            <ul className="border-y border-[var(--line)]">
              <li>
                <button type="button" data-row onClick={() => void choose(passkeyOption)} className={`${row} min-h-[56px]`}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--proof)] text-[var(--bg)]">
                    <PasskeyGlyph style={{ height: 16, width: "auto" }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">Passkey</span>
                    <span className="block text-[13px] text-[var(--muted)]">
                      Passkey smart account · Face ID or Touch ID, no extension
                    </span>
                  </span>
                </button>
              </li>
            </ul>

              </>
            )}

            {freighterRow}

            {phoneLobstr}

            {listErr && (
              <p className="px-5 py-6 text-[14px] text-[var(--muted)]">
                Couldn’t load the wallet list. Close and try again.
              </p>
            )}
            {!wallets && !listErr && <div className="mx-5 mt-4 h-[88px] rounded-[8px] bg-[var(--s2)] opacity-40" />}

            {groups.detected.length > 0 && (
              <>
                <p className={label}>Detected</p>
                <ul className="border-y border-[var(--line)]">
                  {groups.detected.map((w) => (
                    <Row key={w.id} w={w} status="detected" dot />
                  ))}
                </ul>
              </>
            )}

            {groups.web.length > 0 && (
              <>
                <p className={label}>Web wallets · no install</p>
                <ul className="border-y border-[var(--line)]">
                  {groups.web.map((w) => (
                    <Row key={w.id} w={w} status="web wallet" />
                  ))}
                </ul>
              </>
            )}

            {mobile && groups.apps.length > 0 && (
              <>
                <p className={label}>Mobile apps</p>
                <ul className="grid grid-cols-2 gap-px border-y border-[var(--line)] bg-[var(--line)]">
                  {groups.apps.map((w) => (
                    <li key={w.id} className="bg-[var(--s1)]">
                      <a href={w.url} target="_blank" rel="noopener noreferrer" className={`${row} px-4`}>
                        <Icon w={w} />
                        <span className="min-w-0 flex-1 truncate text-[14px]">{w.name}</span>
                        <span className="text-[var(--dim)]" aria-hidden>
                          ↗
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {groups.more.length > 0 && (
              <>
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((m) => !m)}
                  className={`${label} flex w-full items-center justify-between text-left hover:text-[var(--text)]`}
                >
                  <span>More wallets · {groups.more.length}</span>
                  <span className="flex items-center gap-2">
                    {!moreOpen &&
                      groups.more.slice(0, 4).map((w) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={w.id} src={w.icon} alt="" width={16} height={16} className="size-4 rounded-[4px]" />
                      ))}
                    {moreOpen ? "Hide ▴" : "Show ▾"}
                  </span>
                </button>
                {moreOpen && (
                  <ul className="grid grid-cols-3 gap-px border-y border-[var(--line)] bg-[var(--line)]">
                    {groups.more.map((w) => (
                      <li key={w.id} className="bg-[var(--s1)]">
                        <a
                          href={w.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${w.name} · not installed (opens its site)`}
                          className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 px-2 py-3 text-center outline-none hover:bg-[var(--s2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--proof)]"
                        >
                          <Icon w={w} />
                          <span className="max-w-full truncate text-[12px] text-[var(--muted)]">
                            {w.name} <span aria-hidden>↗</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}

        {view.kind === "connecting" && (
          <div className="px-5 pt-6 pb-2" role="status">
            <div className="flex flex-col items-center py-8 text-center">
              <div className="relative">
                {view.wallet.id === "passkey" ? (
                  <span className="flex size-12 items-center justify-center rounded-[10px] bg-[var(--proof)] text-[var(--bg)]">
                    <PasskeyGlyph style={{ height: 24, width: "auto" }} />
                  </span>
                ) : (
                  <Icon w={view.wallet} size={48} />
                )}
              </div>
              <span
                className="chestzk-spin mt-5 size-8 rounded-full border-2 border-[var(--line)] border-t-[var(--proof)]"
                aria-hidden
              />
              <p className="mt-4 text-[15px] font-medium">
                {view.wallet.id === "passkey"
                  ? "Confirm with your passkey…"
                  : `Approve the connection in the ${view.wallet.name} popup…`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                attempt.current++;
                setView({ kind: "list" });
              }}
              className="btn-landing btn-landing-s mb-5 w-full"
            >
              Cancel
            </button>
          </div>
        )}

        {view.kind === "rejected" && (
          <div className="space-y-4 px-5 pt-4 pb-5">
            <InlineAlert
              tone="red"
              title="Wallet not connected"
              body={`Couldn’t connect to ${view.wallet.name}. The request was cancelled or failed.`}
            />
            <button type="button" onClick={() => void choose(view.wallet)} className="btn-landing btn-landing-p w-full">
              Try again
            </button>
            <button type="button" onClick={() => setView({ kind: "list" })} className="btn-landing btn-landing-s w-full">
              Choose another wallet
            </button>
          </div>
        )}

        {view.kind === "network" && (
          <div className="space-y-4 px-5 pt-4 pb-5">
            <InlineAlert
              tone="gold"
              title="Wrong network"
              body={`${view.wallet.name} is on ${view.network}. Loot runs on Stellar ${NETWORK_LC}.`}
            />
            <ol className="space-y-1 pl-5 text-[14px] leading-[1.6] text-[var(--muted)]" style={{ listStyle: "decimal" }}>
              <li>Open {view.wallet.name} and go to its network settings.</li>
              <li>Switch to “{NETWORK_LABEL}”.</li>
              <li>Come back and check again.</li>
            </ol>
            <button
              type="button"
              disabled={view.checking}
              onClick={() => void recheck(view.wallet, view.network)}
              className="btn-landing btn-landing-p w-full disabled:opacity-50"
            >
              I switched, check again
            </button>
            <button type="button" onClick={() => setView({ kind: "list" })} className="btn-landing btn-landing-s w-full">
              Choose another wallet
            </button>
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3 font-mono text-[12px] text-[var(--dim)]">
          <a
            href={WALLET_INFO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[var(--text)]"
          >
            What is a wallet? ↗
          </a>
          <span>Stellar Wallets Kit</span>
        </footer>
      </div>
    </div>
  );
}
