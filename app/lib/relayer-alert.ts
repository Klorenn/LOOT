import type { NetConfig } from "./network";
import { relayerBalance } from "./relay-limits";

/**
 * Low-balance alert for the relayer (read-only). When the balance is under the threshold it logs ONE structured
 * line with a stable tag (grep / log drain: `[relayer-low-balance]`) and, if RELAYER_LOW_BALANCE_WEBHOOK is set,
 * POSTs the same JSON there. Throttled per instance so a busy relayer does not spam.
 *
 * Thresholds: RELAYER_LOW_BALANCE_XLM (testnet, default 500) / RELAYER_LOW_BALANCE_XLM_MAINNET (default 10).
 * It never changes what an endpoint answers on mainnet; on testnet /api/relayer/status reports `relayerLow`.
 */
export const LOW_BALANCE_TAG = "[relayer-low-balance]";
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const lowBalanceThresholdStroops = (mainnet: boolean): bigint =>
  BigInt(
    Math.round(
      (mainnet ? num(process.env.RELAYER_LOW_BALANCE_XLM_MAINNET, 10) : num(process.env.RELAYER_LOW_BALANCE_XLM, 500)) * 1e7,
    ),
  );

const THROTTLE_MS = 10 * 60_000;
const lastAlert = new Map<string, number>();

export type BalanceCheck = { low: boolean; balanceStroops: bigint | null; thresholdStroops: bigint };

/** Pure decision: unknown balance counts as low (it is what an operator needs to look at). */
export function isLow(balance: bigint | null, threshold: bigint): boolean {
  return balance === null || balance < threshold;
}

export async function checkRelayerBalance(
  c: Pick<NetConfig, "IS_MAINNET" | "net" | "NETWORK">,
  account: string | undefined,
  deps: {
    balance?: (c: NetConfig, a: string) => Promise<bigint | null>;
    fetch?: typeof fetch;
    now?: number;
  } = {},
): Promise<BalanceCheck> {
  const thresholdStroops = lowBalanceThresholdStroops(c.IS_MAINNET);
  const balanceStroops = account ? await (deps.balance ?? relayerBalance)(c as NetConfig, account).catch(() => null) : null;
  const low = isLow(balanceStroops, thresholdStroops);
  if (low) {
    const now = deps.now ?? Date.now();
    const last = lastAlert.get(c.net);
    if (last === undefined || now - last >= THROTTLE_MS) {
      lastAlert.set(c.net, now);
      const alert = {
        tag: LOW_BALANCE_TAG,
        net: c.net,
        account: account ?? null,
        balanceXlm: balanceStroops === null ? null : Number(balanceStroops) / 1e7,
        thresholdXlm: Number(thresholdStroops) / 1e7,
        at: new Date(now).toISOString(),
      };
      console.error(LOW_BALANCE_TAG, JSON.stringify(alert));
      const hook = process.env.RELAYER_LOW_BALANCE_WEBHOOK?.trim();
      if (hook) {
        await (deps.fetch ?? fetch)(hook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(alert),
          signal: AbortSignal.timeout(3000),
        }).catch(() => undefined);
      }
    }
  }
  return { low, balanceStroops, thresholdStroops };
}

/** Test hook. */
export function resetAlertThrottle(): void {
  lastAlert.clear();
}
