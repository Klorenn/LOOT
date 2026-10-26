/**
 * Espera la confirmación de una tx ya enviada. NUNCA devuelve "ok" para una tx sin confirmar: si no aparece a
 * tiempo lanza TxPendingError (con el hash), que las rutas convierten en { ok:false, code:"tx_pending", hash }.
 */
export class TxPendingError extends Error {
  constructor(public hash: string) {
    super(`transaction ${hash} was not confirmed in time`);
    this.name = "TxPendingError";
  }
}

export class TxFailedError extends Error {
  constructor(public hash: string) {
    super(`tx failed ${hash}`);
    this.name = "TxFailedError";
  }
}

type GetTx = (hash: string) => Promise<{ status: string }>;

/** Segundos de espera: mainnet más largo (congestión), testnet como siempre. */
export const waitSeconds = (mainnet: boolean) => (mainnet ? 90 : 40);

export async function waitForConfirmation(
  getTransaction: GetTx,
  hash: string,
  opts: { attempts: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<{ hash: string }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < opts.attempts; i++) {
    await sleep(opts.intervalMs ?? 1000);
    const st = await getTransaction(hash).catch(() => ({ status: "NOT_FOUND" }));
    if (st.status === "SUCCESS") return { hash };
    if (st.status === "FAILED") throw new TxFailedError(hash);
  }
  throw new TxPendingError(hash);
}
