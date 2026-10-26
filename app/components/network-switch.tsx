"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
 * ÚNICO control de red de la app: un botón pequeño con el nombre de la red actual y ▾ ("Mainnet ▾" en dorado,
 * "Testnet ▾" en verde) que abre un menú con SOLO el nombre de la otra red; elegirla cambia la red y recarga la ruta.
 * Teclado: Enter/Espacio/↓ abren, ↑/↓ mueven, Esc cierra y devuelve el foco; clic fuera cierra. Sin sombras (s1, borde 1px, radio 10).
 * `up` abre el menú hacia arriba (footer); `inline` lo pinta en el flujo (dentro de menús con overflow oculto).
 */
export function NetworkSelect({
  className = "",
  info = true,
  up = false,
  inline = false,
}: {
  className?: string;
  info?: boolean;
  up?: boolean;
  inline?: boolean;
}) {
  const { IS_MAINNET, NETWORK_LABEL, mainnetReady } = useNet();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const other: Net = IS_MAINNET ? "testnet" : "mainnet";
  const otherLabel = other === "mainnet" ? "Mainnet" : "Testnet";
  const soon = other === "mainnet" && !mainnetReady;
  const color = IS_MAINNET ? "var(--gold)" : "var(--ok)";

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  return (
    <span ref={root} className={`relative inline-flex items-center gap-2 ${className}`} data-network-select data-network={IS_MAINNET ? "mainnet" : "testnet"}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Network: ${NETWORK_LABEL}. Change network`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "Escape") close(false);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[var(--line)] bg-transparent px-3 font-mono text-[13px] font-semibold outline-none hover:bg-[var(--s1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--proof)]"
        style={{ color }}
      >
        {NETWORK_LABEL}
        <span aria-hidden className="text-[10px] opacity-80">
          ▾
        </span>
      </button>
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
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Network"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close(true);
            }
            if (e.key === "Tab") setOpen(false);
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault(); // un solo ítem: el foco se queda en él
              item.current?.focus();
            }
          }}
          className={`z-50 min-w-[120px] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--s1)] ${
            inline ? "mt-2 w-full" : `absolute left-0 ${up ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"}`
          }`}
        >
          <button
            ref={item}
            type="button"
            role="menuitem"
            disabled={soon}
            title={soon ? "Mainnet is not live yet" : undefined}
            onClick={() => switchNetwork(other)}
            className="block w-full px-3 py-2 text-left font-mono text-[13px] text-[var(--muted)] outline-none hover:bg-[var(--s2)] hover:text-[var(--text)] focus-visible:bg-[var(--s2)] focus-visible:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {otherLabel}
          </button>
        </div>
      )}
    </span>
  );
}

/** Mismo control en el pie de página (el menú abre hacia arriba). */
export function NetworkSwitch() {
  return <NetworkSelect up />;
}

/** Fila del menú de cuenta: el mismo control, con el menú en el flujo (el desplegable de cuenta recorta lo que sobresale). */
export function NetworkMenuItem() {
  return (
    <div role="none" className="border-b border-[var(--line)] px-4 py-3">
      <NetworkSelect info={false} inline />
    </div>
  );
}
