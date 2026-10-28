/**
 * Maps any thrown value to a SAFE (code, message) pair for API responses. Raw error messages can carry RPC
 * URLs, simulation logs, XDR, stack fragments or env names, so routes must log the raw error server-side
 * and return only what this helper produces.
 */
export type SafeError = { code: string; error: string };

const CONTRACT_RE = /Error\(Contract,\s*#(\d+)\)/;

/** Contract error number (`Error(Contract, #N)`) found in an error, or null. */
export function contractErrorNumber(e: unknown): number | null {
  const m = (e instanceof Error ? e.message : String(e)).match(CONTRACT_RE);
  return m ? Number(m[1]) : null;
}

export function toSafeError(e: unknown, fallback = "request failed"): SafeError {
  const msg = e instanceof Error ? e.message : String(e);
  const n = contractErrorNumber(e);
  if (n !== null) return { code: `contract_${n}`, error: `The contract rejected the request (#${n}).` };
  if (/timeout|timed out|TRY_AGAIN|ECONN|ENOTFOUND|fetch failed|network/i.test(msg))
    return { code: "network_busy", error: "The network is busy. Try again in a moment." };
  return { code: "internal_error", error: fallback };
}

/** Keeps an upstream error code only when it looks like a plain token (no free text). */
export function safeUpstreamCode(code: unknown): string | undefined {
  return typeof code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(code) ? code : undefined;
}
