import { rpc } from "@stellar/stellar-sdk";
import { NETWORK } from "./config";

/**
 * Soroban RPC con failover. Lecturas (simulate, getLedgerEntries, getEvents): timeout corto y
 * se prueba el siguiente RPC ante cualquier fallo que no sea una respuesta definitiva del
 * contrato o del rango de ledgers. Escrituras (sendTransaction y similares): se queda en el
 * RPC primario y solo cae al fallback ante un error de red, sin timeout propio (el SDK espera
 * la confirmación). Reintentar un envío con la misma tx firmada es idempotente (mismo hash).
 */

class RpcTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`RPC timeout (${ms} ms): ${url}`);
    this.name = "RpcTimeoutError";
  }
}

const msgOf = (e: unknown) => (e as { message?: string })?.message ?? String(e);

/** Error de transporte: el request ni llegó o el servidor no respondió. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof RpcTimeoutError) return true;
  return /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|network|timeout|aborted|\b50[234]\b|Bad Gateway|Service Unavailable|Gateway Time/i.test(
    msgOf(e),
  );
}

/** Respuesta válida del RPC que otro RPC repetiría igual: no tiene sentido hacer failover. */
function isDefinitive(e: unknown): boolean {
  return /Error\(Contract|startLedger must be within|ledger range/i.test(
    msgOf(e),
  );
}

function withTimeout<T>(p: Promise<T>, url: string, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new RpcTimeoutError(url, ms)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** RPC que acaba de fallar por red: se deja de probar primero durante un rato (no pagar el timeout en cada request). */
const downUntil = new Map<string, number>();
const DOWN_MS = 30_000;

/** Ejecuta `fn(url)` contra cada RPC en orden según el modo. */
export async function withRpcUrl<T>(
  fn: (rpcUrl: string) => Promise<T>,
  opts: { write?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const all = NETWORK.rpcUrls as readonly string[];
  const now = Date.now();
  const urls = [
    ...all.filter((u) => (downUntil.get(u) ?? 0) <= now),
    ...all.filter((u) => (downUntil.get(u) ?? 0) > now),
  ];
  let lastErr: unknown;
  for (let i = 0; i < urls.length; i++) {
    try {
      return opts.write
        ? await fn(urls[i])
        : await withTimeout(fn(urls[i]), urls[i], opts.timeoutMs ?? NETWORK.rpcTimeoutMs);
    } catch (e) {
      lastErr = e;
      if (isNetworkError(e)) downUntil.set(urls[i], Date.now() + DOWN_MS);
      const failover = opts.write ? isNetworkError(e) : !isDefinitive(e);
      if (!failover || i === urls.length - 1) throw e;
      console.warn(
        `rpc failover ${urls[i]} → ${urls[i + 1]}: ${msgOf(e).slice(0, 120)}`,
      );
    }
  }
  throw lastErr;
}

/** Igual que withRpcUrl pero entrega un rpc.Server ya creado. */
export function withRpc<T>(
  fn: (server: rpc.Server) => Promise<T>,
  opts: { write?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  return withRpcUrl((url) => fn(new rpc.Server(url)), opts);
}

/**
 * Elige una vez un RPC que responde (getHealth, con el timeout de lectura) para flujos largos
 * con efectos secundarios que no se pueden reintentar a mitad de camino (envío passkey, demo
 * del cofre normal). No hace failover durante el flujo: solo evita arrancarlo contra un RPC caído.
 */
export function pickRpcUrl(): Promise<string> {
  return withRpcUrl(async (url) => {
    await new rpc.Server(url).getHealth();
    return url;
  });
}
