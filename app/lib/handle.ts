"use client";

import { useEffect, useState } from "react";

/**
 * Nombre (handle) del usuario. Vive solo en este navegador (localStorage), por dirección:
 * no hay backend, así que no existe unicidad global y nunca se escribe on-chain.
 */
const KEY = "chestzk.handles";
/** Direcciones a las que ya se les preguntó y eligieron "Skip for now" (no insistir). */
const SKIP_KEY = "chestzk.handleSkips";
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const HANDLE_EVENT = "chestzk:handle";
export const HANDLE_HINT = "Use 3–20 characters: a–z, 0–9 and _.";

function read(key: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

export function getHandle(address: string): string | null {
  if (typeof window === "undefined") return null;
  return (read(KEY)[address] as string | undefined) ?? null;
}

export function setHandle(address: string, handle: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(KEY), [address]: handle }));
    window.dispatchEvent(new Event(HANDLE_EVENT));
  } catch {
    /* storage bloqueado: el handle simplemente no se recuerda */
  }
}

export function hasSkippedHandle(address: string): boolean {
  if (typeof window === "undefined") return false;
  return read(SKIP_KEY)[address] === true;
}

export function skipHandle(address: string) {
  try {
    localStorage.setItem(SKIP_KEY, JSON.stringify({ ...read(SKIP_KEY), [address]: true }));
  } catch {
    /* ignorado */
  }
}

/** Handle de una dirección, reactivo (se actualiza al guardarlo desde cualquier parte). */
export function useHandle(address: string | null): string | null {
  const [h, setH] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setH(address ? getHandle(address) : null);
    sync();
    window.addEventListener(HANDLE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(HANDLE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [address]);
  return h;
}
