"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IS_MAINNET, NETWORK_LABEL, NETWORK_URLS } from "@/lib/config";
import { otherNetworkUrl } from "@/lib/network-switch";

const TARGET = IS_MAINNET ? "Testnet" : "Mainnet";
const BASE = IS_MAINNET ? NETWORK_URLS.testnet : NETWORK_URLS.mainnet;

/** Enlace al despliegue de la otra red, conservando ruta y query. */
export function useOtherNetworkHref(): string {
  const path = usePathname();
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(window.location.search), [path]);
  return otherNetworkUrl(BASE, path || "/", search);
}

/** Etiqueta de la red actual: dorado en mainnet (fondos reales), verde en testnet. */
export function NetworkBadge({ className = "" }: { className?: string }) {
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

/** Badge de la red actual + enlace "Testnet ⇄ Mainnet". */
export function NetworkSwitch({ compact = false }: { compact?: boolean }) {
  const href = useOtherNetworkHref();
  return (
    <span className="inline-flex items-center gap-3">
      <NetworkBadge />
      <a
        href={href}
        title={`Open this page on ${TARGET}`}
        className="font-mono text-[12px] text-[var(--dim)] underline-offset-2 hover:text-[var(--text)] hover:underline"
      >
        {compact ? "⇄" : `${NETWORK_LABEL} ⇄ ${TARGET}`}
      </a>
    </span>
  );
}

/** Fila para el menú de cuenta. */
export function NetworkMenuItem({ onClick }: { onClick?: () => void }) {
  const href = useOtherNetworkHref();
  return (
    <a
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 text-[14px] text-[var(--muted)] hover:bg-[var(--s2)] hover:text-[var(--text)]"
    >
      <span>Switch to {TARGET}</span>
      <NetworkBadge className="!text-[12px]" />
    </a>
  );
}
