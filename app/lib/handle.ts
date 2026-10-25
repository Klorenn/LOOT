/**
 * Handle opcional del usuario. Vive solo en este navegador (localStorage), por dirección:
 * no existe indexer y nunca se escribe on-chain.
 */
const KEY = "chestzk.handles";
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function getHandle(address: string): string | null {
  if (typeof window === "undefined") return null;
  return read()[address] ?? null;
}

export function setHandle(address: string, handle: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [address]: handle }));
  } catch {
    /* storage bloqueado: el handle simplemente no se recuerda */
  }
}
