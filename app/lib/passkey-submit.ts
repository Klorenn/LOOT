/**
 * Cliente: envío de txs firmadas con passkey por el relayer y verificación de que un wallet recién desplegado
 * existe de verdad. Una tx "pending" (sin confirmar) es un fallo: nunca se guarda una sesión para un contrato
 * que no existe.
 */
export class PasskeyTxPendingError extends Error {
  constructor(public hash?: string) {
    super("The transaction hasn’t been confirmed yet. Check your activity before trying again.");
    this.name = "PasskeyTxPendingError";
  }
}

export class WalletNotDeployedError extends Error {
  constructor() {
    super("Your account wasn’t created yet — please try again.");
    this.name = "WalletNotDeployedError";
  }
}

export async function postPasskeyTx(xdr: string): Promise<string> {
  const res = await fetch("/api/passkey/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ xdr }),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.code === "tx_pending") throw new PasskeyTxPendingError(data.hash);
  // pending sin ok:false (servidores viejos) también cuenta como no confirmado
  if (res.ok && data?.ok && data?.pending) throw new PasskeyTxPendingError(data.hash);
  if (!res.ok || !data.ok) throw new Error(data.error || "passkey submit failed");
  return data.hash as string;
}

/** Espera a que `exists()` sea true (el RPC puede ir unos segundos por detrás); si no, lanza. */
export async function assertWalletDeployed(
  exists: () => Promise<boolean>,
  opts: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const attempts = opts.attempts ?? 10;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; i < attempts; i++) {
    if (await exists().catch(() => false)) return;
    if (i < attempts - 1) await sleep(opts.intervalMs ?? 2000);
  }
  throw new WalletNotDeployedError();
}
