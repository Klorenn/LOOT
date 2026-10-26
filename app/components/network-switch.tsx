"use client";

import Link from "next/link";
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
 * ÚNICO control de red de la app: botón segmentado "Testnet | Mainnet" (dos <button> reales dentro de un grupo
 * con borde de 1px, radio 10, h-9). Activo = relleno (Mainnet dorado con texto oscuro, Testnet verde); inactivo =
 * transparente con texto atenuado. Mainnet queda deshabilitada ("soon") hasta que esté configurada.
 */
export function NetworkSegmented({ className = "", info = true }: { className?: string; info?: boolean }) {
  const { IS_MAINNET, mainnetReady } = useNet();
  const seg = (net: Net, label: string) => {
    const active = (net === "mainnet") === IS_MAINNET;
    const soon = net === "mainnet" && !mainnetReady;
    const on = net === "mainnet" ? "bg-[var(--gold)] text-[#14110a]" : "bg-[var(--ok)] text-[#04170d]";
    return (
      <button
        key={net}
        type="button"
        aria-pressed={active}
        disabled={soon}
        title={soon ? "Mainnet is not live yet" : active ? `${label} is active` : `Switch to ${label}`}
        onClick={() => !active && switchNetwork(net)}
        className={`h-full px-3.5 font-mono text-[13px] font-semibold outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--proof)] ${
          active ? on : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {soon ? `${label} · soon` : label}
      </button>
    );
  };
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        role="group"
        aria-label="Network"
        data-network-toggle
        data-network={IS_MAINNET ? "mainnet" : "testnet"}
        className="inline-flex h-9 items-stretch overflow-hidden rounded-[10px] border border-[var(--line)]"
      >
        {seg("testnet", "Testnet")}
        {seg("mainnet", "Mainnet")}
      </span>
      {info && (
        <Link
          href="/network"
          aria-label="Network facts"
          title="Live network facts"
          className="focus-landing inline-flex h-9 items-center font-mono text-[13px] text-[var(--dim)] hover:text-[var(--text)]"
        >
          ⓘ
        </Link>
      )}
    </span>
  );
}

/** Mismo control en el pie de página. */
export const NetworkSwitch = NetworkSegmented;

/** Fila del menú de cuenta: el mismo control segmentado. */
export function NetworkMenuItem() {
  return (
    <div role="none" className="border-b border-[var(--line)] px-4 py-3">
      <p className="mb-2 font-mono text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase">Network</p>
      <NetworkSegmented info={false} />
    </div>
  );
}
