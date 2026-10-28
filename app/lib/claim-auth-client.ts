"use client";

import { Keypair, xdr } from "@stellar/stellar-sdk";
import { signClaimAuthEntry } from "@findloot/chest";
import type { Player } from "./wallet";

/**
 * Registry v2 claims need the RECIPIENT's signature on the Soroban auth entry of `claim`
 * (the contract calls `recipient.require_auth()`). The relayer still pays the fee and submits.
 *
 * - demo G key (classic): signed locally with its keypair
 * - external G wallet (Stellar Wallets Kit): SEP-43 `signAuthEntry` (one wallet prompt)
 * - passkey C wallet: passkey-kit `signAuthEntry` (one WebAuthn prompt)
 *
 * Returns the signed SorobanAuthorizationEntry as base64 XDR.
 */
export async function signClaimAuth(
  player: Player,
  authEntry: string,
  validUntilLedger: number,
  networkPassphrase: string,
): Promise<string> {
  if (player.kind === "classic") {
    if (!player.secretKey) throw new Error("demo wallet key missing in this browser");
    return signClaimAuthEntry(authEntry, Keypair.fromSecret(player.secretKey), validUntilLedger, networkPassphrase);
  }
  if (player.kind === "wallet") {
    if (!player.walletId) throw new Error("wallet session missing; reconnect your wallet");
    const { signAuthEntryWithWallet } = await import("./wallets-kit");
    return signClaimAuthEntry(
      authEntry,
      async (preimage) =>
        signAuthEntryWithWallet(preimage.toXDR("base64"), player.publicKey, player.walletId!, networkPassphrase),
      validUntilLedger,
      networkPassphrase,
    );
  }
  // passkey smart wallet (C…)
  const [{ getPasskeyKit }, { PasskeySigner }] = await Promise.all([import("./passkey-client"), import("passkey-kit")]);
  const kit = getPasskeyKit();
  if (player.keyId) {
    try {
      await kit.connectWallet({ keyId: player.keyId });
    } catch (e) {
      console.warn("connectWallet (claim auth):", e); // known passkey-kit 0.19 issue; signing may still work
    }
  }
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(authEntry, "base64");
  const signed = await kit.signAuthEntry(entry, new PasskeySigner(player.keyId ?? "any"), {
    expiration: validUntilLedger,
  });
  return signed.toXDR("base64");
}
