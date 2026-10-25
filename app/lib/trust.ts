"use client";

import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { NETWORK, USDC } from "./config";

export class UsdcTrustlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsdcTrustlineError";
  }
}

/**
 * Cuentas G… necesitan trustline a USDC para recibir el premio (los C… no).
 * La cuenta existe vía Friendbot y paga su propia fee/reserva; idempotente.
 */
export async function ensureTrustline(secretKey: string): Promise<string | null> {
  const kp = Keypair.fromSecret(secretKey);
  const horizon = new Horizon.Server(NETWORK.horizonUrl);

  let account: Awaited<ReturnType<Horizon.Server["loadAccount"]>>;
  try {
    account = await horizon.loadAccount(kp.publicKey());
  } catch {
    throw new UsdcTrustlineError(
      "Tu cuenta no existe en testnet todavía. Volvé a entrar con “Demo sin passkey” para crearla.",
    );
  }

  const has = account.balances.some(
    (b) =>
      "asset_code" in b &&
      b.asset_code === USDC.code &&
      b.asset_issuer === USDC.issuer,
  );
  if (has) return null;

  const tx = new TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(USDC.code, USDC.issuer) }))
    .setTimeout(60)
    .build();
  tx.sign(kp);

  try {
    const res = await horizon.submitTransaction(tx);
    return res.hash;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new UsdcTrustlineError(
      `Tu cuenta no puede recibir USDC todavía: no se pudo crear la trustline (${detail}). Reintentá o usá la passkey.`,
    );
  }
}
