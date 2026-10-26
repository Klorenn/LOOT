"use client";

import { useNet } from "@/components/network-provider";
import { switchNetwork, type Net } from "@/lib/network";

/** Etiqueta de la red actual: dorado en mainnet (fondos reales), verde en testnet. */
export function NetworkBadge({ className = "" }: { className?: string }) {
  const { IS_MAINNET, NETWORK_LABEL } = useNet();
  const color = IS_MAINNET ? "var(--gold)" : "var(--ok)";
  return (
    <span
      data-network={IS_MAINNET ? "mainnet" : "testnet"}
      className={`inline-flex items-center gap-2 font-mono text-[13px] ${className}`}
      style={{ color: IS_MAINNET ? color : "var(--dim)" }}
    >
      <span className="size-[6px] rounded-full" style={{ background: color }} aria-hidden />
      {NETWORK_LABEL}
    </span>
  );
}

/**
 * Botón "Testnet ⇄ Mainnet": cambia la red en este mismo sitio (cookie `loot_net`) y recarga.
 * Si mainnet no está configurada, muestra "Mainnet (coming soon)" deshabilitado.
 */
export function NetworkToggle({ compact = false }: { compact?: boolean }) {
  const { IS_MAINNET, mainnetReady, NETWORK_LABEL } = useNet();
  const target: Net = IS_MAINNET ? "testnet" : "mainnet";
  const soon = target === "mainnet" && !mainnetReady;
  const label = soon ? "Mainnet (coming soon)" : target === "mainnet" ? "Mainnet" : "Testnet";
  return (
    <button
      type="button"
      disabled={soon}
      onClick={() => switchNetwork(target)}
      title={soon ? "Mainnet is not live yet" : `Switch to ${label}`}
      className="font-mono text-[12px] text-[var(--dim)] underline-offset-2 hover:text-[var(--text)] hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
    >
      {compact && !soon ? "⇄" : `${NETWORK_LABEL} ⇄ ${label}`}
    </button>
  );
}

/** Badge de la red actual + botón de cambio. */
export function NetworkSwitch({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <NetworkBadge />
      <NetworkToggle compact={compact} />
    </span>
  );
}

/** Fila para el menú de cuenta. */
export function NetworkMenuItem({ onClick }: { onClick?: () => void }) {
  const { IS_MAINNET, mainnetReady } = useNet();
  const target: Net = IS_MAINNET ? "testnet" : "mainnet";
  const soon = target === "mainnet" && !mainnetReady;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={soon}
      onClick={() => {
        onClick?.();
        switchNetwork(target);
      }}
      className="flex w-full items-center justify-between border-b border-[var(--line)] px-4 py-3 text-left text-[14px] text-[var(--muted)] hover:bg-[var(--s2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>{soon ? "Mainnet (coming soon)" : `Switch to ${target === "mainnet" ? "Mainnet" : "Testnet"}`}</span>
      <NetworkBadge className="!text-[12px]" />
    </button>
  );
}
