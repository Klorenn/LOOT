"use client";

import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc as StellarRpc,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { CONTRACTS, NETWORK } from "./config";

/** Crea trustline al token CHEST firmando con la keypair del jugador. */
export async function ensureTrustline(secretKey: string): Promise<string> {
  const kp = Keypair.fromSecret(secretKey);
  const server = new StellarRpc.Server(NETWORK.rpcUrl);
  const account = await server.getAccount(kp.publicKey());

  const contract = new Contract(CONTRACTS.token);
  const tx = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(
      contract.call(
        "trust",
        nativeToScVal(kp.publicKey(), { type: "address" }),
      ),
    )
    .setTimeout(180)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(kp);
  const result = await server.sendTransaction(prepared);
  if (result.status === "ERROR") {
    throw new Error(`trust send error: ${JSON.stringify(result)}`);
  }

  // Esperar confirmación breve
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await server.getTransaction(result.hash);
    if (st.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
      return result.hash;
    }
    if (st.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`trust failed: ${result.hash}`);
    }
  }
  return result.hash;
}
