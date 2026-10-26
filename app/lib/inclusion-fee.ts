/**
 * Fee de inclusión (base fee por operación) de las txs que paga el relayer. 100 stroops es el mínimo y en
 * mainnet, con precios de congestión, una tx con 100 puede no incluirse nunca (mediana de inclusión Soroban
 * ~200): por eso en mainnet se usa max(p90 de getFeeStats, 200), con tope. Testnet se queda en 100.
 * La fee total (recursos + inclusión) sigue acotada por relayMaxFee en cada ruta.
 */
export const INCLUSION_TESTNET = BigInt(100);
export const INCLUSION_MAINNET_MIN = BigInt(200);
export const INCLUSION_MAINNET_MAX = BigInt(20_000);

type FeeStatsLike = { sorobanInclusionFee?: { p90?: string | number | bigint } };

/** Pura: de un p90 (o nada) a la fee de inclusión de la red. */
export function pickInclusionFee(p90: string | number | bigint | undefined, mainnet: boolean): bigint {
  if (!mainnet) return INCLUSION_TESTNET;
  let v = INCLUSION_MAINNET_MIN;
  try {
    const n = p90 === undefined ? BigInt(0) : BigInt(p90);
    if (n > v) v = n;
  } catch {
    /* p90 ilegible: se queda el mínimo */
  }
  return v > INCLUSION_MAINNET_MAX ? INCLUSION_MAINNET_MAX : v;
}

const cache = new Map<string, { at: number; v: bigint }>();
const TTL_MS = 30_000;

/** Lee getFeeStats (caché de 30 s por red). Si el RPC falla, usa el último valor conocido o el mínimo de la red. */
export async function inclusionFee(
  server: { getFeeStats(): Promise<FeeStatsLike> },
  c: { net: string; IS_MAINNET: boolean },
  now = Date.now(),
): Promise<bigint> {
  if (!c.IS_MAINNET) return INCLUSION_TESTNET;
  const hit = cache.get(c.net);
  if (hit && now - hit.at < TTL_MS) return hit.v;
  try {
    const stats = await server.getFeeStats();
    const v = pickInclusionFee(stats?.sorobanInclusionFee?.p90, true);
    cache.set(c.net, { at: now, v });
    return v;
  } catch {
    return hit?.v ?? INCLUSION_MAINNET_MIN;
  }
}

export function clearInclusionFeeCache(): void {
  cache.clear();
}
